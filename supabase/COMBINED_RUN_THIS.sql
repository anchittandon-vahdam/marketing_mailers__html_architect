-- ===========================================
-- VAHDAM Mailer Studio — Combined SQL
-- Paste this entire file into Supabase Dashboard -> SQL Editor -> Run
-- Project: ozlmmiyyjmmfdvvrtgdp.supabase.co
-- ===========================================

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- VAHDAMÂ® Mailer Studio â€” initial schema
-- Run with: supabase db push   (after `supabase link --project-ref <ref>`)
-- Or paste into Supabase Dashboard â†’ SQL Editor â†’ run
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- â”€â”€ Table 1: Campaigns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Every generated mailer is recorded here. JSONB columns allow rich analytics
-- queries (e.g. SELECT campaign_type, COUNT(*) FROM vahdam_campaigns GROUP BY 1).
CREATE TABLE IF NOT EXISTS public.vahdam_campaigns (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- WHO
  user_name TEXT,
  user_email TEXT,

  -- THE TASK (Step 1 input)
  prompt_short TEXT,                 -- truncated 200-char preview
  prompt_full TEXT,                  -- complete user prompt
  active_prompt TEXT,                -- prompt + regen feedback (used by Steps 3-5)
  campaign_type TEXT,                -- Sale | Launch | Gift | Bestseller | â€¦
  primary_market TEXT,               -- the market shown by default
  markets JSONB,                     -- ["US","UK","IN"]

  -- THE GOALS (Step 2 product selection)
  hero_product_name TEXT,
  hero_product_image TEXT,
  hero_category TEXT,                -- result of categoryFromHero()
  product_names JSONB,               -- ["India's Original Masala Chai", â€¦]
  product_full JSONB,                -- complete S.finalProds array

  -- THE OFFER & OCCASION
  offer_text TEXT,
  offer_code TEXT,
  offer_pct TEXT,
  occasion JSONB,                    -- {line1, line2}

  -- COMPUTED COPY (resolved once, used everywhere â€” full provenance)
  headline JSONB,                    -- [line1, line2]
  sub_copy TEXT,
  cta TEXT,
  ann_bar TEXT,

  -- COMPUTED COPY (extended)
  feature_strip JSONB,               -- ["ðŸŒ¿ Farm Direct", "ðŸ¤ Ethically Sourced", â€¦]
  ingredients JSONB,                 -- [{n:'Hibiscus', d:'Tart, ruby-red bloom'}, â€¦]
  section_title TEXT,
  product_section_title TEXT,

  -- LAYOUT VARIANTS (Step 5 output â€” both A & B)
  layout_variant TEXT,               -- 'A' or 'B' (suggested primary)
  canvas_market TEXT,                -- region active in the Step 4 canvas filter
  canvas_variant TEXT,               -- variant active in the Step 4 canvas filter
  variant_a_html TEXT,               -- Variant A "Editorial Hero" HTML for primary market
  variant_b_html TEXT,               -- Variant B "Narrative Story" HTML for primary market
  market_mailers JSONB,              -- {US:{A:html,B:html}, UK:{A:html,B:html}, â€¦}
  variant_a_image_prompt TEXT,       -- Variant A image-gen prompt (primary market)
  variant_b_image_prompt TEXT,       -- Variant B image-gen prompt (primary market)
  image_prompts_full JSONB,          -- {US:{A:'...',B:'...'}, UK:{â€¦}, â€¦} â€” every region Ã— variant
  generated_images JSONB,            -- {US:{A:url,B:url}, UK:{â€¦}, â€¦} â€” Pollinations URLs
  image_seeds JSONB,                 -- {US_A:12345, US_B:67890, â€¦} â€” for reproducibility
  canvas_data_url TEXT,              -- PNG data URL of the local canvas (if not cross-origin tainted)

  -- REGEN HISTORY
  regen_count INT DEFAULT 0,
  last_feedback TEXT,
  feedback_history JSONB,            -- ["regen feedback 1", "regen feedback 2"]

  -- AUDIT TRAIL (full reasoning + strategy snapshot â€” for analytics/debugging)
  reasoning JSONB,                   -- {typeSource, categorySource, productSource, layoutVariant}
  strategy_full JSONB,               -- full S.strategy snapshot

  -- TECHNICAL META
  build_version TEXT,                -- e.g. 'canvas-variants-hero-single-v17'
  user_agent TEXT,
  origin TEXT
);

-- Auto-update `updated_at` on row update
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vahdam_campaigns_updated ON public.vahdam_campaigns;
CREATE TRIGGER vahdam_campaigns_updated
  BEFORE UPDATE ON public.vahdam_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes (used by dashboard sort + per-user filter)
CREATE INDEX IF NOT EXISTS vc_created_idx        ON public.vahdam_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS vc_user_email_idx     ON public.vahdam_campaigns(user_email);
CREATE INDEX IF NOT EXISTS vc_campaign_type_idx  ON public.vahdam_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS vc_primary_market_idx ON public.vahdam_campaigns(primary_market);
CREATE INDEX IF NOT EXISTS vc_hero_category_idx  ON public.vahdam_campaigns(hero_category);

-- â”€â”€ Table 2: Users (sign-up tracking) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.vahdam_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  campaign_count INT DEFAULT 0,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS vu_last_seen_idx ON public.vahdam_users(last_seen_at DESC);

