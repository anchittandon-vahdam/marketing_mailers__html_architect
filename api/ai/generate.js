// ════════════════════════════════════════════════════════════════════════════
// /api/ai/generate — Vercel serverless function
// Server-side OpenAI text generation. Browser never sees OPENAI_API_KEY.
//
// MODES:
//   mode: 'concepts'      → returns 3 strategic concepts (replaces Claude path)
//   mode: 'create_brief'  → returns 180-280-word director brief from minimal inputs
//   mode: 'mailer_full'   → returns {strategy, creative_spec, html_plan} for variant A or B
//
// Env vars (set via `vercel env add`):
//   OPENAI_API_KEY      — required
//   OPENAI_TEXT_MODEL   — default 'gpt-4o-mini'
// ════════════════════════════════════════════════════════════════════════════

const OPENAI_BASE = 'https://api.openai.com/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// ────────────────────────────────────────────────────────────────────────────
// MASTER PROMPTS (production-grade, embedded server-side so they cannot be
// tampered with by browser-side edits)
// ────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_CONCEPTS = `You are a D2C growth director for VAHDAM India — premium Indian heritage tea brand. Output STRICT JSON ONLY: {"concepts":[3 concepts]}. Each concept has: id, name (2-5w), hook (≤80ch), emotional_driver, visual_direction, tone, layout_archetype (one of: hero-led-editorial|product-grid-conversion|storytelling-narrative|single-product-spotlight|gift-bundle-showcase|ritual-journey|comparison-discovery|founder-note|editorial-trend-roundup|limited-drop-countdown|subscription-anchor), hero_focus, risk_profile (safe|balanced|bold), hero_concept (2-3 sentences), section_flow (array of 5 mod sections), visual_prompt_extension (120-200ch), subject_lines [3 ≤60ch each], preheader (≤90ch no terminal period), copy {eyebrow, headline:[2 lines], sub_copy ≤200ch, cta ≤3w, section_title, ann_bar}, cta_options [3 ≤3w each], product_handles [3-5 from AVAILABLE_PRODUCTS], scores {brand_fit:1-10, conversion_potential:1-10, novelty:1-10}, performance_notes {recommended_subject_index, swap_if_low_open, personalization_token}, primary_hook (offer|benefit|origin-freshness), secondary_hook, user_emotional_state (curiosity-trust|reward-upgrade|reactivation-incentive), internal_critique {strongest_subject_index, strongest_subject_reason, weakest_section, weakest_reason, open_rate_lever, ctr_lever}, rationale.

MANDATORY: exactly 3 concepts; risk distribution = exactly one safe + one balanced + one bold; all 3 layout_archetype unique; products ONLY from AVAILABLE_PRODUCTS handles.

BANNED phrases: "wellness journey", "transform", "liquid gold", "game-changer", "LIMITED TIME" (caps), "You won't believe", "Hurry", "Don't miss out", "Last chance", "While supplies last".
PREFERRED: ritual, restore, balance, origin, single-estate, hand-picked, steep, heritage, crafted.

VARIANT DIVERGENCE: the runtime renders TWO variants of every concept on different archetypes from same compatible pool. Your section_flow must work in both.

REGENERATE DIVERGENCE: if regenerate_counter > 0, force divergence on hero angle + benefit framing + product order vs prior output.

First char of output MUST be { · last char }. No markdown, no commentary.`;

const SYSTEM_PROMPT_CREATE_BRIEF = `You are Creative Director + Director of Growth at VAHDAM India — a $100M premium D2C Indian heritage tea brand. Your brief feeds two downstream AI systems simultaneously: (1) a multi-stage HTML email builder that reads every field to generate copy, layout, and product sections, and (2) an image model (gpt-image-1) that generates photorealistic product and lifestyle images. A vague brief produces a generic mailer. A specific brief produces a premium mailer. Every field must be precise, actionable, and grounded in the actual products and campaign context provided.

━━ BRAND CONTEXT ━━
VAHDAM India. Premium single-estate teas, wellness blends, gift sets. B-Corp certified. Source-to-cup transparency.
Palette: forest green #0f2a1c / amber gold #d4873a / cream #fdf6e8
BANNED phrases: wellness journey / transform / liquid gold / game-changer / LIMITED TIME (caps) / Hurry / Don't miss out / Last chance / While supplies last
PREFERRED language: ritual / restore / balance / origin / single-estate / hand-picked / steep / heritage / crafted / comfort / meaningful

