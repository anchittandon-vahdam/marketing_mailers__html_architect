# VAHDAM Mailer Studio — Project Memory (CLAUDE.md)

## Architecture
- **Single-file SPA**: `vahdam_mailer_architect_v23.html` (~7700+ lines) — all UI, logic, templates
- **Vercel serverless API**: `api/ai/generate.js` (text), `api/ai/image.js` (images), `api/ai/pipeline/` (multi-stage)
- **Shared LLM caller**: `api/_shared/llm.js` — 4-provider waterfall with de-duplication
- **Deployment**: Vercel at https://vahdam-marketing-mailers-architect.vercel.app/

## Provider Waterfall (text)
OpenAI (gpt-4o-mini) → Anthropic (claude-3-5-haiku) → Gemini (gemini-2.0-flash, free) → Grok (grok-3-mini-fast)

## Provider Waterfall (images)
OpenAI (gpt-image-2 → gpt-image-1) → Pollinations (free, FLUX model)

## Key Files
| File | Purpose |
|------|---------|
| `vahdam_mailer_architect_v23.html` | Production SPA — UI + concept engine + email builders |
| `api/ai/generate.js` | Text generation: create_brief, concepts, mailer_full, suggested_prompts |
| `api/ai/image.js` | Image generation with multi-key cascade + Pollinations fallback |
| `api/_shared/llm.js` | Shared 4-provider LLM caller used by pipeline stages |
| `api/ai/pipeline/*.js` | Multi-stage pipeline: strategy → variant → images → html → score |
| `api/health.js` | Top-level health check for uptime monitors |
| `vercel.json` | Deployment config: functions, rewrites, headers |
| `.env.example` | Environment variable documentation (no real values) |

## Brand Constants
- **Palette**: forest green `#0f2a1c`, amber gold `#d4873a`, cream `#fdf6e8`
- **Typography**: Cormorant Garamond (serif headings) + DM Sans (body)
- **BANNED phrases**: wellness journey, transform, liquid gold, game-changer, LIMITED TIME (caps), hurry, don't miss out, last chance, while supplies last
- **PREFERRED**: ritual, restore, balance, origin, single-estate, hand-picked, steep, heritage, crafted

## Layout Archetypes (11)
hero-led-editorial | product-grid-conversion | storytelling-narrative | single-product-spotlight | gift-bundle-showcase | ritual-journey | comparison-discovery | founder-note | editorial-trend-roundup | limited-drop-countdown | subscription-anchor

## Common Bugs to Watch
1. **Unescaped quotes in JS strings** — apostrophes in single-quoted strings, double-quotes in double-quoted strings
2. **`const` reassignment** — use `let` when variable will be reassigned later
3. **Gemini model duplication** — env var can duplicate a hardcoded fallback model; always de-duplicate
4. **CORS headers** — every serverless function needs Access-Control-Allow-Origin
5. **Font stack in JS** — never use quoted font names inside JS template strings

## Current State (v83)
- Build stamp: `audit-additions-v83`
- Gemini free tier is primary LLM (user has no paid credits)
- Pollinations is primary image generator (free fallback)
- Dashboard has type/market filter chips, campaign title headings, deliverables panel
- Concept ideation engine generates 3 grounded concepts before every Build
- 11 layout archetypes with deterministic rotation via `_layoutSeed()`
- Variant A/B forced structural divergence via `_alternateArchetypeForVariantB()`

## Environment Variables (Vercel)
Required: `GEMINI_API_KEY` (free tier)
Optional: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`
Auto-set: `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`
