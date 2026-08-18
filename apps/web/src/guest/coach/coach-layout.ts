export const GUEST_COACH_ENABLED_STORAGE_KEY =
  "llm-space.guest.learning-coach.enabled.v1";
export const GUEST_COACH_GUIDANCE_ENABLED_STORAGE_KEY =
  "llm-space.guest.learning-coach.guidance-enabled.v1";

export type CoachSurfaceId =
  | "workbench"
  | "settings"
  | "variables"
  | "examples"
  | "threads"
  | "mcp"
  | "confirmation"
  | "evaluation"
  | "dialog";

export type CoachPresentation = "docked" | "overlay" | "launcher" | "hidden";

export interface CoachSurfaceHint {
  label: string;
  message: string;
}

export interface CoachPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SURFACE_HINTS: Record<CoachSurfaceId, CoachSurfaceHint> = {
  workbench: {
    label: "工作台助手",
    message: "我可以解释当前工作台，并通过受控动作协助你完成下一步。",
  },
  settings: {
    label: "正在查看设置",
    message: "我可以解释模型、MCP、Skills 与各项安全边界。",
  },
  variables: {
    label: "正在查看 Variables",
    message: "我可以解释内置变量、模板写法以及变量会影响哪些 Prompt。",
  },
  examples: {
    label: "正在选择 Agent 案例",
    message: "告诉我你想学习什么，我可以说明各案例适合调试的 Agent 能力。",
  },
  threads: {
    label: "正在管理 Threads",
    message: "我可以解释 Thread、复制、导入导出和浏览器存储边界。",
  },
  mcp: {
    label: "正在查看 MCP",
    message: "我可以解释 MCP、Built-in Tool 的区别及游客模式安全限制。",
  },
  confirmation: {
    label: "正在确认一项操作",
    message: "我可以解释这项操作的影响；不会替你确认或绕过安全步骤。",
  },
  evaluation: {
    label: "正在比较 Runs",
    message: "我可以帮助你理解两次 Run 的 Trace、差异与评估方式。",
  },
  dialog: {
    label: "当前面板也可提问",
    message: "我能解释这个操作面板，但不会读取或提交其中的表单内容。",
  },
};

export function readGuestCoachEnabled(
  storage: CoachPreferenceStorage | null | undefined
): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(GUEST_COACH_ENABLED_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveGuestCoachEnabled(
  storage: CoachPreferenceStorage | null | undefined,
  enabled: boolean
): void {
  if (!storage) return;
  try {
    storage.setItem(GUEST_COACH_ENABLED_STORAGE_KEY, String(enabled));
  } catch {
    // The preference is non-critical when browser storage is unavailable.
  }
}

export function readGuestCoachGuidanceEnabled(
  storage: CoachPreferenceStorage | null | undefined
): boolean {
  if (!storage) return true;
  try {
    return (
      storage.getItem(GUEST_COACH_GUIDANCE_ENABLED_STORAGE_KEY) !== "false"
    );
  } catch {
    return true;
  }
}

export function saveGuestCoachGuidanceEnabled(
  storage: CoachPreferenceStorage | null | undefined,
  enabled: boolean
): void {
  if (!storage) return;
  try {
    storage.setItem(GUEST_COACH_GUIDANCE_ENABLED_STORAGE_KEY, String(enabled));
  } catch {
    // The preference is non-critical when browser storage is unavailable.
  }
}

export function normalizeCoachSurface(
  value: string | undefined
): CoachSurfaceId {
  return value && value in SURFACE_HINTS ? (value as CoachSurfaceId) : "dialog";
}

export function getCoachSurfaceHint(surface: CoachSurfaceId): CoachSurfaceHint {
  return SURFACE_HINTS[surface];
}

export function resolveCoachPresentation(options: {
  enabled: boolean;
  wide: boolean;
  dialogOpen: boolean;
  floatingOpen: boolean;
}): CoachPresentation {
  if (options.dialogOpen) {
    return options.floatingOpen ? "overlay" : "launcher";
  }
  if (!options.wide) {
    return options.floatingOpen ? "overlay" : "launcher";
  }
  return options.enabled ? "docked" : "hidden";
}