-- â”€â”€ Table 3: Regional product catalog snapshots (optional analytics) â”€â”€â”€â”€â”€â”€â”€â”€
-- Lets you track which products were shown for which campaign type per market.
CREATE TABLE IF NOT EXISTS public.vahdam_catalog_snapshots (
  id BIGSERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ DEFAULT now(),
  market TEXT NOT NULL,
  product_name TEXT,
  product_image TEXT,
  product_tags JSONB,
  pdp_url TEXT,
  source_campaign_id BIGINT REFERENCES public.vahdam_campaigns(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS vcs_market_idx ON public.vahdam_catalog_snapshots(market);
CREATE INDEX IF NOT EXISTS vcs_product_idx ON public.vahdam_catalog_snapshots(product_name);

-- â”€â”€ Row Level Security â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Anonymous (publishable/anon key) can read + insert campaigns/users.
-- This is safe for an internal marketing tool. For public-facing usage,
-- swap policies to require authenticated() and add user_id = auth.uid() filters.
ALTER TABLE public.vahdam_campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vahdam_users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vahdam_catalog_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read campaigns"  ON public.vahdam_campaigns;
DROP POLICY IF EXISTS "anon insert campaigns" ON public.vahdam_campaigns;
CREATE POLICY "anon read campaigns"   ON public.vahdam_campaigns FOR SELECT USING (true);
CREATE POLICY "anon insert campaigns" ON public.vahdam_campaigns FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon read users"   ON public.vahdam_users;
DROP POLICY IF EXISTS "anon insert users" ON public.vahdam_users;
DROP POLICY IF EXISTS "anon update users" ON public.vahdam_users;
CREATE POLICY "anon read users"   ON public.vahdam_users FOR SELECT USING (true);
CREATE POLICY "anon insert users" ON public.vahdam_users FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update users" ON public.vahdam_users FOR UPDATE USING (true);

DROP POLICY IF EXISTS "anon read catalog"   ON public.vahdam_catalog_snapshots;
DROP POLICY IF EXISTS "anon insert catalog" ON public.vahdam_catalog_snapshots;
CREATE POLICY "anon read catalog"   ON public.vahdam_catalog_snapshots FOR SELECT USING (true);
CREATE POLICY "anon insert catalog" ON public.vahdam_catalog_snapshots FOR INSERT WITH CHECK (true);

-- â”€â”€ Helpful analytics views â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE VIEW public.vahdam_campaigns_by_type AS
SELECT campaign_type, COUNT(*) AS total, MAX(created_at) AS last_at
FROM public.vahdam_campaigns
GROUP BY campaign_type
ORDER BY total DESC;

CREATE OR REPLACE VIEW public.vahdam_campaigns_by_user AS
SELECT user_email, user_name, COUNT(*) AS total, MAX(created_at) AS last_at
FROM public.vahdam_campaigns
WHERE user_email IS NOT NULL AND user_email <> ''
GROUP BY user_email, user_name
ORDER BY total DESC;

CREATE OR REPLACE VIEW public.vahdam_campaigns_by_market AS
SELECT primary_market AS market, COUNT(*) AS total, MAX(created_at) AS last_at
FROM public.vahdam_campaigns
GROUP BY primary_market
ORDER BY total DESC;

-- Grant SELECT on views to anon
GRANT SELECT ON public.vahdam_campaigns_by_type   TO anon;
GRANT SELECT ON public.vahdam_campaigns_by_user   TO anon;
GRANT SELECT ON public.vahdam_campaigns_by_market TO anon;


-- =========================================== --
-- v2 Migration -- Adds extended audit columns
-- =========================================== --

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- VAHDAM Mailer Studio â€” schema upgrade
-- Adds the new fields the v17+ HTML saves: image matrix, regen history,
-- canvas filter state, extended copy fields. Idempotent â€” safe to re-run.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ALTER TABLE public.vahdam_campaigns
  -- Computed copy (extended)
  ADD COLUMN IF NOT EXISTS feature_strip          JSONB,
  ADD COLUMN IF NOT EXISTS ingredients            JSONB,
  ADD COLUMN IF NOT EXISTS section_title          TEXT,
  ADD COLUMN IF NOT EXISTS product_section_title  TEXT,

  -- Canvas filter state (Step 4)
  ADD COLUMN IF NOT EXISTS canvas_market          TEXT,
  ADD COLUMN IF NOT EXISTS canvas_variant         TEXT,

  -- Image generation matrix (every region Ã— variant)
  ADD COLUMN IF NOT EXISTS image_prompts_full     JSONB,
  ADD COLUMN IF NOT EXISTS generated_images       JSONB,
  ADD COLUMN IF NOT EXISTS image_seeds            JSONB,
  ADD COLUMN IF NOT EXISTS canvas_data_url        TEXT,

  -- Regen history (extended)
  ADD COLUMN IF NOT EXISTS regen_count            INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_feedback          TEXT;

-- Indexes for analytics on the new fields
CREATE INDEX IF NOT EXISTS vc_canvas_variant_idx ON public.vahdam_campaigns(canvas_variant);
CREATE INDEX IF NOT EXISTS vc_regen_count_idx    ON public.vahdam_campaigns(regen_count);

-- A new view: campaigns by regen activity (which prompts needed the most iteration)
CREATE OR REPLACE VIEW public.vahdam_campaigns_by_regen AS
SELECT
  campaign_type,
  regen_count,
  COUNT(*) AS total,
  AVG(regen_count) OVER (PARTITION BY campaign_type) AS avg_regens_for_type,
  MAX(created_at) AS last_at
FROM public.vahdam_campaigns
WHERE regen_count > 0
GROUP BY campaign_type, regen_count
ORDER BY regen_count DESC;

GRANT SELECT ON public.vahdam_campaigns_by_regen TO anon;

