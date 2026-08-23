import type { Thread } from "@llm-space/core";
import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { useDefaultModel } from "@llm-space/ui/components/model-provider";
import {
  ThreadPlayground,
  type ThreadRunPreparation,
  type ThreadRunSettledEvent,
  type ThreadPlaygroundLearningEvent,
} from "@llm-space/ui/components/thread-playground";
import { HostServicesProvider } from "@llm-space/ui/host";
import { Button } from "@llm-space/ui/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@llm-space/ui/ui/popover";
import {
  CircleHelpIcon,
  BotIcon,
  InfoIcon,
  LibraryIcon,
  RotateCcwIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import {
  OPEN_GUEST_SETTINGS_EVENT,
  requestGuestThreadRun,
  webHost,
} from "@/host/web-host";

import { CoachLauncher } from "./coach/coach-launcher";
import {
  normalizeCoachSurface,
  readGuestCoachEnabled,
  resolveCoachPresentation,
  saveGuestCoachEnabled,
  type CoachSurfaceId,
} from "./coach/coach-layout";
import type { LearningCoachContext } from "./coach/learning-coach";
import { observeWeatherLearning } from "./coach/weather-learning-observation";
import {
  createGuestTransport,
  readGuestQuota,
  type GuestQuota,
} from "./guest-api";
import { GuestExampleDialog } from "./guest-example-dialog";
import {
  createGuestExampleThread,
  type GuestExample,
} from "./guest-examples";
import { GuestFirstRunDialog } from "./guest-first-run-dialog";
import {
  captureGuestActivationEvent,
  classifyGuestRunFailure,
  clearGuestRunRecovery,
  dismissGuestFirstSuccessCallout,
  guestRunPreparation,
  hasCompletedAgentLoop,
  hasCompletedToolResult,
  initialGuestRunResult,
  loadGuestFirstSuccess,
  recordGuestFirstRunMode,
  recordGuestFirstSuccess,
  recordGuestHistoryOpened,
  recordGuestRunRecovery,
  recoveryRunPreparation,
  saveGuestFirstSuccess,
  shouldOfferGuestFirstRun,
  type GuestFirstRunMode,
  type GuestFirstSuccessState,
} from "./guest-first-success";
import { GuestFirstSuccessCallout } from "./guest-first-success-callout";
import { OPEN_GUEST_MCP_SETTINGS_EVENT } from "./guest-mcp";
import { GuestMcpSettingsDialog } from "./guest-mcp-settings-dialog";
import { GUEST_RUN_RECOVERY } from "./guest-run-recovery";
import {
  GuestSettingsDialog,
  type GuestSettingsTab,
} from "./guest-settings-dialog";
import { GuestThreadLibrary } from "./guest-thread-library";
import {
  addGuestThread,
  DEFAULT_GUEST_STARTER_ID,
  deleteGuestThread,
  duplicateGuestThread,
  loadGuestWorkspace,
  MAX_GUEST_THREAD_IMPORT_BYTES,
  parseGuestThreadImport,
  resetGuestThread,
  saveGuestWorkspace,
  selectGuestThread,
  serializeGuestThread,
  uniqueGuestThreadTitle,
  updateGuestThread,
  type GuestWorkspace,
  type GuestWorkspaceFactory,
  type GuestWorkspaceStorage,
} from "./guest-workspace";

const LearningCoach = lazy(() => import("./coach/learning-coach"));
const GuestEvaluationLabDialog = lazy(
  () => import("./guest-evaluation-lab-dialog")
);

const BROWSER_WORKSPACE_FACTORY: GuestWorkspaceFactory = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};
const BROWSER_STORAGE = _browserStorage();
const WEB_APP_TITLE = "LLM Space — Build, trace, and debug agents in one place";
const WIDE_COACH_QUERY = "(min-width: 1280px)";

interface GuestWorkspaceState {
  workspace: GuestWorkspace;
  storageError: string | null;
}

