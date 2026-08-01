import { beforeEach, describe, expect, test } from "bun:test";

import {
  GUEST_DEMO_MCP_ID,
  GUEST_RESEARCH_MCP_ID,
  isGuestBuiltinMcpServer,
  listGuestMcpServers,
} from "./guest-mcp";

beforeEach(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "https://example.com" },
  });
});

describe("guest MCP catalog", () => {
  test("publishes two connected built-in servers with real tools", () => {
    const servers = listGuestMcpServers();
    expect(servers.map((server) => server.id)).toEqual([
      GUEST_DEMO_MCP_ID,
      GUEST_RESEARCH_MCP_ID,
    ]);
    expect(servers.map((server) => server.toolCount)).toEqual([4, 3]);
    expect(servers.every((server) => server.connected)).toBe(true);
    expect(isGuestBuiltinMcpServer(GUEST_RESEARCH_MCP_ID)).toBe(true);
  });
});
