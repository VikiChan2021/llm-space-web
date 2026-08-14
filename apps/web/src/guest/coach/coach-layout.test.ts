import { describe, expect, test } from "bun:test";

import {
  GUEST_COACH_ENABLED_STORAGE_KEY,
  getCoachSurfaceHint,
  normalizeCoachSurface,
  readGuestCoachEnabled,
  resolveCoachPresentation,
  saveGuestCoachEnabled,
} from "./coach-layout";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set(GUEST_COACH_ENABLED_STORAGE_KEY, initial);
  }
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("guest coach layout", () => {
  test("defaults to enabled and persists an explicit opt-out", () => {
    const storage = memoryStorage();
    expect(readGuestCoachEnabled(storage)).toBe(true);
    saveGuestCoachEnabled(storage, false);
    expect(storage.values.get(GUEST_COACH_ENABLED_STORAGE_KEY)).toBe("false");
    expect(readGuestCoachEnabled(storage)).toBe(false);
  });

  test("uses a docked third column only on a wide workbench", () => {
    expect(
      resolveCoachPresentation({
        enabled: true,
        wide: true,
        dialogOpen: false,
        floatingOpen: false,
      })
    ).toBe("docked");
    expect(
      resolveCoachPresentation({
        enabled: false,
        wide: true,
        dialogOpen: false,
        floatingOpen: false,
      })
    ).toBe("hidden");
  });

  test("uses a launcher or overlay for narrow and dialog states", () => {
    expect(
      resolveCoachPresentation({
        enabled: true,
        wide: false,
        dialogOpen: false,
        floatingOpen: false,
      })
    ).toBe("launcher");
    expect(
      resolveCoachPresentation({
        enabled: false,
        wide: true,
        dialogOpen: true,
        floatingOpen: true,
      })
    ).toBe("overlay");
  });

  test("falls back to a content-free generic dialog hint", () => {
    expect(normalizeCoachSurface("variables")).toBe("variables");
    expect(normalizeCoachSurface("unknown-panel")).toBe("dialog");
    expect(getCoachSurfaceHint("variables").message).toContain("内置变量");
    expect(getCoachSurfaceHint("dialog").message).not.toContain("unknown-panel");
  });
});
