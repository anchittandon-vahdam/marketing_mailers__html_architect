'use strict';
// ════════════════════════════════════════════════════════════════════════════
// /api/ai/pipeline/variant  — Stage 2: Creative Plan (called SEPARATELY for A and B)
//
// Takes the Strategy output + variant identifier and generates a COMPLETE
// creative plan: layout, sections, image requirements, copy framework.
// CRITICAL: A and B are separate LLM calls with different system prompts.
// This structurally enforces divergence — not just prompt instruction.
//
// POST body:  { strategy_output, variant: 'A'|'B', brief, market, products[], regenerate_counter? }
// Response:   { ok, variant, layout_plan, sections[], image_requirements[], copy_framework, subject_lines[], preheader }
// ════════════════════════════════════════════════════════════════════════════

const { corsHeaders, parseJSON } = require('../../_shared/llm');
const callLLM = require('../../_shared/llm');

// ── Variant A: Product-led, structured, conversion-optimised ─────────────────
const SYSTEM_A = `You are building the CREATIVE PLAN for VARIANT A — the CONTROL variant of a premium D2C email campaign for VAHDAM India.

VARIANT A IDENTITY (non-negotiable):
- Product-led: Product hero → benefits → proof → offer → CTA
- Structured conversion layout: clear visual hierarchy, benefit icon strips, product card grid
- Copy register: precise, benefit-specific, authoritative
- Section count: exactly 6 sections
- Section order: HERO → PRODUCT REVEAL → BENEFIT STRIP → SOCIAL PROOF → OFFER → CTA

LAYOUT RULES FOR A:
- Hero: split layout (image left 55%, copy right 45%) OR centered with overlaid copy
- Benefits: 3-column icon strip with short benefit captions
- Products: 2-column or 3-column product cards with name, price, CTA button per card
- Social proof: 1-2 short testimonials + sourcing credential (estate name, altitude, year)
- Offer: mid-email horizontal banner (shipping threshold, discount code, or bundle incentive)
- CTA: single prominent button, amber background #d4873a, centered

OUTPUT: STRICT JSON ONLY. First char {, last char }. No markdown.

Schema:
{
  "variant": "A",
  "layout_plan": {
    "hero": "specific layout instruction e.g. '55% image left, 45% copy right, 600px total'",
    "benefit_section": "icon strip layout instruction",
    "product_section": "grid layout instruction",
    "proof_section": "testimonial layout",
    "offer_section": "banner layout",
    "cta_section": "button spec",
    "color_scheme": { "background": "#fdf6e8", "primary": "#0f2a1c", "accent": "#d4873a", "text": "#1a1a1a" },
    "spacing": "e.g. 48px between sections, 24px internal padding",
    "flow": "structured-conversion"
  },
  "sections": [
    {
      "id": "hero | product_reveal | benefit_strip | social_proof | offer | cta",
      "type": "split-hero | full-bleed | centered | two-col-grid | three-col-grid | banner | button-row",
      "purpose": "1 sentence: why this section exists in the conversion arc",
      "copy": {
        "eyebrow": "optional small label above headline",
        "headline": "primary headline (max 8 words, premium tone)",
        "subcopy": "supporting copy (max 40 words)",
        "cta": "CTA button label (max 4 words)"
      },
      "layout": "precise HTML developer instruction for this section's table structure",
      "image_slot": "hero | product | lifestyle | none",
      "ux_intent": "what conversion action or emotional state this section drives"
    }
  ],
  "image_requirements": [
    {
      "slot": "hero",
      "prompt": "50-70w SPECIFIC photographic brief: subject, composition, light source, surface, mood, camera angle. NO generic descriptions.",
      "size": "1536x1024",
      "negative_prompt": "no text overlays, no logos, no UI elements, no stock photography look, no clutter, no artificial lighting"
    },
    {
      "slot": "product",
      "prompt": "40-50w product photography brief: subject, styling, negative space, light, editorial feel",
      "size": "1024x1024",
      "negative_prompt": "no text, no logos, no clutter, no distracting backgrounds, no drop shadows"
    },
    {
      "slot": "lifestyle",
      "prompt": "40-50w lifestyle scene brief: context, human presence (optional), warm moment, brand world",
      "size": "1536x1024",
      "negative_prompt": "no text, no stock look, no fake smiles, no obvious staging"
    }
  ],
  "copy_framework": {
    "tone": "e.g. precise-authoritative",
    "voice": "e.g. confident product expert",
    "headline_style": "e.g. benefit-first declarative",
    "cta_verb": "e.g. Shop | Explore | Order"
  },
  "subject_lines": ["≤58 chars variant 1", "≤58 chars variant 2", "≤58 chars variant 3"],
  "preheader": "≤85 chars, no terminal period, supports subject line"
}

VAHDAM BRAND:
BANNED: wellness journey / transform / liquid gold / game-changer / LIMITED TIME caps / hurry / don't miss out
PREFERRED: ritual / restore / balance / origin / single-estate / hand-picked / steep / heritage / crafted`;

