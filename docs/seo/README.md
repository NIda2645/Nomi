# SEO Observatory

`pnpm seo:audit` checks the public marketing pages without reading Nomi projects, media, prompts, or user credentials. An optional `PAGESPEED_API_KEY` is used only for the Google PageSpeed request and is never written to reports. Each run records:

- page title, description, canonical, robots, Open Graph, Twitter card, language, image alt and JSON-LD;
- sitemap coverage and whether its `lastmod` is behind the checked-in page manifest;
- optional mobile PageSpeed data when the GitHub Actions secret `PAGESPEED_API_KEY` is configured.

The scheduled workflow `.github/workflows/seo-radar.yml` runs every Monday and writes one JSON snapshot to `docs/seo/data/` plus a Markdown summary to `docs/seo/reports/`. It opens a report-only pull request containing only those paths; it never pushes directly to `main`. A missing PageSpeed key is reported as `not_configured`, not treated as a failure.

## Optimization loop

The Codex heartbeat reads the newest report and the previous two snapshots. It must:

1. separate observed facts from hypotheses;
2. compare recommendations with current official search/structured-data guidance;
3. choose at most three falsifiable next experiments;
4. open a task branch and PR only for deterministic, low-risk fixes (metadata, canonical links, generated sitemap, dead-link removal);
5. leave claims, major copy, repository settings, and external integrations as reviewable recommendations.

No workflow step uploads Nomi projects, prompts, assets, or user credentials. `llms.txt`, keyword stuffing, hidden text, fake reviews, and unsupported schema are intentionally out of scope.
