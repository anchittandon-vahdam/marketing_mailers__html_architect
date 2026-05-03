'use strict';
// ════════════════════════════════════════════════════════════════════════════
// /api/ai/pipeline/variant  — Stage 2: Pure Execution (no thinking)
//
// Strategy is LOCKED in Stage 1. This stage is EXECUTION ONLY.
// Takes the locked strategy + structure contract and produces a complete
// creative plan: sections, layout, copy, image requirements.
//
// CRITICAL: All strategic decisions (theme, product, vibe, structure sections)
// come from strategy output. This stage implements — it does NOT invent.
//
// A and B are called separately with structurally opposite implementations
// of the SAME locked strategy.
//
// POST body:  { strategy_output, variant: 'A'|'B', brief, market, products[], regenerate_counter? }
// Response:   { ok, variant, layout_plan, sections[], image_requirements[], copy_framework, subject_lines[], preheader }
// ════════════════════════════════════════════════════════════════════════════

const { corsHeaders, parseJSON } = require('../../_shared/llm');
const callLLM = require('../../_shared/llm');

// ── Variant A: Product-first, structured, conversion-optimised ───────────────
const SYSTEM_A = `You are building VARIANT A — the CONTROL execution of a locked campaign strategy for VAHDAM India.

YOUR ROLE: EXECUTOR, NOT THINKER.
The strategy, theme, structure, products, and vibe are already decided. You implement them exactly.
Do NOT invent new strategy. Do NOT override layout rules. Do NOT change the product selection.
Your only job: convert the locked plan into a detailed creative brief for HTML generation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIANT A EXECUTION RULES (non-negotiable):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Product VISIBLE in the FIRST section — no delay, no story buildup
- Layout: product-hero + conversion hierarchy
- Section order: hero (product visible) → context/benefits → social proof → offer → CTA
- Copy register: precise, benefit-specific, authoritative — reader should know exactly what they're buying and why
- Hero layout: split (image 55% left, copy 45% right) OR centered with product image dominant
- Benefits: 3-column icon strip with short benefit captions
- Products: 2-column or 3-column product cards with name, price, CTA
- Offer: prominent horizontal banner with discount code / free shipping threshold
- CTA: single prominent button — amber background #d4873a, centered, max 4 words
- Section count: 5-7 (what the campaign needs — never pad with filler)

COPY REGISTER FOR A:
- Headlines: direct, benefit-first declarative ("Steep Better. Start Here.")
- Sub-copy: specific, factual, benefit-rich — no vague poetry
- CTA verbs: Shop / Order / Explore / Start

OUTPUT: STRICT JSON ONLY. First char {, last char }. No markdown.

SCHEMA:
{
  "variant": "A",
  "layout_plan": {
    "hero": "specific layout — e.g. '55% image left, 45% copy right, 600px total'",
    "benefit_section": "icon strip layout",
    "product_section": "grid layout",
    "proof_section": "testimonial layout",
    "offer_section": "banner layout",
    "cta_section": "button spec",
    "color_scheme": { "background": "#fdf6e8", "primary": "#0f2a1c", "accent": "#d4873a", "text": "#1a1a1a" },
    "spacing": "e.g. 48px between sections, 24px internal padding",
    "flow": "structured-conversion"
  },
  "sections": [
    {
      "id": "hero | product_reveal | benefit_strip | social_proof | offer_bar | cta",
      "type": "split-hero | full-bleed | centered | two-col-grid | three-col-grid | banner | button-row",
      "purpose": "1 sentence: why this section exists in the conversion arc",
      "copy": {
        "eyebrow": "optional small label above headline",
        "headline": "primary headline (max 8 words, benefit-direct, premium tone)",
        "subcopy": "supporting copy (max 40 words, specific and factual)",
        "cta": "CTA button label (max 4 words)"
      },
      "layout": "precise HTML developer instruction for this section's table structure",
      "image_slot": "hero | product | lifestyle | none",
      "ux_intent": "conversion action or emotional state this section drives"
    }
  ],
  "image_requirements": [
    {
      "slot": "hero",
      "prompt": "55-70w SPECIFIC scene for ChatGPT Image (gpt-image-1): name the exact subject, surface material, light source+direction, camera angle, time of day, color temperature, compositional focus. No text, no logos.",
      "size": "1536x1024",
      "negative_prompt": "no text overlays, no logos, no UI elements, no email layout, no stock look, no artificial lighting, no clutter"
    },
    {
      "slot": "product",
      "prompt": "55-70w SPECIFIC product photography: hero product on a tactile surface, studio-adjacent natural sidelight, close-up angle showing packaging texture, warm depth, VAHDAM premium feel. No text, no logos.",
      "size": "1024x1024",
      "negative_prompt": "no text overlays, no logos, no UI elements, no stock look, no artificial lighting"
    },
    {
      "slot": "lifestyle",
      "prompt": "55-70w SPECIFIC lifestyle moment: person or hands interacting with tea in a real-life setting — morning ritual, desk moment, kitchen counter. Warm cinematic light, emotional context. No text, no logos.",
      "size": "1024x1024",
      "negative_prompt": "no text overlays, no logos, no UI elements, no stock look, no artificial lighting"
    }
  ],
  "copy_framework": {
    "tone": "precise-authoritative",
    "voice": "confident product expert",
    "headline_style": "benefit-first declarative",
    "cta_verb": "Shop | Explore | Order | Start"
  },
  "subject_lines": ["≤58 chars, benefit-led variant 1", "≤58 chars variant 2", "≤58 chars variant 3"],
  "preheader": "≤85 chars, no terminal period, supports and extends subject line"
}

VAHDAM BRAND:
BANNED: wellness journey / transform / liquid gold / game-changer / LIMITED TIME caps / hurry / don't miss out
PREFERRED: ritual / restore / balance / origin / single-estate / hand-picked / steep / heritage / crafted`;