// ── Variant B: Narrative-led, editorial, emotional ───────────────────────────
const SYSTEM_B = `You are building the CREATIVE PLAN for VARIANT B — the EXPERIMENTAL variant of a premium D2C email campaign for VAHDAM India.

VARIANT B IDENTITY (non-negotiable):
- Narrative-led: Story opens before product is revealed
- Editorial layout: full-bleed hero, generous whitespace, flowing prose sections
- Copy register: sensory, evocative, poetic — the reader FEELS before they see product
- Section count: exactly 7 sections
- Section order: CINEMATIC HERO → NARRATIVE CONTEXT → LIFESTYLE MOMENT → PRODUCT DISCOVERY → ORIGIN PROOF → OFFER (subtle) → CTA (understated)

LAYOUT RULES FOR B — THESE MUST DIFFER FROM VARIANT A:
- Hero: full-bleed image (600px wide) with minimal overlaid headline OR image + copy below (never split like A)
- Narrative: single full-width prose paragraph with pull quote
- Lifestyle: full-bleed or 2-col lifestyle photo + sensory caption
- Product: single featured product, large image, editorial crop — NOT a grid (A uses grid)
- Proof: origin story section (estate, harvest, altitude) NOT testimonials (A uses testimonials)
- Offer: subtle inline mention, NOT a banner (A uses banner)
- CTA: understated, minimal, ghost-button or text-link style — NOT prominent amber button (A uses that)

OUTPUT: STRICT JSON ONLY. First char {, last char }. No markdown.

Schema: IDENTICAL to Variant A schema but:
- "variant": "B"
- "layout_plan.flow": "editorial-narrative"
- All section types, copy register, and image prompts MUST differ from what Variant A would produce

CRITICAL DIVERGENCE CHECK:
Before outputting, verify internally:
□ Hero layout differs from A (full-bleed vs split)
□ Copy register differs (sensory/poetic vs benefit-rational)
□ Section order differs (narrative-first vs product-first)
□ Image prompts differ (mood/atmospheric vs studio/structured)
□ CTA style differs (understated vs prominent)
If ANY box is unchecked — rewrite the failing sections before outputting.

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

  const productsBlock = products.slice(0, 5)
    .map(p => `- name:"${p.name || p.n || ''}" | price:"$${p.price || '?'}" | handle:"${p.handle || p.id || ''}" | img:"${p.image_url || p.i || ''}"`)
    .join('\n');

  const userMessage = `━━ STRATEGY ━━
Strategy: ${strategy_output.strategy || ''}
Reasoning: ${strategy_output.reasoning || ''}

━━ THEME ━━
${JSON.stringify(strategy_output.theme || {}, null, 2)}

━━ VIBE ━━
${JSON.stringify(strategy_output.vibe || {}, null, 2)}

━━ IMAGE STYLE LOCK (apply to all image prompts) ━━
${strategy_output.image_style_lock || 'Luxury editorial photography, cinematic lighting, shallow DOF, tactile textures, no stock look'}

━━ VARIANT ${variant} CONCEPT (what was decided in strategy) ━━
${JSON.stringify(concept, null, 2)}

━━ HERO PRODUCT ━━
${JSON.stringify(strategy_output.product_selection && strategy_output.product_selection.hero || {}, null, 2)}

━━ MARKET ━━
${market}

━━ BRIEF ━━
${brief}

━━ AVAILABLE PRODUCTS ━━
${productsBlock || '(none — use hero product from strategy)'}

REGENERATE_COUNTER: ${regenerate_counter}${regenerate_counter > 0 ? '\nHard requirement: change hero image scene, section copy, and layout emphasis from previous generation.' : ''}

Generate the complete Variant ${variant} creative plan now. Every image prompt must be specific and art-directed — reject any generic description internally before outputting.`;

  try {
    const { text, provider, model } = await callLLM({
      systemPrompt,
      userMessage,
      responseFormat: { type: 'json_object' },
      maxTokens: 3500,
      temperature: 0.65 + Math.min(0.25, regenerate_counter * 0.1),
      timeoutMs: 35000
    });

    let parsed;
    try { parsed = parseJSON(text); }
    catch (e) { return res.status(502).json({ error: 'json_parse_failed', provider, raw: text.substring(0, 400) }); }

    // Ensure variant field is correct
    parsed.variant = variant;

    return res.status(200).json({ ok: true, provider, model, stage: 'variant', variant, ...parsed });

  } catch (e) {
    return res.status(500).json({ error: 'variant_plan_failed', stage: 'variant', variant, detail: String(e.message || e).substring(0, 300) });
  }
};
