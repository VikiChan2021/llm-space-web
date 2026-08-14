import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { Message as PiMessage } from "@earendil-works/pi-ai";
import type { AgentStreamRequest } from "@llm-space/core/types";

import {
  GUEST_PROVIDER_ID,
  isGuestModelAllowed,
} from "./guest-model-catalog";

const MAX_COACH_REQUEST_BYTES = 32 * 1024;
const MAX_COACH_MESSAGES = 20;
const MAX_COACH_MESSAGE_CHARACTERS = 2_000;
const MAX_COACH_TOTAL_CHARACTERS = 8_000;
const RUN_INTERRUPT_PREFIX = "run-current-thread:";

export interface GuestCoachPageContext {
  page: "guest-workbench";
  activeThreadTitle: string;
  starterId: string | null;
  running: boolean;
  selectedModel: string;
  toolCount: number;
  messageCount: number;
}

export interface GuestCoachMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface GuestCoachResumeEntry {
  interruptId: string;
  status: "resolved" | "cancelled";
  payload?: unknown;
}

export interface GuestCoachRequest {
  threadId: string;
  runId: string;
  messages: GuestCoachMessage[];
  context: GuestCoachPageContext;
  resume?: GuestCoachResumeEntry[];
}

export type GuestCoachEvent = Record<string, unknown> & { type: string };

export type GuestCoachPlan =
  | { kind: "shortcut"; events: GuestCoachEvent[] }
  | { kind: "model"; request: AgentStreamRequest };

export class GuestCoachRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export async function readGuestCoachRequest(
  request: Request
): Promise<GuestCoachRequest> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_COACH_REQUEST_BYTES
  ) {
    throw new GuestCoachRequestError(
      413,
      "coach_request_too_large",
      "学习助手请求过大，请缩短问题后重试。"
    );
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_COACH_REQUEST_BYTES) {
    throw new GuestCoachRequestError(
      413,
      "coach_request_too_large",
      "学习助手请求过大，请缩短问题后重试。"
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new GuestCoachRequestError(
      400,
      "invalid_coach_json",
      "学习助手请求格式无效。"
    );
  }
  return _parseCoachRequest(value);
}

export function createGuestCoachPlan(
  input: GuestCoachRequest,
  fallbackModelId: string
): GuestCoachPlan {
  const resumed = _resumePlan(input);
  if (resumed) return resumed;

  const userText = _lastUserText(input);
  const shortcut = _shortcutPlan(input, userText);
  if (shortcut) return shortcut;

  const selectedModel = isGuestModelAllowed(input.context.selectedModel)
    ? input.context.selectedModel
    : fallbackModelId;
  const history: PiMessage[] = input.messages.slice(-8).map((message) =>
    message.role === "user"
      ? {
          role: "user",
          content: [{ type: "text" as const, text: message.content }],
          timestamp: Date.now(),
        }
      : {
          role: "assistant",
          content: [{ type: "text" as const, text: message.content }],
          api: "openai-completions",
          provider: GUEST_PROVIDER_ID,
          model: selectedModel,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          stopReason: "stop",
          timestamp: Date.now(),
        }
  );
  return {
    kind: "model",
    request: {
      model: { provider: GUEST_PROVIDER_ID, id: selectedModel },
      config: { model: { maxTokens: 700, temperature: 0.3 } },
      context: {
        systemPrompt: _coachSystemPrompt(input.context),
        messages: history,
        tools: [],
        responseApiNativeTools: [],
      },
    },
  };
}

export async function* streamGuestCoachModelEvents(
  input: GuestCoachRequest,
  events: AsyncIterable<AgentEvent>
): AsyncGenerator<GuestCoachEvent> {
  const messageId = `coach-message:${input.runId}`;
  yield _runStarted(input);
  yield {
    type: "TEXT_MESSAGE_START",
    messageId,
    role: "assistant",
  };
  let emittedText = false;
  for await (const event of events) {
    if (_isModelFailureEvent(event)) {
      throw new Error("Coach model returned an error event.");
    }
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      emittedText = true;
      yield {
        type: "TEXT_MESSAGE_CONTENT",
        messageId,
        delta: event.assistantMessageEvent.delta,
      };
    }
    if (event.type === "message_end" && !emittedText) {
      const text =
        event.message.role === "assistant" && Array.isArray(event.message.content)
          ? event.message.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("")
          : "";
      if (text) {
        emittedText = true;
        yield { type: "TEXT_MESSAGE_CONTENT", messageId, delta: text };
      }
    }
  }
  if (!emittedText) {
    yield {
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta: "我暂时没有生成有效说明，请换一种问法。",
    };
  }
  yield { type: "TEXT_MESSAGE_END", messageId };
  yield _runFinished(input);
}

