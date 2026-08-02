import { isIP } from "node:net";
import { relative, resolve } from "node:path";
import { WebError } from "./types.ts";

const PRIVATE_IPV4_RANGES = [
	[/^10\./, "private network"],
	[/^127\./, "loopback"],
	[/^169\.254\./, "link-local"],
	[/^172\.(1[6-9]|2\d|3[01])\./, "private network"],
	[/^192\.168\./, "private network"],
	[/^198\.18\./, "benchmark network"],
	[/^0\./, "unspecified network"],
] as const;

function isPrivateIp(address: string): boolean {
	if (isIP(address) === 4) return PRIVATE_IPV4_RANGES.some(([pattern]) => pattern.test(address));
	if (isIP(address) === 6) {
		const normalized = address.toLowerCase();
		return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd");
	}
	return false;
}

function normalizeDomain(domain: string): string {
	return domain
		.trim()
		.toLowerCase()
		.replace(/^\.+|\.+$/g, "");
}

export function assertAllowedDomain(url: URL, allowedDomains?: string[]): void {
	if (!allowedDomains || allowedDomains.length === 0) return;
	const hostname = normalizeDomain(url.hostname);
	const allowed = allowedDomains.map(normalizeDomain).filter(Boolean);
	if (!allowed.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
		throw new WebError("blocked", `Domain is not allowed: ${url.hostname}`);
	}
}

export function assertSafeUrl(
	value: string,
	options?: { allowedDomains?: string[]; allowPrivateHosts?: boolean },
): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch (error) {
		throw new WebError("invalid_input", `Invalid URL: ${value}`, {
			cause: error instanceof Error ? error : undefined,
		});
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new WebError("blocked", `Unsupported URL protocol: ${url.protocol}`);
	}
	if (!url.hostname) throw new WebError("invalid_input", "URL must include a hostname");
	assertAllowedDomain(url, options?.allowedDomains);
	if (!options?.allowPrivateHosts && (url.hostname === "localhost" || isPrivateIp(url.hostname))) {
		throw new WebError("blocked", `Private or local host is blocked: ${url.hostname}`);
	}
	return url;
}

export function assertConfiguredEndpoint(value: string, label: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch (error) {
		throw new WebError("provider_unavailable", `${label} is not a valid URL: ${value}`, {
			cause: error instanceof Error ? error : undefined,
		});
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new WebError("provider_unavailable", `${label} must use HTTP or HTTPS`);
	}
	return url;
}

export function assertResponseSize(text: string, maxBytes: number): string {
	const size = Buffer.byteLength(text, "utf8");
	if (size > maxBytes) {
		throw new WebError("blocked", `Provider response exceeds the ${maxBytes}-byte limit`);
	}
	return text;
}

export function assertPathWithinDirectory(path: string, directory: string): string {
	const resolvedDirectory = resolve(directory);
	const resolvedPath = resolve(directory, path);
	const relativePath = relative(resolvedDirectory, resolvedPath);
	if (relativePath.startsWith("..") || relativePath.includes("../") || relativePath.includes("..\\")) {
		throw new WebError("blocked", "Screenshot path escapes the configured output directory");
	}
	return resolvedPath;
}
