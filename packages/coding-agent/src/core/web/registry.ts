import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentToolResult } from "@athena/agent-core";
import { type TSchema, Type } from "typebox";
import { getPackageDir } from "../../config.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { createBrowserUseTaskRunner, createPlaywrightBrowserBackend, navigateWithPlaywright } from "./browser.ts";
import { crawlWithFirecrawl, fetchWithFirecrawl, searchWithSearxng } from "./providers.ts";
import { assertSafeUrl } from "./security.ts";
import {
	type WebBrowserTaskInput,
	type WebBrowserTaskRunner,
	type WebCrawlInput,
	WebError,
	type WebFetchInput,
	type WebNavigateInput,
	type WebProviderOptions,
	type WebSearchInput,
	type WebSkillIndex,
	type WebSkillRegistryOptions,
	type WebSkillSearchResult,
	type WebToolManifest,
} from "./types.ts";

function createSearchSchema(): TSchema {
	return Type.Object({
		query: Type.String({ description: "Search query" }),
		language: Type.Optional(Type.String()),
		timeRange: Type.Optional(
			Type.Union([
				Type.Literal("day"),
				Type.Literal("week"),
				Type.Literal("month"),
				Type.Literal("year"),
				Type.Literal("any"),
			]),
		),
		maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
		domains: Type.Optional(Type.Array(Type.String())),
		excludeDomains: Type.Optional(Type.Array(Type.String())),
	});
}

function createFetchSchema(): TSchema {
	return Type.Object({
		url: Type.String({ description: "Page URL" }),
		formats: Type.Optional(
			Type.Array(Type.Union([Type.Literal("markdown"), Type.Literal("html"), Type.Literal("links")])),
		),
	});
}

function createCrawlSchema(): TSchema {
	return Type.Object({
		url: Type.String({ description: "Root URL" }),
		maxDepth: Type.Optional(Type.Integer({ minimum: 0, maximum: 10 })),
		maxPages: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
		includePaths: Type.Optional(Type.Array(Type.String())),
		excludePaths: Type.Optional(Type.Array(Type.String())),
	});
}

function createBrowserActionSchema(): TSchema {
	return Type.Union([
		Type.Object({ type: Type.Literal("open"), url: Type.String() }),
		Type.Object({ type: Type.Literal("click"), selector: Type.String() }),
		Type.Object({ type: Type.Literal("fill"), selector: Type.String(), value: Type.String() }),
		Type.Object({ type: Type.Literal("select"), selector: Type.String(), value: Type.String() }),
		Type.Object({
			type: Type.Literal("wait"),
			milliseconds: Type.Optional(Type.Integer({ minimum: 0, maximum: 10_000 })),
		}),
		Type.Object({ type: Type.Literal("screenshot"), name: Type.Optional(Type.String()) }),
		Type.Object({ type: Type.Literal("extract"), selector: Type.Optional(Type.String()) }),
		Type.Object({ type: Type.Literal("submit"), selector: Type.String() }),
	]);
}

function createNavigateSchema(): TSchema {
	return Type.Object({
		startUrl: Type.String(),
		actions: Type.Array(createBrowserActionSchema(), { maxItems: 100 }),
		browser: Type.Optional(Type.Union([Type.Literal("chromium"), Type.Literal("camoufox")])),
		allowedDomains: Type.Optional(Type.Array(Type.String())),
	});
}

function createBrowserTaskSchema(): TSchema {
	return Type.Object({
		task: Type.String({ minLength: 1 }),
		startUrl: Type.Optional(Type.String()),
		allowedDomains: Type.Optional(Type.Array(Type.String())),
		maxSteps: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
		browser: Type.Optional(Type.Union([Type.Literal("chromium"), Type.Literal("camoufox")])),
		allowWriteActions: Type.Optional(Type.Boolean()),
	});
}

export type WebToolName = "web.search" | "web.fetch" | "web.crawl" | "web.navigate" | "web.browser-task";

interface WebToolMetadata {
	name: WebToolName;
	description: string;
	permission: WebToolManifest["permission"];
	limits: Record<string, number | string>;
	createSchema: () => TSchema;
}

const toolMetadata: Record<WebToolName, WebToolMetadata> = {
	"web.search": {
		name: "web.search",
		description: "Find URLs and primary sources using SearXNG.",
		permission: "READ",
		limits: { maxResults: 50, timeoutMs: 15_000 },
		createSchema: createSearchSchema,
	},
	"web.fetch": {
		name: "web.fetch",
		description: "Extract and structure one page using Firecrawl.",
		permission: "READ",
		limits: { maxResponseBytes: 4_000_000, timeoutMs: 15_000 },
		createSchema: createFetchSchema,
	},
	"web.crawl": {
		name: "web.crawl",
		description: "Extract a bounded set of related pages using Firecrawl.",
		permission: "READ",
		limits: { maxDepth: 10, maxPages: 20, timeoutMs: 15_000 },
		createSchema: createCrawlSchema,
	},
	"web.navigate": {
		name: "web.navigate",
		description: "Execute a known browser flow with Playwright or Camoufox.",
		permission: "INTERACT",
		limits: { maxActions: 100, timeoutMs: 30_000 },
		createSchema: createNavigateSchema,
	},
	"web.browser-task": {
		name: "web.browser-task",
		description: "Delegate an unknown browser flow to Browser Use.",
		permission: "INTERACT",
		limits: { maxSteps: 30, timeoutMs: 60_000 },
		createSchema: createBrowserTaskSchema,
	},
};