━━ PRODUCT & OFFER SPECIFICITY RULES ━━
→ ALWAYS name the exact product(s) from the provided list — never invent product names
→ ALWAYS include the price (e.g. "$22.49") and the original/compare price (e.g. "was $34.99") if available
→ ALWAYS state the discount % explicitly (e.g. "36% off", "up to 58% off on selected gifts")
→ If a discount code is in the brief, include it verbatim in OFFER MECHANICS
→ If no discount info is given, do NOT invent one — leave OFFER MECHANICS as "No code needed · prices as listed"

━━ MAILER LAYOUT DIRECTION ━━
The HTML builder uses these section types — your MAILER SECTIONS field must specify which to use in order:
  announcement_bar → hero_split (product left/right) → trust_badges → product_grid_3col → lifestyle_image → offer_banner → footer
  OR for gifting: announcement_bar → hero_full → trust_badges_gifting → gifting_favorites_grid → lifestyle_moment → bottom_cta → footer
Specify the section order in MAILER SECTIONS field.

━━ GIFTING CAMPAIGN RULES (apply when type is Gift, Mother's Day, holiday, celebration) ━━
→ Hero subcopy MUST end with: "She'll enjoy it every day and remember you."
→ Hero CTA tagline: "MAKE HER SMILE, GIFT RIGHT!" (place below CTA button)
→ Product section heading: "Gifting Favorites" with ✦ decorative separator
→ Add "🔥 [N] units sold in the last 24 hours" per product (N between 25–90, vary per product)
→ Offer badge in hero: dark rectangle "UP TO [X%] OFF ON SELECTED GIFTS"

━━ IMAGE PROMPT RULES FOR gpt-image-1 ━━
A great prompt names: SUBJECT + SURFACE MATERIAL + LIGHT SOURCE + DIRECTION + CAMERA ANGLE + COLOR TEMPERATURE + MOOD
Good: "VAHDAM gift set open box with 6 tea tins on cream linen, raking golden morning sidelight from left, tight 45° overhead angle, warm amber tones, shallow DOF, roses out-of-focus background"
Bad: "Beautiful tea gift in warm light" — too vague, generates generic stock image
IMAGE A (product-led): product MUST be clearly visible and prominent · studio-adjacent natural light · morning or afternoon
IMAGE B (lifestyle/editorial): NO product visible · atmospheric · human presence or trace (hands, cup, book) · different time of day from A

━━ MANDATORY OUTPUT — ALL FIELDS REQUIRED ━━
Output EXACTLY these labeled fields in this order. Do NOT skip, merge, or rename any field.

CAMPAIGN: [2-4 word ownable name — NOT "Tea Campaign" / "Heritage Collection" / "Gift Guide"]
OBJECTIVE: [One measurable outcome — e.g. "Convert gifting-intent US subscribers at $49+ AOV with 36% off gift sets via Mother's Day urgency"]
AUDIENCE: [Specific behavioral insight — who is this person, what are they feeling RIGHT NOW, why haven't they bought yet, what will tip them over]
STRATEGY: [Exactly one: Conversion Push | Ritual Reinforcement | Desire Creation | AOV Expansion | Gifting Push] — [1 sentence: why THIS strategy for THIS audience right now]
HOOK: [Primary lever: gift | urgency | origin | ritual | discovery | bestseller | seasonal | price-anchor] — [1 sentence: how this hook removes the specific purchase barrier]
OFFER MECHANICS: [Exact offer — e.g. "UP TO 58% OFF on selected gifts · no code needed · free shipping $49+" OR "No code needed · prices as listed"]
HERO PRODUCT: [Exact product name from list] | $[price] (was $[compare_at]) | [1 sentence: why this product for this campaign]
SUPPORTING PRODUCTS: [Product 2 exact name] | $[price] + [Product 3 exact name] | $[price] — [1 sentence: how these increase AOV or complete the gift system]
THEME: [2-4 words, ownable] — [1 sentence: consumption truth being reframed + emotional state it unlocks]
MAILER SECTIONS: [Ordered list of sections — e.g. "1. Announcement bar (offer line) → 2. Hero split (product right, copy left) → 3. Trust badges (gifting-focused) → 4. Gifting Favorites product grid (3 products) → 5. Lifestyle image → 6. Bottom CTA banner → 7. Footer"]
VISUAL WORLD: [55-70 words — specific photographic scene: surface material + light source + direction + time of day + unusual compositional choice + color temperature + depth of field + what is foregrounded + what is background. No generic mood words.]
IMAGE A: [55-70 words for gpt-image-1 — Variant A hero (product-led). Must name: subject + surface + light source/direction + camera angle + color temperature + mood + DOF. Product clearly visible. No text, no logos, no stock feel.]
IMAGE B: [55-70 words for gpt-image-1 — Variant B hero (lifestyle/editorial). MUST differ from A: different subject, time of day, composition axis, mood. NO product visible. Human warmth or trace preferred. No text, no logos.]
NEGATIVE PROMPT: [no text overlays, no logos, no brand marks, no stock photography feel, no artificial studio lighting, no clutter, no lens distortion — plus 2-3 campaign-specific exclusions]
HEADLINE A: [Direct, benefit-first, max 8 words — e.g. "A Thoughtful Cup for the Woman Who Deserves Everything"]
HEADLINE B: [Sensory or poetic, max 8 words, completely different register from A — e.g. "Moments of comfort. Crafted with care."]
SUBHEADLINE: [Optional italic gold accent word or phrase that pairs with Headline A — e.g. "Everything" or "Crafted with care" in italic gold]
CTA A: [Max 4 words, action verb — Shop Gifts / Explore Teas / Order Now / Shop Now]
CTA B: [Max 4 words, understated — Discover / Begin / Find / Explore]
GIFTING TAGLINE: [For gifting campaigns: "MAKE HER SMILE, GIFT RIGHT!" / For non-gifting: leave blank]
TONE: [3-6 word emotional atmosphere — e.g. "warm, generous, quietly celebratory"]
URGENCY: [For seasonal/sale: specific urgency hook — e.g. "Mother's Day is [date] — ships in 2 days" / For evergreen: "Limited estate batch — this harvest only"]
AVOID: [2-3 specific execution choices that would make THIS mailer feel generic — be precise about what not to do for this exact campaign]`;


const SYSTEM_PROMPT_SUGGESTED_PROMPTS = `You are a Creative Director + Director of Growth at VAHDAM India — a premium D2C Indian heritage tea brand (Aesop / AG1 / Net-a-Porter standard). Generate exactly 6 campaign briefs as a JSON array. Each is a director-grade email campaign prompt that a downstream AI pipeline uses to produce a flawless premium mailer.

VAHDAM BRAND:
- Ultra-premium Indian heritage tea. Single-estate sourcing. Ethical, B-Corp certified.
- Palette: forest green #0f2a1c / amber #d4873a / cream #fdf6e8
- Tone: calm-confident-premium. Ritual not regimen. Story over price.
- BANNED: wellness journey, transform, liquid gold, game-changer, LIMITED TIME (caps), hurry, dont miss out
- PREFERRED: ritual, restore, balance, origin, single-estate, hand-picked, steep, heritage, crafted

For each campaign:
1. Pick a different emotional angle and campaign archetype (Sale, Launch, Gift, Seasonal, Bestseller, Routine, Discovery — no two the same)
2. Write the "text" field as ONE cohesive director brief (150-200 words): audience insight → hook → product feature (specific SKUs) → creative direction → CTA approach
3. The brief must feel like a senior creative director briefing specialists — NOT a marketing brief template
4. Vary markets across the 6 prompts based on the provided focus markets
5. Each brief should diverge in emotional register from every other

Return ONLY a valid JSON array — no markdown, no code fences, no explanation. Format:
[{"icon":"<single emoji>","type":"<Campaign Name> — <Market>","mkt":"<US|UK|IN|AU|ME|EU|Global>","ctype":"<Sale|Launch|Gift|Seasonal|Bestseller|Routine|Discovery>","text":"<director brief 150-200 words>"},...]`;

// FINAL MASTER PROMPT — Full 11-step orchestration system
// Used by mailer_full mode (fallback path when pipeline is unavailable)
const SYSTEM_PROMPT_MAILER_FULL = `You are a Creative Director + Director of Growth at a $100M premium D2C brand.

You DO NOT generate outputs directly.
You operate as a deterministic system that:
→ analyzes → decides → enforces constraints → generates → validates → regenerates if needed

Goal: TWO high-quality, non-repetitive, premium email mailer specs with:
- strong marketing strategy
- completely different structures
- image prompts for gpt-image-1 (ChatGPT Image)
- a layout plan the HTML builder will implement exactly

Output STRICT JSON. First char {, last char }. No markdown.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEPS 0-5: STRATEGY + VARIANT LOCK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 0: INPUT SYNTHESIS
Convert raw input into: audience_truth, business_goal, product_roles, conversion_levers, market_context.
No generic statements.

STEP 1: STRATEGY LOCK
Select ONE: Conversion Push | Ritual Reinforcement | Desire Creation | AOV Expansion | Catalog Expansion.

STEP 2: VIBE DEFINITION
Tone + Pace + Visual Energy + what to avoid.

STEP 3: PRODUCT LOGIC
Hero product + supporting products + AOV logic.

STEP 4: THEME
[Consumption Truth] + [Reframe] + [Emotion] = theme_name + core_idea + visual_world.

STEP 5: HARD VARIANT SPLIT (CRITICAL)
VARIANT A (CONTROL): product-first, structured, benefit-rational, prominent amber CTA.
VARIANT B (EXPERIMENTAL — RADICALLY DIFFERENT):
  - NO product in first 2 sections
  - storytelling-first narrative
  - asymmetric/editorial layout
  - NO product grids
  - emotional progression before product reveal
  - understated CTA (ghost button or text-link)
If B resembles A structurally → REJECT and regenerate B internally before outputting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6: CREATIVE PLAN (PER VARIANT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For EACH variant:
- layout_plan: { hero_type (split-hero|full-bleed|centered), flow, spacing, color_scheme }
- sections[]: each with { id, type (split-hero|full-bleed|centered|two-col-grid|three-col-grid|banner|button-row), purpose, copy: {eyebrow,headline,subcopy,cta}, layout, image_slot (hero|product|lifestyle|none), ux_intent }
- copy_framework: { tone, voice, headline_style, cta_verb }
- subject_lines: [3 options ≤58 chars]
- preheader: ≤85 chars

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7: IMAGE GENERATION PROMPTS (MANDATORY for gpt-image-1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GLOBAL STYLE LOCK: "Luxury editorial photography, cinematic lighting, soft shadows, shallow depth of field, premium textures, no stock feel, no text overlays"

For EACH variant generate EXACTLY 3 image_requirements:
1. HERO: 50-70w — scene + composition + lighting + mood + color palette
2. PRODUCT: 40-50w — macro detail, texture, negative space, editorial feel
3. LIFESTYLE: 40-50w — contextual scene, warmth, brand world

Each: { slot (hero|product|lifestyle), prompt, size (1536x1024 for hero, 1024x1024 for others), negative_prompt }
NEGATIVE PROMPT: "no stock images, no clutter, no distortion, no text, no low resolution"

RULE: Variant B image prompts MUST differ — different scene, different composition, different mood.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 8: VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Check:
- A and B structurally different? (layout, section order, CTA style, copy register)
- B follows hard rules? (no product first, narrative-led, understated CTA)
- Image prompts detailed and specific?
- Theme reflected in copy and visuals?
If ANY fails → regenerate that component internally before outputting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL OUTPUT JSON SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "synthesis": { "audience_truth":"", "business_goal":"", "product_roles":"", "conversion_levers":"", "market_context":"" },
  "strategy": { "name":"", "why":"" },
  "vibe": { "tone":"", "pace":"", "visual_energy":"", "avoid":"" },
  "product_logic": { "hero_product":"", "supporting_products":[], "aov_logic":"" },
  "theme": { "theme_name":"", "core_idea":"", "visual_world":"", "conversion_reason":"" },
  "image_style_lock": "global photography style for ALL images",
  "variant_a": {
    "layout_plan": { "hero_type":"", "flow":"", "spacing":"", "color_scheme":{} },
    "sections": [{ "id":"", "type":"", "purpose":"", "copy":{"eyebrow":"","headline":"","subcopy":"","cta":""}, "layout":"", "image_slot":"", "ux_intent":"" }],
    "image_requirements": [{ "slot":"hero", "prompt":"", "size":"1536x1024", "negative_prompt":"" }, { "slot":"product", "prompt":"", "size":"1024x1024", "negative_prompt":"" }, { "slot":"lifestyle", "prompt":"", "size":"1024x1024", "negative_prompt":"" }],
    "copy_framework": { "tone":"", "voice":"", "headline_style":"", "cta_verb":"" },
    "subject_lines": ["","",""],
    "preheader": ""
  },
  "variant_b": {
    "layout_plan": { "hero_type":"", "flow":"", "spacing":"", "color_scheme":{} },
    "sections": [{ "id":"", "type":"", "purpose":"", "copy":{"eyebrow":"","headline":"","subcopy":"","cta":""}, "layout":"", "image_slot":"", "ux_intent":"" }],
    "image_requirements": [{ "slot":"hero", "prompt":"", "size":"1536x1024", "negative_prompt":"" }, { "slot":"product", "prompt":"", "size":"1024x1024", "negative_prompt":"" }, { "slot":"lifestyle", "prompt":"", "size":"1024x1024", "negative_prompt":"" }],
    "copy_framework": { "tone":"", "voice":"", "headline_style":"", "cta_verb":"" },
    "subject_lines": ["","",""],
    "preheader": ""
  }
}

━━ NON-NEGOTIABLE RULES ━━
- NEVER reuse same structure across variants
- NEVER skip image_requirements
- NEVER produce generic layouts
- NEVER ignore Step 8 validation

VAHDAM BRAND:
Palette: #0f2a1c / #d4873a / #fdf6e8. Cormorant Garamond serif / DM Sans body.
BANNED: wellness journey, transform, liquid gold, game-changer, LIMITED TIME caps, hurry, don't miss out.
PREFERRED: ritual, restore, balance, origin, single-estate, hand-picked, steep, heritage, crafted.

First char { · last char }. No markdown. No commentary.`;

// ────────────────────────────────────────────────────────────────────────────
// HANDLER
// ────────────────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // CORS — allow same-origin + preview deploys
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  // PROVIDER WATERFALL: OpenAI → Anthropic (Claude) → Gemini → Grok
  const openaiKey    = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;
  const grokKey      = process.env.XAI_API_KEY;
  if (!openaiKey && !anthropicKey && !geminiKey && !grokKey) {
    return res.status(500).json({ error: 'server_misconfigured', detail: 'No AI provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or XAI_API_KEY.' });
  }
  const provider  = openaiKey ? 'openai' : anthropicKey ? 'anthropic' : geminiKey ? 'gemini' : 'grok';
  const textModel = openaiKey    ? (process.env.OPENAI_TEXT_MODEL    || 'gpt-4o-mini')
                  : anthropicKey ? (process.env.ANTHROPIC_TEXT_MODEL || 'claude-3-5-haiku-20241022')
                  : geminiKey    ? (process.env.GEMINI_TEXT_MODEL    || 'gemini-2.0-flash')
                  :                (process.env.GROK_TEXT_MODEL      || 'grok-3-mini-fast');

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { return res.status(400).json({ error: 'invalid_json_body' }); }
  }
  body = body || {};

  const mode = body.mode || 'create_brief';
  const market = body.market || 'US';
  const markets = body.markets || [market];
  const theme = body.theme || body.type || '';
  const campaign_brief = body.campaign_brief || body.brief || body.prompt || '';
  const selected_products = Array.isArray(body.selected_products) ? body.selected_products : [];
  const variant = body.variant || 'A';
  const regenerate_counter = Number(body.regenerate_counter || 0);
  const previous_outputs_summary = body.previous_outputs_summary || '';
  const season = body.season || '';

  let systemPrompt = SYSTEM_PROMPT_CREATE_BRIEF;
  let userMessage = '';
  let response_format = undefined;

  if (mode === 'suggested_prompts') {
    systemPrompt = SYSTEM_PROMPT_SUGGESTED_PROMPTS;
    response_format = { type: 'json_object' };
    const mktList = Array.isArray(markets) ? markets.join(', ') : market;
    const mktContext = {
      US: 'urban US professionals 30-55, $55+ AOV, values quality and origin story',
      UK: 'UK tea-culture audience, appreciate provenance and craft, premium gifters',
      IN: 'Indian domestic audience, value tradition and festivity',
      AU: 'Australian wellness seekers, outdoor lifestyle, clean-label conscious',
      ME: 'Middle East audience, love rich masala chai and aromatic blends',
      EU: 'European health-conscious shoppers, organic-certified, B-Corp story resonates',
      Global: 'International premium audience, discovery-minded, seeking authentic Indian heritage'
    };
    const mktDesc = (Array.isArray(markets) ? markets : [market]).map(m => `${m}: ${mktContext[m] || m}`).join('; ');
    userMessage = `MARKETS TO FOCUS ON: ${mktList}\nMARKET AUDIENCE: ${mktDesc}\nCAMPAIGN TYPE FILTER: ${theme || 'Mixed — generate variety across Sale, Launch, Gift, Seasonal, Bestseller, Routine'}\nSEASON CONTEXT: ${season || 'Year-round'}\n\nGenerate 6 diverse, elite director-grade campaign briefs now. Each must be a different emotional angle and conversion strategy. No two briefs should share the same archetype or hero product. Return only the JSON array.`;
  } else if (mode === 'concepts') {
    systemPrompt = SYSTEM_PROMPT_CONCEPTS;
    response_format = { type: 'json_object' };
    const productsBlock = selected_products.slice(0, 30).map(p => `- handle:${p.handle||p.id||''} | name:${p.name||p.n||''} | category:${p.category||''} | price:${p.price||''} | compare_at:${p.compare_at||''}`).join('\n');
    userMessage = `BRIEF: ${campaign_brief.substring(0, 800)}\nMARKET: ${market}\nTYPE: ${theme}\nVARIANT: ${variant}\nREGENERATE_COUNTER: ${regenerate_counter}\n${previous_outputs_summary ? 'PREVIOUS_OUTPUT_HASH: ' + previous_outputs_summary + '\n' : ''}\nAVAILABLE_PRODUCTS:\n${productsBlock || '(none provided — use category defaults)'}\n\nGenerate the JSON now.`;
  } else if (mode === 'mailer_full') {
    systemPrompt = SYSTEM_PROMPT_MAILER_FULL;
    response_format = { type: 'json_object' };
    const productsBlock = selected_products.slice(0, 5).map(p => `- name:"${p.name||p.n||''}" | url:"${p.url||p.pdp_url||''}" | price:"${p.price||''}" | compare_price:"${p.compare_at||p.compare_price||''}" | image:"${p.image_url||p.i||''}"`).join('\n');
    userMessage = `INPUTS:\nmarket: ${market}\ntheme: ${theme}\ncampaign_brief: ${campaign_brief.substring(0, 1000)}\nvariant: ${variant}\nregenerate_counter: ${regenerate_counter}\n${previous_outputs_summary ? 'previous_outputs_summary: ' + previous_outputs_summary + '\n' : ''}selected_products:\n${productsBlock || '(none)'}\n\nReturn the strict JSON now.`;
  } else {
    // create_brief mode (default)
    // Market context — informs audience psychology and visual direction
    const mktContext = {
      US:     'Urban US professionals 30-55. Value origin story + morning ritual. $55+ AOV. Expect premium provenance, not discounts.',
      UK:     'UK tea-culture audience. Provenance and craft matter. Premium gifting occasion. Appreciate estate names and harvest seasons.',
      IN:     'Indian domestic audience. Value tradition, festivity, masala chai culture. Gifting + family occasions drive purchase.',
      AU:     'Australian wellness seekers. Outdoor lifestyle, clean-label conscious. Ethical sourcing story resonates strongly.',
      ME:     'Middle East audience. Love rich masala chai and aromatic blends. Gifting occasions, premium packaging, bold flavors.',
      EU:     'European health-conscious shoppers. B-Corp + organic certification resonates. Provenance and sustainability over price.',
      Global: 'International premium audience. Discovery-minded. Seeking authentic Indian heritage and origin stories.'
    };
    const audienceCtx = mktContext[market] || `${market} market audience`;

    // Product block — name + price + category so the LLM can build a genuine product system
    const productsBlock = selected_products.length
      ? selected_products.slice(0, 6).map(p => {
          const parts = [p.name || p.n || ''];
          if (p.price) parts.push('$' + p.price);
          if (p.category) parts.push(p.category);
          if (p.compare_at && p.compare_at !== p.price) parts.push('(was $' + p.compare_at + ')');
          return '- ' + parts.join(' | ');
        }).join('\n')
      : null;

    userMessage = [
      `CAMPAIGN TYPE: ${theme || 'General Campaign'}`,
      `MARKET: ${market} — ${audienceCtx}`,
      `SEED IDEA FROM USER: ${campaign_brief || '(none provided — derive a strong, specific campaign concept from the campaign type and market above)'}`,
      productsBlock ? `PRODUCTS AVAILABLE (use exact names and prices):\n${productsBlock}` : `PRODUCTS: (none selected — infer 2-3 best-fit VAHDAM gift sets or teas for this market + campaign type, with realistic price estimates around $12-$35)`,
      ``,
      `INSTRUCTIONS: Output ALL labeled fields in the exact order shown. Be specific — name exact products with prices, state the exact discount %, write 55-70 word image prompts with named surfaces/light/angles. Generic output is rejected. Every field is required.`
    ].join('\n');
  }

  // ── Provider-specific call ──
  const temperature = 0.7 + Math.min(0.3, regenerate_counter * 0.1);
  // create_brief: 1800 tokens handles the full labeled output (all fields ≈ 700-900 tokens) with headroom
  const max_tokens = mode === 'mailer_full' ? 7000 : (mode === 'concepts' ? 4500 : (mode === 'suggested_prompts' ? 3000 : 1800));

  function isRetryable(s) { return s === 429 || s === 503 || s === 404 || s === 400 || s === 529; }

  // ── Provider helpers ───────────────────────────────────────────────────────
  async function callOpenAI(model, key) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(OPENAI_BASE + '/chat/completions', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
          max_tokens, temperature,
          ...(response_format ? { response_format } : {})
        }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        const isQuota = r.status === 429 && (err.includes('insufficient_quota') || err.includes('quota') || err.includes('billing'));
        return { ok: false, status: r.status, error: 'openai_error', detail: err.substring(0, 400), provider: 'openai', model, quotaExhausted: isQuota };
      }
      const data = await r.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      return { ok: true, text, provider: 'openai', model };
    } catch (e) { clearTimeout(t); return { ok: false, status: 0, error: 'openai_fetch_error', detail: String(e.message||e).substring(0,200), provider: 'openai', model }; }
  }

  async function callAnthropic(model) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const claudeSys = response_format
      ? systemPrompt + '\n\nCRITICAL: Return ONLY valid JSON. First char { last char }. No markdown, no commentary.'
      : systemPrompt;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens, temperature, system: claudeSys, messages: [{ role: 'user', content: userMessage }] }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!r.ok) { const err = await r.text().catch(()=>''); return { ok: false, status: r.status, error: 'anthropic_error', detail: err.substring(0,400), provider: 'anthropic', model }; }
      const data = await r.json();
      const text = (data.content && data.content[0] && data.content[0].text) || '';
      return { ok: true, text, provider: 'anthropic', model };
    } catch (e) { clearTimeout(t); return { ok: false, status: 0, error: 'anthropic_fetch_error', detail: String(e.message||e).substring(0,200), provider: 'anthropic', model }; }
  }

  async function callGemini(model) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(
        GEMINI_BASE + '/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(geminiKey),
        {
          method: 'POST', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n---\nUSER REQUEST:\n' + userMessage }] }],
            generationConfig: {
              temperature, maxOutputTokens: max_tokens,
              ...(response_format ? { responseMimeType: 'application/json' } : {}),
              ...(response_format && model.includes('2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {})
            }
          }),
          signal: ctrl.signal
        }
      );
      clearTimeout(t);
      if (!r.ok) {
        const err = await r.text().catch(()=>'');
        const retryMatch = err.match(/retry in ([\d.]+)s/i);
        return { ok: false, status: r.status, error: 'gemini_error', detail: err.substring(0,400), provider: 'gemini', model, retry_after: retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 30 };
      }
      const data = await r.json();
      const text = (data.candidates&&data.candidates[0]&&data.candidates[0].content&&data.candidates[0].content.parts&&data.candidates[0].content.parts[0]&&data.candidates[0].content.parts[0].text)||'';
      return { ok: true, text, provider: 'gemini', model };
    } catch (e) { clearTimeout(t); return { ok: false, status: 0, error: 'gemini_fetch_error', detail: String(e.message||e).substring(0,200), provider: 'gemini', model }; }
  }

  async function callGrok(model) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + grokKey },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
          max_tokens, temperature,
          ...(response_format ? { response_format } : {})
        }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!r.ok) { const err = await r.text().catch(()=>''); return { ok: false, status: r.status, error: 'grok_error', detail: err.substring(0,400), provider: 'grok', model }; }
      const data = await r.json();
      const text = (data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content)||'';
      return { ok: true, text, provider: 'grok', model };
    } catch (e) { clearTimeout(t); return { ok: false, status: 0, error: 'grok_fetch_error', detail: String(e.message||e).substring(0,200), provider: 'grok', model }; }
  }

  // ── 4-provider cascade: OpenAI → Claude → Gemini → Grok ──────────────────
  let result = null;

  try {
    // 1. OpenAI (multi-key rotation on quota exhaustion)
    if (openaiKey) {
      const openaiKeys = [openaiKey, process.env.OPENAI_API_KEY_2, process.env.OPENAI_API_KEY_3].filter(Boolean);
      const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';
      for (const key of openaiKeys) {
        result = await callOpenAI(model, key);
        if (result.ok) break;
        if (result.quotaExhausted) { console.warn('[generate] OpenAI key quota exhausted — rotating'); continue; }
        console.warn('[generate] OpenAI ' + result.status + ' — falling through to Claude');
        break;
      }
    }

    // 2. Anthropic (Claude) — if OpenAI unavailable or failed
    if (anthropicKey && (!result || !result.ok)) {
      console.warn('[generate] Trying Anthropic (Claude)');
      for (const model of [process.env.ANTHROPIC_TEXT_MODEL || 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022']) {
        result = await callAnthropic(model);
        if (result.ok) break;
        if (isRetryable(result.status)) { console.warn('[generate] Anthropic ' + result.status + ' on ' + model + ' — next model'); continue; }
        break;
      }
    }

    // 3. Gemini — if Claude unavailable or failed
    if (geminiKey && (!result || !result.ok)) {
      console.warn('[generate] Trying Gemini');
      for (const model of [process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash-lite']) {
        console.log('[generate] Trying Gemini model:', model);
        result = await callGemini(model);
        if (result.ok) break;
        if (isRetryable(result.status)) { console.warn('[generate] Gemini ' + result.status + ' on ' + model + ' — next model'); continue; }
        break;
      }
    }

    // 4. Grok (xAI) — final fallback
    if (grokKey && (!result || !result.ok)) {
      console.warn('[generate] Trying Grok (xAI)');
      for (const model of [process.env.GROK_TEXT_MODEL || 'grok-3-mini-fast', 'grok-3-mini']) {
        result = await callGrok(model);
        if (result.ok) break;
        if (isRetryable(result.status)) { console.warn('[generate] Grok ' + result.status + ' on ' + model + ' — next model'); continue; }
        break;
      }
    }

    if (!result || !result.ok) {
      const is429 = result && result.status === 429;
      // Never forward Gemini/OpenAI's 404 (model not found) as our response status —
      // that confuses clients into thinking the endpoint doesn't exist. Use 503 instead.
      const clientStatus = !result ? 500
        : result.status === 404 ? 503
        : (result.status || 500);
      return res.status(clientStatus).json({
        error: result ? result.error : 'no_provider',
        detail: result ? result.detail : 'All providers failed',
        provider: result ? result.provider : provider,
        model: result ? result.model : textModel,
        // Include retry_after so the frontend can show a countdown and auto-retry
        ...(is429 ? { retry_after: result.retry_after || 30, rate_limited: true } : {})
      });
    }

    const text = result.text || '';
    if (mode === 'concepts' || mode === 'mailer_full' || mode === 'suggested_prompts') {
      let parsed;
      // Robust JSON extraction: handles markdown fences, prose prefix/suffix (Gemini habit)
      const tryParse = (t) => {
        try { return JSON.parse(t); } catch (_) {}
        const s = t.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/m, '').trim();
        try { return JSON.parse(s); } catch (_) {}
        const bs = t.indexOf('{'), be = t.lastIndexOf('}');
        if (bs !== -1 && be > bs) { try { return JSON.parse(t.slice(bs, be + 1)); } catch (_) {} }
        // Also try array extraction for suggested_prompts
        const as = t.indexOf('['), ae = t.lastIndexOf(']');
        if (as !== -1 && ae > as) { try { return JSON.parse(t.slice(as, ae + 1)); } catch (_) {} }
        return null;
      };
      parsed = tryParse(text);
      if (!parsed) {
        return res.status(502).json({ error: 'json_parse_failed', provider: result.provider, raw: text.substring(0, 600) });
      }
      return res.status(200).json({ ok: true, mode, provider: result.provider, model: result.model, data: parsed });
    }
    return res.status(200).json({ ok: true, mode, provider: result.provider, model: result.model, text });

  } catch (e) {
    return res.status(500).json({ error: 'server_error', provider, detail: String(e && e.message || e).substring(0, 300) });
  }
};
