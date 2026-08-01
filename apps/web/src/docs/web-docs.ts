import autoRun from "./content/auto-run-react.md?raw";
import browserData from "./content/browser-data.md?raw";
import errors from "./content/errors.md?raw";
import interfaceGuide from "./content/interface.md?raw";
import models from "./content/models.md?raw";
import quickStart from "./content/quick-start.md?raw";
import tools from "./content/tools.md?raw";

export interface WebDoc {
  slug: string;
  title: string;
  summary: string;
  group: string;
  content: string;
}

export const WEB_DOCS: readonly WebDoc[] = [
  {
    slug: "quick-start",
    title: "快速开始",
    summary: "30 秒完成第一次天气工具 Run",
    group: "开始使用",
    content: quickStart,
  },
  {
    slug: "interface",
    title: "界面与 Thread",
    summary: "认识工作台左右区域、消息与运行历史",
    group: "开始使用",
    content: interfaceGuide,
  },
  {
    slug: "models",
    title: "模型与免费额度",
    summary: "选择智谱模型并理解游客额度",
    group: "核心能力",
    content: models,
  },
  {
    slug: "tools",
    title: "Tools、Custom Tool 与 MCP",
    summary: "让模型读取网页、查天气和调用外部能力",
    group: "核心能力",
    content: tools,
  },
  {
    slug: "auto-run-react",
    title: "自动工具与 ReAct",
    summary: "控制模型—工具—模型的连续循环",
    group: "核心能力",
    content: autoRun,
  },
  {
    slug: "errors",
    title: "运行历史与错误恢复",
    summary: "停止、重试、切换模型和查看运行记录",
    group: "排查问题",
    content: errors,
  },
  {
    slug: "browser-data",
    title: "浏览器数据与安全边界",
    summary: "了解本地保存、导入导出和游客限制",
    group: "排查问题",
    content: browserData,
  },
];

export function findWebDoc(slug: string | undefined): WebDoc | undefined {
  return WEB_DOCS.find((doc) => doc.slug === slug);
}
