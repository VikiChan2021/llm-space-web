import { HttpAgent, type AgentSubscriber, type Interrupt } from "@ag-ui/client";
import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Button } from "@llm-space/ui/ui/button";
import { Textarea } from "@llm-space/ui/ui/textarea";
import {
  BotIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
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
import { createPortal } from "react-dom";

import { guestCoachApiUrl } from "../guest-api";

import {
  executeCoachAction,
  parseCoachAction,
  type CoachActionEnvironment,
} from "./coach-actions";
import {
  getCoachSurfaceHint,
  readGuestCoachGuidanceEnabled,
  saveGuestCoachGuidanceEnabled,
  type CoachSurfaceId,
} from "./coach-layout";
import {
  captureWeatherLearningEvent,
  type WeatherLearningAnalyticsEvent,
} from "./learning-analytics";
import { WeatherLearningCard } from "./weather-learning-card";
import {
  canShowWeatherLearningPrompt,
  clearWeatherLearningProgress,
  loadWeatherLearningProgress,
  reduceWeatherLearningProgress,
  saveWeatherLearningProgress,
  type WeatherLearningEvent,
  type WeatherLearningObservation,
  type WeatherLearningProgress,
} from "./weather-learning-track";

import "./coach.css";

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
  "解释 Variables",
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
  variant: "docked" | "overlay";
  portalTarget?: Element | null;
  surface?: CoachSurfaceId;
  showCollapsedNudge?: boolean;
  context: LearningCoachContext;
  onOpenChange: (open: boolean) => void;
  onOpenVariables: () => void;
  onRequestRun: (options?: { fromFirstUserMessage: boolean }) => boolean;
  onRunCompleted: () => void;
  weatherObservation: WeatherLearningObservation;
  interactionBlocked: boolean;
  onOpenRunHistory: () => void;
  comparisonOpenedToken: number;
}

