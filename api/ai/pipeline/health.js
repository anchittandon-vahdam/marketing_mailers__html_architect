'use strict';
// ════════════════════════════════════════════════════════════════════════════
// /api/ai/pipeline/health  — Pipeline health check (no shared-module deps)
//
// Called by the frontend before starting the pipeline to verify:
//   1. The endpoint is reachable (not 404 → deployment issue)
//   2. At least one LLM provider key is configured
//   3. Multi-key status: OPENAI_API_KEY_2 / _3 presence (for cascade info)
//
// GET or POST. No body required. Fast — no external calls.
// ════════════════════════════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const openaiKey1 = !!process.env.OPENAI_API_KEY;
  const openaiKey2 = !!process.env.OPENAI_API_KEY_2;
  const openaiKey3 = !!process.env.OPENAI_API_KEY_3;
  const geminiKey  = !!process.env.GEMINI_API_KEY;

  const openaiKeyCount = [openaiKey1, openaiKey2, openaiKey3].filter(Boolean).length;
  const hasOpenAI  = openaiKeyCount > 0;
  const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1 (default)';
  const textModel  = process.env.OPENAI_TEXT_MODEL  || process.env.GEMINI_TEXT_MODEL || 'gpt-4o-mini / gemini-2.5-flash (default)';

  const hasProvider = hasOpenAI || geminiKey;

  // Build provider description
  let providerDesc = '';
  if (hasOpenAI) {
    providerDesc = 'OpenAI (' + openaiKeyCount + ' key' + (openaiKeyCount > 1 ? 's' : '') + ')';
    if (geminiKey) providerDesc += ' + Gemini (fallback)';
  } else if (geminiKey) {
    providerDesc = 'Gemini (OpenAI fallback if rate-limited)';
  }

  const checks = {
    endpoint_reachable:     true,
    openai_key_set:         openaiKey1,
    openai_key_2_set:       openaiKey2,
    openai_key_3_set:       openaiKey3,
    openai_keys_total:      openaiKeyCount,
    gemini_key_set:         geminiKey,
    at_least_one_provider:  hasProvider,
    image_model:            hasOpenAI ? imageModel : 'Pollinations FLUX (free)',
    text_model:             textModel,
    node_version:           process.version,
    timestamp:              new Date().toISOString()
  };

  const warnings = [];
  if (!hasOpenAI && !geminiKey) {
    warnings.push('CRITICAL: Neither OPENAI_API_KEY nor GEMINI_API_KEY is set. Pipeline cannot call LLMs.');
  }
  if (!hasOpenAI) {
    warnings.push('OPENAI_API_KEY not set — image generation will use Pollinations FLUX (free fallback).');
  } else if (openaiKeyCount === 1) {
    warnings.push('Only 1 OpenAI key configured. If quota runs out, add OPENAI_API_KEY_2 and OPENAI_API_KEY_3 as backups in Vercel env to avoid Pollinations fallback.');
  }
  if (!geminiKey && hasOpenAI) {
    warnings.push('GEMINI_API_KEY not set — if all OpenAI keys hit quota, text generation will fail. Add GEMINI_API_KEY (free) as a fallback.');
  }

  return res.status(200).json({
    ok: hasProvider,
    stage: 'health',
    checks,
    warnings,
    verdict: hasProvider
      ? 'Pipeline ready · ' + providerDesc
      : 'BLOCKED: No LLM provider configured. Set GEMINI_API_KEY (free) or OPENAI_API_KEY in Vercel dashboard → Settings → Environment Variables.'
  });
};
