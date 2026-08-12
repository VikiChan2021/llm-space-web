import type { BuiltinTool, ModelConfig, Thread, Tool } from "@llm-space/core";
import {
  PROMPT_EXAMPLES,
  isPromptExample,
  resolveSeed,
  type PromptExample,
  type SeedHost,
} from "@llm-space/ui/components/thread-playground/examples/prompts";
import type { LucideIcon } from "lucide-react";
import { CloudSunIcon } from "lucide-react";

import { GUEST_MODEL_ID, GUEST_PROVIDER_ID } from "./guest-api";
import { GUEST_BUILTIN_TOOLS } from "./guest-tools";
import {
  createStarterThread,
  DEFAULT_GUEST_STARTER_ID,
} from "./guest-workspace";

export interface GuestExample {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  featured: boolean;
  eyebrow?: string;
  promptExample?: PromptExample;
}

const PRESENTATION: Record<
  string,
  Pick<GuestExample, "label" | "description" | "featured" | "eyebrow">
> = {
  blank: {
    label: "空白 Thread",
    description: "从干净画布开始，自由设置 Prompt、消息和工具。",
    featured: false,
  },
  "general-agent": {
    label: "General Agent",
    description: "结合 Skills、网页研究和虚拟文件操作的通用任务 Agent。",
    featured: true,
    eyebrow: "推荐",
  },
  "deep-research": {
    label: "Deep Research",
    description: "先规划、再检索与读取来源，最后形成结构化深度报告。",
    featured: true,
    eyebrow: "深度研究",
  },
  translation: {
    label: "翻译助手",
    description: "在保留原意、语气和风格的前提下完成高质量翻译。",
    featured: false,
  },
  "deep-wiki": {
    label: "Deep Wiki",
    description: "读取虚拟工作区并生成带结构与来源的长篇知识库内容。",
    featured: false,
  },
  "compact-memory": {
    label: "Compact Memory",
    description: "压缩长对话记忆，保留后续任务真正需要的上下文。",
    featured: false,
  },
  "meta-prompt": {
    label: "Meta Prompt",
    description: "把简单需求改写成清晰、可复用、便于调试的系统提示词。",
    featured: false,
  },
  "meta-image-prompt": {
    label: "Meta Image Prompt",
    description: "将视觉想法整理为结构化、可执行的图像生成提示词。",
    featured: false,
  },
};

const WEATHER_EXAMPLE: GuestExample = {
  id: DEFAULT_GUEST_STARTER_ID,
  label: "实时天气 Agent",
  description: "调用天气与网页工具，观察模型决策、工具结果和最终回答。",
  icon: CloudSunIcon,
  featured: true,
  eyebrow: "快速体验",
};

export const GUEST_EXAMPLES: readonly GuestExample[] = [
  WEATHER_EXAMPLE,
  ...PROMPT_EXAMPLES.filter(isPromptExample).map((promptExample) => {
    const presentation = PRESENTATION[promptExample.id];
    return {
      id: promptExample.id,
      label: presentation?.label ?? promptExample.label,
      description: presentation?.description ?? promptExample.description,
      icon: promptExample.icon,
      featured: presentation?.featured ?? false,
      eyebrow: presentation?.eyebrow,
      promptExample,
    };
  }),
];

/** Built-ins that are visible in desktop examples but intentionally unavailable on Web. */
const UNSUPPORTED_WEB_EXAMPLE_TOOLS = new Set([
  "ask_user_question",
  "bash",
]);

export function getGuestExample(id: string): GuestExample | undefined {
  return GUEST_EXAMPLES.find((example) => example.id === id);
}

export async function createGuestExampleThread(
  exampleId: string,
  host: SeedHost,
  createId: () => string,
  defaultModel?: ModelConfig | null
): Promise<Thread> {
  if (exampleId === DEFAULT_GUEST_STARTER_ID) {
    return {
      ...createStarterThread(createId, defaultModel),
      title: WEATHER_EXAMPLE.label,
    };
  }

  const example = getGuestExample(exampleId)?.promptExample;
  if (!example) throw new Error("这个案例已不可用，请选择其他案例。");

  const [systemPrompt, tools, messages, textVariables] = await Promise.all([
    resolveSeed(example.content, host),
    resolveSeed(example.tools, host),
    resolveSeed(example.messages, host),
    resolveSeed(example.textVariables, host),
  ]);

  return {
    title: getGuestExample(exampleId)?.label ?? example.label,
    model: {
      provider: defaultModel?.provider ?? GUEST_PROVIDER_ID,
      id: defaultModel?.id ?? GUEST_MODEL_ID,
      params: { maxTokens: 2_048, reasoning: "off", temperature: 0.7 },
    },
    context: {
      systemPrompt: systemPrompt ?? "",
      tools: _resolveGuestTools(tools),
      messages: messages?.length
        ? structuredClone(messages)
        : [
            {
              id: createId(),
              role: "user",
              content: [{ type: "text", text: "" }],
            },
          ],
      ...(textVariables
        ? {
            variableVariants: {
              active: "default",
              variants: { default: structuredClone(textVariables) },
            },
          }
        : {}),
    },
  };
}

function _resolveGuestTools(tools: Tool[] | undefined): Tool[] {
  if (!tools?.length) return [];
  const available = new Map(
    GUEST_BUILTIN_TOOLS.map((tool) => [tool.name, tool] as const)
  );
  const resolved: BuiltinTool[] = [];
  for (const tool of tools) {
    if (
      tool.type !== "builtin" ||
      UNSUPPORTED_WEB_EXAMPLE_TOOLS.has(tool.name)
    ) {
      continue;
    }
    const guestTool = available.get(tool.name);
    if (guestTool) resolved.push(structuredClone(guestTool));
  }
  return resolved;
}
