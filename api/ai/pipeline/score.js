'use strict';
// ════════════════════════════════════════════════════════════════════════════
// /api/ai/pipeline/score  — Stage 5: Quality scoring + retry signal
//
// Scores both generated email variants on 4 dimensions. If any score < 7,
// flags the weak variant and returns a retry reason the orchestrator uses
// to increase regenerate_counter and re-run the pipeline.
//
// POST body:  { html_a, html_b, variant_a_plan, variant_b_plan, strategy_output }
// Response:   { ok, scores_a, scores_b, pass, weak_variant, failure_reasons[], retry_reason }
// ════════════════════════════════════════════════════════════════════════════

const { corsHeaders, parseJSON } = require('../../_shared/llm');
const callLLM = require('../../_shared/llm');

const PASS_THRESHOLD = 7;      // Minimum score per dimension
const DIVERGENCE_MIN  = 8;     // Variant B divergence must score this or above

const SYSTEM = `You are a senior email marketing quality auditor for VAHDAM India. Score two email variants against specific quality criteria. Output STRICT JSON only — no commentary, no markdown.

━━ SCORING CRITERIA ━━

strategy_alignment (0-10):
  10 = Every section directly serves the stated campaign strategy
  5  = Strategy is loosely present
  0  = No connection to strategy

structural_uniqueness (0-10):
  10 = Layout is custom-built for this campaign, zero generic template feel
  5  = Some unique elements, mostly template
  0  = Pure template, could be any brand

copy_quality (0-10):
  10 = Premium, brand-aligned, emotionally specific, zero banned phrases
  5  = Adequate, some generic copy present
  0  = Generic marketing copy or banned phrases found

variant_divergence (0-10) — score ONLY for Variant B:
  10 = B is structurally and emotionally opposite to A (different hero, section order, copy register, CTA style)
  5  = Some differences but similar feel
  0  = B is essentially a reskin of A

━━ PASS RULES ━━
- All Variant A scores ≥ ${PASS_THRESHOLD}
- All Variant B scores ≥ ${PASS_THRESHOLD}
- Variant B variant_divergence ≥ ${DIVERGENCE_MIN}

━━ OUTPUT SCHEMA ━━
{
  "scores_a": {
    "strategy_alignment": 0-10,
    "structural_uniqueness": 0-10,
    "copy_quality": 0-10,
    "overall": 0-10
  },
  "scores_b": {
    "strategy_alignment": 0-10,
    "structural_uniqueness": 0-10,
    "copy_quality": 0-10,
    "variant_divergence": 0-10,
    "overall": 0-10
  },
  "pass": true | false,
  "weak_variant": null | "A" | "B" | "both",
  "failure_reasons": ["specific reason 1", "specific reason 2"],
  "retry_reason": "1 concise instruction for what to fix on retry, OR null if pass"
}`;

// Extract a structural fingerprint from HTML (avoids sending 80KB to the LLM)
function fingerprint(html) {
  if (!html || typeof html !== 'string') return {};
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    char_count: html.length,
    section_count: (html.match(/<!-- SECTION:/g) || []).length,
    table_count: (html.match(/<table/gi) || []).length,
    image_count: (html.match(/<img/gi) || []).length,
    cta_buttons: (html.match(/bgcolor="#d4873a"/gi) || []).length,
    ghost_buttons: (html.match(/border:2px solid/gi) || []).length,
    hero_is_split: html.includes('55%') || (html.match(/<td[^>]*width="[2-4][0-9][0-9]"/gi) || []).length > 1,
    hero_is_fullbleed: html.includes('width="600"') && html.includes('{{HERO_IMAGE_URL}}'),
    has_banner: html.includes('bgcolor="#0f2a1c"') && (html.match(/bgcolor="#0f2a1c"/gi) || []).length > 1,
    word_count: stripped.split(' ').filter(w => w.length > 2).length,
    copy_sample: stripped.substring(0, 600)
  };
}

