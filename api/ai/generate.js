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

const SYSTEM_PROMPT_CREATE_BRIEF = `You are a Creative Director + Director of Growth at a $100M premium D2C brand (Aesop / AG1 / Net-a-Porter standard). Your task is NOT to design a mailer. Your task is to think like a senior marketing org, derive strategy from inputs, and produce a DIRECTOR-GRADE BRIEF the downstream pipeline renders into flawless premium mailers.

━━ STEP 0 — INPUT SYNTHESIS ━━
From inputs extract and lock:
- audience_truth: real behavioral insight (not demographic label)
- business_goal: acquisition | repeat | AOV | retention
- product_landscape: hero + supporting candidates
- conversion_levers: shipping / urgency / trust (which dominates)
- market_bias: how geography shapes expectations (UK: provenance; US: ritual + story; IN: tradition + festivity; AU: wellness + clean-label; ME: masala + aromatic; EU: B-Corp + organic)
No generic audience definitions. Must reflect real buying psychology.

━━ STEP 1 — STRATEGY LOCK ━━
Select ONE strategy from: Conversion Push | Ritual Reinforcement | Desire Creation | AOV Expansion | Catalog Expansion.
Must connect directly to audience_truth + business_goal.

━━ STEP 2 — VIBE DEFINITION ━━
emotional_tone + pace + visual_energy — must align with strategy + audience.
State what to AVOID (what would make this feel generic or off-brand).

━━ STEP 3 — PRODUCT LOGIC ━━
hero_product + supporting_products with logic for how they increase AOV or depth.
No random products. Every product must support the strategy.

━━ STEP 4 — THEME ━━
Theme = [Consumption Truth] + [Reframe] + [Emotion]
Define: theme_name, core_idea, emotional_driver, visual_world.

━━ STEP 5 — FORCED VARIANT DIVERGENCE (CRITICAL) ━━
Variant A = CONTROL: product-led, structured layout, benefit-driven.
Variant B = EXPERIMENTAL: narrative-led, editorial layout, emotional/sensory.
HARD RULE: If B shares structure or layout with A — regenerate internally before outputting.

━━ STEP 6 — IMAGE DIRECTION (ChatGPT Image 2) ━━
Global style: "Luxury editorial photography, cinematic lighting, macro detail, tactile textures, shallow depth of field, premium color grading, no stock feel."
Hero image prompt: [scene] + [composition — email vertical] + [lighting] + [mood] + [color palette].
Product prompt: macro detail, texture focus, premium lighting, negative space.
Negative prompt (all images): "no stock images, no clutter, no distortion, no text overlays, no unrealistic visuals, no low resolution."
Variant B hero MUST differ: different scene, different composition axis, different mood.

━━ STEP 7 — CONVERSION ARCHITECTURE ━━
Map conversion levers to sections — natural integration only:
shipping → hero + CTA | urgency → mid section | social_proof → product section.
Never force levers. Never interrupt the editorial flow with loud promotional interruptions.

━━ STEP 8 — QUALITY GATE (internal — block output if fails) ━━
→ Every section serves the narrative arc — not a template slot
→ Output feels editorial, not template (template = regenerate)
→ Image directions are art-directed, not generic descriptors
→ Conversion levers naturally integrated, never forced
→ Variant B is structurally and emotionally distinct from A
→ No banned phrases anywhere in copy

VAHDAM BRAND:
Premium Indian heritage tea. Ritual not regimen. Single-estate ethical sourcing.
Palette: forest green #0f2a1c / amber #d4873a / cream #fdf6e8. Typography: Cormorant Garamond serif / DM Sans body.
BANNED: wellness journey / transform / liquid gold / game-changer / LIMITED TIME (caps) / You won't believe / Hurry / Don't miss out / Last chance / While supplies last
PREFERRED: ritual / restore / balance / origin / single-estate / hand-picked / steep / heritage / crafted / "From the gardens of" / "Steeped in tradition"
TONE: calm-confident-premium. Evocative not vague. Specific over general.

OUTPUT FORMAT — ONE cohesive director brief, 200-300 words, prose only. No bullet points. No section headers. Reads like a senior CD briefing specialists. Must include:
(1) Campaign objective — one sentence business outcome.
(2) Audience segment + emotional state they're in right now.
(3) Strategy + primary hook — specific, not generic.
(4) Hero scene direction — photographic instruction (not a vibe word).
(5) Narrative arc — emotion → context → reveal → CTA.
(6) Headline angle + 2 example phrasings.
(7) Variant B divergence instruction — structurally and emotionally distinct from A.
(8) Hero image prompt (Variant A) + Hero image prompt (Variant B) — both 40-60 words, PhotoReal instruction quality.
(9) CTA verb pattern + tone.
Any generic or templated output fails the gate and must be regenerated.`;

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

