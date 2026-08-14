import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Input } from "@llm-space/ui/ui/input";
import { CableIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  addGuestMcpServer,
  GUEST_REMOTE_MCP_ENABLED,
  isGuestBuiltinMcpServer,
  listGuestMcpServers,
  removeGuestMcpServer,
} from "./guest-mcp";

export function GuestMcpSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [servers, setServers] = useState(() => listGuestMcpServers());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setServers(listGuestMcpServers());
    } else {
      setName("");
      setUrl("");
    }
  }, [open]);

  const handleAdd = useCallback(() => {
    try {
      addGuestMcpServer({ name, url });
      setName("");
      setUrl("");
      setServers(listGuestMcpServers());
      toast.success("MCP 服务器已保存", {
        description: "请在 Add MCP Tools 中测试并导入工具。",
      });
    } catch (error) {
      toast.error("无法保存 MCP", {
        description:
          error instanceof Error ? error.message : "请检查名称和地址。",
      });
    }
  }, [name, url]);

  const handleDelete = useCallback(() => {
    if (!deleteId) return;
    removeGuestMcpServer(deleteId);
    setDeleteId(null);
    setServers(listGuestMcpServers());
    toast.success("MCP 服务器已删除");
  }, [deleteId]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-coach-surface="mcp" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>游客 MCP 设置</DialogTitle>
            <DialogDescription>
              两组内置 MCP 都会执行真实工具调用。公共 HTTPS Streamable HTTP MCP
              入口会保留，但需完成独立网络出口隔离后才会开放。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {servers.map((server) => (
              <div
                key={server.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2"
              >
                <CableIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{server.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {isGuestBuiltinMcpServer(server.id)
                      ? `同源内置 · ${server.readiness?.tools
                          ?.map((tool) => tool.toolName)
                          .join(" / ")}`
                      : server.url}
                  </div>
                </div>
                {!isGuestBuiltinMcpServer(server.id) ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`删除 ${server.name}`}
                    onClick={() => setDeleteId(server.id)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-md border border-dashed p-3">
            <div>
              <div className="text-sm font-medium">添加公共 MCP</div>
              <div className="mt-1 text-xs text-muted-foreground">
                不支持 localhost、私网、查询参数、认证头、OAuth、SSE 或
                stdio。
              </div>
            </div>
            <Input
              disabled={!GUEST_REMOTE_MCP_ENABLED}
              value={name}
              maxLength={60}
              placeholder="名称，例如 Public Docs"
              aria-label="MCP 名称"
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              disabled={!GUEST_REMOTE_MCP_ENABLED}
              value={url}
              placeholder="https://example.com/mcp"
              aria-label="MCP HTTPS 地址"
              onChange={(event) => setUrl(event.target.value)}
            />
            <Button
              disabled={
                !GUEST_REMOTE_MCP_ENABLED || !name.trim() || !url.trim()
              }
              onClick={handleAdd}
            >
              <PlusIcon className="size-4" />
              保存 MCP
            </Button>
            {!GUEST_REMOTE_MCP_ENABLED ? (
              <p className="text-xs text-muted-foreground">
                当前线上开放两组同源内置 MCP；公共远程 MCP 等待网络层出站策略。
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteId(null);
        }}
        title="删除 MCP 服务器？"
        description="已导入 Thread 的工具定义会保留，但再次调用时会提示服务器已删除。"
        cancelLabel="取消"
        confirmLabel="删除"
        onConfirm={handleDelete}
      />
    </>
  );
}
