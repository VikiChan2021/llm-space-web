import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@llm-space/ui/ui/dropdown-menu";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import {
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  FileJsonIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { GuestThreadRecord } from "./guest-workspace";

export interface GuestThreadLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: readonly GuestThreadRecord[];
  activeThreadId: string;
  running: boolean;
  onCreate: () => void;
  onSelect: (recordId: string) => void;
  onDuplicate: (recordId: string) => void;
  onExport: (recordId: string) => void;
  onDelete: (recordId: string) => void;
  onImport: (file: File) => Promise<boolean>;
}

export function GuestThreadLibrary({
  open,
  onOpenChange,
  records,
  activeThreadId,
  running,
  onCreate,
  onSelect,
  onDuplicate,
  onExport,
  onDelete,
  onImport,
}: GuestThreadLibraryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<GuestThreadRecord | null>(
    null
  );
  const sortedRecords = useMemo(
    () =>
      [...records].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      ),
    [records]
  );

  const handleCreate = () => {
    onCreate();
    onOpenChange(false);
  };
  const handleSelect = (recordId: string) => {
    if (running) return;
    onSelect(recordId);
    onOpenChange(false);
  };
  const handleDuplicate = (recordId: string) => {
    onDuplicate(recordId);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-describedby="guest-thread-library-description"
          className="top-0 left-0 flex h-dvh w-[min(22rem,calc(100vw-1rem))] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r p-0 sm:max-w-[22rem]"
        >
          <DialogHeader className="border-b px-4 py-4 pr-12">
            <DialogTitle>浏览器 Threads</DialogTitle>
            <DialogDescription id="guest-thread-library-description">
              {records.length} 个 Thread，仅保存在当前浏览器。
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2 border-b p-3">
            <Button disabled={running} onClick={handleCreate}>
              <PlusIcon />
              新建 Thread
            </Button>
            <Button
              variant="outline"
              disabled={running}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon />
              导入 JSON
            </Button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="application/json,.json"
              aria-label="导入 Thread JSON"
              disabled={running}
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file && (await onImport(file))) {
                  onOpenChange(false);
                }
              }}
            />
          </div>

          {running ? (
            <p className="border-b bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
              Run 进行中。停止或等待完成后可以切换和管理 Thread。
            </p>
          ) : null}

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1 p-2">
              {sortedRecords.map((record) => {
                const active = record.id === activeThreadId;
                return (
                  <div
                    key={record.id}
                    className={
                      active
                        ? "border-primary/40 bg-primary/10 flex items-center gap-1 rounded-lg border p-1"
                        : "hover:bg-muted/60 flex items-center gap-1 rounded-lg border border-transparent p-1"
                    }
                  >
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      disabled={running}
                      className="min-w-0 flex-1 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                      onClick={() => handleSelect(record.id)}
                    >
                      <span className="block truncate text-xs font-medium">
                        {record.thread.title?.trim() || "未命名 Thread"}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-[0.625rem]">
                        {_formatUpdatedAt(record.updatedAt)}
                      </span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`管理 ${record.thread.title || "未命名 Thread"}`}
                        >
                          <EllipsisIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={running}
                          onSelect={() => handleDuplicate(record.id)}
                        >
                          <CopyIcon />
                          复制
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => onExport(record.id)}
                        >
                          <DownloadIcon />
                          导出 JSON
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={running}
                          onSelect={() => setDeleteTarget(record)}
                        >
                          <Trash2Icon />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="text-muted-foreground border-t px-4 py-3 text-[0.625rem] leading-relaxed">
            <div className="flex items-center gap-1.5">
              <FileJsonIcon className="size-3" />
              导出的文件可在其他浏览器或桌面版 LLM Space 中继续使用。
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteTarget(null);
        }}
        title="删除这个 Thread？"
        description={
          records.length === 1
            ? "删除最后一个 Thread 后会自动创建新的示例。此操作无法撤销。"
            : `“${deleteTarget?.thread.title || "未命名 Thread"}”只存在当前浏览器中，删除后无法撤销。`
        }
        cancelLabel="取消"
        confirmLabel="删除"
        dimBackground={false}
        onConfirm={() => {
          if (deleteTarget) onDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

function _formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
