import { describe, expect, test } from "bun:test";

import {
  assertPublicHttpsMcpUrl,
  callGuestBuiltinTool,
  callGuestMcpTool,
  GuestToolError,
  listBuiltinGuestMcpTools,
  listDemoMcpTools,
} from "./guest-tool-service";

describe("guest tool service", () => {
  test("executes bounded demo MCP tools without a remote connection", async () => {
    expect(listDemoMcpTools().map((tool) => tool.name)).toEqual([
      "calculator",
      "current_time",
      "json_formatter",
      "text_statistics",
    ]);
    const result = await callGuestMcpTool({
      serverId: "guest-demo-mcp",
      toolName: "calculator",
      arguments: { a: 9, operator: "-", b: 4 },
    });
    expect(result.isError).toBe(false);
    expect(result.contentText).toContain('"result":5');
  });

  test("executes utility and web-research MCP tools through real handlers", async () => {
    expect(
      listBuiltinGuestMcpTools("guest-web-research-mcp").map(
        (tool) => tool.name
      )
    ).toEqual(["web_fetch", "web_search", "weather_report"]);

    const formatted = await callGuestMcpTool({
      serverId: "guest-demo-mcp",
      toolName: "json_formatter",
      arguments: { json: '{"ok":true}', indent: 2 },
    });
    expect(JSON.parse(formatted.contentText)).toEqual({
      valid: true,
      formatted: '{\n  "ok": true\n}',
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(`
          <h2 class=""><a href="https://example.com/">Research Result</a></h2>
          <div class="b_caption"><p>Verified result.</p></div>
        `)
      )) as unknown as typeof fetch;
    try {
      const research = await callGuestMcpTool({
        serverId: "guest-web-research-mcp",
        toolName: "web_search",
        arguments: { query: "mcp", limit: 1 },
      });
      expect(research.contentText).toContain("Research Result");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects localhost, private IPs, credentials and URL secrets", async () => {
    const rejected = [
      "https://127.0.0.1/mcp",
      "https://10.0.0.8/mcp",
      "https://user:pass@example.com/mcp",
      "https://example.com/mcp?token=secret",
      "http://example.com/mcp",
    ];
    for (const value of rejected) {
      try {
        await assertPublicHttpsMcpUrl(value);
        throw new Error(`Expected rejection for ${value}`);
      } catch (error) {
        expect(error).toBeInstanceOf(GuestToolError);
      }
    }
  });

  test("rejects private targets before the web fetch proxy is called", async () => {
    const rejected = [
      "http://localhost/admin",
      "http://127.0.0.1/admin",
      "http://169.254.169.254/latest/meta-data",
      "https://10.0.0.8/internal",
    ];
    for (const url of rejected) {
      try {
        await callGuestBuiltinTool("web_fetch", { url });
        throw new Error(`Expected rejection for ${url}`);
      } catch (error) {
        expect(error).toBeInstanceOf(GuestToolError);
        expect((error as GuestToolError).code).toBe("private_tool_url");
      }
    }
  });

  test("uses the Tencent-reachable bounded provider for web search", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = ((input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      calls.push(url);
      if (url.startsWith("https://cn.bing.com/search")) {
        return Promise.resolve(new Response(`
          <h2 class=""><a href="https://example.com/">Example &amp; Result</a></h2>
          <div class="b_caption"><p>A <b>bounded</b> result.</p></div>
        `));
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    try {
      const search = await callGuestBuiltinTool("web_search", {
        query: "example",
        limit: 1,
      });
      expect(JSON.parse(search)).toEqual([
        {
          title: "Example & Result",
          url: "https://example.com/",
          snippet: "A bounded result.",
        },
      ]);
      expect(calls[0]).toStartWith(
        "https://cn.bing.com/search?q=example"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
