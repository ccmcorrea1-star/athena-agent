import { readFileSync } from "node:fs";

export interface AthenaManifest {
	extensions?: string[];
	skills?: string[];
	prompts?: string[];
	themes?: string[];
}

const RESOURCE_FIELDS = ["extensions", "skills", "prompts", "themes"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readAthenaManifest(packageJsonPath: string): AthenaManifest | null {
	try {
		const pkg: unknown = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
		if (!isObject(pkg)) {
			return null;
		}

		// Support both "athena" and legacy "pi" field names (pi takes precedence for backward compat)
		const manifestObj = isObject(pkg.athena) ? pkg.athena : isObject(pkg.pi) ? pkg.pi : null;
		if (!manifestObj) {
			return null;
		}

		const manifest: AthenaManifest = {};
		for (const field of RESOURCE_FIELDS) {
			const entries = manifestObj[field];
			if (Array.isArray(entries) && entries.every((entry: unknown) => typeof entry === "string")) {
				manifest[field] = entries;
			}
		}
		return manifest;
	} catch {
		return null;
	}
}
