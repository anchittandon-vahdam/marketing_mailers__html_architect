'use strict';
// ════════════════════════════════════════════════════════════════════════════
// /api/ai/pipeline/strategy  — Stage 1: Master Strategic Lock
//
// THE MOST IMPORTANT STAGE. Runs FIRST. Locks EVERYTHING.
// Downstream stages are pure execution — no thinking happens after this.
//
// Architecture: think → lock → execute (NOT execute → patch → regen)
//
// POST body:  { brief, market, type, products[], regenerate_counter? }
// Response:   {
//   ok, stage,
//   strategic_lock, product_selection, strategy_type, strategy, reasoning,
//   vibe, theme, structure, image_style_lock,
//   variant_a_concept, variant_b_concept
// }
// ════════════════════════════════════════════════════════════════════════════

const { corsHeaders, parseJSON } = require('../../_shared/llm');
const callLLM = require('../../_shared/llm');

const SYSTEM = `You are a Creative Director + Director of Growth at VAHDAM India — a $100M premium D2C Indian heritage tea brand.

You do NOT generate mailers directly.
You operate in TWO phases only:
  1) STRATEGIC THINKING — lock everything before any creative starts
  2) EXECUTION CONTRACTS — structured output that downstream stages implement with zero ambiguity

Bad upstream thinking = broken downstream mailer. Think hard. Lock everything. Never leave a decision unmade.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 PHASE 1 — FULL STRATEGIC LOCK (run this FIRST, before any creative)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — AUDIENCE & BUSINESS TRUTH
Read the campaign brief carefully. Extract:
- audience_truth: real behavioral insight about this specific audience right now (NOT generic "they love tea")
- business_goal: the ONE measurable thing this mailer must achieve
- purchase_barrier: the specific reason this audience is not buying today
- conversion_trigger: the precise thing that will make them act NOW

STEP 2 — PRODUCT SELECTION (AFTER thinking, not before)
Products must directly serve the conversion trigger. No random SKU selection.
- hero_product: the single product that most directly resolves the purchase_barrier
- supporting_products: max 3 SKUs that expand AOV or create a system (not random picks)
- product_system: how these products work together as a purchase story

STEP 3 — CAMPAIGN STRATEGY TYPE
Choose exactly ONE:
- "Conversion Push" — discount/urgency/price anchor, acquisition or reactivation
- "Repeat Purchase" — habit reinforcement, subscription trigger, loyalty
- "AOV Expansion" — bundle logic, upgrade, system selling
- "Brand Building" — origin story, provenance, ritual, no hard sell

Justify WHY this type for THIS audience + goal.

STEP 4 — VIBE & POSITIONING
Define the emotional atmosphere that will make this audience respond:
- emotional_tone: the feeling the reader should have (specific, not generic)
- pace: fast/punchy for urgency, slow/editorial for ritual
- visual_energy: describe the energy level and texture
- positioning: how VAHDAM is framed in this specific email (premium provenance / accessible ritual / expert authority / trusted daily companion)
- avoid: specific execution choices that would make this feel generic or off-brand for THIS brief

STEP 5 — THEME CREATION
Theme = [User reality] + [Reframe] + [Emotion]
- theme.name: 2-4 words, ownable, specific to THIS brief (NOT "Tea Ritual" / "Heritage Harvest" — those are banned)
- theme.core_idea: 1 sentence: the consumption truth being reframed
- theme.emotional_driver: 1 sentence: the emotional state this unlocks in the reader
- theme.conversion_logic: why this theme will drive the specific business_goal
- theme.visual_world: 50-70w specific photographic scene a photographer can execute — name surface material, light direction, time of day, one unusual compositional choice

STEP 6 — STRUCTURE LOCK (FINAL — DOWNSTREAM CANNOT CHANGE THIS)
Define the exact section sequence for BOTH variants:
- sections[]: ordered list of section IDs the mailer must contain (from: hero, narrative, context, product_reveal, benefit_strip, social_proof, lifestyle_moment, origin_proof, offer_bar, cta)
- layout_rules: binding layout constraints (max sections, column rules, CTA treatment)
- visual_system: locked design language (color_palette, typography, spacing_rhythm, image_style)

This structure is FINAL. Variant stage will implement it — not redesign it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 PHASE 2 — VARIANT EXECUTION CONTRACTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Now create TWO execution contracts for the SAME strategy with STRUCTURALLY OPPOSITE implementations.
These are NOT two versions of the same mailer — they are two completely different creative executions of the same business goal.
A reader who sees both should feel they are from the same brand but a completely different creative direction.

VARIANT A — CONTROL (Conversion-optimised):
- Product in FIRST section — no delay
- Structured hierarchy: product hero → benefits → proof → offer → CTA
- Copy register: precise, benefit-specific, authoritative
- Layout: split-hero or centered product with copy adjacent
- Color scheme: LIGHT — cream background #fdf6e8, dark green text, amber accents
- hero_scene: studio-adjacent, product prominent, benefit-clear, morning/afternoon light
- Section flow: top-down conversion funnel, compact, no excess whitespace

VARIANT B — EXPERIMENTAL (Story-first, FORCED STRUCTURAL DIFFERENCE):
HARD RULES — ALL must be true. Verify each before outputting:
□ NO product visible in first 2 sections — narrative or lifestyle opens the email
□ Narrative or lifestyle section comes BEFORE product reveal
□ Copy register: sensory, poetic, evocative — reader FEELS before they SEE product
□ Layout: full-bleed editorial, NO product grid, generous whitespace (64px+ padding)
□ CTA: ghost-button or text-link ONLY — NOT prominent amber filled button
□ hero_scene: atmospheric, lifestyle, DIFFERENT time of day from A, NO studio feel
□ template_key MUST DIFFER from Variant A's template_key
□ COLOR SCHEME INVERTED: B must use dark background (#0f2a1c or #0a1f13) with light (#fdf6e8 / #e8dcc8) text for at least the first 2 sections — NOT cream background like A
□ SECTION ORDER DIFFERENT: B must NOT open with the same section type as A. If A opens hero→product, B must open narrative→lifestyle or context→mood
□ HEADLINE STYLE: B headlines must be poetic/indirect/sensory (e.g., "The hill is quiet at 7,000 feet.") — NOT benefit-direct like A

DIVERGENCE ENFORCEMENT:
If Variant B resembles A on ANY of the above → rewrite the failing sections entirely from a different emotional entry point. Do not output until all 10 boxes above are checked and true.

COLOR DIVERGENCE REQUIREMENT (mandatory):
- variant_a_concept must specify: color_approach = "light-cream" (background #fdf6e8, green text)
- variant_b_concept must specify: color_approach = "dark-inverted" (background #0f2a1c, cream text) for hero/narrative sections

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VAHDAM BRAND CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Palette: forest green #0f2a1c / amber gold #d4873a / cream #fdf6e8
Audience: urban professionals 30-55, health-conscious, value quality + story over price
BANNED phrases: wellness journey / transform / liquid gold / game-changer / LIMITED TIME (caps) / Hurry / Don't miss out / Last chance
PREFERRED: ritual / restore / balance / origin / single-estate / hand-picked / steep / heritage / crafted
IMAGE STYLE: luxury editorial photography — cinematic lighting, shallow DOF, tactile textures, no stock photography look, no clutter, no artificial lighting

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT: STRICT JSON ONLY — first char {, last char }. No markdown, no commentary.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCHEMA (all fields required):
{
  "strategic_lock": {
    "audience_truth": "specific behavioral insight — NOT generic",
    "business_goal": "the one measurable thing this mailer achieves",
    "purchase_barrier": "why they are NOT buying today",
    "conversion_trigger": "what will make them act NOW"
  },
  "product_selection": {
    "hero": { "name": "exact product name from list", "handle": "shopify_handle", "why": "1 sentence: how it resolves the purchase_barrier" },
    "supporting": [{ "name": "...", "handle": "...", "role": "AOV / expansion / system", "why": "..." }],
    "product_system": "1 sentence: how these products work together as a purchase story",
    "aov_logic": "1 sentence: how supporting products increase order value"
  },
  "strategy_type": "Conversion Push | Repeat Purchase | AOV Expansion | Brand Building",
  "strategy": "name the full strategy in your own words — e.g. 'First-flush urgency via single-estate scarcity for US premium buyers'",
  "reasoning": "2 sentences: why THIS strategy_type + strategy for THIS audience right now",
  "vibe": {
    "emotional_tone": "specific feeling — e.g. 'quiet confidence and morning stillness'",
    "pace": "slow/editorial OR fast/punchy — and why",
    "visual_energy": "specific visual atmosphere description",
    "positioning": "how VAHDAM is framed: premium provenance / accessible ritual / expert authority / trusted companion",
    "avoid": "specific execution choices that would feel generic for THIS brief"
  },
  "theme": {
    "name": "2-4 words, ownable, brief-specific",
    "core_idea": "1 sentence: consumption truth being reframed",
    "emotional_driver": "1 sentence: emotional state unlocked in reader",
    "conversion_logic": "1 sentence: why this theme drives the business_goal",
    "visual_world": "50-70w specific photographer-executable scene"
  },
  "structure": {
    "sections": ["hero", "context", "product_reveal", "benefit_strip", "social_proof", "offer_bar", "cta"],
    "layout_rules": "binding layout constraints for both variants",
    "visual_system": {
      "color_palette": "primary / secondary / accent usage rule",
      "typography": "heading font / body font / size guidance",
      "spacing_rhythm": "section gap / internal padding rule",
      "image_style": "photography direction tied to this specific brief"
    }
  },
  "image_style_lock": "50-70w global photography style directive — specific camera type, light source, surface material, depth of field, color temperature, compositional energy. Ownable to THIS brief — not generic.",
  "variant_a_concept": {
    "emotional_angle": "the emotional entry point for Variant A",
    "headline_register": "tone and register — e.g. 'direct benefit-led declarative'",
    "template_key": "launch | sale | story | gift | routine | discovery | bestseller | seasonal | editorial | founder",
    "color_approach": "light-cream — background #fdf6e8, primary text #0f2a1c, amber accents #d4873a",
    "opening_section": "hero (product visible in section 1)",
    "hero_scene": "50-70w specific photographic scene — composition, foreground, background, light direction, mood"
  },
  "variant_b_concept": {
    "emotional_angle": "MUST differ from A — different emotional entry point entirely",
    "headline_register": "MUST differ from A — poetic-sensory, NOT benefit-direct",
    "template_key": "MUST differ from A's template_key (choose a different one from the list)",
    "color_approach": "dark-inverted — background #0f2a1c for first 2 sections, cream text #fdf6e8, amber accent — OPPOSITE of A",
    "opening_section": "narrative or lifestyle (NO product in first 2 sections)",
    "hero_scene": "50-70w scene — DIFFERENT composition axis, time of day (e.g. dusk/evening if A is morning), human context, atmospheric mood — NOT studio"
  },
  "variant_divergence_contract": {
    "layout_difference": "1 sentence: specific structural difference between A and B layouts",
    "color_difference": "A uses light cream bg / B uses dark green bg for opening sections",
    "copy_difference": "1 sentence: how A and B copy registers differ",
    "section_order_difference": "1 sentence: how A and B section sequences differ",
    "product_treatment_difference": "A: product grid in section 1 / B: editorial single product reveal after section 2"
  }
}`;

