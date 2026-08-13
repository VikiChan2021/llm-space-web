export const COACH_ELEMENT_IDS = [
  "models",
  "tools",
  "variables",
  "run-settings",
  "system-prompt",
  "message-input",
] as const;

export type CoachElementId = (typeof COACH_ELEMENT_IDS)[number];

export type CoachAction =
  | { name: "highlight_element"; elementId: CoachElementId }
  | { name: "open_variables" }
  | { name: "request_run" };

export interface CoachActionReceipt {
  success: boolean;
  message: string;
}

export interface CoachActionEnvironment {
  openVariables(): void;
  requestRun(): boolean;
}

const COACH_ELEMENT_ID_SET = new Set<string>(COACH_ELEMENT_IDS);
const HIGHLIGHT_CLASSES = [
  "outline",
  "outline-2",
  "outline-offset-2",
  "outline-violet-500",
  "transition-[outline-color]",
];

export function parseCoachAction(
  name: string,
  args: Record<string, unknown>
): CoachAction | null {
  if (name === "highlight_element") {
    const elementId = args.elementId;
    return typeof elementId === "string" && COACH_ELEMENT_ID_SET.has(elementId)
      ? { name, elementId: elementId as CoachElementId }
      : null;
  }
  if (name === "open_variables") return { name };
  if (name === "request_run") return { name };
  return null;
}

export function executeCoachAction(
  action: CoachAction,
  environment: CoachActionEnvironment
): CoachActionReceipt {
  switch (action.name) {
    case "highlight_element":
      return _highlightElement(action.elementId);
    case "open_variables":
      environment.openVariables();
      return { success: true, message: "已打开 Variables 面板。" };
    case "request_run":
      return environment.requestRun()
        ? { success: true, message: "已通过工作台命令启动当前 Thread。" }
        : {
            success: false,
            message: "当前工作台暂时不能运行，请等待正在执行的任务结束。",
          };
  }
}

function _highlightElement(elementId: CoachElementId): CoachActionReceipt {
  const target = document.querySelector<HTMLElement>(
    `[data-coach-element-id="${elementId}"]`
  );
  if (!target) {
    return { success: false, message: "当前页面没有找到这个元素。" };
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add(...HIGHLIGHT_CLASSES);
  window.setTimeout(() => {
    target.classList.remove(...HIGHLIGHT_CLASSES);
  }, 3_000);
  return { success: true, message: "已在工作台中高亮对应元素。" };
}
