# web.navigate

Provider: Playwright. Use quando os passos e cliques necessários são conhecidos. Chromium é o backend padrão; use Camoufox como backend alternativo quando Chromium for incompatível ou bloqueado.

Parâmetros:

- `startUrl` (string, obrigatório): URL inicial HTTP ou HTTPS.
- `actions` (array, obrigatório, no máximo 100): ações determinísticas, cada uma sendo `open {url}`, `click {selector}`, `fill {selector, value}`, `select {selector, value}`, `wait {milliseconds}`, `screenshot {name}`, `extract {selector}` ou `submit {selector}`.
- `browser` (`chromium` ou `camoufox`, opcional): backend.
- `allowedDomains` (array de strings, opcional): domínios permitidos para toda a navegação.

Schema: objeto com `startUrl` e `actions` obrigatórios; `actions` é uma união discriminada pelo campo `type`.

Retorna URL, título, texto, conteúdo extraído, screenshots e backend. Envio de formulário exige confirmação. Cada execução usa um contexto isolado.