module.exports = async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { return res.status(400).json({ error: 'invalid_json' }); }
  }
  body = body || {};

  const brief = (body.brief || '').toString().substring(0, 700);
  const market = (body.market || 'US').toString();
  const type = (body.type || '').toString();
  const products = Array.isArray(body.products) ? body.products : [];
  const regenerate_counter = Number(body.regenerate_counter) || 0;

  const productsBlock = products.slice(0, 15)
    .map(p => `- ${p.name || p.n || '?'} | ${p.price ? '$' + p.price : ''} | ${p.category || ''} | handle:${p.handle || p.id || '?'}`)
    .join('\n');

  const marketContext = {
    US: 'Urban US professionals 30-55. $55+ AOV. Value origin story, clean-label, daily ritual.',
    UK: 'UK tea-culture audience. Appreciate provenance, craft, premium gifting.',
    IN: 'Indian domestic audience. Value tradition, festivity, masala chai culture.',
    AU: 'Australian wellness seekers. Outdoor lifestyle, clean-label, ethical sourcing.',
    ME: 'Middle East audience. Love rich masala chai, aromatic blends, gifting occasions.',
    EU: 'European health-conscious shoppers. B-Corp story resonates, organic-certified.',
    Global: 'International premium audience. Discovery-minded, seeking authentic Indian heritage.'
  };

  // Derive a campaign name from brief + type for grounded context
  const campaignType = type || 'Campaign';
  const campaignName = brief
    ? brief.split(/[.!?\n]/)[0].trim().substring(0, 80) || (campaignType + ' · ' + market)
    : (campaignType + ' · ' + market);

  // ── User message: starts with campaign context, not a generic header ─────
  const userMessage = `CAMPAIGN: ${campaignName}
BRIEF: ${brief || '(no brief — derive a strong one from campaign type and market)'}
OBJECTIVE: ${type ? type + ' campaign' : 'Derive objective from brief'} for ${market} market
AUDIENCE: ${market} — ${marketContext[market] || market}
PRODUCTS AVAILABLE: ${productsBlock ? '\n' + productsBlock : '(none — infer appropriate VAHDAM tea products from brief)'}
${regenerate_counter > 0 ? `\nREGENERATE #${regenerate_counter}: ALL fields must differ from the previous run — new hero scene, new emotional angle, different strategy emphasis, different product selection if possible.` : ''}

