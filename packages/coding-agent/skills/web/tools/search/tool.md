# web.search

Provider: SearXNG. Use para descobrir fontes e URLs antes de ler uma página.

Parâmetros:

- `query` (string, obrigatório): consulta.
- `language` (string, opcional): idioma da busca.
- `timeRange` (`day`, `week`, `month`, `year` ou `any`, opcional): recorte temporal.
- `maxResults` (inteiro de 1 a 50, opcional): máximo de resultados; padrão 10.
- `domains` (array de strings, opcional): restringe aos domínios informados.
- `excludeDomains` (array de strings, opcional): exclui os domínios informados.

Schema: objeto com os campos acima; apenas `query` é obrigatório.

Retorna `query` e `results`, com `title`, `url`, `snippet`, `engine` e `publishedAt` quando disponíveis. URLs duplicadas são removidas. O limite máximo é 50 resultados e o timeout é configurável.