export const WEB_TOOL_NAMES: readonly WebToolName[] = Object.keys(toolMetadata) as WebToolName[];

function isWebToolName(value: string): value is WebToolName {
	return value in toolMetadata;
}

function formatToolResult(value: unknown): AgentToolResult<unknown> {
	return {
		content: [{ type: "text", text: JSON.stringify(value) }],
		details: value,
	};
}

function formatToolError(error: unknown): AgentToolResult<unknown> {
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [{ type: "text", text: message }],
		details: { error: message },
	};
}

function readString(value: unknown, name: string): string {
	if (typeof value !== "string" || value.trim().length === 0)
		throw new WebError("invalid_input", `${name} must be a non-empty string`);
	return value;
}

function readObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new WebError("invalid_input", "Tool arguments must be an object");
	return value as Record<string, unknown>;
}

function readBrowserTaskRunner(): WebBrowserTaskRunner {
	const executable = process.env.ATHENA_BROWSER_USE_COMMAND ?? "browser-use";
	return createBrowserUseTaskRunner({
		executable,
		spawn: (command, args, options) =>
			new Promise((resolve, reject) => {
				const child = spawn(command, args, { env: options.env, signal: options.signal });
				let stdout = "";
				let stderr = "";
				child.stdout?.on("data", (chunk: Buffer) => {
					stdout += chunk.toString();
				});
				child.stderr?.on("data", (chunk: Buffer) => {
					stderr += chunk.toString();
				});
				child.once("error", reject);
				child.once("close", (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? 1 }));
			}),
	});
}

function defaultSkillDirectory(): string {
	const packageDir = getPackageDir();
	return join(packageDir, "skills", "web");
}

export class WebSkillRegistry {
	private readonly options: WebSkillRegistryOptions;
	private readonly skillDirectory: string;

	constructor(options: WebSkillRegistryOptions = {}) {
		this.options = options;
		this.skillDirectory = options.skillDirectory ?? defaultSkillDirectory();
	}

	/** Return only the small index that can be placed in the global model context. */
	getSkillIndexPrompt(): string {
		try {
			const documentation = readFileSync(join(this.skillDirectory, "skill.md"), "utf8").trim();
			return `<web_skill>\n${documentation}\n</web_skill>`;
		} catch {
			return "<web_skill>\n<name>web</name>\n</web_skill>";
		}
	}

	skillSearch(query: string): WebSkillSearchResult[] {
		const normalized = query.trim().toLowerCase();
		if (!normalized || "web internet pesquisa leitura extração navegação".includes(normalized)) {
			return [{ name: "web", description: "Pesquisa, leitura, extração e navegação na internet." }];
		}
		return ["web", "internet", "pesquisa", "leitura", "extração", "navegação"].some((term) =>
			normalized.includes(term),
		)
			? [{ name: "web", description: "Pesquisa, leitura, extração e navegação na internet." }]
			: [];
	}

	skill_search(query: string): WebSkillSearchResult[] {
		return this.skillSearch(query);
	}

	async skillOpen(name: string): Promise<WebSkillIndex> {
		if (name !== "web") throw new WebError("invalid_input", `Unknown skill: ${name}`);
		const documentation = await this.readDocumentation("skill.md");
		return {
			name: "web",
			description: "Pesquisa, leitura, extração e navegação na internet.",
			documentation,
			tools: Object.values(toolMetadata).map(({ name: toolName, description, permission }) => ({
				name: toolName,
				description,
				permission,
			})),
		};
	}

	async skill_open(name: string): Promise<WebSkillIndex> {
		return this.skillOpen(name);
	}

	async toolOpen(name: string): Promise<WebToolManifest> {
		if (!isWebToolName(name)) throw new WebError("invalid_input", `Unknown web tool: ${name}`);
		const metadata = toolMetadata[name];
		return {
			name: metadata.name,
			description: metadata.description,
			permission: metadata.permission,
			parameters: metadata.createSchema(),
			limits: metadata.limits,
			documentation: await this.readDocumentation(`tools/${name.slice("web.".length)}/tool.md`),
		};
	}

