import { describe, expect, it } from "vitest";
import {
	type WebBrowser,
	type WebBrowserBackend,
	type WebBrowserInstance,
	type WebBrowserPage,
	type WebBrowserTaskRunner,
	type WebFetch,
	WebSkillRegistry,
} from "../src/core/web/index.ts";

function response(body: unknown, status = 200): Awaited<ReturnType<WebFetch>> {
	return {
		status,
		text: async () => JSON.stringify(body),
	};
}

function pageForTest(): WebBrowserPage {
	let currentUrl = "https://example.com";
	return {
		url: () => currentUrl,
		goto: async (url) => {
			currentUrl = url;
		},
		click: async () => undefined,
		fill: async () => undefined,
		selectOption: async () => undefined,
		waitForTimeout: async () => undefined,
		title: async () => "Example",
		textContent: async () => "page text",
		content: async () => "<html>page</html>",
		screenshot: async () => new Uint8Array(),
	};
}

function backendForTest(calls: WebBrowser[]): WebBrowserBackend {
	return {
		launch: async (browser) => {
			calls.push(browser);
			const page = pageForTest();
			const instance: WebBrowserInstance = {
				newContext: async () => ({
					newPage: async () => page,
					close: async () => undefined,
				}),
				close: async () => undefined,
			};
			return instance;
		},
	};
}