function _parseCoachRequest(value: unknown): GuestCoachRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw _invalidCoachRequest();
  }
  const record = value as Record<string, unknown>;
  const threadId = _boundedId(record.threadId);
  const runId = _boundedId(record.runId);
  if (!threadId || !runId || !Array.isArray(record.messages)) {
    throw _invalidCoachRequest();
  }
  if (
    record.messages.length === 0 ||
    record.messages.length > MAX_COACH_MESSAGES
  ) {
    throw _invalidCoachRequest();
  }
  const messages: GuestCoachMessage[] = [];
  let totalCharacters = 0;
  for (const rawMessage of record.messages) {
    if (!rawMessage || typeof rawMessage !== "object") {
      throw _invalidCoachRequest();
    }
    const message = rawMessage as Record<string, unknown>;
    const content =
      message.role === "assistant" && message.content === undefined
        ? ""
        : message.content;
    if (
      (message.role !== "user" && message.role !== "assistant") ||
      typeof content !== "string" ||
      content.length > MAX_COACH_MESSAGE_CHARACTERS
    ) {
      throw _invalidCoachRequest();
    }
    totalCharacters += content.length;
    const id = _boundedId(message.id);
    if (!id || totalCharacters > MAX_COACH_TOTAL_CHARACTERS) {
      throw _invalidCoachRequest();
    }
    messages.push({ id, role: message.role, content });
  }

  const context = _readCoachContext(record.context);
  const resume = _readResume(record.resume);
  if (!resume && messages.at(-1)?.role !== "user") {
    throw _invalidCoachRequest();
  }
  return {
    threadId,
    runId,
    messages,
    context,
    ...(resume ? { resume } : {}),
  };
}

function _readCoachContext(value: unknown): GuestCoachPageContext {
  if (!Array.isArray(value)) throw _invalidCoachRequest();
  const entry = value.find(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).description ===
        "llm-space guest workbench context"
  ) as Record<string, unknown> | undefined;
  if (!entry || typeof entry.value !== "string" || entry.value.length > 2_000) {
    throw _invalidCoachRequest();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(entry.value);
  } catch {
    throw _invalidCoachRequest();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw _invalidCoachRequest();
  }
  const context = parsed as Record<string, unknown>;
  const activeThreadTitle = _boundedRequiredText(
    context.activeThreadTitle,
    160
  );
  const selectedModel = _boundedRequiredText(context.selectedModel, 120);
  const starterId =
    context.starterId === null
      ? null
      : _boundedRequiredText(context.starterId, 120);
  if (
    context.page !== "guest-workbench" ||
    activeThreadTitle === null ||
    selectedModel === null ||
    starterId === undefined ||
    typeof context.running !== "boolean" ||
    !_boundedCount(context.toolCount) ||
    !_boundedCount(context.messageCount)
  ) {
    throw _invalidCoachRequest();
  }
  return {
    page: "guest-workbench",
    activeThreadTitle,
    starterId,
    running: context.running,
    selectedModel,
    toolCount: context.toolCount as number,
    messageCount: context.messageCount as number,
  };
}

function _readResume(value: unknown): GuestCoachResumeEntry[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 1) {
    throw _invalidCoachRequest();
  }
  const items = value as unknown[];
  const item: unknown = items[0];
  if (!item || typeof item !== "object") throw _invalidCoachRequest();
  const entry = item as Record<string, unknown>;
  const interruptId = _boundedId(entry.interruptId);
  if (
    !interruptId ||
    (entry.status !== "resolved" && entry.status !== "cancelled")
  ) {
    throw _invalidCoachRequest();
  }
  return [
    {
      interruptId,
      status: entry.status,
      ...(entry.payload === undefined
        ? {}
        : { payload: entry.payload }),
    },
  ];
}

