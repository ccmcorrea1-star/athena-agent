import type { TSchema } from "typebox";

export type WebBrowser = "chromium" | "camoufox";
export type WebPermission = "READ" | "INTERACT" | "WRITE" | "DESTRUCTIVE";

export interface WebSearchInput {
	query: string;
	language?: string;
	timeRange?: "day" | "week" | "month" | "year" | "any";
	maxResults?: number;
	domains?: string[];
	excludeDomains?: string[];
}

export interface WebSearchResult {
	title: string;
	url: string;
	snippet?: string;
	engine?: string;
	publishedAt?: string;
}

export interface WebSearchOutput {
	query: string;
	results: WebSearchResult[];
}

export interface WebFetchInput {
	url: string;
	formats?: Array<"markdown" | "html" | "links">;
}

export interface WebFetchOutput {
	url: string;
	title?: string;
	markdown?: string;
	html?: string;
	links?: string[];
	metadata?: Record<string, unknown>;
}

export interface WebCrawlInput {
	url: string;
	maxDepth?: number;
	maxPages?: number;
	includePaths?: string[];
	excludePaths?: string[];
}

export interface WebCrawlPage extends WebFetchOutput {
	depth?: number;
}

export interface WebCrawlOutput {
	url: string;
	pages: WebCrawlPage[];
}

export type BrowserAction =
	| { type: "open"; url: string }
	| { type: "click"; selector: string }
	| { type: "submit"; selector: string }
	| { type: "fill"; selector: string; value: string }
	| { type: "select"; selector: string; value: string }
	| { type: "wait"; milliseconds?: number }
	| { type: "screenshot"; name?: string }
	| { type: "extract"; selector?: string };

export interface WebNavigateInput {
	startUrl: string;
	actions: BrowserAction[];
	browser?: WebBrowser;
	allowedDomains?: string[];
}

export interface WebNavigateOutput {
	url: string;
	title?: string;
	text?: string;
	extracted?: string[];
	screenshots?: string[];
	backend: WebBrowser;
}

export interface WebBrowserTaskInput {
	task: string;
	startUrl?: string;
	allowedDomains?: string[];
	maxSteps?: number;
	browser?: WebBrowser;
	allowWriteActions?: boolean;
}

export interface WebBrowserTaskOutput {
	task: string;
	result: string;
	backend: WebBrowser;
	steps: number;
}

export interface WebToolManifest {
	name: `web.${string}`;
	description: string;
	permission: WebPermission;
	parameters: TSchema;
	limits: Record<string, number | string>;
	documentation: string;
}

export interface WebSkillIndex {
	name: "web";
	description: string;
	documentation: string;
	tools: Array<Pick<WebToolManifest, "name" | "description" | "permission">>;
}

export interface WebSkillSearchResult {
	name: "web";
	description: string;
}

export interface WebProviderOptions {
	searxngUrl?: string;
	firecrawlUrl?: string;
	firecrawlApiKey?: string;
	timeoutMs?: number;
	maxResponseBytes?: number;
	maxCrawlPages?: number;
	maxBrowserSteps?: number;
	allowPrivateHosts?: boolean;
}

export interface WebProviderResponse {
	status: number;
	text(): Promise<string>;
}

export type WebFetch = (input: string | URL, init?: RequestInit) => Promise<WebProviderResponse>;

export interface WebBrowserPage {
	url(): string;
	goto(url: string, options?: { timeout?: number; waitUntil?: "domcontentloaded" | "load" }): Promise<void>;
	click(selector: string, options?: { timeout?: number }): Promise<void>;
	fill(selector: string, value: string, options?: { timeout?: number }): Promise<void>;
	selectOption(selector: string, value: string, options?: { timeout?: number }): Promise<void>;
	waitForTimeout(milliseconds: number): Promise<void>;
	title(): Promise<string>;
	textContent(selector: string): Promise<string | null>;
	content(): Promise<string>;
	screenshot(options?: { path?: string }): Promise<Uint8Array>;
}

export interface WebBrowserContext {
	newPage(): Promise<WebBrowserPage>;
	close(): Promise<void>;
}

export interface WebBrowserInstance {
	newContext(): Promise<WebBrowserContext>;
	close(): Promise<void>;
}

export interface WebBrowserBackend {
	launch(browser: WebBrowser): Promise<WebBrowserInstance>;
}

export interface WebBrowserTaskContext {
	browser: WebBrowser;
	allowedDomains?: string[];
	maxSteps: number;
	allowWriteActions: boolean;
	signal?: AbortSignal;
}

export interface WebBrowserTaskRunner {
	run(input: WebBrowserTaskInput, context: WebBrowserTaskContext): Promise<WebBrowserTaskOutput>;
}

export interface WebSkillRegistryOptions extends WebProviderOptions {
	skillDirectory?: string;
	fetch?: WebFetch;
	browserBackend?: WebBrowserBackend;
	browserTaskRunner?: WebBrowserTaskRunner;
	confirmWrite?: (permission: "WRITE" | "DESTRUCTIVE", action: BrowserAction) => Promise<boolean>;
}

export class WebError extends Error {
	readonly code:
		| "invalid_input"
		| "provider_unavailable"
		| "timeout"
		| "cancelled"
		| "blocked"
		| "confirmation_required";

	constructor(code: WebError["code"], message: string, options?: { cause?: Error }) {
		super(message, options?.cause === undefined ? undefined : { cause: options.cause });
		this.name = "WebError";
		this.code = code;
	}
}
