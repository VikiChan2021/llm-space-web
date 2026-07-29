import type { Thread } from "@llm-space/core";
import { ThreadPlayground } from "@llm-space/ui/components/thread-playground";
import { Button } from "@llm-space/ui/ui/button";
import { RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createGuestTransport,
  GUEST_MODEL_ID,
  GUEST_PROVIDER_ID,
  readGuestQuota,
  type GuestQuota,
} from "./guest-api";

const STORAGE_KEY = "llm-space.guest.thread.v1";

function _initialThread(): Thread {
  return {
    title: "游客体验工作台",
    model: {
      provider: GUEST_PROVIDER_ID,
      id: GUEST_MODEL_ID,
      params: { maxTokens: 2_048, reasoning: "off", temperature: 0.7 },
    },
    context: {
      systemPrompt:
        "你是一个严谨、友好的 AI 助手。优先给出清晰、可操作的中文回答。",
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: [
            {
              type: "text",
              text: "请用三点说明：一个好的 Agent 工作台应当帮助开发者解决哪些问题？",
            },
          ],
        },
      ],
      tools: [],
    },
  };
}

function _loadThread(): Thread {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return _initialThread();
  try {
    return JSON.parse(saved) as Thread;
  } catch {
    return _initialThread();
  }
}

export function GuestWorkbench() {
  const [thread, setThread] = useState<Thread>(_loadThread);
  const [revision, setRevision] = useState(0);
  const [quota, setQuota] = useState<GuestQuota | null>(null);
  const [quotaError, setQuotaError] = useState(false);

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

  const transport = useMemo(
    () =>
      createGuestTransport((nextQuota) => {
        if (nextQuota) setQuota(nextQuota);
        else void refreshQuota();
      }),
    [refreshQuota]
  );
  const handleChange = useCallback((nextThread: Thread) => {
    setThread(nextThread);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextThread));
  }, []);
  const handleRename = useCallback((title: string) => {
    setThread((current) => {
      const next = { ...current, title };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    return Promise.resolve(true);
  }, []);
  const handleReset = useCallback(() => {
    const next = _initialThread();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setThread(next);
    setRevision((value) => value + 1);
  }, []);

  return (
    <div className="dark flex h-dvh min-w-0 flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold">LLM Space Web 工作台</h1>
            <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-xs text-violet-200">
              游客模式
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Thread 自动保存在当前浏览器。Bash、文件工具、MCP 和 Generator
            暂未开放。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
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
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcwIcon className="size-3.5" />
            重置示例
          </Button>
        </div>
      </header>
      <main className="min-h-0 min-w-0 flex-1 p-2 sm:p-4">
        <ThreadPlayground
          key={revision}
          active
          className="size-full min-w-0 overflow-hidden rounded-xl border shadow-lg"
          path="guest/workbench.json"
          title={thread.title}
          initialValue={thread}
          transport={transport}
          onChange={handleChange}
          onRenameTitle={handleRename}
          onStreamingEnd={() => void refreshQuota()}
        />
      </main>
    </div>
  );
}
