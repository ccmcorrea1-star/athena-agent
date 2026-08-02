import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { assertAllowedDomain, assertPathWithinDirectory, assertSafeUrl } from "./security.ts";
import {
	type BrowserAction,
	type WebBrowser,
	type WebBrowserBackend,
	type WebBrowserInstance,
	type WebBrowserPage,
	type WebBrowserTaskContext,
	type WebBrowserTaskInput,
	type WebBrowserTaskOutput,
	type WebBrowserTaskRunner,
	WebError,
	type WebNavigateInput,
	type WebNavigateOutput,
	type WebProviderOptions,
} from "./types.ts";

interface PlaywrightBrowserType {
	launch(options?: { headless?: boolean; executablePath?: string }): Promise<WebBrowserInstance>;
}

interface PlaywrightModule {
	chromium: PlaywrightBrowserType;
}

const require = createRequire(import.meta.url);

function loadPlaywright(): PlaywrightModule {
	try {
		return require("playwright") as PlaywrightModule;
	} catch (error) {
		throw new WebError("provider_unavailable", "Playwright is unavailable; install the playwright package", {
			cause: error instanceof Error ? error : undefined,
		});
	}
}

export function createPlaywrightBrowserBackend(options?: {
	headless?: boolean;
	camoufoxExecutable?: string;
}): WebBrowserBackend {
	return {
		async launch(browser: WebBrowser): Promise<WebBrowserInstance> {
			const playwright = loadPlaywright();
			if (browser === "chromium") {
				return playwright.chromium.launch({
					headless: options?.headless ?? process.env.ATHENA_BROWSER_HEADLESS !== "false",
				});
			}
			const executablePath = options?.camoufoxExecutable ?? process.env.ATHENA_CAMOUFOX_EXECUTABLE;
			if (!executablePath) {
				throw new WebError("provider_unavailable", "Camoufox is not configured; set ATHENA_CAMOUFOX_EXECUTABLE");
			}
			return playwright.chromium.launch({
				headless: options?.headless ?? process.env.ATHENA_BROWSER_HEADLESS !== "false",
				executablePath,
			});
		},
	};
}

function ensurePageUrl(page: WebBrowserPage, allowedDomains: string[] | undefined, allowPrivateHosts: boolean): void {
	const currentUrl = page.url();
	const url = assertSafeUrl(currentUrl, { allowedDomains, allowPrivateHosts });
	assertAllowedDomain(url, allowedDomains);
}

function screenshotPath(name: string | undefined, outputDirectory: string): string {
	const safeName = basename(name ?? `athena-${Date.now()}.png`);
	return assertPathWithinDirectory(join(outputDirectory, safeName), outputDirectory);
}

export async function navigateWithPlaywright(
	input: WebNavigateInput,
	backend: WebBrowserBackend,
	options: WebProviderOptions & {
		outputDirectory?: string;
		confirmWrite?: (action: BrowserAction) => Promise<boolean>;
	} = {},
	signal?: AbortSignal,
): Promise<WebNavigateOutput> {
	const browser = input.browser ?? "chromium";
	const startUrl = assertSafeUrl(input.startUrl, {
		allowedDomains: input.allowedDomains,
		allowPrivateHosts: options.allowPrivateHosts,
	});
	const instance = await backend.launch(browser);
	const context = await instance.newContext();
	const page = await context.newPage();
	const screenshots: string[] = [];
	const extracted: string[] = [];
	const outputDirectory = options.outputDirectory ?? join(process.cwd(), ".athena", "web-screenshots");
	await mkdir(outputDirectory, { recursive: true });
	try {
		await page.goto(startUrl.toString(), { timeout: options.timeoutMs, waitUntil: "domcontentloaded" });
		ensurePageUrl(page, input.allowedDomains, options.allowPrivateHosts ?? false);
		for (const action of input.actions) {
			if (signal?.aborted) throw new WebError("cancelled", "Navigation was cancelled");
			if (action.type === "open") {
				const url = assertSafeUrl(action.url, {
					allowedDomains: input.allowedDomains,
					allowPrivateHosts: options.allowPrivateHosts,
				});
				await page.goto(url.toString(), { timeout: options.timeoutMs, waitUntil: "domcontentloaded" });
			} else if (action.type === "click") {
				await page.click(action.selector, { timeout: options.timeoutMs });
			} else if (action.type === "submit") {
				const approved = await options.confirmWrite?.(action);
				if (!approved) throw new WebError("confirmation_required", "Submitting a form requires confirmation");
				await page.click(action.selector, { timeout: options.timeoutMs });
			} else if (action.type === "fill") {
				await page.fill(action.selector, action.value, { timeout: options.timeoutMs });
			} else if (action.type === "select") {
				await page.selectOption(action.selector, action.value, { timeout: options.timeoutMs });
			} else if (action.type === "wait") {
				await page.waitForTimeout(Math.min(Math.max(action.milliseconds ?? 250, 0), 10_000));
			} else if (action.type === "screenshot") {
				const path = screenshotPath(action.name, outputDirectory);
				await page.screenshot({ path });
				screenshots.push(path);
			} else if (action.type === "extract") {
				const value = action.selector ? await page.textContent(action.selector) : await page.content();
				if (value) extracted.push(value.slice(0, options.maxResponseBytes ?? 4_000_000));
			}
			ensurePageUrl(page, input.allowedDomains, options.allowPrivateHosts ?? false);
		}
		const text = await page.textContent("body");
		return {
			url: page.url(),
			title: await page.title(),
			text: text?.slice(0, options.maxResponseBytes ?? 4_000_000),
			extracted,
			screenshots,
			backend: browser,
		};
	} finally {
		await context.close().catch(() => undefined);
		await instance.close().catch(() => undefined);
	}
}

export interface BrowserUseCommand {
	executable: string;
	args?: string[];
	spawn: (
		executable: string,
		args: string[],
		options: { env: NodeJS.ProcessEnv; signal?: AbortSignal },
	) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export function createBrowserUseTaskRunner(command: BrowserUseCommand): WebBrowserTaskRunner {
	return {
		async run(input: WebBrowserTaskInput, context: WebBrowserTaskContext): Promise<WebBrowserTaskOutput> {
			const args = [
				...(command.args ?? []),
				"--task",
				input.task,
				...(input.startUrl ? ["--start-url", input.startUrl] : []),
				"--max-steps",
				String(context.maxSteps),
				"--browser",
				context.browser,
			];
			const result = await command.spawn(command.executable, args, {
				env: { ...process.env, ATHENA_BROWSER_BACKEND: context.browser },
				signal: context.signal,
			});
			if (result.exitCode !== 0)
				throw new WebError("provider_unavailable", `Browser Use failed: ${result.stderr.slice(0, 500)}`);
			return {
				task: input.task,
				result: result.stdout.slice(0, 4_000_000),
				backend: context.browser,
				steps: context.maxSteps,
			};
		},
	};
}
