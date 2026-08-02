# Web skill

The built-in `web` skill is progressive. `DefaultResourceLoader.getWebSkillRegistry()` exposes:

- `skillSearch(query)`
- `skillOpen("web")`
- `toolOpen("web.search")`
- `toolExecute("web.search", arguments)`

`skillOpen` returns only the short index. `toolOpen` returns only the selected tool's schema, limits, and documentation.

## Providers

Configure the HTTP providers with:

- `ATHENA_SEARXNG_URL`
- `ATHENA_FIRECRAWL_URL`
- `ATHENA_FIRECRAWL_API_KEY`

Install the Playwright package and its browser binaries for `web.navigate`. Set `ATHENA_CAMOUFOX_EXECUTABLE` to use Camoufox as the alternate backend. Set `ATHENA_BROWSER_USE_COMMAND` when Browser Use is not available as `browser-use` on `PATH`.

All provider requests have timeouts and response limits. URLs accept only HTTP(S), block local/private hosts by default, and honor `allowedDomains`. Browser contexts are created and closed per call.

`READ` operations run automatically. Form submission and browser write actions require the registry `confirmWrite` callback; destructive actions are not exposed by the skill.
