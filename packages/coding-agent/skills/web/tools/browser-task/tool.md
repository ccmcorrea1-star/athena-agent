# web.browser-task

Provider: Browser Use. Use somente quando o caminho não é conhecido e o agente precisa observar a interface, decidir os próximos passos e navegar autonomamente.

Parâmetros:

- `task` (string, obrigatório): objetivo em linguagem natural.
- `startUrl` (string, opcional): URL inicial HTTP ou HTTPS.
- `allowedDomains` (array de strings, opcional): domínios permitidos.
- `maxSteps` (inteiro de 1 a 100, opcional): limite de passos; o runtime também impõe limite próprio.
- `browser` (`chromium` ou `camoufox`, opcional): backend; Chromium é o padrão.
- `allowWriteActions` (booleano, opcional): permite ações de escrita após confirmação.

Schema: objeto com `task` obrigatório e os demais campos opcionais.

Camoufox substitui Chromium quando necessário; não é uma tool separada. Não use para contornar autenticação, CAPTCHA ou controles de acesso. O limite de passos é obrigatório.
