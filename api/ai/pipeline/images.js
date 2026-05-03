'use strict';
// ════════════════════════════════════════════════════════════════════════════
// /api/ai/pipeline/images  — Stage 3: Multi-image generation with retry
//
// Generates up to 3 images per call (hero + product + lifestyle).
// Each image is retried up to 3× if generation or validation fails.
// Supports gpt-image-1 (OpenAI) or Pollinations FLUX (free fallback).
//
// POST body:  { requirements: [{slot, prompt, size, negative_prompt}],
//               variant, image_style_lock }
// Response:   { ok, variant, images: [{slot, data_url, success, attempts, error}],
//               all_success, success_count }
// ════════════════════════════════════════════════════════════════════════════

const { corsHeaders } = require('../../_shared/llm');

const OPENAI_BASE = 'https://api.openai.com/v1';
const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';

// Image preamble — tight, non-negotiable constraints.
// All composition/mood/lighting comes from the caller's scene prompt.
// gpt-image-1 (ChatGPT Image, aka GPT-4o native image generation) needs clear negative constraints
// to avoid adding text overlays, logos, or email UI into the scene.
const PHOTO_PREAMBLE = `Ultra-photorealistic lifestyle/product photograph for VAHDAM India premium tea brand. Style: luxury editorial photography, cinematic shallow depth-of-field, gallery-print resolution.

MANDATORY CONSTRAINTS:
- Absolutely NO text, NO letters, NO words, NO logos, NO watermarks, NO brand marks
- NO email layout, NO UI frames, NO mockup frames, NO device screens
- NO stock photography look, NO artificial studio lighting
- Tactile textures visible, natural cinematic lighting only

SCENE:
`;

const VALID_SIZES = ['1024x1024', '1536x1024', '1024x1536'];

// ── Single image generation (one provider attempt) ───────────────────────────
async function generateImage(prompt, size, openaiKey) {
  const safeSize = VALID_SIZES.includes(size) ? size : '1024x1024';
  const finalPrompt = (PHOTO_PREAMBLE + prompt).substring(0, 4000);

  if (openaiKey) {
    // gpt-image-1 = OpenAI's GPT-4o native image generation model (ChatGPT Image 2 in the product UI)
    // This is the most capable model for photorealistic editorial images
    const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
    const r = await fetch(OPENAI_BASE + '/images/generations', {
      method: 'POST',
      cache: 'no-store',   // disable fetch-level caching — each image must be unique
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + openaiKey },
      body: JSON.stringify({
        model: imageModel,
        prompt: finalPrompt,
        n: 1,
        size: safeSize,
        quality: 'high',   // 'high' = max detail for product/lifestyle photography
        output_format: 'b64_json'  // always request base64 to avoid expiring URLs
      })
    });
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      throw new Error('OpenAI image ' + r.status + ': ' + err.substring(0, 200));
    }
    const data = await r.json();
    const entry = data.data && data.data[0];
    if (!entry) throw new Error('OpenAI: no image in response');
    if (entry.b64_json) return 'data:image/png;base64,' + entry.b64_json;
    if (entry.url) {
      const imgR = await fetch(entry.url, { cache: 'no-store' });
      const buf = await imgR.arrayBuffer();
      return 'data:image/png;base64,' + Buffer.from(buf).toString('base64');
    }
    throw new Error('OpenAI: unrecognised image response shape');

  } else {
    // Pollinations fallback — random seed per call ensures different output
    const sizeMap = {
      '1024x1024': { w: 1024, h: 1024 },
      '1536x1024': { w: 1536, h: 1024 },
      '1024x1536': { w: 1024, h: 1536 }
    };
    const dim = sizeMap[safeSize];
    const seed = Math.floor(Math.random() * 999999) + 1;
    const url = POLLINATIONS_BASE + '/' +
      encodeURIComponent(finalPrompt.substring(0, 1500)) +
      '?width=' + dim.w + '&height=' + dim.h +
      '&seed=' + seed + '&nologo=true&model=flux&enhance=true';

    const imgR = await fetch(url, { cache: 'no-store' });
    if (!imgR.ok) throw new Error('Pollinations ' + imgR.status);
    const buf = await imgR.arrayBuffer();
    const ct = imgR.headers.get('content-type') || 'image/jpeg';
    return 'data:' + ct + ';base64,' + Buffer.from(buf).toString('base64');
  }
}

// ── Validation — checks data URL is a real image ─────────────────────────────
function validateDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return { valid: false, reason: 'null or non-string' };
  if (!dataUrl.startsWith('data:image/')) return { valid: false, reason: 'not a data: URL' };
  const base64 = dataUrl.split(',')[1] || '';
  if (base64.length < 2000) return { valid: false, reason: 'data too small — likely error image' };
  return { valid: true };
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { return res.status(400).json({ error: 'invalid_json' }); }
  }
  body = body || {};

  const requirements = Array.isArray(body.requirements) ? body.requirements : [];
  const variant = (body.variant || 'A').toString();
  const image_style_lock = (body.image_style_lock || '').toString();
  const openaiKey = process.env.OPENAI_API_KEY;
  const MAX_RETRIES = 3;

  // Generate all images in parallel (each with its own retry loop)
  const imagePromises = requirements.slice(0, 3).map(async (item) => {
    const { slot, prompt = '', size = '1024x1024', negative_prompt = '' } = item;

    // Build full prompt: style lock + scene brief + negative
    const fullPrompt = [
      image_style_lock,
      prompt,
      negative_prompt ? 'Avoid: ' + negative_prompt : ''
    ].filter(Boolean).join(' ').trim();

    let dataUrl = null;
    let attempts = 0;
    let lastError = null;

    while (attempts < MAX_RETRIES) {
      attempts++;
      try {
        dataUrl = await generateImage(fullPrompt, size, openaiKey);
        const validation = validateDataUrl(dataUrl);
        if (validation.valid) break;
        lastError = 'Validation: ' + validation.reason;
        dataUrl = null;
        console.warn('[pipeline/images]', variant, slot, 'attempt', attempts, '— validation failed:', lastError);
      } catch (e) {
        lastError = String(e.message || e).substring(0, 200);
        dataUrl = null;
        console.warn('[pipeline/images]', variant, slot, 'attempt', attempts, '— error:', lastError);
      }
    }

    return {
      slot,
      data_url: dataUrl,
      success: !!dataUrl,
      attempts,
      error: dataUrl ? null : lastError,
      prompt_used: fullPrompt.substring(0, 200)
    };
  });

  const images = await Promise.allSettled(imagePromises).then(results =>
    results.map(r => r.status === 'fulfilled' ? r.value : {
      slot: '?', data_url: null, success: false, attempts: MAX_RETRIES, error: String(r.reason)
    })
  );

  const successCount = images.filter(i => i.success).length;

  return res.status(200).json({
    ok: true,
    stage: 'images',
    variant,
    provider: openaiKey ? 'openai' : 'pollinations',
    images,
    success_count: successCount,
    all_success: successCount === images.length
  });
};
