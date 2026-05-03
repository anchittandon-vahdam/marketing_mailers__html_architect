'use strict';
// ════════════════════════════════════════════════════════════════════════════
// /api/ai/pipeline/strategy  — Stage 1: Decision Engine
//
// Receives raw campaign inputs. Returns a fully locked strategic decision
// object that all downstream stages consume. ONE LLM call.
//
// POST body:  { brief, market, type, products[], regenerate_counter? }
// Response:   { ok, strategy, vibe, theme, product_selection,
//               image_style_lock, variant_a_concept, variant_b_concept }
// ════════════════════════════════════════════════════════════════════════════

const { corsHeaders, parseJSON } = require('../../_shared/llm');
const callLLM = require('../../_shared/llm');

const SYSTEM = `You are the DECISION ENGINE for VAHDAM India — a $100M premium D2C Indian heritage tea brand.

Your job: receive raw campaign inputs and produce a FULLY LOCKED strategic decision object.
Every downstream stage (creative plan, image generation, HTML) depends on your output.
Bad strategy = broken pipeline. Think hard. Lock everything.

OUTPUT: STRICT JSON ONLY. First char {, last char }. No markdown, no commentary.

━━ OUTPUT SCHEMA ━━
{
  "strategy": "one of exactly: Conversion Push | Ritual Reinforcement | Desire Creation | AOV Expansion | Catalog Expansion",
  "reasoning": "2 sentences: why THIS strategy for THIS audience right now",
  "vibe": {
    "emotional_tone": "e.g. calm-contemplative / urgent-confident / warm-intimate",
    "pace": "slow-deliberate | measured-editorial | fast-punchy",
    "visual_energy": "minimal-airy | rich-textured | cinematic-dramatic",
    "avoid": "specific things that would make this feel generic or off-brand"
  },
  "theme": {
    "name": "2-4 word theme (not generic — make it ownable)",
    "core_idea": "1 sentence: the consumption truth being reframed",
    "emotional_driver": "1 sentence: what emotional state this unlocks in the reader",
    "visual_world": "40-60w: specific scene description a photographer can execute"
  },
  "product_selection": {
    "hero": { "name": "exact product name from provided list", "handle": "shopify_handle_or_id" },
    "supporting": [{ "name": "...", "handle": "..." }],
    "aov_logic": "1 sentence: how supporting products increase order value or create a bundle"
  },
  "image_style_lock": "50-70w global photography style directive applied to ALL images in this campaign. Camera, light source, surface, DOF, color tone.",
  "variant_a_concept": {
    "emotional_angle": "rational-benefit | sensory-aspirational | social-proof-led | origin-story",
    "headline_register": "clear-informative | benefit-specific | authoritative",
    "layout_archetype": "structured-conversion | product-grid | editorial-split",
    "hero_scene": "50-70w specific photographic scene for Variant A hero — composition, foreground, background, light direction, mood"
  },
  "variant_b_concept": {
    "emotional_angle": "MUST DIFFER from Variant A — choose: sensory-evocative | narrative-atmospheric | emotional-intimate | desire-aspirational",
    "headline_register": "MUST DIFFER from Variant A — choose: poetic-evocative | story-opening | sensory-descriptive",
    "layout_archetype": "editorial-narrative | lifestyle-led | story-first | cinematic-flow",
    "hero_scene": "50-70w DIFFERENT photographic scene from Variant A — different composition axis, different mood, different human context"
  }
}

━━ VAHDAM BRAND ━━
Premium Indian heritage tea. Single-estate sourcing. B-Corp certified. Hand-picked.
Palette: forest green #0f2a1c / amber gold #d4873a / cream #fdf6e8.
Audience: urban professionals 30-55, health-conscious, value quality + story over price.
BANNED phrases: wellness journey / transform / liquid gold / game-changer / LIMITED TIME (caps) / You won't believe / Hurry / Don't miss out / Last chance / While supplies last
PREFERRED: ritual / restore / balance / origin / single-estate / hand-picked / steep / heritage / crafted

━━ DIVERGENCE RULE (non-negotiable) ━━
variant_a_concept and variant_b_concept MUST differ on ALL 4 fields: emotional_angle, headline_register, layout_archetype, hero_scene.
If they share any field value — your output is invalid. Regenerate internally before outputting.`;

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
    US: 'Urban US professionals 30-55. $55+ AOV. Value origin story, clean-label, ritual.',
    UK: 'UK tea-culture audience. Appreciate provenance, craft, premium gifting.',
    IN: 'Indian domestic audience. Value tradition, festivity, masala chai culture.',
    AU: 'Australian wellness seekers. Outdoor lifestyle, clean-label, ethical sourcing.',
    ME: 'Middle East audience. Love rich masala chai, aromatic blends, gifting occasions.',
    EU: 'European health-conscious shoppers. B-Corp story resonates, organic-certified.',
    Global: 'International premium audience. Discovery-minded, seeking authentic Indian heritage.'
  };

  const userMessage = `BRIEF: ${brief || '(no brief — derive a strong one from the campaign type and market)'}
MARKET: ${market} — ${marketContext[market] || market}
CAMPAIGN TYPE: ${type || 'General'}
REGENERATE_COUNTER: ${regenerate_counter}${regenerate_counter > 0 ? '\nINSTRUCTION: Force all dimensions to differ from previous generation. Change hero scene, emotional angle, strategy, and product emphasis.' : ''}

AVAILABLE PRODUCTS (use ONLY these):
${productsBlock || '(none — infer appropriate VAHDAM tea products from brief)'}

Generate the strategic decision JSON now. Think carefully. Every field matters.`;

  try {
    const { text, provider, model } = await callLLM({
      systemPrompt: SYSTEM,
      userMessage,
      responseFormat: { type: 'json_object' },
      maxTokens: 1800,
      temperature: 0.6 + Math.min(0.3, regenerate_counter * 0.1),
      timeoutMs: 28000
    });

    let parsed;
    try { parsed = parseJSON(text); }
    catch (e) { return res.status(502).json({ error: 'json_parse_failed', provider, raw: text.substring(0, 400) }); }

    // Validate divergence — warn but don't block (downstream will handle)
    const a = parsed.variant_a_concept || {};
    const b = parsed.variant_b_concept || {};
    const diverged = a.emotional_angle !== b.emotional_angle &&
                     a.headline_register !== b.headline_register &&
                     a.layout_archetype !== b.layout_archetype;
    if (!diverged) {
      parsed._divergence_warning = 'Variants share ≥1 dimension — downstream will enforce separation';
    }

    return res.status(200).json({ ok: true, provider, model, stage: 'strategy', ...parsed });

  } catch (e) {
    return res.status(500).json({ error: 'strategy_failed', stage: 'strategy', detail: String(e.message || e).substring(0, 300) });
  }
};
