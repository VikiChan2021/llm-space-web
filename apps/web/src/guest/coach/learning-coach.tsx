import {
  HttpAgent,
  type AgentSubscriber,
  type Interrupt,
} from "@ag-ui/client";
import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Button } from "@llm-space/ui/ui/button";
import { Textarea } from "@llm-space/ui/ui/textarea";
import {
  BotIcon,
  CheckCircle2Icon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";


import { guestCoachApiUrl } from "../guest-api";

import {
  executeCoachAction,
  parseCoachAction,
  type CoachActionEnvironment,
} from "./coach-actions";

const COACH_AGENT_ID = "llm-space-learning-coach";
const COACH_TOOLS = [
  {
    name: "highlight_element",
    description: "Highlight one registered workbench concept.",
    parameters: {
      type: "object",
      properties: { elementId: { type: "string" } },
      required: ["elementId"],
    },
  },
  {
    name: "open_variables",
    description: "Open the workbench Variables panel.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "request_run",
    description: "Run the current Thread after explicit confirmation.",
    parameters: { type: "object", properties: {} },
  },
];
const SUGGESTIONS = [
  "解释 Models",
  "解释 Tools",
  "解释 ReAct",
  "打开 Variables",
  "运行当前 Thread",
] as const;

export interface LearningCoachContext {
  page: "guest-workbench";
  activeThreadTitle: string;
  starterId: string | null;
  running: boolean;
  selectedModel: string;
  toolCount: number;
  messageCount: number;
}

interface CoachDisplayMessage {
  id: string;
  role: "assistant" | "user" | "receipt";
  content: string;
  failed?: boolean;
}

export interface LearningCoachProps {
  open: boolean;
  context: LearningCoachContext;
  onOpenChange: (open: boolean) => void;
  onOpenVariables: () => void;
  onRequestRun: () => boolean;
  onRunCompleted: () => void;
}

export default function LearningCoach({
  open,
  context,
  onOpenChange,
  onOpenVariables,
  onRequestRun,
  onRunCompleted,
}: LearningCoachProps) {
  const [agent] = useState(
    () =>
      new HttpAgent({
        agentId: COACH_AGENT_ID,
        threadId: `coach:${crypto.randomUUID()}`,
        url: guestCoachApiUrl(),
      })
  );
  const [messages, setMessages] = useState<CoachDisplayMessage[]>([
    {
      id: "coach-welcome",
      role: "assistant",
      content:
        "你好，我是学习助手。我可以解释页面概念、带你找到功能，并通过受控动作协助操作。先选一个概念试试。",
    },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [pendingInterrupt, setPendingInterrupt] = useState<Interrupt | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const contextValue = useMemo(() => JSON.stringify(context), [context]);
  const actionEnvironment = useMemo<CoachActionEnvironment>(
    () => ({
      openVariables: () => onOpenVariables(),
      requestRun: () => onRequestRun(),
    }),
    [onOpenVariables, onRequestRun]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, running]);

  useEffect(
    () => () => {
      agent.abortRun();
    },
    [agent]
  );

  const updateAssistant = useCallback(
    (messageId: string, delta: string) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, content: `${message.content}${delta}` }
            : message
        )
      );
    },
    []
  );

  const addReceipt = useCallback((content: string, failed = false) => {
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "receipt", content, failed },
    ]);
  }, []);

  const createSubscriber = useCallback(
    (assistantMessageId: string): AgentSubscriber => ({
      onTextMessageContentEvent({ event }) {
        updateAssistant(assistantMessageId, event.delta);
      },
      onToolCallEndEvent({ toolCallName, toolCallArgs }) {
        const action = parseCoachAction(toolCallName, toolCallArgs);
        if (!action) {
          addReceipt("助手请求了未注册动作，已被安全策略拒绝。", true);
          return;
        }
        const receipt = executeCoachAction(action, actionEnvironment);
        addReceipt(receipt.message, !receipt.success);
      },
      onRunErrorEvent({ event }) {
        updateAssistant(
          assistantMessageId,
          event.message || "学习助手暂时无法回答。"
        );
      },
    }),
    [actionEnvironment, addReceipt, updateAssistant]
  );

  const runAgent = useCallback(
    async (resume?: {
      interruptId: string;
      status: "resolved" | "cancelled";
      payload: { approved: boolean };
    }) => {
      if (running) return;
      setRunning(true);
      const assistantMessageId = crypto.randomUUID();
      setMessages((current) => [
        ...current,
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);
      try {
        await agent.runAgent(
          {
            tools: COACH_TOOLS,
            context: [
              {
                description: "llm-space guest workbench context",
                value: contextValue,
              },
            ],
            ...(resume ? { resume: [resume] } : {}),
          },
          createSubscriber(assistantMessageId)
        );
        const interrupt = agent.pendingInterrupts[0] ?? null;
        setPendingInterrupt(interrupt);
        setMessages((current) =>
          current.filter(
            (message) =>
              message.id !== assistantMessageId || message.content.length > 0
          )
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "学习助手暂时无法回答，请稍后重试。";
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantMessageId
              ? { ...item, content: message, failed: true }
              : item
          )
        );
      } finally {
        setRunning(false);
        onRunCompleted();
      }
    }, [agent, contextValue, createSubscriber, onRunCompleted, running]);

  const ask = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || running) return;
      const userMessage = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: trimmed,
      };
      agent.addMessage(userMessage);
      setMessages((current) => [...current, userMessage]);
      setInput("");
      void runAgent();
    },
    [agent, runAgent, running]
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      ask(input);
    },
    [ask, input]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        ask(input);
      }
    },
    [ask, input]
  );

  const resolveInterrupt = useCallback(
    (approved: boolean) => {
      const interrupt = pendingInterrupt;
      if (!interrupt || running) return;
      setPendingInterrupt(null);
      void runAgent({
        interruptId: interrupt.id,
        status: approved ? "resolved" : "cancelled",
        payload: { approved },
      });
    },
    [pendingInterrupt, runAgent, running]
  );

  if (!open) return null;

  return (
    <>
      <aside
        role="dialog"
        aria-modal="false"
        aria-labelledby="learning-coach-title"
        className="bg-popover text-popover-foreground fixed inset-y-2 right-2 z-40 flex w-[min(24rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b px-4 py-3">
          <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
            <BotIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 id="learning-coach-title" className="text-sm font-semibold">
                Agent 学习助手
              </h2>
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[0.625rem] font-medium text-violet-700 dark:text-violet-200">
                Phase 0
              </span>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              按需模式 · 页面动作受安全策略控制
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="关闭学习助手"
            onClick={() => onOpenChange(false)}
          >
            <XIcon />
          </Button>
        </header>

        <div className="border-b px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <SparklesIcon className="size-3.5 text-violet-500" />
            试试这些操作
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() => ask(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          aria-live="polite"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "bg-primary text-primary-foreground ml-8 rounded-xl rounded-br-sm px-3 py-2 text-xs leading-relaxed"
                  : message.role === "receipt"
                    ? `flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                        message.failed
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                      }`
                    : `bg-muted mr-5 rounded-xl rounded-bl-sm px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                        message.failed ? "text-destructive" : ""
                      }`
              }
            >
              {message.role === "receipt" ? (
                <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" />
              ) : null}
              <span>{message.content}</span>
            </div>
          ))}
          {running ? (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span className="size-1.5 animate-pulse rounded-full bg-violet-500" />
              正在理解当前页面…
            </div>
          ) : null}
        </div>

        <form className="border-t p-3" onSubmit={handleSubmit}>
          <Textarea
            value={input}
            maxLength={500}
            rows={3}
            aria-label="向 Agent 学习助手提问"
            placeholder="例如：Tool 和 ReAct 有什么关系？"
            disabled={running}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="mt-2 flex items-center gap-2">
            <div className="text-muted-foreground flex min-w-0 flex-1 items-start gap-1.5 text-[0.625rem] leading-relaxed">
              <ShieldCheckIcon className="mt-0.5 size-3 shrink-0" />
              不发送完整 Prompt、回答、图片、文件或密钥；开放问题可能消耗 1 次免费 Run。
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={running || !input.trim()}
            >
              <SendIcon />
              发送
            </Button>
          </div>
        </form>
      </aside>

      <ConfirmDialog
        open={Boolean(pendingInterrupt)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && pendingInterrupt) resolveInterrupt(false);
        }}
        title="确认运行当前 Thread？"
        description="学习助手不会直接替你消耗额度。确认后才会调用工作台 Run；每个模型回合都会计入免费 Run。"
        cancelLabel="先不运行"
        confirmLabel="确认运行"
        confirmVariant="default"
        onCancel={() => resolveInterrupt(false)}
        onConfirm={() => resolveInterrupt(true)}
      />
    </>
  );
}