function _resumePlan(input: GuestCoachRequest): GuestCoachPlan | null {
  const resume = input.resume?.[0];
  if (!resume) return null;
  if (!resume.interruptId.startsWith(RUN_INTERRUPT_PREFIX)) {
    throw new GuestCoachRequestError(
      400,
      "invalid_coach_resume",
      "学习助手确认已失效，请重新发起操作。"
    );
  }
  const approved =
    resume.status === "resolved" &&
    resume.payload !== null &&
    typeof resume.payload === "object" &&
    (resume.payload as Record<string, unknown>).approved === true;
  if (!approved) {
    return {
      kind: "shortcut",
      events: _textEvents(input, "已取消运行，当前 Thread 没有发生变化。"),
    };
  }
  return {
    kind: "shortcut",
    events: _actionEvents(
      input,
      "request_run",
      {},
      "已确认。正在通过工作台的受控 Run 动作启动当前 Thread。"
    ),
  };
}

function _shortcutPlan(
  input: GuestCoachRequest,
  text: string
): GuestCoachPlan | null {
  if (_matches(text, /(?:打开|显示|open|show).*(?:变量|variables?)/i)) {
    return {
      kind: "shortcut",
      events: _actionEvents(
        input,
        "open_variables",
        {},
        "Variables 用来把 Prompt 中经常变化的值抽出来复用。我已经为你打开变量面板。"
      ),
    };
  }
  if (
    _matches(
      text,
      /^(?:(?:请|麻烦)?(?:帮我)?(?:(?:从第一条用户消息)?(?:运行|执行|开始运行|run))(?:一下)?(?:当前|这个)?(?:\s*thread|\s*案例|\s*任务)?|(?:请|麻烦)?(?:帮我)?(?:把)?(?:当前|这个)(?:\s*thread|\s*案例|\s*任务)?(?:运行|执行)(?:一下)?)[。！! ]*$/i
    )
  ) {
    const interruptId = `${RUN_INTERRUPT_PREFIX}${input.runId}`;
    const events = _textEvents(
      input,
      "运行当前 Thread 会调用模型并消耗免费 Run，需要你确认后我才会继续。"
    );
    events[events.length - 1] = {
      type: "RUN_FINISHED",
      threadId: input.threadId,
      runId: input.runId,
      outcome: {
        type: "interrupt",
        interrupts: [
          {
            id: interruptId,
            reason: "high_impact_action_confirmation",
            message: "确认运行当前 Thread？这会消耗免费 Run 额度。",
            responseSchema: {
              type: "object",
              properties: { approved: { type: "boolean" } },
              required: ["approved"],
            },
            metadata: { action: "request_run", risk: "L2" },
          },
        ],
      },
    };
    return { kind: "shortcut", events };
  }

  const element = _elementExplanation(text);
  if (element) {
    return {
      kind: "shortcut",
      events: _actionEvents(
        input,
        "highlight_element",
        { elementId: element.id },
        element.explanation
      ),
    };
  }
  return null;
}

function _elementExplanation(
  text: string
): { id: string; explanation: string } | null {
  if (_matches(text, /\bvariables?\b|变量/i)) {
    return {
      id: "variables",
      explanation:
        "Variables 是在 Run 前渲染到 Prompt、消息或工具结果模板中的命名值。内置变量可提供当前日期、可用 Skills 和工作目录；Custom Variables 适合复用经常变化的输入。它们不是 Agent 步骤间自动共享的可变内存。",
    };
  }
  if (_matches(text, /\bmodels?\b|模型/i)) {
    return {
      id: "models",
      explanation:
        "Models 决定由哪个大模型完成当前 Thread。不同模型的上下文、推理、速度和多模态能力不同；调试时先固定 Prompt，再更换模型比较结果更容易定位差异。",
    };
  }
  if (_matches(text, /\btools?\b|工具/i)) {
    return {
      id: "tools",
      explanation:
        "Tools 是 Agent 可以调用的外部能力，例如天气、搜索或文件操作。模型只负责决定何时调用，真正执行仍受工作台权限和安全策略控制。",
    };
  }
  if (_matches(text, /react|推理.*行动|思考.*行动/i)) {
    return {
      id: "run-settings",
      explanation:
        "ReAct 是 Reason + Act 的循环：模型先判断下一步，再调用工具，读取结果后继续推理，直到给出最终答案。这里的 Run settings 可以控制是否自动继续这个循环。",
    };
  }
  if (_matches(text, /system\s*prompt|系统提示词/i)) {
    return {
      id: "system-prompt",
      explanation:
        "System Prompt 定义 Agent 的长期角色、约束和工作方式。它通常比单条用户消息优先级更高，适合放稳定规则，不适合塞入每次都会变化的数据。",
    };
  }
  return null;
}