export default function LearningCoach({
  open,
  variant,
  portalTarget,
  surface = "workbench",
  showCollapsedNudge = true,
  context,
  onOpenChange,
  onOpenVariables,
  onRequestRun,
  onRunCompleted,
  weatherObservation,
  interactionBlocked,
  onOpenRunHistory,
  comparisonOpenedToken,
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
  const [weatherProgress, setWeatherProgress] =
    useState<WeatherLearningProgress | null>(() =>
      loadWeatherLearningProgress(window.localStorage)
    );
  const [nudgeStage, setNudgeStage] = useState<string | null>(null);
  const [guidanceEnabled, setGuidanceEnabled] = useState(() =>
    readGuestCoachGuidanceEnabled(getBrowserStorage())
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const runFromFirstUserMessageRef = useRef(false);
  const handledComparisonTokenRef = useRef(0);
  const previousWeatherStageRef = useRef(weatherProgress?.stage);

  const contextValue = useMemo(() => JSON.stringify(context), [context]);
  const actionEnvironment = useMemo<CoachActionEnvironment>(
    () => ({
      openVariables: () => onOpenVariables(),
      requestRun: () => {
        const result = onRequestRun({
          fromFirstUserMessage: runFromFirstUserMessageRef.current,
        });
        runFromFirstUserMessageRef.current = false;
        return result;
      },
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

  const updateAssistant = useCallback((messageId: string, delta: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, content: `${message.content}${delta}` }
          : message
      )
    );
  }, []);

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
    },
    [agent, contextValue, createSubscriber, onRunCompleted, running]
  );

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

  const updateWeatherProgress = useCallback(
    (
      event: WeatherLearningEvent,
      analyticsEvent?: WeatherLearningAnalyticsEvent
    ) => {
      setWeatherProgress((current) => {
        const next = reduceWeatherLearningProgress(current, event);
        if (!next) return current;
        saveWeatherLearningProgress(window.localStorage, next);
        if (analyticsEvent) captureWeatherLearningEvent(analyticsEvent, next);
        return next;
      });
    },
    []
  );

  useEffect(() => {
    if (!weatherProgress) return;
    updateWeatherProgress({
      type: "observation",
      observation: weatherObservation,
      now: new Date().toISOString(),
    });
  }, [updateWeatherProgress, weatherObservation, weatherProgress]);

  useEffect(() => {
    if (
      !comparisonOpenedToken ||
      comparisonOpenedToken === handledComparisonTokenRef.current
    ) {
      return;
    }
    handledComparisonTokenRef.current = comparisonOpenedToken;
    const now = new Date().toISOString();
    updateWeatherProgress({
      type: "comparison_opened",
      now,
    });
    if (
      weatherProgress &&
      !open &&
      !interactionBlocked &&
      canShowWeatherLearningPrompt(weatherProgress, now)
    ) {
      setNudgeStage("comparison_opened");
      updateWeatherProgress(
        { type: "prompt_shown", now },
        "proactive_prompt_shown"
      );
    }
  }, [
    comparisonOpenedToken,
    interactionBlocked,
    open,
    updateWeatherProgress,
    weatherProgress,
  ]);

  useEffect(() => {
    const previousStage = previousWeatherStageRef.current;
    const nextStage = weatherProgress?.stage;
    previousWeatherStageRef.current = nextStage;
    if (!weatherProgress || !previousStage || previousStage === nextStage)
      return;
    captureWeatherLearningEvent(
      nextStage === "completed" ? "track_completed" : "step_completed",
      weatherProgress
    );
    if (
      !open &&
      !interactionBlocked &&
      !context.running &&
      !pendingInterrupt &&
      canShowWeatherLearningPrompt(weatherProgress, new Date().toISOString())
    ) {
      setNudgeStage(nextStage ?? null);
      updateWeatherProgress(
        { type: "prompt_shown", now: new Date().toISOString() },
        "proactive_prompt_shown"
      );
    }
  }, [
    context.running,
    interactionBlocked,
    open,
    pendingInterrupt,
    updateWeatherProgress,
    weatherProgress,
  ]);

  const startWeatherLearning = useCallback(() => {
    const now = new Date().toISOString();
    const event: WeatherLearningEvent = {
      type: "start",
      threadRecordId: weatherObservation.threadRecordId,
      runCount: weatherObservation.runCount,
      now,
      sessionId: crypto.randomUUID(),
    };
    const next = reduceWeatherLearningProgress(null, event);
    if (!next) return;
    setWeatherProgress(next);
    saveWeatherLearningProgress(window.localStorage, next);
    captureWeatherLearningEvent("track_started", next);
  }, [weatherObservation]);

  const resetWeatherLearning = useCallback(() => {
    if (weatherProgress) {
      captureWeatherLearningEvent("track_reset", weatherProgress);
    }
    clearWeatherLearningProgress(window.localStorage);
    setWeatherProgress(null);
    setNudgeStage(null);
  }, [weatherProgress]);

  const dispatchWeatherLearning = useCallback(
    (event: WeatherLearningEvent) => {
      const analyticsEvent =
        event.type === "pause"
          ? "track_paused"
          : event.type === "resume"
            ? "track_resumed"
            : undefined;
      updateWeatherProgress(event, analyticsEvent);
    },
    [updateWeatherProgress]
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

  if (!open) {
    if (
      !showCollapsedNudge ||
      !nudgeStage ||
      !weatherProgress ||
      interactionBlocked
    )
      return null;
    return (
      <div className="bg-popover text-popover-foreground fixed right-3 bottom-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border p-3 shadow-xl">
        <div className="flex items-start gap-2.5">
          <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
            <BotIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">学习轨道有了新进展</div>
            <p className="text-muted-foreground mt-1 text-[0.6875rem] leading-relaxed">
              因为刚完成了一个可观测步骤，现在适合查看下一项任务。
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                onClick={() => {
                  setNudgeStage(null);
                  onOpenChange(true);
                }}
              >
                查看下一步
                <ChevronRightIcon />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNudgeStage(null)}
              >
                稍后
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNudgeStage(null);
                  dispatchWeatherLearning({
                    type: "pause",
                    now: new Date().toISOString(),
                  });
                }}
              >
                暂停引导
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const surfaceHint = getCoachSurfaceHint(surface);
  const compactDialog = Boolean(portalTarget);
  const coach = (
    <>
      <aside
        data-coach-dialog-panel={compactDialog ? "true" : undefined}
        role={variant === "docked" ? "complementary" : "dialog"}
        aria-modal={variant === "overlay" ? "false" : undefined}
        aria-labelledby="learning-coach-title"
        className={
          variant === "docked"
            ? "bg-popover text-popover-foreground flex h-full w-96 shrink-0 flex-col overflow-hidden border-l"
            : portalTarget
              ? "bg-popover text-popover-foreground absolute inset-y-3 right-3 z-20 flex w-[min(24rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border shadow-2xl"
              : "bg-popover text-popover-foreground fixed inset-y-2 right-2 z-60 flex w-[min(24rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        }
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
                Learning V1
              </span>
            </div>
            <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
              <span>
                {compactDialog
                  ? `${surfaceHint.label} · 按需问答`
                  : guidanceEnabled
                    ? "学习引导 + 按需问答 · 页面动作受安全策略控制"
                    : "按需问答 · 学习引导已关闭"}
              </span>
              {!compactDialog && !guidanceEnabled ? (
                <button
                  type="button"
                  className="text-primary shrink-0 font-medium hover:underline"
                  onClick={() => {
                    setGuidanceEnabled(true);
                    saveGuestCoachGuidanceEnabled(getBrowserStorage(), true);
                  }}
                >
                  开启引导
                </button>
              ) : null}
            </div>
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

        {!compactDialog && surface !== "workbench" ? (
          <div className="border-b bg-violet-500/5 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-200">
              <SparklesIcon className="size-3.5" />
              {surfaceHint.label}
            </div>
            <p className="text-muted-foreground mt-1 text-[0.6875rem] leading-relaxed">
              {surfaceHint.message}
            </p>
            <p className="text-muted-foreground mt-1 text-[0.625rem] leading-relaxed">
              仅感知当前面板类型，不读取表单值或正文。
            </p>
          </div>
        ) : null}

        {!compactDialog && guidanceEnabled ? (
          <WeatherLearningCard
            available={context.starterId === "weather"}
            observation={weatherObservation}
            progress={weatherProgress}
            coachRunning={running}
            onStart={startWeatherLearning}
            onDispatch={dispatchWeatherLearning}
            onAskRun={(fromFirstUserMessage) => {
              runFromFirstUserMessageRef.current = fromFirstUserMessage;
              ask(
                fromFirstUserMessage
                  ? "从第一条用户消息运行当前 Thread"
                  : "运行当前 Thread"
              );
            }}
            onHighlight={(elementId) => {
              const receipt = executeCoachAction(
                { name: "highlight_element", elementId },
                actionEnvironment
              );
              addReceipt(receipt.message, !receipt.success);
            }}
            onOpenRunHistory={onOpenRunHistory}
            onReset={resetWeatherLearning}
            onDismiss={() => {
              setGuidanceEnabled(false);
              saveGuestCoachGuidanceEnabled(getBrowserStorage(), false);
            }}
          />
        ) : null}

        {!compactDialog && guidanceEnabled ? (
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
        ) : null}

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
              不发送完整 Prompt、回答、图片、文件或密钥；开放问题可能消耗 1
              次免费 Run。
            </div>
            <Button type="submit" size="sm" disabled={running || !input.trim()}>
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
        coachSurface="confirmation"
        coachOwner="learning-coach"
        onCancel={() => resolveInterrupt(false)}
        onConfirm={() => resolveInterrupt(true)}
      />
    </>
  );

  return portalTarget ? createPortal(coach, portalTarget) : coach;
}

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
