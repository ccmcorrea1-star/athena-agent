# web.fetch

Provider: Firecrawl. Use quando a URL já é conhecida e o conteúdo precisa ser extraído, limpo ou transformado.

Parâmetros:

- `url` (string, obrigatório): URL HTTP ou HTTPS.
- `formats` (array opcional): qualquer combinação de `markdown`, `html` e `links`; padrão `markdown`.

Schema: objeto com `url` obrigatório e `formats` opcional.

Retorna `url`, `title`, `markdown`, `html`, `links` e `metadata` quando disponíveis. A URL passa por proteção contra SSRF e o tamanho da resposta é limitado.
