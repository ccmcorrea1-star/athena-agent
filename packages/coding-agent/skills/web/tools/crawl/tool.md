# web.crawl

Provider: Firecrawl. Use para analisar várias páginas relacionadas dentro de um mesmo site.

Parâmetros:

- `url` (string, obrigatório): URL raiz HTTP ou HTTPS.
- `maxDepth` (inteiro de 0 a 10, opcional): profundidade máxima; padrão 1.
- `maxPages` (inteiro de 1 a 100, opcional): páginas solicitadas; o provider impõe um limite menor quando configurado.
- `includePaths` (array de strings, opcional): caminhos permitidos.
- `excludePaths` (array de strings, opcional): caminhos excluídos.

Schema: objeto com `url` obrigatório e os demais campos opcionais.

Retorna a URL raiz e `pages`, cada uma com os dados extraídos disponíveis. Crawling ilimitado não é permitido.
