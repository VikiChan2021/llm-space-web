import { Button } from "@llm-space/ui/ui/button";
import {
  CheckCircle2Icon,
  CirclePauseIcon,
  CloudSunIcon,
  GitCompareArrowsIcon,
  LocateFixedIcon,
  PlayIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import type {
  WeatherLearningEvent,
  WeatherLearningObservation,
  WeatherLearningProgress,
} from "./weather-learning-track";
import { weatherLearningStep } from "./weather-learning-track";

interface WeatherLearningCardProps {
  available: boolean;
  observation: WeatherLearningObservation;
  progress: WeatherLearningProgress | null;
  coachRunning: boolean;
  onStart: () => void;
  onDispatch: (event: WeatherLearningEvent) => void;
  onAskRun: (fromFirstUserMessage: boolean) => void;
  onHighlight: (elementId: "tools" | "run-settings" | "message-input") => void;
  onOpenRunHistory: () => void;
  onReset: () => void;
  onDismiss: () => void;
}

const REFLECTION_OPTIONS = [
  "模型每次都会随机选择一个城市",
  "输入城市改变，工具参数和结果随之变化",
  "Tools 只负责美化最终回答",
] as const;

export function WeatherLearningCard({
  available,
  observation,
  progress,
  coachRunning,
  onStart,
  onDispatch,
  onAskRun,
  onHighlight,
  onOpenRunHistory,
  onReset,
  onDismiss,
}: WeatherLearningCardProps) {
  const [reflection, setReflection] = useState<string | null>(null);
  const [reflectionError, setReflectionError] = useState(false);

  if (!progress) {
    return (
      <section className="border-b bg-gradient-to-br from-sky-500/10 via-transparent to-violet-500/10 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-200">
            <CloudSunIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">天气 Agent 学习轨道</div>
            <p className="text-muted-foreground mt-1 text-[0.6875rem] leading-relaxed">
              约 8 分钟，亲手完成两次 Run、观察 Tool 调用并比较结果。
            </p>
            {!available ? (
              <p className="mt-2 text-[0.6875rem] text-amber-700 dark:text-amber-200">
                请先从“案例”打开实时天气 Agent，再开始本轨道。
              </p>
            ) : null}
            <Button
              className="mt-2"
              size="sm"
              disabled={!available}
              onClick={onStart}
            >
              <PlayIcon />
              开始学习
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="关闭学习引导"
            title="关闭学习引导"
            onClick={onDismiss}
          >
            <XIcon />
          </Button>
        </div>
      </section>
    );
  }

  const step = weatherLearningStep(progress.stage);
  return (
    <section className="border-b bg-gradient-to-br from-sky-500/10 via-transparent to-violet-500/10 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold">
            天气 Agent · 第 {step}/6 步
          </div>
          <div className="text-muted-foreground mt-0.5 text-[0.625rem]">
            学习进度仅保存在当前浏览器
          </div>
        </div>
        <div className="flex items-center gap-1">
          {progress.stage !== "completed" ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={progress.paused ? "继续学习" : "暂停学习"}
              onClick={() =>
                onDispatch({
                  type: progress.paused ? "resume" : "pause",
                  now: new Date().toISOString(),
                })
              }
            >
              {progress.paused ? <PlayIcon /> : <CirclePauseIcon />}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="重新开始天气学习轨道"
            onClick={onReset}
          >
            <RotateCcwIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="关闭学习引导"
            title="关闭学习引导"
            onClick={onDismiss}
          >
            <XIcon />
          </Button>
        </div>
      </div>
      <div className="bg-muted mb-3 h-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 transition-[width]"
          style={{ width: `${(step / 6) * 100}%` }}
        />
      </div>

      {progress.threadRecordId !== observation.threadRecordId ? (
        <div className="rounded-lg border border-dashed px-3 py-2 text-[0.6875rem]">
          你已切换到另一个 Thread。本轨道已自动停在原天气
          Thread；切回后会从当前步骤继续。
        </div>
      ) : progress.paused ? (
        <div className="rounded-lg border border-dashed px-3 py-2 text-[0.6875rem]">
          学习轨道已暂停。工作台仍可自由使用，继续后会回到当前步骤。
        </div>
      ) : (
        <WeatherLearningTask
          progress={progress}
          observation={observation}
          coachRunning={coachRunning}
          reflection={reflection}
          reflectionError={reflectionError}
          onReflectionChange={(value) => {
            setReflection(value);
            setReflectionError(false);
          }}
          onReflectionSubmit={() => {
            const correct = reflection === REFLECTION_OPTIONS[1];
            setReflectionError(!correct);
            onDispatch({
              type: "reflection_answered",
              correct,
              now: new Date().toISOString(),
            });
          }}
          onDispatch={onDispatch}
          onAskRun={onAskRun}
          onHighlight={onHighlight}
          onOpenRunHistory={onOpenRunHistory}
        />
      )}
    </section>
  );
}

function WeatherLearningTask({
  progress,
  observation,
  coachRunning,
  reflection,
  reflectionError,
  onReflectionChange,
  onReflectionSubmit,
  onDispatch,
  onAskRun,
  onHighlight,
  onOpenRunHistory,
}: {
  progress: WeatherLearningProgress;
  observation: WeatherLearningObservation;
  coachRunning: boolean;
  reflection: string | null;
  reflectionError: boolean;
  onReflectionChange: (value: string) => void;
  onReflectionSubmit: () => void;
  onDispatch: (event: WeatherLearningEvent) => void;
  onAskRun: (fromFirstUserMessage: boolean) => void;
  onHighlight: (elementId: "tools" | "run-settings" | "message-input") => void;
  onOpenRunHistory: () => void;
}) {
  const now = () => new Date().toISOString();

  if (progress.stage === "concepts") {
    return (
      <TaskShell title="先认识 Tool 与 ReAct">
        Tool 让模型读取实时信息；ReAct 让模型在“思考 → 调用工具 →
        观察结果”之间继续循环。你可以在 Run 右侧设置中开启 ReAct。
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onHighlight("tools")}
          >
            高亮 Tools
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onHighlight("run-settings")}
          >
            定位 ReAct
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onDispatch({ type: "concepts_acknowledged", now: now() })
            }
          >
            我理解了
          </Button>
        </div>
      </TaskShell>
    );
  }
  if (progress.stage === "first_run") {
    return (
      <TaskShell title="运行一次真实天气查询">
        点击后助手会先请求确认，只有你确认才会消耗免费 Run。
        <Button
          className="mt-2"
          size="sm"
          disabled={coachRunning || observation.running}
          onClick={() => onAskRun(false)}
        >
          <PlayIcon />
          发起第一次 Run
        </Button>
      </TaskShell>
    );
  }
  if (progress.stage === "inspect_tool") {
    const pending = observation.pendingWeatherToolCallCount > 0;
    return (
      <TaskShell title="读懂 weather_report 工具链">
        已发现 {observation.weatherToolCallCount} 次天气工具调用，完成输出{" "}
        {observation.completedWeatherToolCallCount} 次。
        {pending
          ? " 当前调用仍待执行：在消息卡中点击 Call tools；若未启用 ReAct，再点 Continue。"
          : " 展开工具卡即可查看参数、状态和输出。"}
        <Button
          className="mt-2"
          size="sm"
          disabled={observation.weatherToolCallCount === 0}
          onClick={() =>
            onDispatch({
              type: "tool_trace_acknowledged",
              observation,
              now: now(),
            })
          }
        >
          我找到了工具调用
        </Button>
      </TaskShell>
    );
  }
  if (progress.stage === "change_input") {
    return (
      <TaskShell title="把广州改成另一座城市">
        请亲手修改第一条用户消息。助手只负责定位，不会替你改 Prompt。
        <Button
          className="mt-2"
          variant="outline"
          size="sm"
          onClick={() => onHighlight("message-input")}
        >
          <LocateFixedIcon />
          定位用户消息
        </Button>
      </TaskShell>
    );
  }
  if (progress.stage === "second_run") {
    return (
      <TaskShell title="用新城市再运行一次">
        已检测到输入发生变化。现在运行第二次，生成可比较的 Run 记录。
        <Button
          className="mt-2"
          size="sm"
          disabled={coachRunning || observation.running}
          onClick={() => onAskRun(true)}
        >
          <PlayIcon />
          发起第二次 Run
        </Button>
      </TaskShell>
    );
  }
  if (progress.stage === "compare") {
    return (
      <TaskShell title="比较两次 Run">
        打开 Run history，选择两条记录并点击
        Compare。比较界面真正打开后，本步骤才算完成。
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" onClick={onOpenRunHistory}>
            <GitCompareArrowsIcon />
            打开 Run history
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!progress.comparisonOpened}
            onClick={() =>
              onDispatch({ type: "comparison_acknowledged", now: now() })
            }
          >
            进入复盘
          </Button>
        </div>
      </TaskShell>
    );
  }
  if (progress.stage === "reflection") {
    return (
      <TaskShell title="最后一个问题">
        哪个现象最能说明 Agent 的 Tool 调用受上下文驱动？
        <fieldset className="mt-2 space-y-1.5">
          {REFLECTION_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-[0.6875rem]"
            >
              <input
                type="radio"
                name="weather-learning-reflection"
                checked={reflection === option}
                onChange={() => onReflectionChange(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>
        {reflectionError ? (
          <p
            role="alert"
            className="mt-1.5 text-[0.6875rem] text-amber-700 dark:text-amber-200"
          >
            再观察一下：改变的是输入城市，随后变化的是 Tool 参数与结果。
          </p>
        ) : null}
        <Button
          className="mt-2"
          size="sm"
          disabled={!reflection}
          onClick={onReflectionSubmit}
        >
          提交答案
        </Button>
      </TaskShell>
    );
  }
  return (
    <TaskShell title="学习闭环已完成">
      <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-200">
        <CheckCircle2Icon className="size-4" />
        你已完成“概念 → 运行 → 工具 → 改参 → 对比 → 复盘”。
      </span>
    </TaskShell>
  );
}

function TaskShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background/70 rounded-lg border px-3 py-2.5 text-[0.6875rem] leading-relaxed">
      <div className="mb-1 text-xs font-medium">{title}</div>
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}
