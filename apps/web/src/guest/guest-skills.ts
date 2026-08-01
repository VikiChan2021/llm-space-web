import type { SkillInfo } from "@llm-space/core";

export const GUEST_SKILLS_PATH = "builtin://llm-space-web/skills";

interface GuestSkill extends SkillInfo {
  content: string;
}

export const GUEST_SKILLS: readonly GuestSkill[] = [
  {
    name: "deep-research",
    description:
      "把复杂问题拆成可验证的子问题，优先搜索一手资料，交叉核对并在结论中标注来源与不确定性。",
    path: `${GUEST_SKILLS_PATH}/deep-research`,
    enabled: true,
    content: `# 深度研究

1. 先复述研究目标、时间范围和交付形式，缺少关键信息时明确假设。
2. 把问题拆成互不重复的子问题，并按影响程度排序。
3. 优先调用 web_search 寻找官方文档、论文、标准或当事方资料，再用 web_fetch 阅读原文。
4. 对关键事实至少寻找两个相互独立的来源；冲突时说明差异，不强行合并。
5. 区分已证实事实、合理推断和未知项，记录来源发布日期与事件发生日期。
6. 最终先给结论，再给证据、限制和可继续验证的下一步。`,
  },
  {
    name: "code-review",
    description:
      "按正确性、安全性、兼容性、性能和可测试性审查代码，优先报告可复现且影响明确的问题。",
    path: `${GUEST_SKILLS_PATH}/code-review`,
    enabled: true,
    content: `# 代码审查

1. 先理解变更目标、调用链和已有测试，不只阅读局部 diff。
2. 优先检查会导致错误结果、数据丢失、越权、敏感信息泄露或兼容性回退的问题。
3. 每个问题说明触发条件、实际影响和最小修复方向；没有证据的问题不作为缺陷上报。
4. 检查边界输入、并发、重试、错误处理、资源释放和类型收窄。
5. 把风格建议与功能缺陷分开，按严重程度排序。
6. 若没有发现问题，明确说明已检查的范围和仍未验证的风险。`,
  },
  {
    name: "data-analysis",
    description:
      "用可复核步骤完成数据清洗、统计和解释，主动检查缺失值、异常值、口径偏差与相关不等于因果。",
    path: `${GUEST_SKILLS_PATH}/data-analysis`,
    enabled: true,
    content: `# 数据分析

1. 明确分析问题、指标定义、粒度、时间窗和比较基线。
2. 先检查字段类型、重复、缺失、异常值和样本选择偏差，再进行统计。
3. 同时报告绝对量、比例、分母和样本量，避免只展示有利指标。
4. 区分描述性结果、相关关系与因果结论；没有实验或识别策略时不要声称因果。
5. 对关键计算给出公式、筛选条件和可复核的中间结果。
6. 最终给出结论、业务含义、限制和下一步验证建议。`,
  },
  {
    name: "prompt-engineering",
    description:
      "把模糊需求改写为目标、上下文、约束、工具策略、输出格式和验收标准清晰的 System Prompt。",
    path: `${GUEST_SKILLS_PATH}/prompt-engineering`,
    enabled: true,
    content: `# Prompt 工程

1. 提取角色、目标、输入、约束、可用工具、输出格式和成功标准。
2. 删除互相冲突、重复或无法执行的要求，并保留用户给出的业务常量和示例。
3. 对实时信息明确要求调用工具并说明来源；工具失败时不得编造结果。
4. 将必须遵守的约束写成可观察行为，不依赖“认真思考”等空泛表述。
5. 仅在能减少歧义时加入少量高质量示例，并使用明显占位符。
6. 输出语言与用户输入保持一致，除非用户明确指定另一种语言。`,
  },
] as const;

export function listGuestSkills(path: string): SkillInfo[] {
  if (path !== GUEST_SKILLS_PATH) return [];
  return GUEST_SKILLS.map((skill) => ({
    name: skill.name,
    description: skill.description,
    path: skill.path,
    enabled: skill.enabled,
  }));
}

export function readGuestSkill(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("name 必须是一个内置 Skill 名称。");
  }
  const normalized = name.trim().toLowerCase();
  const skill = GUEST_SKILLS.find(
    (candidate) =>
      candidate.name === normalized || candidate.path === name.trim()
  );
  if (!skill) {
    throw new Error(
      `未找到 Skill“${name.trim()}”。可用 Skill：${GUEST_SKILLS.map((item) => item.name).join("、")}。`
    );
  }
  return skill.content;
}