	/** Adapt the selected web tools to Athena's normal tool registry. */
	createToolDefinitions(names: readonly WebToolName[] = WEB_TOOL_NAMES): ToolDefinition<TSchema, unknown, unknown>[] {
		return names.map((name) => {
			const metadata = toolMetadata[name];
			return {
				name,
				label: name,
				description: metadata.description,
				promptSnippet: metadata.description,
				promptGuidelines: ["Choose exactly one web tool whose purpose matches the task."],
				parameters: metadata.createSchema(),
				executionMode: "sequential",
				execute: async (_toolCallId, params, signal, _onUpdate, _context) => {
					try {
						return formatToolResult(await this.toolExecute(name, params, signal));
					} catch (error) {
						return { ...formatToolError(error), isError: true };
					}
				},
			};
		});
	}

	async tool_open(name: string): Promise<WebToolManifest> {
		return this.toolOpen(name);
	}

	async toolExecute(name: string, argumentsValue: unknown, signal?: AbortSignal): Promise<unknown> {
		if (!isWebToolName(name)) throw new WebError("invalid_input", `Unknown web tool: ${name}`);
		const args = readObject(argumentsValue);
		const providerOptions: WebProviderOptions = this.options;
		if (name === "web.search")
			return searchWithSearxng(
				args as unknown as WebSearchInput,
				providerOptions,
				this.options.fetch ?? fetch,
				signal,
			);
		if (name === "web.fetch") {
			const url = readString(args.url, "url");
			assertSafeUrl(url, { allowPrivateHosts: this.options.allowPrivateHosts });
			return fetchWithFirecrawl(
				{ ...args, url } as unknown as WebFetchInput,
				providerOptions,
				this.options.fetch ?? fetch,
				signal,
			);
		}
		if (name === "web.crawl") {
			const url = readString(args.url, "url");
			assertSafeUrl(url, { allowPrivateHosts: this.options.allowPrivateHosts });
			return crawlWithFirecrawl(
				{ ...args, url } as unknown as WebCrawlInput,
				providerOptions,
				this.options.fetch ?? fetch,
				signal,
			);
		}
		if (name === "web.navigate") return this.executeNavigate(args, signal);
		return this.executeBrowserTask(args, signal);
	}

	async tool_execute(name: string, argumentsValue: unknown, signal?: AbortSignal): Promise<unknown> {
		return this.toolExecute(name, argumentsValue, signal);
	}

	private async executeNavigate(args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
		const startUrl = readString(args.startUrl, "startUrl");
		const input = {
			...args,
			startUrl,
			actions: Array.isArray(args.actions) ? args.actions : [],
		} as unknown as WebNavigateInput;
		assertSafeUrl(startUrl, {
			allowedDomains: input.allowedDomains,
			allowPrivateHosts: this.options.allowPrivateHosts,
		});
		if (input.actions.length > 100) throw new WebError("blocked", "Navigation action limit exceeded");
		const backend = this.options.browserBackend ?? createPlaywrightBrowserBackend();
		return navigateWithPlaywright(
			input,
			backend,
			{
				...this.options,
				confirmWrite: async (action) => Boolean(await this.options.confirmWrite?.("WRITE", action)),
			},
			signal,
		);
	}

	private async executeBrowserTask(args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
		const task = readString(args.task, "task");
		const browser = args.browser === "camoufox" ? "camoufox" : "chromium";
		if (typeof args.startUrl === "string") {
			assertSafeUrl(args.startUrl, {
				allowedDomains: Array.isArray(args.allowedDomains)
					? args.allowedDomains.filter((value): value is string => typeof value === "string")
					: undefined,
				allowPrivateHosts: this.options.allowPrivateHosts,
			});
		}
		const maxSteps = Math.min(
			Math.max(typeof args.maxSteps === "number" ? args.maxSteps : (this.options.maxBrowserSteps ?? 30), 1),
			100,
		);
		const allowWriteActions = args.allowWriteActions === true;
		if (allowWriteActions) {
			const approved = await this.options.confirmWrite?.("WRITE", { type: "submit", selector: "browser-task" });
			if (!approved) throw new WebError("confirmation_required", "Browser write actions require confirmation");
		}
		const runner = this.options.browserTaskRunner ?? readBrowserTaskRunner();
		return runner.run({ ...args, task, browser, maxSteps, allowWriteActions } as unknown as WebBrowserTaskInput, {
			browser,
			allowedDomains: Array.isArray(args.allowedDomains)
				? args.allowedDomains.filter((value): value is string => typeof value === "string")
				: undefined,
			maxSteps,
			allowWriteActions,
			signal,
		});
	}

	private async readDocumentation(relativePath: string): Promise<string> {
		try {
			return (await readFile(join(this.skillDirectory, relativePath), "utf8")).trim();
		} catch (error) {
			throw new WebError("provider_unavailable", `Web skill documentation is unavailable: ${relativePath}`, {
				cause: error instanceof Error ? error : undefined,
			});
		}
	}
}

export function createWebSkillRegistry(options?: WebSkillRegistryOptions): WebSkillRegistry {
	return new WebSkillRegistry(options);
}