describe("web skill progressive registry", () => {
	it("discovers and opens only the selected tool documentation", async () => {
		const registry = new WebSkillRegistry();
		expect(registry.skillSearch("pesquisa na internet")).toEqual([
			{ name: "web", description: "Pesquisa, leitura, extração e navegação na internet." },
		]);
		const index = await registry.skillOpen("web");
		expect(index.documentation).toContain("web.search");
		expect(index.documentation).toContain("SearXNG");
		expect(index.documentation).toContain("Camoufox");
		expect(index.documentation).not.toContain("Parâmetros:");
		const search = await registry.toolOpen("web.search");
		expect(search.name).toBe("web.search");
		expect(search.documentation).toContain("SearXNG");
		expect(search.documentation).not.toContain("Browser Use");
		expect(search.parameters).toMatchObject({ type: "object" });
		expect(registry.createToolDefinitions(["web.search"])).toHaveLength(1);
	});

	it("searches with SearXNG and removes duplicate URLs", async () => {
		let requestedUrl = "";
		const fetchImpl: WebFetch = async (url) => {
			requestedUrl = String(url);
			return response({
				results: [
					{ title: "A", url: "https://example.com/a#one", content: "one", engine: "google" },
					{ title: "A duplicate", url: "https://example.com/a#two" },
					{ title: "B", url: "https://example.com/b", publishedDate: "2026-08-01" },
				],
			});
		};
		const result = await new WebSkillRegistry({ searxngUrl: "https://search.example", fetch: fetchImpl }).toolExecute(
			"web.search",
			{
				query: "Athena",
				maxResults: 10,
			},
		);
		expect(requestedUrl).toContain("format=json");
		expect(result).toEqual({
			query: "Athena",
			results: [
				{ title: "A", url: "https://example.com/a", snippet: "one", engine: "google" },
				{ title: "B", url: "https://example.com/b", publishedAt: "2026-08-01" },
			],
		});
	});

	it("fetches with Firecrawl and blocks SSRF targets", async () => {
		let body = "";
		const fetchImpl: WebFetch = async (_url, init) => {
			body = String(init?.body);
			return response({
				data: { url: "https://docs.example/page", title: "Docs", markdown: "# Docs", metadata: { source: "test" } },
			});
		};
		const registry = new WebSkillRegistry({ firecrawlUrl: "https://firecrawl.example", fetch: fetchImpl });
		await expect(registry.toolExecute("web.fetch", { url: "http://127.0.0.1/admin" })).rejects.toMatchObject({
			code: "blocked",
		});
		await expect(
			registry.toolExecute("web.fetch", { url: "https://docs.example/page", formats: ["markdown"] }),
		).resolves.toMatchObject({ title: "Docs", markdown: "# Docs" });
		expect(body).toContain("https://docs.example/page");
	});

	it("keeps crawling bounded by maxPages", async () => {
		let requestBody: Record<string, unknown> | undefined;
		const fetchImpl: WebFetch = async (_url, init) => {
			requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
			return response({
				data: [
					{ url: "https://docs.example/1", markdown: "1" },
					{ url: "https://docs.example/2", markdown: "2" },
					{ url: "https://docs.example/3", markdown: "3" },
				],
			});
		};
		const result = await new WebSkillRegistry({
			firecrawlUrl: "https://firecrawl.example",
			maxCrawlPages: 2,
			fetch: fetchImpl,
		}).toolExecute("web.crawl", {
			url: "https://docs.example",
			maxPages: 50,
			maxDepth: 2,
		});
		expect(requestBody?.limit).toBe(2);
		expect((result as { pages: unknown[] }).pages).toHaveLength(2);
	});

	it("selects Chromium and Camoufox without exposing both backends", async () => {
		const calls: WebBrowser[] = [];
		const registry = new WebSkillRegistry({ browserBackend: backendForTest(calls) });
		await registry.toolExecute("web.navigate", { startUrl: "https://example.com", actions: [], browser: "chromium" });
		await registry.toolExecute("web.navigate", { startUrl: "https://example.com", actions: [], browser: "camoufox" });
		expect(calls).toEqual(["chromium", "camoufox"]);
	});

	it("runs a controlled Browser Use task with a bounded step count", async () => {
		const calls: Array<{ browser: string; maxSteps: number }> = [];
		const runner: WebBrowserTaskRunner = {
			run: async (_input, context) => {
				calls.push({ browser: context.browser, maxSteps: context.maxSteps });
				return { task: "find logs", result: "done", backend: context.browser, steps: context.maxSteps };
			},
		};
		const registry = new WebSkillRegistry({ browserTaskRunner: runner });
		await expect(
			registry.toolExecute("web.browser-task", { task: "find logs", maxSteps: 999, browser: "camoufox" }),
		).resolves.toMatchObject({ result: "done", backend: "camoufox" });
		expect(calls).toEqual([{ browser: "camoufox", maxSteps: 100 }]);
	});

	it("reports timeout, cancellation, unavailable providers, and blocked domains clearly", async () => {
		const timeoutFetch: WebFetch = async (_url, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
			});
		await expect(
			new WebSkillRegistry({ searxngUrl: "https://search.example", timeoutMs: 5, fetch: timeoutFetch }).toolExecute(
				"web.search",
				{ query: "timeout" },
			),
		).rejects.toMatchObject({ code: "timeout" });
		const controller = new AbortController();
		controller.abort();
		await expect(
			new WebSkillRegistry({ searxngUrl: "https://search.example", fetch: timeoutFetch }).toolExecute(
				"web.search",
				{ query: "cancel" },
				controller.signal,
			),
		).rejects.toMatchObject({ code: "cancelled" });
		await expect(
			new WebSkillRegistry({ searxngUrl: "not-a-url" }).toolExecute("web.search", { query: "missing" }),
		).rejects.toMatchObject({ code: "provider_unavailable" });
		await expect(
			new WebSkillRegistry({ browserBackend: backendForTest([]) }).toolExecute("web.navigate", {
				startUrl: "https://example.com",
				actions: [{ type: "open", url: "https://evil.example" }],
				allowedDomains: ["example.com"],
			}),
		).rejects.toMatchObject({ code: "blocked" });
	});

	it("requires confirmation for form submission", async () => {
		const registry = new WebSkillRegistry({ browserBackend: backendForTest([]) });
		await expect(
			registry.toolExecute("web.navigate", {
				startUrl: "https://example.com",
				actions: [{ type: "submit", selector: "form" }],
			}),
		).rejects.toMatchObject({ code: "confirmation_required" });
	});
});