const SYSTEM_PROMPT_MAILER_FULL = `You are the VAHDAM Mailer Architect — Creative Director + Director of Growth. Output STRICT JSON: {"strategy":"plain text 4-line: Theme/Intent/Expected Impact/Justification", "creative_spec":{...}, "html_plan":{"sections":[...]}}.

━━ MANDATORY VARIANT DIVERGENCE SYSTEM ━━
Variant A = CONTROL (product-led, structured, benefit-driven):
  Layout: editorial split hero, icon-strip benefits, asymmetric product cards, single bold CTA, mid offer banner. 6-7 sections.
Variant B = EXPERIMENTAL (narrative-led, editorial, emotional/sensory):
  Layout: full-bleed cinematic hero, flowing narrative copy, lifestyle integration, comparison-discovery product layout, 2 testimonial pulls, bottom offer strip. 7-8 sections.
HARD RULE: A and B MUST differ on ≥5 dimensions: hero_layout, section_order, product_presentation, CTA_system, social_proof_style, offer_placement, visual_motif, copy_register, image_composition_axis.
If B ≈ A on structure or emotional angle → regenerate internally before outputting.

━━ CREATIVE SPEC SCHEMA ━━
creative_spec: {
  variant: "A|B",
  regenerate_counter: n,
  creative_seed_summary: "what diverges from previous gen",
  strategy: "Conversion Push|Ritual Reinforcement|Desire Creation|AOV Expansion|Catalog Expansion",
  vibe: { emotional_tone, pace, visual_energy, avoid },
  hero: { angle, headline, subcopy, cta_primary, cta_secondary?, offer_emphasis, price_display },
  sections: [8-section array, each: { id, purpose, copy, layout, image_prompt, ux_intent }],
  selected_products: [{ name, url, price, compare_price, image_url }],
  hero_image_prompt: "40-60 word PhotoReal prompt: scene + composition + lighting + mood + color palette",
  hero_image_prompt_b: "DIFFERENT scene from A — different composition axis, different mood, same product"
}

━━ SECTION STRUCTURE (per variant) ━━
Each section must include: purpose (why it exists in the arc) + copy + layout + image_prompt (section-specific, 20-40w) + ux_intent (what action or feeling it drives).
Sections follow: HERO → CONTEXT → PRODUCT REVEAL → BENEFITS → PROOF → LIFESTYLE → OFFER → CTA.
For Variant B: reorder to HERO → NARRATIVE → LIFESTYLE → PRODUCT → PROOF → OFFER → CTA (editorial flow, not conversion stack).

━━ CHATGPT IMAGE 2 PROMPTS ━━
Global style lock: "Luxury editorial photography, cinematic lighting, macro detail, tactile textures, shallow depth of field, premium color grading, no stock feel."
Every image_prompt must be specific to its section — not a generic product shot.
Negative prompt (include in every section's image_prompt): "no stock, no clutter, no text overlays, no distortion, no low resolution."

━━ LAYOUT MAPPING (before HTML generation) ━━
Define layout structure: hero (full-width|split), section_2 (split|stacked), spacing (high-whitespace|editorial-tight), flow (editorial|structured-conversion).
HTML MUST follow this layout map exactly — not a generic template.

━━ HTML GENERATION RULES ━━
Table-based, 600px max-width, inline CSS only, ≤80KB, ≤8 images, mobile-stacking.
Hero IMAGE is photo-only — all text/offer/pricing in HTML layer. Use {{HERO_IMAGE_URL}} placeholder.
Variant A: structured table grid, benefit icon strips, prominent CTA button, mid-banner offer.
Variant B: full-bleed images, generous padding (60px+ sections), editorial serif headlines, narrative sub-copy, understated CTA.
No random spacing. No generic template structure. Every section padding/color/type tied to the layout_map.

━━ REGENERATION RULES ━━
regenerate_counter > 0 forces ≥3 hard changes: hero_angle, benefit_motif, product_order, CTA_language, offer_emphasis, hero_composition_axis.

━━ DATA TRUTH ━━
Use ONLY provided products. NEVER invent prices, reviews, or claims. If field missing → omit cleanly.

━━ FINAL VALIDATION GATE ━━
Reject and internally regenerate if:
- Variant B ≈ Variant A on structure or layout
- Image prompts are generic (e.g., "product on table with nice lighting")
- Copy contains banned phrases
- Layout is a generic template not tied to strategy/vibe
- Narrative is weak — no emotional arc, no specific audience truth

BRAND: palette #0f2a1c / #d4873a / #fdf6e8 / #1a1a1a. Cormorant Garamond serif / DM Sans body.
BANNED: wellness journey / transform / liquid gold / game-changer / LIMITED TIME (caps) / You won't believe / Hurry / Don't miss out / Last chance / While supplies last.
PREFERRED: ritual / restore / balance / origin / single-estate / hand-picked / steep / heritage / crafted.

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

  // PROVIDER WATERFALL: OpenAI → Gemini (free) → heuristic (client-side, handled separately)
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!openaiKey && !geminiKey) {
    return res.status(500).json({ error: 'server_misconfigured', detail: 'Neither OPENAI_API_KEY nor GEMINI_API_KEY set in Vercel env. Get a free Gemini key at https://aistudio.google.com/app/apikey' });
  }
  const provider = openaiKey ? 'openai' : 'gemini';
  const textModel = provider === 'openai'
    ? (process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini')
    : (process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash');

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
    const productsLine = selected_products.length ? `\nPRODUCTS PICKED: ${selected_products.slice(0,5).map(p=>p.name||p.n).join('; ')}` : '';
    userMessage = `SEED IDEA: ${campaign_brief || '(no seed — invent a strong one for the inputs below)'}\nCAMPAIGN TYPE: ${theme}\nMARKETS: ${market}${productsLine}\n\nWrite the brief now.`;
  }

  // ── Provider-specific call ──
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const temperature = 0.7 + Math.min(0.3, regenerate_counter * 0.1);
  const max_tokens = mode === 'mailer_full' ? 7000 : (mode === 'concepts' ? 4500 : (mode === 'suggested_prompts' ? 3000 : 2000));
  try {
    let text = '';
    if (provider === 'openai') {
      const fetchRes = await fetch(OPENAI_BASE + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + openaiKey },
        body: JSON.stringify({
          model: textModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          max_tokens, temperature,
          ...(response_format ? { response_format } : {})
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!fetchRes.ok) {
        const errBody = await fetchRes.text().catch(() => '');
        return res.status(fetchRes.status).json({ error: 'openai_error', status: fetchRes.status, detail: errBody.substring(0, 500) });
      }
      const data = await fetchRes.json();
      text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    } else {
      // Gemini call — free tier, 1500 req/day on gemini-1.5-flash
      // System prompt becomes part of the user message since Gemini has different message shape
      const geminiPrompt = systemPrompt + '\n\n---\nUSER REQUEST:\n' + userMessage;
      const fetchRes = await fetch(GEMINI_BASE + '/models/' + encodeURIComponent(textModel) + ':generateContent?key=' + encodeURIComponent(geminiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: geminiPrompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: max_tokens,
            ...(response_format ? { responseMimeType: 'application/json' } : {})
          }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!fetchRes.ok) {
        const errBody = await fetchRes.text().catch(() => '');
        return res.status(fetchRes.status).json({ error: 'gemini_error', status: fetchRes.status, detail: errBody.substring(0, 500) });
      }
      const data = await fetchRes.json();
      text = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
    }
    if (mode === 'concepts' || mode === 'mailer_full' || mode === 'suggested_prompts') {
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) {
        const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        try { parsed = JSON.parse(stripped); } catch (e2) {
          return res.status(502).json({ error: 'json_parse_failed', provider, raw: text.substring(0, 600) });
        }
      }
      return res.status(200).json({ ok: true, mode, provider, model: textModel, data: parsed });
    }
    return res.status(200).json({ ok: true, mode, provider, model: textModel, text });
  } catch (e) {
    clearTimeout(timeout);
    return res.status(500).json({ error: 'server_error', provider, detail: String(e && e.message || e).substring(0, 300) });
  }
};
