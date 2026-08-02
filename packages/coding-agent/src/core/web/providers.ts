import { assertConfiguredEndpoint, assertResponseSize, assertSafeUrl } from "./security.ts";
import {
	type WebCrawlInput,
	type WebCrawlOutput,
	WebError,
	type WebFetch,
	type WebFetchInput,
	type WebFetchOutput,
	type WebProviderOptions,
	type WebSearchInput,
	type WebSearchOutput,
	type WebSearchResult,
} from "./types.ts";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 4_000_000;
const DEFAULT_MAX_CRAWL_PAGES = 20;

interface FirecrawlResponse {
	success?: boolean;
	data?: Record<string, unknown> | Array<Record<string, unknown>>;
	id?: string;
	status?: string;
	pages?: Array<Record<string, unknown>>;
}

function timeoutSignal(
	signal: AbortSignal | undefined,
	timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new Error("request timeout")), timeoutMs);
	const abort = (): void => controller.abort(signal?.reason);
	if (signal) {
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
	}
	return {
		signal: controller.signal,
		dispose: () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
		},
	};
}

async function requestJson(
	fetchImpl: WebFetch,
	url: string,
	init: RequestInit,
	options: WebProviderOptions,
	signal?: AbortSignal,
): Promise<FirecrawlResponse & Record<string, unknown>> {
	if (signal?.aborted) throw new WebError("cancelled", "Web provider request was cancelled");
	const timeout = timeoutSignal(signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	try {
		const response = await fetchImpl(url, { ...init, signal: timeout.signal });
		const body = assertResponseSize(await response.text(), options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);
		if (!response.status || response.status < 200 || response.status >= 300) {
			throw new WebError(
				"provider_unavailable",
				`Web provider returned HTTP ${response.status}: ${body.slice(0, 300)}`,
			);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(body);
		} catch (error) {
			throw new WebError("provider_unavailable", "Web provider returned invalid JSON", {
				cause: error instanceof Error ? error : undefined,
			});
		}
		if (!parsed || typeof parsed !== "object")
			throw new WebError("provider_unavailable", "Web provider returned an invalid response");
		return parsed as FirecrawlResponse & Record<string, unknown>;
	} catch (error) {
		if (error instanceof WebError) throw error;
		if (signal?.aborted) {
			throw new WebError("cancelled", "Web provider request was cancelled", {
				cause: error instanceof Error ? error : undefined,
			});
		}
		if (timeout.signal.aborted) {
			throw new WebError("timeout", `Web provider timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`, {
				cause: error instanceof Error ? error : undefined,
			});
		}
		throw new WebError(
			"provider_unavailable",
			`Web provider is unavailable: ${error instanceof Error ? error.message : String(error)}`,
			{
				cause: error instanceof Error ? error : undefined,
			},
		);
	} finally {
		timeout.dispose();
	}
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeUrl(value: unknown): string | undefined {
	const raw = getString(value);
	if (!raw) return undefined;
	try {
		const url = new URL(raw);
		url.hash = "";
		return url.toString();
	} catch {
		return undefined;
	}
}

function readSearchResult(value: unknown): WebSearchResult | undefined {
	if (!value || typeof value !== "object") return undefined;
	const item = value as Record<string, unknown>;
	const url = normalizeUrl(item.url);
	const title = getString(item.title);
	if (!url || !title) return undefined;
	return {
		title,
		url,
		snippet: getString(item.content) ?? getString(item.snippet),
		engine: getString(item.engine),
		publishedAt: getString(item.publishedDate) ?? getString(item.published_at),
	};
}

export async function searchWithSearxng(
	input: WebSearchInput,
	options: WebProviderOptions = {},
	fetchImpl: WebFetch = fetch,
	signal?: AbortSignal,
): Promise<WebSearchOutput> {
	if (!input.query.trim()) throw new WebError("invalid_input", "Search query must not be empty");
	const endpoint = assertConfiguredEndpoint(
		options.searxngUrl ?? process.env.ATHENA_SEARXNG_URL ?? "",
		"ATHENA_SEARXNG_URL",
	);
	endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/search`;
	endpoint.searchParams.set("q", input.query);
	endpoint.searchParams.set("format", "json");
	if (input.language) endpoint.searchParams.set("language", input.language);
	if (input.timeRange && input.timeRange !== "any") endpoint.searchParams.set("time_range", input.timeRange);
	if (input.domains?.length) endpoint.searchParams.set("site", input.domains.join(","));
	if (input.excludeDomains?.length) endpoint.searchParams.set("exclude_site", input.excludeDomains.join(","));
	const maxResults = Math.min(Math.max(input.maxResults ?? 10, 1), 50);
	const response = await requestJson(
		fetchImpl,
		endpoint.toString(),
		{ method: "GET", headers: { accept: "application/json" } },
		options,
		signal,
	);
	const rawResults = Array.isArray(response.results) ? response.results : [];
	const seen = new Set<string>();
	const results: WebSearchResult[] = [];
	for (const raw of rawResults) {
		const result = readSearchResult(raw);
		if (!result || seen.has(result.url)) continue;
		seen.add(result.url);
		results.push(result);
		if (results.length >= maxResults) break;
	}
	return { query: input.query, results };
}

function firecrawlData(response: FirecrawlResponse & Record<string, unknown>): Record<string, unknown> {
	if (response.data && !Array.isArray(response.data) && typeof response.data === "object") return response.data;
	return response;
}

function normalizeFetchOutput(value: Record<string, unknown>, fallbackUrl: string): WebFetchOutput {
	const metadata =
		value.metadata && typeof value.metadata === "object" ? (value.metadata as Record<string, unknown>) : undefined;
	const links = Array.isArray(value.links)
		? value.links.filter((link): link is string => typeof link === "string")
		: undefined;
	return {
		url: normalizeUrl(value.url) ?? fallbackUrl,
		title: getString(value.title) ?? getString(metadata?.title),
		markdown: getString(value.markdown) ?? getString(value.content),
		html: getString(value.html),
		links,
		metadata,
	};
}

function firecrawlEndpoint(options: WebProviderOptions): string {
	return (options.firecrawlUrl ?? process.env.ATHENA_FIRECRAWL_URL ?? "").replace(/\/$/, "");
}

function firecrawlHeaders(options: WebProviderOptions): Record<string, string> {
	return {
		accept: "application/json",
		"content-type": "application/json",
		...((options.firecrawlApiKey ?? process.env.ATHENA_FIRECRAWL_API_KEY)
			? { authorization: `Bearer ${options.firecrawlApiKey ?? process.env.ATHENA_FIRECRAWL_API_KEY}` }
			: {}),
	};
}

export async function fetchWithFirecrawl(
	input: WebFetchInput,
	options: WebProviderOptions = {},
	fetchImpl: WebFetch = fetch,
	signal?: AbortSignal,
): Promise<WebFetchOutput> {
	const url = assertSafeUrl(input.url, { allowPrivateHosts: options.allowPrivateHosts });
	const endpoint = firecrawlEndpoint(options);
	if (!endpoint) throw new WebError("provider_unavailable", "Firecrawl is not configured; set ATHENA_FIRECRAWL_URL");
	const formats = input.formats?.length ? input.formats : ["markdown"];
	const response = await requestJson(
		fetchImpl,
		`${assertConfiguredEndpoint(endpoint, "ATHENA_FIRECRAWL_URL").toString().replace(/\/$/, "")}/v1/scrape`,
		{
			method: "POST",
			headers: firecrawlHeaders(options),
			body: JSON.stringify({ url: url.toString(), formats }),
		},
		options,
		signal,
	);
	return normalizeFetchOutput(firecrawlData(response), url.toString());
}

export async function crawlWithFirecrawl(
	input: WebCrawlInput,
	options: WebProviderOptions = {},
	fetchImpl: WebFetch = fetch,
	signal?: AbortSignal,
): Promise<WebCrawlOutput> {
	const url = assertSafeUrl(input.url, { allowPrivateHosts: options.allowPrivateHosts });
	const endpoint = assertConfiguredEndpoint(firecrawlEndpoint(options), "ATHENA_FIRECRAWL_URL")
		.toString()
		.replace(/\/$/, "");
	const maxPages = Math.min(
		Math.max(input.maxPages ?? DEFAULT_MAX_CRAWL_PAGES, 1),
		options.maxCrawlPages ?? DEFAULT_MAX_CRAWL_PAGES,
	);
	const start = await requestJson(
		fetchImpl,
		`${endpoint}/v1/crawl`,
		{
			method: "POST",
			headers: firecrawlHeaders(options),
			body: JSON.stringify({
				url: url.toString(),
				limit: maxPages,
				maxDepth: Math.min(Math.max(input.maxDepth ?? 1, 0), 10),
				includePaths: input.includePaths,
				excludePaths: input.excludePaths,
				scrapeOptions: { formats: ["markdown"] },
			}),
		},
		options,
		signal,
	);
	const initialPages = Array.isArray(start.data) ? start.data : start.pages;
	if (initialPages) {
		return {
			url: url.toString(),
			pages: initialPages.slice(0, maxPages).map((page) => normalizeFetchOutput(page, url.toString())),
		};
	}
	const crawlId = getString(start.id);
	if (!crawlId) throw new WebError("provider_unavailable", "Firecrawl did not return a crawl id");
	const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS) * 4;
	while (Date.now() < deadline) {
		const status = await requestJson(
			fetchImpl,
			`${endpoint}/v1/crawl/${encodeURIComponent(crawlId)}`,
			{ method: "GET", headers: firecrawlHeaders(options) },
			options,
			signal,
		);
		const pages = Array.isArray(status.data) ? status.data : status.pages;
		if (pages && (status.status === "completed" || status.status === "done" || status.status === undefined)) {
			return {
				url: url.toString(),
				pages: pages.slice(0, maxPages).map((page) => normalizeFetchOutput(page, url.toString())),
			};
		}
		if (["failed", "cancelled"].includes(status.status ?? ""))
			throw new WebError("provider_unavailable", `Firecrawl crawl ${status.status}`);
		await new Promise<void>((resolve) => setTimeout(resolve, 250));
	}
	throw new WebError("timeout", "Firecrawl crawl exceeded its timeout");
}
