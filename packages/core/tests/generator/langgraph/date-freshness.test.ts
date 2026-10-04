import { afterAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { applyTemplatePy } from "../../../src/generator/langgraph/templates";

const TEMP_DIRS: string[] = [];

afterAll(async () => {
  await Promise.all(TEMP_DIRS.map((root) => rm(root, { recursive: true })));
});

test("generated Python refreshes nested include dates for system and meta prompts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "llm-space-date-freshness-"));
  TEMP_DIRS.push(root);
  const promptingDir = path.join(root, "src", "prompting");
  await mkdir(promptingDir, { recursive: true });
  await Bun.write(
    path.join(promptingDir, "apply_template.py"),
    applyTemplatePy(
      {
        variables: {
          current_date: { type: "currentDate", format: "iso-date" },
        },
      },
      [],
      {}
    )
  );
  await Bun.write(
    path.join(promptingDir, "variables.py"),
    Bun.file(
      new URL("../../../src/generator/langgraph/variables.py", import.meta.url)
    )
  );
  await Bun.write(path.join(root, "outer.md"), '{{@include("inner.md")}}');
  await Bun.write(path.join(root, "inner.md"), "Today: {{current_date}}");
  for (const name of ["system_prompt.md", "meta_user_prompt.md"]) {
    await Bun.write(path.join(promptingDir, name), '{{@include("outer.md")}}');
  }
  const child = Bun.spawn(
    [
      process.platform === "win32" ? "python" : "python3",
      "-c",
      `
from unittest.mock import patch
from src.prompting import apply_template as runtime
for date in ("2026-08-29", "2026-08-30"):
    with patch.object(runtime, "current_date", return_value=date) as clock:
        assert runtime.get_system_prompt() == "Today: " + date
        assert runtime.get_meta_user_prompt() == "Today: " + date
        assert clock.call_count == 2
print("ok")
`,
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" }
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe("ok");
});