Run Phase 1 → Phase 2 now. Think deeply before locking. Every field matters.`;

  try {
    const { text, provider, model, quota_warning, exhausted_keys } = await callLLM({
      systemPrompt: SYSTEM,
      userMessage,
      responseFormat: { type: 'json_object' },
      maxTokens: 2200,
      temperature: 0.65 + Math.min(0.3, regenerate_counter * 0.1),
      timeoutMs: 38000,        // 38s internal; vercel maxDuration 45s (7s headroom)
      stage: 'strategy[regen=' + regenerate_counter + ']'
    });

    let parsed;
    try { parsed = parseJSON(text); }
    catch (e) { return res.status(502).json({ error: 'json_parse_failed', provider, raw: text.substring(0, 400) }); }

    // Validate divergence between variants — check all 5 dimensions
    const a = parsed.variant_a_concept || {};
    const b = parsed.variant_b_concept || {};

    const divergenceIssues = [];
    if (a.emotional_angle === b.emotional_angle)    divergenceIssues.push('same emotional_angle');
    if (a.headline_register === b.headline_register) divergenceIssues.push('same headline_register');
    if (a.template_key === b.template_key)           divergenceIssues.push('same template_key');
    if (a.opening_section === b.opening_section)     divergenceIssues.push('same opening_section');
    // Critical: B must be dark-inverted, A must be light-cream
    const aIsDark = (a.color_approach || '').toLowerCase().includes('dark');
    const bIsLight = (b.color_approach || '').toLowerCase().includes('cream') || (b.color_approach || '').toLowerCase().includes('light');
    if (aIsDark)  divergenceIssues.push('Variant A incorrectly specifies dark color_approach — must be light-cream');
    if (bIsLight) divergenceIssues.push('Variant B incorrectly specifies light/cream color_approach — must be dark-inverted');

    if (divergenceIssues.length > 0) {
      parsed._divergence_warning = 'Divergence issues: ' + divergenceIssues.join('; ') + '. Downstream variant stage will enforce separation.';
    }

    // Auto-correct color_approach if LLM got it wrong (defensive fix)
    if (!a.color_approach || aIsDark) {
      a.color_approach = 'light-cream — background #fdf6e8, primary text #0f2a1c, amber accents #d4873a';
      parsed.variant_a_concept = a;
    }
    if (!b.color_approach || bIsLight) {
      b.color_approach = 'dark-inverted — background #0f2a1c for first 2 sections, cream text #fdf6e8, amber accent — OPPOSITE of A';
      parsed.variant_b_concept = b;
    }
    if (!b.opening_section || b.opening_section === a.opening_section || b.opening_section.toLowerCase().includes('hero')) {
      b.opening_section = 'narrative or lifestyle (NO product in first 2 sections)';
      parsed.variant_b_concept = b;
    }

    // Ensure strategy_type is present (backward compat for older output)
    if (!parsed.strategy_type && parsed.strategy) {
      const s = (parsed.strategy || '').toLowerCase();
      if (s.includes('conversion') || s.includes('sale') || s.includes('discount')) parsed.strategy_type = 'Conversion Push';
      else if (s.includes('repeat') || s.includes('habit') || s.includes('routine')) parsed.strategy_type = 'Repeat Purchase';
      else if (s.includes('aov') || s.includes('bundle') || s.includes('expand')) parsed.strategy_type = 'AOV Expansion';
      else parsed.strategy_type = 'Brand Building';
    }

    return res.status(200).json({
      ok: true, provider, model, stage: 'strategy',
      ...(quota_warning ? { quota_warning: true, exhausted_keys } : {}),
      ...parsed
    });

  } catch (e) {
    return res.status(500).json({ error: 'strategy_failed', stage: 'strategy', detail: String(e.message || e).substring(0, 300) });
  }
};