function _actionEvents(
  input: GuestCoachRequest,
  action: string,
  args: Record<string, unknown>,
  message: string
): GuestCoachEvent[] {
  const events = _textEvents(input, message);
  const finished = events.pop()!;
  const toolCallId = `coach-action:${input.runId}:${action}`;
  events.push(
    {
      type: "TOOL_CALL_START",
      toolCallId,
      toolCallName: action,
    },
    {
      type: "TOOL_CALL_ARGS",
      toolCallId,
      delta: JSON.stringify(args),
    },
    { type: "TOOL_CALL_END", toolCallId },
    finished
  );
  return events;
}

function _textEvents(
  input: GuestCoachRequest,
  text: string
): GuestCoachEvent[] {
  const messageId = `coach-message:${input.runId}`;
  return [
    _runStarted(input),
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId, delta: text },
    { type: "TEXT_MESSAGE_END", messageId },
    _runFinished(input),
  ];
}

function _runStarted(input: GuestCoachRequest): GuestCoachEvent {
  return {
    type: "RUN_STARTED",
    threadId: input.threadId,
    runId: input.runId,
  };
}

function _runFinished(input: GuestCoachRequest): GuestCoachEvent {
  return {
    type: "RUN_FINISHED",
    threadId: input.threadId,
    runId: input.runId,
    outcome: { type: "success" },
  };
}

function _coachSystemPrompt(context: GuestCoachPageContext): string {
  return `你是 LLM Space Web 的 Agent 开发学习助手。请使用简洁、准确的中文回答，只讨论 Agent、Prompt、Model、Tool、Variables、ReAct、Run history、调试和当前工作台学习路径。

规则：
1. 你不能直接操作页面，也不能声称已经执行动作；页面动作只由前端白名单注册表执行。
2. 不索要或复述 API Key、完整 Prompt、回答、图片、文件或工具结果。
3. 解释概念时优先说明“是什么、为什么需要、会影响什么、下一步怎么试”。
4. 不确定当前页面状态时明确说不知道，不编造。
5. 鼓励用户亲自观察、修改和比较，不替用户完成整个学习任务。

当前白名单页面上下文：${JSON.stringify(context)}`;
}

function _lastUserText(input: GuestCoachRequest): string {
  const message = [...input.messages].reverse().find((item) => item.role === "user");
  if (!message) throw _invalidCoachRequest();
  return message.content.trim();
}

function _isModelFailureEvent(event: AgentEvent): boolean {
  switch (event.type) {
    case "message_start":
    case "message_update":
    case "message_end":
    case "turn_end":
      return _failedAssistantMessage(event.message);
    case "agent_end":
      return event.messages.some(_failedAssistantMessage);
    default:
      return false;
  }
}

function _failedAssistantMessage(
  message: Extract<AgentEvent, { type: "message_end" }>["message"]
): boolean {
  return (
    message.role === "assistant" &&
    (message.stopReason === "error" || Boolean(message.errorMessage))
  );
}

function _boundedId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(value)
    ? value
    : null;
}

function _boundedRequiredText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length <= maximum ? value : null;
}

function _boundedCount(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 1_000
  );
}

function _matches(text: string, pattern: RegExp): boolean {
  return pattern.test(text.trim());
}

function _invalidCoachRequest(): GuestCoachRequestError {
  return new GuestCoachRequestError(
    400,
    "invalid_coach_request",
    "学习助手只接收有限的页面上下文和文本消息。"
  );
}