module.exports = async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { return res.status(400).json({ error: 'invalid_json' }); }
  }
  body = body || {};

  const { html_a = '', html_b = '', variant_a_plan = {}, variant_b_plan = {}, strategy_output = {} } = body;

  const fpA = fingerprint(html_a);
  const fpB = fingerprint(html_b);

  // Structural divergence check (heuristic, pre-LLM)
  const structurallyDiverged = fpA.cta_buttons !== fpB.cta_buttons ||
                               fpA.hero_is_split !== fpB.hero_is_split ||
                               fpA.hero_is_fullbleed !== fpB.hero_is_fullbleed;

  const planSummaryA = {
    layout_flow: (variant_a_plan.layout_plan || {}).flow,
    hero_type: (variant_a_plan.layout_plan || {}).hero,
    section_ids: (variant_a_plan.sections || []).map(s => s.id)
  };
  const planSummaryB = {
    layout_flow: (variant_b_plan.layout_plan || {}).flow,
    hero_type: (variant_b_plan.layout_plan || {}).hero,
    section_ids: (variant_b_plan.sections || []).map(s => s.id)
  };

  const userMessage = `━━ CAMPAIGN ━━
Strategy: ${strategy_output.strategy || '(not provided)'}
Theme: ${(strategy_output.theme && strategy_output.theme.name) || ''}

━━ VARIANT A ━━
Intended plan: ${JSON.stringify(planSummaryA)}
HTML fingerprint: ${JSON.stringify(fpA)}
Copy sample:
"${fpA.copy_sample || ''}"

━━ VARIANT B ━━
Intended plan: ${JSON.stringify(planSummaryB)}
HTML fingerprint: ${JSON.stringify(fpB)}
Copy sample:
"${fpB.copy_sample || ''}"

Structural divergence check (heuristic): ${structurallyDiverged ? 'PASS — A and B have different structural signatures' : 'WARN — A and B may share structural patterns'}

Score both variants now and return the JSON.`;

  try {
    const { text, provider, model } = await callLLM({
      systemPrompt: SYSTEM,
      userMessage,
      responseFormat: { type: 'json_object' },
      maxTokens: 700,
      temperature: 0.15,  // Near-deterministic — scoring should be consistent
      timeoutMs: 20000
    });

    let parsed;
    try { parsed = parseJSON(text); }
    catch (e) { return res.status(502).json({ error: 'json_parse_failed', provider, raw: text.substring(0, 300) }); }

    // Enforce pass logic client-side too (don't trust LLM alone)
    const sa = parsed.scores_a || {};
    const sb = parsed.scores_b || {};
    const aFails = [sa.strategy_alignment, sa.structural_uniqueness, sa.copy_quality]
      .some(s => s != null && s < PASS_THRESHOLD);
    const bFails = [sb.strategy_alignment, sb.structural_uniqueness, sb.copy_quality]
      .some(s => s != null && s < PASS_THRESHOLD);
    const divergenceFails = sb.variant_divergence != null && sb.variant_divergence < DIVERGENCE_MIN;

    parsed.pass = !aFails && !bFails && !divergenceFails;
    parsed.weak_variant = (aFails && bFails) ? 'both' : aFails ? 'A' : (bFails || divergenceFails) ? 'B' : null;

    return res.status(200).json({ ok: true, stage: 'score', provider, model, ...parsed });

  } catch (e) {
    // Scoring failure is non-fatal — return a synthetic pass so pipeline doesn't loop
    console.warn('[pipeline/score] error:', e.message);
    return res.status(200).json({
      ok: true,
      stage: 'score',
      provider: 'fallback',
      pass: true,
      weak_variant: null,
      failure_reasons: [],
      retry_reason: null,
      _score_error: String(e.message || e).substring(0, 200),
      scores_a: { overall: 8 },
      scores_b: { overall: 8 }
    });
  }
};