// ── Variant B: Story-first, editorial, emotional, dark-inverted ──────────────
const SYSTEM_B = `You are building VARIANT B — the EXPERIMENTAL execution of a locked campaign strategy for VAHDAM India.

YOUR ROLE: EXECUTOR, NOT THINKER.
The strategy, theme, structure, products, and vibe are already decided. You implement them exactly.
Do NOT invent new strategy. Do NOT change the product selection.
Your only job: convert the locked plan into a creative brief that is STRUCTURALLY AND VISUALLY OPPOSITE from Variant A.

VARIANT A (for reference — do the OPPOSITE on every dimension):
A = cream backgrounds · product in section 1 · split-hero · 3-col product grid · amber filled CTA button · benefit-direct headlines · compact conversion layout · testimonial proof · offer banner

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIANT B EXECUTION RULES (ALL MUST BE TRUE — verify before outputting):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ COLOR SCHEME INVERTED: First 2–3 sections MUST have dark background (#0f2a1c or #0a1f13) with cream text (#fdf6e8 or #e8dcc8). A uses cream throughout — B must open DARK.
□ NO product in the first 2 sections — narrative, lifestyle or mood section opens the email
□ Narrative context or lifestyle moment comes BEFORE product reveal (product appears section 3+ only)
□ Copy register: sensory, poetic, evocative — reader FEELS the world before they SEE the product
□ Hero layout: full-bleed image (600px wide) with overlaid text on dark overlay OR image with copy stacked below
  → NEVER split layout (A uses split — this must be full-bleed or stacked)
□ Products: single featured product with large editorial image — NOT a product grid (A uses grid)
□ Proof: origin story / provenance section (estate, harvest, altitude, year) — NOT star-rating testimonials (A uses those)
□ Offer: subtle inline text mention — NOT a prominent horizontal banner (A uses banner)
□ CTA: ghost-button (border: 2px solid #fdf6e8, transparent bg on dark sections) OR text-link — NOT amber filled button (A uses amber)
□ Section padding: minimum 64px top and bottom throughout — generous editorial whitespace
□ Headline font: 44px+ for editorial scale (A uses ~32px conversion headlines)
□ Section count: 6-8 (narrative needs room)
□ template_key MUST differ from Variant A's template_key

COPY REGISTER FOR B:
- Headlines: sensory, poetic, place-anchored ("The hill is quiet at 7,000 feet.")
- Sub-copy: evocative prose, 1-2 sentences, creates desire through atmosphere and origin
- CTA verbs: Discover / Begin / Explore / Find / Enter

SECTION ORDER FOR B (narrative arc — do NOT use A's funnel order):
Mood/atmosphere → Origin/context → Product reveal → Brand story/proof → Subtle offer → Ghost CTA

COLOR SCHEME FOR B layout_plan:
{
  "background": "#0f2a1c",
  "primary": "#fdf6e8",
  "accent": "#d4873a",
  "text": "#e8dcc8",
  "section_note": "Dark forest green opening sections; can transition to cream for product reveal section"
}

DIVERGENCE CHECK (verify all before outputting):
□ First 2 sections use dark (#0f2a1c) background — NOT cream like A
□ Hero is full-bleed or stacked — NOT split like A
□ Product appears in section 3 or later — NOT section 1 like A
□ Copy is poetic/sensory — NOT benefit-direct like A
□ CTA is ghost/text-link — NOT amber filled button like A
□ No product grid — single editorial product treatment
□ template_key differs from Variant A
If ANY box is false → rewrite the failing sections before outputting.

OUTPUT: STRICT JSON ONLY. First char {, last char }. No markdown.
SCHEMA: identical to Variant A schema but with:
- "variant": "B"
- "layout_plan.flow": "editorial-narrative"
- "layout_plan.color_scheme": dark-inverted as above
- All section types, copy, and image prompts must structurally differ from A

VAHDAM BRAND:
BANNED: wellness journey / transform / liquid gold / game-changer / LIMITED TIME caps / hurry / don't miss out
PREFERRED: ritual / restore / balance / origin / single-estate / hand-picked / steep / heritage / crafted`;

