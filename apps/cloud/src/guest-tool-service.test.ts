import { describe, expect, test } from "bun:test";

import {
  assertPublicHttpsMcpUrl,
  callGuestBuiltinTool,
  callGuestMcpTool,
  GuestToolError,
  listDemoMcpTools,
} from "./guest-tool-service";

describe("guest tool service", () => {
  test("executes bounded demo MCP tools without a remote connection", async () => {
    expect(listDemoMcpTools().map((tool) => tool.name)).toEqual([
      "calculator",
      "current_time",
    ]);
    const result = await callGuestMcpTool({
      serverId: "guest-demo-mcp",
      toolName: "calculator",
      arguments: { a: 9, operator: "-", b: 4 },
    });
    expect(result.isError).toBe(false);
    expect(result.contentText).toContain('"result":5');
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

  test("uses keyless bounded providers for web search and fetch", async () => {
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
      if (url.startsWith("https://lite.duckduckgo.com/")) {
        return Promise.resolve(new Response(`
          <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F&amp;rut=safe" class='result-link'>Example &amp; Result</a>
          <td class='result-snippet'>A <b>bounded</b> result.</td>
        `));
      }
      return Promise.resolve(
        new Response("# Example\n\nFetched through the fixed reader.")
      );
    }) as typeof fetch;

    try {
      const search = await callGuestBuiltinTool("web_search", {
        query: "example",
        limit: 1,
      });
      const fetched = await callGuestBuiltinTool("web_fetch", {
        url: "https://1.1.1.1/example",
      });

      expect(JSON.parse(search)).toEqual([
        {
          title: "Example & Result",
          url: "https://example.com/",
          snippet: "A bounded result.",
        },
      ]);
      expect(fetched).toContain("Fetched through the fixed reader.");
      expect(calls[0]).toStartWith(
        "https://lite.duckduckgo.com/lite/?q=example"
      );
      expect(calls[1]).toBe(
        "https://r.jina.ai/https://1.1.1.1/example"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