export function GuestWorkbench() {
  const defaultModel = useDefaultModel();
  const [workspaceState, setWorkspaceState] = useState<GuestWorkspaceState>(
    () => {
      const loaded = loadGuestWorkspace(
        BROWSER_STORAGE,
        BROWSER_WORKSPACE_FACTORY,
        defaultModel
      );
      return {
        workspace: loaded.workspace,
        storageError: loaded.storageError,
      };
    }
  );
  const [revision, setRevision] = useState(0);
  const [quota, setQuota] = useState<GuestQuota | null>(null);
  const [quotaError, setQuotaError] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [mcpSettingsOpen, setMcpSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exampleDialogOpen, setExampleDialogOpen] = useState(false);
  const [evaluationLabOpen, setEvaluationLabOpen] = useState(false);
  const [evaluationCreateRequest, setEvaluationCreateRequest] = useState(0);
  const [coachEnabled, setCoachEnabled] = useState(() =>
    readGuestCoachEnabled(BROWSER_STORAGE)
  );
  const [coachLoaded, setCoachLoaded] = useState(() =>
    readGuestCoachEnabled(BROWSER_STORAGE)
  );
  const [floatingCoachOpen, setFloatingCoachOpen] = useState(false);
  const [openRunHistoryRequest, setOpenRunHistoryRequest] = useState(0);
  const [runFromMessageRequest, setRunFromMessageRequest] = useState<{
    token: number;
    messageId: string;
  } | null>(null);
  const [comparisonOpenedToken, setComparisonOpenedToken] = useState(0);
  const [creatingExample, setCreatingExample] = useState(false);
  const [settingsTab, setSettingsTab] =
    useState<GuestSettingsTab>("appearance");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [firstRunDialogOpen, setFirstRunDialogOpen] = useState(false);
  const [firstSuccessState, setFirstSuccessState] =
    useState<GuestFirstSuccessState>(() =>
      loadGuestFirstSuccess(BROWSER_STORAGE, BROWSER_WORKSPACE_FACTORY)
    );
  const wideCoachLayout = useWideCoachLayout();
  const activeDialogSurface = useActiveDialogSurface();
  const previousDialogTargetRef = useRef<Element | null>(null);
  const workspaceRef = useRef(workspaceState.workspace);
  const firstSuccessRef = useRef(firstSuccessState);
  const sessionEventCapturedRef = useRef(false);
  const pendingFirstRunRef = useRef<
    ((value: ThreadRunPreparation | false) => void) | null
  >(null);
  const runStartedAtRef = useRef<number | null>(null);
  const { workspace, storageError } = workspaceState;
  const activeRecord =
    workspace.threads.find(
      (record) => record.id === workspace.activeThreadId
    ) ?? workspace.threads[0];
  const coachPresentation = resolveCoachPresentation({
    enabled: coachEnabled,
    wide: wideCoachLayout,
    dialogOpen: Boolean(activeDialogSurface),
    floatingOpen: floatingCoachOpen,
  });
  const coachSurface = activeDialogSurface?.surface ?? "workbench";

  useEffect(() => {
    document.title = WEB_APP_TITLE;
  }, []);
  useEffect(() => {
    if (sessionEventCapturedRef.current) return;
    sessionEventCapturedRef.current = true;
    captureGuestActivationEvent("session_started", {
      state: firstSuccessRef.current,
      starterId: activeRecord.starterId,
    });
  }, [activeRecord.starterId]);
  useEffect(() => {
    const nextTarget = activeDialogSurface?.target ?? null;
    if (previousDialogTargetRef.current !== nextTarget) {
      previousDialogTargetRef.current = nextTarget;
      setFloatingCoachOpen(false);
    }
  }, [activeDialogSurface]);

  const setCoachEnabledPreference = useCallback((enabled: boolean) => {
    setCoachEnabled(enabled);
    saveGuestCoachEnabled(BROWSER_STORAGE, enabled);
    if (enabled) setCoachLoaded(true);
  }, []);

  const refreshQuota = useCallback(async () => {
    try {
      setQuota(await readGuestQuota());
      setQuotaError(false);
    } catch {
      setQuotaError(true);
    }
  }, []);
  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);
  useEffect(() => {
    const openMcpSettings = () => setMcpSettingsOpen(true);
    window.addEventListener(
      OPEN_GUEST_MCP_SETTINGS_EVENT,
      openMcpSettings
    );
    return () =>
      window.removeEventListener(
        OPEN_GUEST_MCP_SETTINGS_EVENT,
        openMcpSettings
      );
  }, []);
  useEffect(() => {
    const openSettings = (event: Event) => {
      const requested = (event as CustomEvent<{ tab?: string }>).detail?.tab;
      setSettingsTab(
        requested === "models" || requested === "mcp" || requested === "skills"
          ? requested
          : "appearance"
      );
      setSettingsOpen(true);
    };
    window.addEventListener(OPEN_GUEST_SETTINGS_EVENT, openSettings);
    return () =>
      window.removeEventListener(OPEN_GUEST_SETTINGS_EVENT, openSettings);
  }, []);

  const transport = useMemo(
    () =>
      createGuestTransport((nextQuota) => {
        if (nextQuota) setQuota(nextQuota);
        else void refreshQuota();
      }),
    [refreshQuota]
  );
  const guestHost = useMemo(
    () => ({ ...webHost, createTransport: () => transport }),
    [transport]
  );

  const commitWorkspace = useCallback(
    (transform: (current: GuestWorkspace) => GuestWorkspace) => {
      const nextWorkspace = transform(workspaceRef.current);
      if (nextWorkspace === workspaceRef.current) return;
      workspaceRef.current = nextWorkspace;
      setWorkspaceState({
        workspace: nextWorkspace,
        storageError: saveGuestWorkspace(BROWSER_STORAGE, nextWorkspace),
      });
    },
    []
  );

  const commitFirstSuccess = useCallback(
    (
      transform: (current: GuestFirstSuccessState) => GuestFirstSuccessState
    ) => {
      const next = transform(firstSuccessRef.current);
      firstSuccessRef.current = next;
      setFirstSuccessState(next);
      saveGuestFirstSuccess(BROWSER_STORAGE, next);
      return next;
    },
    []
  );

  const prepareGuestRun = useCallback(
    async ({
      fromMessageId,
    }: {
      fromMessageId?: string;
    }): Promise<ThreadRunPreparation | false | void> => {
      const recoveryMode = recoveryRunPreparation(
        firstSuccessRef.current,
        activeRecord.id,
        fromMessageId
      );
      if (recoveryMode) return recoveryMode;
      if (
        !shouldOfferGuestFirstRun({
          state: firstSuccessRef.current,
          starterId: activeRecord.starterId,
          thread: activeRecord.thread,
        })
      ) {
        return undefined;
      }
      captureGuestActivationEvent("mode_choice_shown", {
        state: firstSuccessRef.current,
        starterId: activeRecord.starterId,
        stage: "first_run",
      });
      setFirstRunDialogOpen(true);
      return new Promise<ThreadRunPreparation | false>((resolve) => {
        pendingFirstRunRef.current = resolve;
      });
    },
    [activeRecord]
  );

  const resolveFirstRun = useCallback(
    (mode?: GuestFirstRunMode) => {
      const resolve = pendingFirstRunRef.current;
      if (!resolve) return;
      pendingFirstRunRef.current = null;
      setFirstRunDialogOpen(false);
      if (!mode) {
        resolve(false);
        return;
      }
      const next = commitFirstSuccess((current) =>
        recordGuestFirstRunMode(
          current,
          mode,
          BROWSER_WORKSPACE_FACTORY.now()
        )
      );
      captureGuestActivationEvent("mode_selected", {
        state: next,
        starterId: activeRecord.starterId,
        mode,
        stage: "first_run",
      });
      resolve(guestRunPreparation(mode));
    },
    [activeRecord.starterId, commitFirstSuccess]
  );

  const handleRunSettled = useCallback(
    (event: ThreadRunSettledEvent) => {
      const now = BROWSER_WORKSPACE_FACTORY.now();
      const elapsedMs = runStartedAtRef.current
        ? Date.now() - runStartedAtRef.current
        : undefined;
      runStartedAtRef.current = null;
      if (event.result) {
        const next = commitFirstSuccess((current) =>
          recordGuestRunRecovery(current, activeRecord.id, event, now)
        );
        if (event.result.outcome === "failed") {
          captureGuestActivationEvent("run_failed", {
            state: next,
            starterId: activeRecord.starterId,
            mode: event.mode,
            stage: "first_run",
            failureCategory: classifyGuestRunFailure(event.result.error).category,
            elapsedMs,
          });
        } else {
          captureGuestActivationEvent("run_aborted", {
            state: next,
            starterId: activeRecord.starterId,
            mode: event.mode,
            stage: "first_run",
            elapsedMs,
          });
        }
        return;
      }

      const previous = firstSuccessRef.current;
      commitFirstSuccess(clearGuestRunRecovery);
      if (hasCompletedToolResult(event.thread)) {
        captureGuestActivationEvent("tool_result_observed", {
          state: firstSuccessRef.current,
          starterId: activeRecord.starterId,
          mode: event.mode,
          stage: "tool_result",
          elapsedMs,
        });
      }
      if (hasCompletedAgentLoop(event.thread) && !previous.completedAt) {
        const next = commitFirstSuccess((current) =>
          recordGuestFirstSuccess(current, activeRecord.id, now)
        );
        captureGuestActivationEvent("final_answer_completed", {
          state: next,
          starterId: activeRecord.starterId,
          mode: event.mode,
          stage: "final_answer",
          elapsedMs,
        });
      }
    },
    [activeRecord.id, activeRecord.starterId, commitFirstSuccess]
  );

  const handleChange = useCallback(
    (nextThread: Thread) => {
      commitWorkspace((current) =>
        updateGuestThread(
          current,
          activeRecord.id,
          nextThread,
          BROWSER_WORKSPACE_FACTORY.now()
        )
      );
    },
    [activeRecord.id, commitWorkspace]
  );
  const handleRename = useCallback(
    (title: string) => {
      const trimmed = title.trim();
      const unique = uniqueGuestThreadTitle(
        trimmed,
        workspace.threads,
        activeRecord.id
      );
      if (unique !== trimmed) {
        return Promise.reject(new Error("已有同名 Thread，请换一个名称。"));
      }
      commitWorkspace((current) =>
        updateGuestThread(
          current,
          activeRecord.id,
          { ...activeRecord.thread, title: trimmed },
          BROWSER_WORKSPACE_FACTORY.now()
        )
      );
      return Promise.resolve(true);
    },
    [
      activeRecord.id,
      activeRecord.thread,
      commitWorkspace,
      workspace.threads,
    ]
  );
  const handleCreate = useCallback(() => {
    if (running) return;
    setExampleDialogOpen(true);
  }, [running]);
  const handleSelectExample = useCallback(
    async (example: GuestExample) => {
      if (running || creatingExample) return;
      setCreatingExample(true);
      try {
        const thread = await createGuestExampleThread(
          example.id,
          guestHost,
          BROWSER_WORKSPACE_FACTORY.createId,
          defaultModel
        );
        commitWorkspace((current) =>
          addGuestThread(
            current,
            thread,
            BROWSER_WORKSPACE_FACTORY,
            example.id
          )
        );
        setExampleDialogOpen(false);
        toast.success(`已创建 ${example.label}`);
      } catch (error) {
        toast.error("无法创建案例", {
          description:
            error instanceof Error ? error.message : "请稍后重试。",
        });
      } finally {
        setCreatingExample(false);
      }
    },
    [commitWorkspace, creatingExample, defaultModel, guestHost, running]
  );
  const coachContext = useMemo<LearningCoachContext>(
    () => ({
      page: "guest-workbench",
      activeThreadTitle: activeRecord.thread.title || "未命名 Thread",
      starterId: activeRecord.starterId ?? null,
      running,
      selectedModel:
        activeRecord.thread.model?.id ?? defaultModel?.id ?? "glm-4.5-air",
      toolCount: activeRecord.thread.context?.tools?.length ?? 0,
      messageCount: activeRecord.thread.context?.messages?.length ?? 0,
    }),
    [activeRecord, defaultModel?.id, running]
  );
  const weatherObservation = useMemo(
    () => observeWeatherLearning(activeRecord.id, activeRecord.thread, running),
    [activeRecord.id, activeRecord.thread, running]
  );
  const handleLearningEvent = useCallback(
    (event: ThreadPlaygroundLearningEvent) => {
      if (event.type === "run_history_opened") {
        if (
          firstSuccessRef.current.completedThreadRecordId !== activeRecord.id
        ) {
          return;
        }
        const wasOpened = Boolean(firstSuccessRef.current.historyOpenedAt);
        const next = commitFirstSuccess((current) =>
          recordGuestHistoryOpened(current, BROWSER_WORKSPACE_FACTORY.now())
        );
        if (!wasOpened) {
          captureGuestActivationEvent("run_history_opened", {
            state: next,
            starterId: activeRecord.starterId,
            stage: "history",
            elapsedMs:
              Date.now() - new Date(next.startedAt).getTime(),
          });
        }
      }
      if (event.type === "run_comparison_opened") {
        setComparisonOpenedToken((value) => value + 1);
      }
    },
    [activeRecord.id, activeRecord.starterId, commitFirstSuccess]
  );
  const handleSelect = useCallback(
    (recordId: string) => {
      if (running || recordId === activeRecord.id) return;
      commitWorkspace((current) => selectGuestThread(current, recordId));
    },
    [activeRecord.id, commitWorkspace, running]
  );
  const handleDuplicate = useCallback(
    (recordId: string) => {
      if (running) return;
      commitWorkspace((current) =>
        duplicateGuestThread(current, recordId, BROWSER_WORKSPACE_FACTORY)
      );
    },
    [commitWorkspace, running]
  );
  const handleDelete = useCallback(
    (recordId: string) => {
      if (running) return;
      commitWorkspace((current) =>
        deleteGuestThread(
          current,
          recordId,
          BROWSER_WORKSPACE_FACTORY,
          defaultModel
        )
      );
      toast.success("Thread 已删除");
    },
    [commitWorkspace, defaultModel, running]
  );
  const handleReset = useCallback(async () => {
    if (running) return;
    try {
      const replacement = await createGuestExampleThread(
        activeRecord.starterId ?? DEFAULT_GUEST_STARTER_ID,
        guestHost,
        BROWSER_WORKSPACE_FACTORY.createId,
        defaultModel
      );
      commitWorkspace((current) =>
        resetGuestThread(
          current,
          activeRecord.id,
          BROWSER_WORKSPACE_FACTORY.createId,
          BROWSER_WORKSPACE_FACTORY.now(),
          defaultModel,
          replacement
        )
      );
      setRevision((value) => value + 1);
      setResetConfirmOpen(false);
      toast.success("已恢复案例初始内容");
    } catch (error) {
      toast.error("无法重置案例", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    }
  }, [
    activeRecord.id,
    activeRecord.starterId,
    commitWorkspace,
    defaultModel,
    guestHost,
    running,
  ]);
  const handleImport = useCallback(
    async (file: File): Promise<boolean> => {
      if (running) return false;
      if (file.size > MAX_GUEST_THREAD_IMPORT_BYTES) {
        toast.error("文件过大", {
          description: "V1 最多导入 1 MiB 的 Thread JSON。",
        });
        return false;
      }
      const imported = await parseGuestThreadImport(file.name, await file.text());
      if (!imported) {
        toast.error("无法导入", {
          description: "请选择有效的 LLM Space Thread JSON 文件。",
        });
        return false;
      }
      const fallbackTitle = file.name.replace(/\.json$/i, "").trim();
      const thread = {
        ...imported,
        title: imported.title?.trim() || fallbackTitle || "导入的 Thread",
      };
      commitWorkspace((current) =>
        addGuestThread(current, thread, BROWSER_WORKSPACE_FACTORY)
      );
      if (thread.context?.tools?.length) {
        toast.warning("Thread 已导入", {
          description:
            "工具定义已保留；受支持工具可以执行，其他工具会显示明确的安全边界。",
        });
      } else {
        toast.success("Thread 已导入");
      }
      return true;
    },
    [commitWorkspace, running]
  );
  const handleExport = useCallback(
    (recordId: string) => {
      const record = workspace.threads.find((item) => item.id === recordId);
      if (!record) return;
      const blob = new Blob([serializeGuestThread(record.thread)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${_safeFileStem(record.thread.title)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Thread JSON 已导出");
    },
    [workspace.threads]
  );

  return (
    <HostServicesProvider value={guestHost}>
      <div className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
      <header className="flex min-w-0 flex-nowrap items-center gap-3 border-b px-4 py-3">
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <h1 className="text-base font-semibold">LLM Space Web 工作台</h1>
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-200">
            游客模式
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="查看游客工作台说明"
              >
                <InfoIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80">
              <PopoverHeader>
                <PopoverTitle>游客工作台说明</PopoverTitle>
                <PopoverDescription>
                  Thread 与虚拟文件保存在当前浏览器。安全 Built-in、Custom
                  Tool、MCP 和 ReAct 可体验；Bash 与 Generator 等待隔离沙箱。
                </PopoverDescription>
                <PopoverDescription>
                  免费额度用完后可配置自己的 API Key（即将开放）。
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </div>
        <div className="ml-auto flex min-w-0 flex-nowrap items-center justify-end gap-2">
          <div className="shrink-0 whitespace-nowrap text-right text-xs font-medium">
            {quota
              ? `今日免费 Run：${quota.browserRemaining}/${quota.browserDailyLimit}`
              : quotaError
                ? "额度状态暂不可用"
                : "正在读取额度…"}
          </div>
          <Button
            data-coach-element-id="learning-coach"
            variant={coachEnabled ? "secondary" : "outline"}
            size="sm"
            aria-label={
              coachEnabled && wideCoachLayout
                ? "关闭 Agent 学习助手三栏"
                : "打开 Agent 学习助手"
            }
            aria-expanded={
              coachPresentation === "docked" || coachPresentation === "overlay"
            }
            onClick={() => {
              setCoachLoaded(true);
              if (wideCoachLayout && !activeDialogSurface) {
                setCoachEnabledPreference(!coachEnabled);
                return;
              }
              setFloatingCoachOpen(true);
            }}
          >
            <BotIcon className="size-3.5" />
            <span className="hidden lg:inline">学习助手</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="打开使用说明"
            onClick={() =>
              window.open(
                `${import.meta.env.BASE_URL}#/docs/quick-start`,
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            <CircleHelpIcon className="size-3.5" />
            <span className="hidden xl:inline">使用说明</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="打开工作台设置"
            onClick={() => {
              setSettingsTab("appearance");
              setSettingsOpen(true);
            }}
          >
            <SettingsIcon className="size-3.5" />
            <span className="hidden xl:inline">设置</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="打开 Agent 案例库"
            disabled={running}
            onClick={() => setExampleDialogOpen(true)}
          >
            <SparklesIcon className="size-3.5" />
            <span className="hidden lg:inline">案例</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={`打开 Thread 列表，共 ${workspace.threads.length} 个`}
            onClick={() => setLibraryOpen(true)}
          >
            <LibraryIcon className="size-3.5" />
            <span className="hidden xl:inline">Threads</span>
            {workspace.threads.length}
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="重置当前示例"
            disabled={running}
            onClick={() => setResetConfirmOpen(true)}
          >
            <RotateCcwIcon className="size-3.5" />
            <span className="hidden xl:inline">重置示例</span>
          </Button>
        </div>
      </header>

      {storageError ? (
        <div
          role="alert"
          className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
        >
          {storageError}
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col p-2 sm:p-4">
          {firstSuccessState.completedAt &&
          firstSuccessState.completedThreadRecordId === activeRecord.id &&
          !firstSuccessState.historyOpenedAt &&
          !firstSuccessState.calloutDismissedAt ? (
            <GuestFirstSuccessCallout
              onOpenHistory={() =>
                setOpenRunHistoryRequest((value) => value + 1)
              }
              onDismiss={() =>
                commitFirstSuccess((current) =>
                  dismissGuestFirstSuccessCallout(
                    current,
                    BROWSER_WORKSPACE_FACTORY.now()
                  )
                )
              }
            />
          ) : null}
          <ThreadPlayground
            key={`${activeRecord.id}:${revision}`}
            active
            className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border shadow-lg"
            path={`guest/${activeRecord.id}.json`}
            title={activeRecord.thread.title}
            initialValue={activeRecord.thread}
            transport={transport}
            runtimeId={activeRecord.id}
            onChange={handleChange}
            onRenameTitle={handleRename}
            onStreamingStart={() => {
              setRunning(true);
              runStartedAtRef.current = Date.now();
              const next = commitFirstSuccess(clearGuestRunRecovery);
              captureGuestActivationEvent("run_started", {
                state: next,
                starterId: activeRecord.starterId,
                stage: "first_run",
              });
            }}
            onStreamingEnd={() => {
              setRunning(false);
              void refreshQuota();
            }}
            openRunHistoryRequest={openRunHistoryRequest}
            onOpenEvaluationLab={() => setEvaluationLabOpen(true)}
            onCreateEvaluationExperiment={() => {
              setEvaluationCreateRequest((value) => value + 1);
              setEvaluationLabOpen(true);
            }}
            runFromMessageRequest={runFromMessageRequest}
            onLearningEvent={handleLearningEvent}
            runRecovery={GUEST_RUN_RECOVERY}
            prepareRun={prepareGuestRun}
            onRunSettled={handleRunSettled}
            initialRunResult={initialGuestRunResult(
              firstSuccessState,
              activeRecord.id
            )}
            onRunResultDismissed={() =>
              commitFirstSuccess(clearGuestRunRecovery)
            }
          />
        </main>

        {coachLoaded ? (
          <Suspense fallback={null}>
            <LearningCoach
              open={
                coachPresentation === "docked" ||
                coachPresentation === "overlay"
              }
              variant={coachPresentation === "docked" ? "docked" : "overlay"}
              portalTarget={activeDialogSurface?.target ?? null}
              surface={coachSurface}
              showCollapsedNudge={false}
              context={coachContext}
              onOpenChange={(open) => {
                if (open) {
                  setCoachLoaded(true);
                  setFloatingCoachOpen(true);
                } else if (coachPresentation === "docked") {
                  setCoachEnabledPreference(false);
                } else {
                  setFloatingCoachOpen(false);
                }
              }}
              onOpenVariables={() => guestHost.actions.openVariables()}
              onRequestRun={(options) => {
                if (running) return false;
                if (options?.fromFirstUserMessage) {
                  const firstUserMessage =
                    activeRecord.thread.context?.messages?.find(
                      (message) => message.role === "user"
                    );
                  if (!firstUserMessage) return false;
                  setRunFromMessageRequest((current) => ({
                    token: (current?.token ?? 0) + 1,
                    messageId: firstUserMessage.id,
                  }));
                  return true;
                }
                return requestGuestThreadRun();
              }}
              onRunCompleted={() => void refreshQuota()}
              weatherObservation={weatherObservation}
              interactionBlocked={
                settingsOpen ||
                mcpSettingsOpen ||
                exampleDialogOpen ||
                libraryOpen ||
                resetConfirmOpen ||
                firstRunDialogOpen ||
                evaluationLabOpen
              }
              onOpenRunHistory={() => {
                setOpenRunHistoryRequest((value) => value + 1);
                if (coachPresentation === "overlay") {
                  setFloatingCoachOpen(false);
                }
              }}
              comparisonOpenedToken={comparisonOpenedToken}
            />
          </Suspense>
        ) : null}
      </div>

      {evaluationLabOpen ? (
        <Suspense fallback={null}>
          <GuestEvaluationLabDialog
            open={evaluationLabOpen}
            onOpenChange={setEvaluationLabOpen}
            createRequest={evaluationCreateRequest}
            thread={activeRecord.thread}
            fallbackModel={defaultModel}
            quota={quota}
            transport={transport}
            runtimeId={activeRecord.id}
            onQuotaRefresh={refreshQuota}
          />
        </Suspense>
      ) : null}

      <GuestThreadLibrary
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        records={workspace.threads}
        activeThreadId={activeRecord.id}
        running={running}
        onCreate={handleCreate}
        onSelect={handleSelect}
        onDuplicate={handleDuplicate}
        onExport={handleExport}
        onDelete={handleDelete}
        onImport={handleImport}
      />

      <GuestMcpSettingsDialog
        open={mcpSettingsOpen}
        onOpenChange={setMcpSettingsOpen}
      />

      <GuestSettingsDialog
        open={settingsOpen}
        tab={settingsTab}
        onOpenChange={setSettingsOpen}
        onTabChange={setSettingsTab}
        onOpenMcp={() => {
          setSettingsOpen(false);
          setMcpSettingsOpen(true);
        }}
      />

      <GuestExampleDialog
        open={exampleDialogOpen}
        onOpenChange={setExampleDialogOpen}
        running={running}
        creating={creatingExample}
        onSelect={(example) => void handleSelectExample(example)}
      />

      <GuestFirstRunDialog
        open={firstRunDialogOpen}
        quota={quota}
        onChoose={resolveFirstRun}
        onCancel={() => resolveFirstRun()}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="重置当前 Thread？"
        description={`“${activeRecord.thread.title || "未命名 Thread"}”的当前内容、Run 历史和评估会被示例内容替换。此操作无法撤销。`}
        cancelLabel="取消"
        confirmLabel="重置"
        coachSurface="confirmation"
        onConfirm={() => void handleReset()}
      />
      {coachPresentation === "launcher" ? (
        <CoachLauncher
          surface={coachSurface}
          portalTarget={activeDialogSurface?.target ?? null}
          onOpen={() => {
            setCoachLoaded(true);
            setFloatingCoachOpen(true);
          }}
        />
      ) : null}
      </div>
    </HostServicesProvider>
  );
}

interface ActiveDialogSurface {
  target: Element;
  surface: CoachSurfaceId;
}

function useWideCoachLayout(): boolean {
  const [wide, setWide] = useState(() =>
    window.matchMedia(WIDE_COACH_QUERY).matches
  );

  useEffect(() => {
    const query = window.matchMedia(WIDE_COACH_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return wide;
}

function useActiveDialogSurface(): ActiveDialogSurface | null {
  const [activeSurface, setActiveSurface] =
    useState<ActiveDialogSurface | null>(null);
  const currentRef = useRef<ActiveDialogSurface | null>(null);

  useEffect(() => {
    const update = () => {
      const dialogs = document.querySelectorAll(
        '[data-slot="dialog-content"][data-state="open"]:not([data-coach-owner="learning-coach"])'
      );
      const target = dialogs.item(dialogs.length - 1);
      const surface = target
        ? normalizeCoachSurface((target as HTMLElement).dataset.coachSurface)
        : null;
      if (
        currentRef.current?.target === target &&
        currentRef.current?.surface === surface
      ) {
        return;
      }
      const next = target && surface ? { target, surface } : null;
      currentRef.current = next;
      setActiveSurface(next);
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-state", "data-coach-surface"],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  return activeSurface;
}

function _safeFileStem(title: string | undefined): string {
  const trimmed = title?.trim() || "llm-space-thread";
  return (
    trimmed
      .split("")
      .filter((character) => character.charCodeAt(0) >= 32)
      .join("")
      .replace(/[<>:"/\\|?*]/g, "-")
      .replace(/[.\s]+$/g, "")
      .slice(0, 80) || "llm-space-thread"
  );
}

function _browserStorage(): GuestWorkspaceStorage {
  try {
    return window.localStorage;
  } catch {
    return {
      getItem: () => {
        throw new Error("浏览器禁止访问本地存储");
      },
      setItem: () => {
        throw new Error("浏览器禁止访问本地存储");
      },
      removeItem: () => {
        throw new Error("浏览器禁止访问本地存储");
      },
    };
  }
}