module.exports = async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { return res.status(400).json({ error: 'invalid_json' }); }
  }
  body = body || {};

  const strategy_output = body.strategy_output || {};
  const variant = (body.variant || 'A').toString().toUpperCase() === 'B' ? 'B' : 'A';
  const brief = (body.brief || '').toString().substring(0, 500);
  const market = (body.market || 'US').toString();
  const products = Array.isArray(body.products) ? body.products : [];
  const regenerate_counter = Number(body.regenerate_counter) || 0;

  const systemPrompt = variant === 'B' ? SYSTEM_B : SYSTEM_A;
  const conceptKey = variant === 'B' ? 'variant_b_concept' : 'variant_a_concept';
  const concept = strategy_output[conceptKey] || {};

  // Extract locked structure from strategy (this is what variant implements)
  const lockedStructure = strategy_output.structure || {};
  const lockedSections = Array.isArray(lockedStructure.sections) ? lockedStructure.sections : [];

  const productsBlock = products.slice(0, 5)
    .map(p => `- name:"${p.name || p.n || ''}" | price:"$${p.price || '?'}" | handle:"${p.handle || p.id || ''}" | img:"${p.image_url || p.i || ''}"`)
    .join('\n');

  // Hero product from strategy (the strategically selected SKU)
  const heroProduct = (strategy_output.product_selection && strategy_output.product_selection.hero) || {};
  const supportingProducts = (strategy_output.product_selection && strategy_output.product_selection.supporting) || [];

  // ── User message: execution brief, not a thinking prompt ─────────────────
  const userMessage = `━━ LOCKED STRATEGY (implement exactly — do not change) ━━

CAMPAIGN: ${brief.split(/[.!?\n]/)[0].trim().substring(0, 80) || 'VAHDAM Campaign'}
STRATEGY TYPE: ${strategy_output.strategy_type || ''}
STRATEGY: ${strategy_output.strategy || ''}
REASONING: ${strategy_output.reasoning || ''}

STRATEGIC LOCK:
- Audience truth: ${(strategy_output.strategic_lock || {}).audience_truth || ''}
- Business goal: ${(strategy_output.strategic_lock || {}).business_goal || ''}
- Purchase barrier: ${(strategy_output.strategic_lock || {}).purchase_barrier || ''}
- Conversion trigger: ${(strategy_output.strategic_lock || {}).conversion_trigger || ''}

━━ THEME (locked) ━━
${JSON.stringify(strategy_output.theme || {}, null, 2)}

━━ VIBE (locked) ━━
${JSON.stringify(strategy_output.vibe || {}, null, 2)}

━━ STRUCTURE CONTRACT (implement these sections in order — this is FINAL) ━━
Sections: ${lockedSections.length > 0 ? lockedSections.join(' → ') : '(derive from strategy)'}
Layout rules: ${lockedStructure.layout_rules || ''}
Visual system: ${JSON.stringify(lockedStructure.visual_system || {}, null, 2)}

━━ IMAGE STYLE LOCK (apply to all image prompts) ━━
${strategy_output.image_style_lock || 'Luxury editorial photography, cinematic lighting, shallow DOF, tactile textures'}

━━ VARIANT ${variant} EXECUTION CONTRACT ━━
Emotional angle: ${concept.emotional_angle || ''}
Headline register: ${concept.headline_register || ''}
Template key: ${concept.template_key || ''}
Hero scene direction: ${concept.hero_scene || ''}

━━ PRODUCTS (use these — do not change) ━━
HERO: ${heroProduct.name || '(from strategy)'} ${heroProduct.why ? '— ' + heroProduct.why : ''}
SUPPORTING: ${supportingProducts.map(p => p.name + (p.role ? ' [' + p.role + ']' : '')).join(', ') || '(from strategy)'}
PRODUCT SYSTEM: ${(strategy_output.product_selection || {}).product_system || ''}
MARKET: ${market}
${productsBlock ? '\nCATALOG MATCHES:\n' + productsBlock : ''}

${regenerate_counter > 0 ? `REGENERATE #${regenerate_counter}: Change hero image scene, section copy emphasis, and layout variation from previous run. Keep same strategy — vary execution.` : ''}

Implement Variant ${variant} now. Follow the locked structure exactly. Generate all sections, copy, and image prompts.`;

  try {
    const { text, provider, model, quota_warning, exhausted_keys } = await callLLM({
      systemPrompt,
      userMessage,
      responseFormat: { type: 'json_object' },
      maxTokens: 3500,
      temperature: 0.55 + Math.min(0.2, regenerate_counter * 0.08),
      timeoutMs: 46000,        // 46s internal; vercel maxDuration 55s (9s headroom)
      stage: 'variant-' + variant + '[regen=' + regenerate_counter + ']'
    });

    let parsed;
    try { parsed = parseJSON(text); }
    catch (e) { return res.status(502).json({ error: 'json_parse_failed', provider, raw: text.substring(0, 400) }); }

    // Ensure variant field is correct
    parsed.variant = variant;

    return res.status(200).json({
      ok: true, provider, model, stage: 'variant', variant,
      ...(quota_warning ? { quota_warning: true, exhausted_keys } : {}),
      ...parsed
    });

  } catch (e) {
    return res.status(500).json({ error: 'variant_plan_failed', stage: 'variant', variant, detail: String(e.message || e).substring(0, 300) });
  }
};
