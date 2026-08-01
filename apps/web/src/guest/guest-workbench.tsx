import type { Thread } from "@llm-space/core";
import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { useDefaultModel } from "@llm-space/ui/components/model-provider";
import { ThreadPlayground } from "@llm-space/ui/components/thread-playground";
import { Button } from "@llm-space/ui/ui/button";
import {
  CircleHelpIcon,
  LibraryIcon,
  RotateCcwIcon,
  SettingsIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { OPEN_GUEST_SETTINGS_EVENT } from "@/host/web-host";

import {
  createGuestTransport,
  readGuestQuota,
  type GuestQuota,
} from "./guest-api";
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
  createStarterThread,
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

const BROWSER_WORKSPACE_FACTORY: GuestWorkspaceFactory = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};
const BROWSER_STORAGE = _browserStorage();

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
  const [settingsTab, setSettingsTab] =
    useState<GuestSettingsTab>("appearance");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const workspaceRef = useRef(workspaceState.workspace);
  const { workspace, storageError } = workspaceState;
  const activeRecord =
    workspace.threads.find(
      (record) => record.id === workspace.activeThreadId
    ) ?? workspace.threads[0];

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
        requested === "models" || requested === "mcp"
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
    commitWorkspace((current) =>
      addGuestThread(
        current,
        createStarterThread(
          BROWSER_WORKSPACE_FACTORY.createId,
          defaultModel
        ),
        BROWSER_WORKSPACE_FACTORY
      )
    );
  }, [commitWorkspace, defaultModel, running]);
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
  const handleReset = useCallback(() => {
    if (running) return;
    commitWorkspace((current) =>
      resetGuestThread(
        current,
        activeRecord.id,
        BROWSER_WORKSPACE_FACTORY.createId,
        BROWSER_WORKSPACE_FACTORY.now(),
        defaultModel
      )
    );
    setRevision((value) => value + 1);
    setResetConfirmOpen(false);
    toast.success("已重置为示例内容");
  }, [activeRecord.id, commitWorkspace, defaultModel, running]);
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
    <div className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold">LLM Space Web 工作台</h1>
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-200">
              游客模式
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Thread 与虚拟文件保存在当前浏览器。安全 Built-in、Custom
            Tool、MCP 和 ReAct 可体验；Bash 与 Generator 等待隔离沙箱。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <div className="text-right text-xs">
            <div className="font-medium">
              {quota
                ? `今日免费 Run：${quota.browserRemaining}/${quota.browserDailyLimit}`
                : quotaError
                  ? "额度状态暂不可用"
                  : "正在读取额度…"}
            </div>
            <div className="text-muted-foreground">
              超额后可配置自己的 API Key（即将开放）
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(
                `${import.meta.env.BASE_URL}#/docs/quick-start`,
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            <CircleHelpIcon className="size-3.5" />
            使用说明
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSettingsTab("appearance");
              setSettingsOpen(true);
            }}
          >
            <SettingsIcon className="size-3.5" />
            设置
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLibraryOpen(true)}
          >
            <LibraryIcon className="size-3.5" />
            Threads {workspace.threads.length}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={running}
            onClick={() => setResetConfirmOpen(true)}
          >
            <RotateCcwIcon className="size-3.5" />
            重置示例
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

      <main className="min-h-0 min-w-0 flex-1 p-2 sm:p-4">
        <ThreadPlayground
          key={`${activeRecord.id}:${revision}`}
          active
          className="size-full min-w-0 overflow-hidden rounded-xl border shadow-lg"
          path={`guest/${activeRecord.id}.json`}
          title={activeRecord.thread.title}
          initialValue={activeRecord.thread}
          transport={transport}
          runtimeId={activeRecord.id}
          onChange={handleChange}
          onRenameTitle={handleRename}
          onStreamingStart={() => setRunning(true)}
          onStreamingEnd={() => {
            setRunning(false);
            void refreshQuota();
          }}
          runRecovery={GUEST_RUN_RECOVERY}
        />
      </main>

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

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="重置当前 Thread？"
        description={`“${activeRecord.thread.title || "未命名 Thread"}”的当前内容、Run 历史和评估会被示例内容替换。此操作无法撤销。`}
        cancelLabel="取消"
        confirmLabel="重置"
        onConfirm={handleReset}
      />
    </div>
  );
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
