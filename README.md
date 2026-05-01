# VAHDAM Mailer Studio

Single-file HTML SPA that generates production-ready Klaviyo / Mailchimp HTML mailers across 7 markets × 2 layout variants from a free-text brief, backed by a Supabase knowledge base of the real Vahdam product catalog and the official brand kit.

- **Live**: https://vahdam-marketing-mailers-architect.vercel.app/vahdam_mailer_architect_v23
- **Repo**: https://github.com/anchittandon-vahdam/marketing_mailers__html_architect
- **Build stamp**: see `window.__VAHDAM_BUILD__` in DevTools console

## Architecture

```
Browser (single HTML file ~6.5k lines)
   │
   ├── Supabase (project ozlmmiyyjmmfdvvrtgdp)
   │     ├── mailers_generated     — every generated mailer + strategic depth
   │     ├── app_users             — signups for THIS app
   │     ├── vahdam_brand_kit      — singleton, official PDF truth source
   │     ├── vahdam_market_config  — 7 markets × URL/currency/shipping
   │     ├── vahdam_products       — 313 real Shopify rows scraped from live stores
   │     ├── vahdam_collections    — 356 collections from live stores
   │     └── Storage: mailer-assets bucket (public, 10 MB cap)
   │
   ├── Pollinations FLUX           — free, no key, hero illustrations
   ├── Anthropic Claude            — vision-fidelity HTML reproduction (user-supplied key)
   └── OpenAI gpt-image-1          — optional image gen (user-supplied key)
```

## Generation pipeline

1. **Brief** — free-text prompt + market multi-select.
2. **Products** — auto-pick from `vahdam_products` (KB) or manual select.
3. **Strategy** — `buildCampaignStrategy()` derives headline / sub-copy / CTA / offer / variant choice + `buildStrategicDepth()` adds target segment + intent + KPIs + justification + send window.
4. **Image prompts** — per-market × per-variant FLUX prompts → Pollinations URLs.
5. **Mailers** — for each (market × variant) build HTML via either Claude vision (uploaded design path) or rule-based templates (default).
6. **Persist** — INSERT row into `mailers_generated`, async-upload images to Storage, UPDATE row with hosted URLs. User-record upserted to `app_users`.

## Local dev

```powershell
# Run the catalog scraper against live Vahdam Shopify storefronts
$env:SUPABASE_PAT = 'sbp_...'              # required for DB writes
.\scripts\scrape_catalog.ps1               # ~313 products, US/UK/IN/Global
.\scripts\scrape_collections.ps1           # ~356 collections

# Deploy
.\update.ps1 "describe what changed"       # commits + pushes; Vercel auto-deploys
```

## Supabase migrations

Apply in chronological order (filenames are date-stamped). The HTML works against the schema at every step thanks to the boot-time table resolver and defensive insert retry.

```
supabase/migrations/20260501130000_slim_schema.sql            — drop legacy analytics views/tables
supabase/migrations/20260501150000_image_hosting.sql          — image URL columns + Storage bucket
supabase/migrations/20260501160000_campaigns_update_policy.sql— anon UPDATE on campaigns
supabase/migrations/20260501170000_knowledge_base.sql         — brand_kit/market_config/products/collections
supabase/migrations/20260501180000_db_hygiene.sql             — user_id FK + storage cleanup trigger
supabase/migrations/20260501190000_rename_tables.sql          — rename to mailers_generated + app_users
supabase/migrations/20260501200000_strategic_depth_columns.sql— materialise depth fields as columns
```

Apply in dashboard SQL editor or via `curl`:

```powershell
$body = @{ query = (Get-Content path/to.sql -Raw) } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/ozlmmiyyjmmfdvvrtgdp/database/query" `
  -Headers @{ Authorization = "Bearer $env:SUPABASE_PAT"; "Content-Type" = "application/json" } `
  -Body $body
```

## Knowledge base refresh

The product catalog and collections will go stale as Vahdam adds / removes SKUs. Re-run:

```powershell
$env:SUPABASE_PAT = 'sbp_...'
.\scripts\scrape_catalog.ps1
.\scripts\scrape_collections.ps1
```

The HTML reads `KB.products[*].refreshed_at` and surfaces a freshness pill bottom-right on first load.

## File map

```
vahdam_mailer_architect_v23.html   — the entire SPA (~6.5k lines, single-file delivery)
index.html                          — 612-byte redirect to the SPA
vercel.json                         — clean URLs + cache headers
update.ps1                          — git → GitHub → Vercel pipeline
supabase/                           — migrations, seeds, COMBINED_RUN_THIS.sql
scripts/                            — catalog + collections scrapers
OPTIMISATION_NOTES.md               — build history + remaining backlog
```

## Status pills

Every async failure (Supabase save / fetch, Storage upload, Claude API, OpenAI API) surfaces a coloured pill in the top-right corner. Levels: green (ok) / amber (warn — fallback engaged) / red (err — action lost). Click to dismiss; ok/info auto-fade in 6 s, warn/err in 15 s.

## Auth model (current)

Lightweight name + email signup, mirrored to `app_users` and `localStorage`. No password. The Supabase anon key is exposed client-side; RLS allows anon read/insert/update on the user-facing tables and read-only on the KB tables. Service-role mutations are gated to the Management API.

This is appropriate for an in-house team. Public-scale deployment would need real Supabase Auth + per-user RLS — see `OPTIMISATION_NOTES.md` next-sprint backlog.
