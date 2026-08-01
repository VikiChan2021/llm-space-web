import type { ModelConfig } from "@llm-space/core";
import {
  useDefaultModel,
  useModels,
  useSetDefaultModel,
} from "@llm-space/ui/components/model-provider";
import {
  DEFAULT_PRIMARY,
  usePrimaryColor,
  useRenderingFidelity,
  useTheme,
  type RenderingFidelity,
  type Theme,
} from "@llm-space/ui/components/theme-provider";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@llm-space/ui/ui/tabs";
import { CableIcon, PaletteIcon, RotateCcwIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { toast } from "sonner";

export type GuestSettingsTab = "appearance" | "models" | "mcp";

export function GuestSettingsDialog({
  open,
  tab,
  onOpenChange,
  onTabChange,
  onOpenMcp,
}: {
  open: boolean;
  tab: GuestSettingsTab;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: GuestSettingsTab) => void;
  onOpenMcp: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const {
    primaryColor,
    hasPrimaryColorOverride,
    setPrimaryColor,
    resetPrimaryColor,
  } = usePrimaryColor();
  const { fidelity, setFidelity } = useRenderingFidelity();
  const providers = useModels();
  const defaultModel = useDefaultModel();
  const setDefaultModel = useSetDefaultModel();
  const models = useMemo(
    () => providers.flatMap((provider) => provider.models),
    [providers]
  );
  const selectedModel = defaultModel
    ? `${defaultModel.provider}:${defaultModel.id}`
    : "";

  const handleModelChange = async (value: string) => {
    const separator = value.indexOf(":");
    if (separator < 1) return;
    const next: ModelConfig = {
      provider: value.slice(0, separator),
      id: value.slice(separator + 1),
    };
    await setDefaultModel(next);
    toast.success("默认模型已更新", {
      description: "新建和重置后的 Thread 将使用该模型。",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Web 工作台设置</DialogTitle>
          <DialogDescription>
            这些设置保存在当前浏览器，只展示 Web 游客工作台可用的配置。
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value as GuestSettingsTab)}
        >
          <TabsList className="w-full justify-start">
            <TabsTrigger value="appearance">外观</TabsTrigger>
            <TabsTrigger value="models">模型</TabsTrigger>
            <TabsTrigger value="mcp">MCP</TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className="space-y-5 pt-2">
            <SettingSection title="主题" description="可跟随操作系统，也可固定浅色或深色。">
              <ChoiceButtons
                value={theme}
                options={[
                  ["system", "跟随系统"],
                  ["light", "浅色"],
                  ["dark", "深色"],
                ]}
                onChange={(value) => setTheme(value as Theme)}
              />
            </SettingSection>

            <SettingSection title="强调色" description="用于按钮、选中状态和焦点提示。">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <PaletteIcon className="size-4 text-muted-foreground" />
                  <input
                    type="color"
                    aria-label="选择强调色"
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                  />
                  <span className="font-mono text-xs">{primaryColor}</span>
                </label>
                <Button
                  variant="outline"
                  disabled={!hasPrimaryColorOverride}
                  onClick={resetPrimaryColor}
                >
                  <RotateCcwIcon />
                  恢复默认 {DEFAULT_PRIMARY}
                </Button>
              </div>
            </SettingSection>

            <SettingSection
              title="消息渲染"
              description="复杂 Thread 卡顿时可切换轻量模式。"
            >
              <ChoiceButtons
                value={fidelity}
                options={[
                  ["rich", "丰富模式"],
                  ["lite", "轻量模式"],
                ]}
                onChange={(value) =>
                  setFidelity(value as RenderingFidelity)
                }
              />
            </SettingSection>
          </TabsContent>

          <TabsContent value="models" className="space-y-4 pt-2">
            <SettingSection
              title="新 Thread 默认模型"
              description="当前 Thread 仍可在左侧 Models 中单独切换。每个模型回合都会消耗一次游客 Run。"
            >
              <select
                aria-label="新 Thread 默认模型"
                value={selectedModel}
                onChange={(event) => void handleModelChange(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                {models.map((model) => (
                  <option
                    key={`${model.provider}:${model.id}`}
                    value={`${model.provider}:${model.id}`}
                  >
                    {model.name}
                  </option>
                ))}
              </select>
            </SettingSection>
            <div className="rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-muted-foreground">
              游客调用使用服务器端智谱 Key。不同模型可能受账号权限、余额或上游繁忙影响；遇到模型错误时可切换其他模型重试。
            </div>
          </TabsContent>

          <TabsContent value="mcp" className="space-y-4 pt-2">
            <div className="rounded-md border p-4">
              <div className="flex items-start gap-3">
                <CableIcon className="mt-0.5 size-5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium">游客 MCP</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    查看同源演示 MCP，以及公共远程 MCP 的安全开放状态。
                  </p>
                  <Button className="mt-3" variant="outline" onClick={onOpenMcp}>
                    管理 MCP
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ChoiceButtons({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([optionValue, label]) => (
        <Button
          key={optionValue}
          variant={value === optionValue ? "default" : "outline"}
          onClick={() => onChange(optionValue)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
