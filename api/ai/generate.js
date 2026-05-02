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

const SYSTEM_PROMPT_CREATE_BRIEF = `You are a senior D2C growth director at a premium tea agency. Take a thin campaign idea and write ONE production-ready brief (180-280 words plain prose, NO bullets, NO headings, NO markdown) covering: campaign goal in one sentence, audience segment + emotional state, PRIMARY HOOK explicit (offer|benefit|origin-freshness with what specifically), SECONDARY HOOK reinforcing the primary, hero scene direction (specific photographic instruction), headline angle (sensory/benefit-led/offer-integrated with 1-2 example phrasings), CTA verb pattern aligned to angle, mood + tone descriptor.

VAHDAM brand: premium Indian heritage tea, ritual not regimen, single-estate ethical sourcing, US-primary audience.
BANNED: "wellness journey", "transform", "liquid gold", "game-changer", "LIMITED TIME" (caps), "You won't believe", "Hurry", "Don't miss out".
PREFERRED: ritual, restore, balance, origin, single-estate, hand-picked, steep, heritage, crafted.

Reads like a senior growth director briefing a creative team. The downstream concept ideation system will parse it.`;

const SYSTEM_PROMPT_MAILER_FULL = `You are the VAHDAM Mailer Architect. Output STRICT JSON: {"strategy":"plain text 4-line: Theme/Intent/Expected Impact/Justification", "creative_spec":{...}, "html_plan":{"sections":[...]}}. The creative_spec follows the schema: {variant:"A|B", regenerate_counter:n, creative_seed_summary:"what changed vs previous", hero:{angle, headline, subcopy, cta_primary, cta_secondary?, offer_emphasis, price_display}, sections:[8-section list], selected_products:[{name,url,price,compare_price,image_url}], hero_image_prompt:"photoreal hero photo prompt ONLY"}.

Variant A = Editorial Split (split hero, icon-strip benefits, asymmetric editorial cards, single CTA, mid offer banner, 6-7 sections).
Variant B = Conversion Stack (full-bleed hero, 2x2 benefits grid, comparison product layout, 2 testimonial cards, bottom offer strip, 7-8 sections).
A and B MUST differ on ≥4 dimensions: hero layout, section order, product presentation, CTA system, social proof, offer placement, visual motif, density.

regenerate_counter > 0 forces ≥3 changes from prior: hero angle, benefit motif, product order, CTA language, offer emphasis, hero composition.

DATA TRUTH: use ONLY provided products. NEVER invent prices/reviews/claims. If field missing → omit.

BRAND palette ONLY: #0f2a1c forest, #d4873a turmeric gold, #fdf6e8 cream, #1a1a1a text. Typography: Cormorant Garamond serif headings, DM Sans body.

HTML rules: table-based, 600px max-width, inline CSS only, ≤80KB, ≤8 images, mobile-stacking. Hero IMAGE is photo only — all text/offer/pricing in HTML. Include {{HERO_IMAGE_URL}} placeholder where the hero photo goes.

BANNED phrases: same list as concepts mode. PREFERRED vocabulary: same list.

First char {· last char }. No markdown.`;

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
  const theme = body.theme || body.type || '';
  const campaign_brief = body.campaign_brief || body.brief || body.prompt || '';
  const selected_products = Array.isArray(body.selected_products) ? body.selected_products : [];
  const variant = body.variant || 'A';
  const regenerate_counter = Number(body.regenerate_counter || 0);
  const previous_outputs_summary = body.previous_outputs_summary || '';

  let systemPrompt = SYSTEM_PROMPT_CREATE_BRIEF;
  let userMessage = '';
  let response_format = undefined;

  if (mode === 'concepts') {
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
  const max_tokens = mode === 'mailer_full' ? 6000 : (mode === 'concepts' ? 4500 : 1500);
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
    if (mode === 'concepts' || mode === 'mailer_full') {
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
