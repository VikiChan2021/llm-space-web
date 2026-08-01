import { uuid, type Message } from "@llm-space/core";
import { SYSTEM_PROMPT_PLACE_KEY } from "@llm-space/core/thread";
import { memo, useCallback, useEffect } from "react";
import { toast } from "sonner";

import { CodeEditor } from "@llm-space/ui/components/code-editor";
import { useHostServices } from "@llm-space/ui/host";
import { cn } from "@llm-space/ui/lib/utils";



import metaPrompt from "../examples/meta-prompt.md?raw";
import { PROMPT_EXAMPLES, resolveSeed } from "../examples/prompts";
import { ExamplesMenu } from "../examples-menu";
import { GeneratePopoverButton } from "../generate-popover-button";
import { useThreadStore, useThreadStoreActions } from "../stores";
import { useStreamText } from "../use-stream-text";
import { usePromptVariableExtension } from "../variable/use-prompt-variable-extension";

interface SystemPromptEditorProps {
  className?: string;
  readonly?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
}

function _SystemPromptEditor({
  className,
  readonly,
  onStreamingChange,
}: SystemPromptEditorProps) {
  const systemPrompt = useThreadStore(
    (s) => s.thread.context?.systemPrompt ?? ""
  );
  const tools = useThreadStore((s) => s.thread.context?.tools);
  const threadModel = useThreadStore((s) => s.thread.model);
  const seedHost = useHostServices();
  const { presentational } = seedHost;
  const { updateSystemPrompt } = useThreadStoreActions();
  const variableExtension = usePromptVariableExtension(SYSTEM_PROMPT_PLACE_KEY);
  const handleChange = useCallback(
    (value: string) => {
      updateSystemPrompt(value);
    },
    [updateSystemPrompt]
  );

  const {
    text: generated,
    error: generationError,
    streaming,
    run: generate,
  } = useStreamText({
    systemPrompt: metaPrompt,
    reasoning: "off",
    // Use the thread's own model (id/provider only) when it has one.
    model: threadModel
      ? { id: threadModel.id, provider: threadModel.provider }
      : undefined,
  });

  // Stream the generated prompt straight into the editor.
  useEffect(() => {
    if (generated) {
      updateSystemPrompt(generated);
    }
  }, [generated, updateSystemPrompt]);

  useEffect(() => {
    if (generationError) {
      toast.error("System Prompt 生成失败", {
        description: generationError,
      });
    }
  }, [generationError]);

  useEffect(() => {
    onStreamingChange?.(streaming);
  }, [onStreamingChange, streaming]);

  useEffect(() => {
    return () => onStreamingChange?.(false);
  }, [onStreamingChange]);

  const handleExampleSelect = useCallback(
    (content: string) => {
      updateSystemPrompt(content);
    },
    [updateSystemPrompt]
  );

  const handleGenerate = useCallback(
    async (prompt: string) => {
      // Feed the current prompt and tools (if any) as a prior assistant turn,
      // so the model refines them in response to the user's request.
      const trimmed = systemPrompt.trim();
      const parts: string[] = [];
      if (trimmed) {
        parts.push(`<system-prompt>\n${trimmed}\n</system-prompt>`);
      }
      const messages: Message[] = parts.length
        ? [
            {
              id: uuid(),
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: `<original>\n${parts.join("\n")}\n</original>`,
                },
              ],
            },
          ]
        : [];
      const succeeded = await generate({
        messages,
        tools: tools ?? [],
        userPrompt: `<user-input>\n${prompt}\n</user-input>`,
      });
      if (succeeded) {
        toast.success("System Prompt 已生成");
      }
      return succeeded;
    },
    [generate, systemPrompt, tools]
  );

  return (
    <div className={cn("flex size-full flex-col", className)}>
      <div className="flex shrink-0 items-center justify-between py-2">
        <div className="text-muted-foreground text-sm">System prompt</div>
        {!presentational && (
          <div className="flex items-center gap-2">
            <GeneratePopoverButton
              placeholder="Describe the assistant you want (its role, tone, and rules), and we'll generate a system prompt."
              onGenerate={handleGenerate}
            />
            <ExamplesMenu
              items={PROMPT_EXAMPLES}
              onSelect={(example) =>
                void resolveSeed(example.content, seedHost).then((content) => {
                  if (content !== undefined) handleExampleSelect(content);
                })
              }
            />
          </div>
        )}
      </div>
      <CodeEditor
        className="hover:border-accent-foreground/20 grow transition-[border-color]"
        value={systemPrompt ?? ""}
        language="markdown"
        readonly={readonly || streaming}
        placeholder="Enter system prompt here"
        extraExtensions={variableExtension}
        onChange={handleChange}
      />
    </div>
  );
}

export const SystemPromptEditor = memo(_SystemPromptEditor);
