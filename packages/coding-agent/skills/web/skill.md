# Web

Índice de seleção progressiva. Carregue a documentação e o schema apenas da tool escolhida.

- `web.search` — SearXNG: encontre URLs, notícias, documentação, artigos, repositórios e fontes relevantes.
- `web.fetch` — Firecrawl: extraia, limpe e transforme uma URL conhecida em Markdown ou dados utilizáveis.
- `web.crawl` — Firecrawl: percorra várias páginas relacionadas do mesmo site.
- `web.navigate` — Playwright: execute um fluxo conhecido e previsível no navegador.
- `web.browser-task` — Browser Use: descubra autonomamente como realizar uma tarefa quando o caminho não é conhecido.
- Camoufox — backend alternativo para `web.navigate` ou `web.browser-task` quando Chromium for incompatível ou bloqueado; não é uma tool separada.

## Seleção

```text
Precisa encontrar fontes ou URLs
→ web.search com SearXNG

Já possui uma URL e precisa ler seu conteúdo
→ web.fetch com Firecrawl

Precisa analisar várias páginas do mesmo site
→ web.crawl com Firecrawl

Conhece os passos e cliques necessários
→ web.navigate com Playwright

Não conhece o caminho e precisa descobrir navegando
→ web.browser-task com Browser Use

Chromium não funciona adequadamente
→ usar Camoufox como backend
```

A Athena deve escolher diretamente a tool adequada, sem executar todas e sem seguir uma sequência fixa.
