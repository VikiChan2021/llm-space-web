import { describe, expect, test } from "bun:test";

import {
  GUEST_SKILLS,
  GUEST_SKILLS_PATH,
  listGuestSkills,
  readGuestSkill,
} from "./guest-skills";

describe("guest built-in skills", () => {
  test("lists curated enabled skills from the built-in discovery path", () => {
    expect(listGuestSkills(GUEST_SKILLS_PATH).map((skill) => skill.name)).toEqual([
      "deep-research",
      "code-review",
      "data-analysis",
      "prompt-engineering",
    ]);
    expect(GUEST_SKILLS.every((skill) => skill.enabled)).toBe(true);
  });

  test("loads real skill instructions by name", () => {
    const content = readGuestSkill("deep-research");
    expect(content).toContain("web_search");
    expect(content).toContain("相互独立");
    expect(() => readGuestSkill("missing-skill")).toThrow("可用 Skill");
  });
});
