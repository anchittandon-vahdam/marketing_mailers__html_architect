// ════════════════════════════════════════════════════════════════════════════
// /api/ai/image — Vercel serverless function
// Server-side image generation with multi-key OpenAI cascade.
// Returns base64 data URL (browser embeds directly into <img src=...>).
// Browser never sees any OPENAI_API_KEY.
//
// Key cascade (v90):
//   OPENAI_API_KEY → OPENAI_API_KEY_2 → OPENAI_API_KEY_3 on quota exhaustion
//   Falls back to Pollinations (free, unlimited) when all keys exhausted.
//   Returns quota_warning:true so UI can surface a note to the user.
//
// POST body:
//   { prompt: string, size?: '1024x1024'|'1536x1024'|'1024x1536', quality?: 'low'|'medium'|'high'|'auto' }
//
// Env vars:
//   OPENAI_API_KEY        — primary key
//   OPENAI_API_KEY_2      — first backup key (optional)
//   OPENAI_API_KEY_3      — second backup key (optional)
//   OPENAI_IMAGE_MODEL    — default 'gpt-image-1'
// ════════════════════════════════════════════════════════════════════════════

const OPENAI_BASE = 'https://api.openai.com/v1';

// MINIMAL GUARD PREAMBLE — enforces only the non-negotiable constraints.
// Style, lighting, mood, composition are ALL driven by the caller's prompt.
// Keeping this short lets the model fully express the art-direction brief
// without conflicting instructions smothering the creative prompt.
const IMAGE_PROMPT_PREAMBLE = `Photoreal product lifestyle photograph for VAHDAM India premium tea brand. Pure photography — NO text, NO logos, NO UI elements, NO email layout, NO mockup, NO watermarks, NO design frames. VAHDAM packaging tin where present: deep forest-green, warm cream, terracotta, or pink/magenta depending on SKU — gold botanical label. Gallery-print resolution, zero AI smear artifacts.

Scene:
`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  // Collect all configured OpenAI keys
  const openaiKeys = [
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEY_2,
    process.env.OPENAI_API_KEY_3
  ].filter(Boolean);

  // Model cascade: gpt-image-2 (primary, highest quality) → gpt-image-1 (fallback)
  const imageModels = [
    process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    'gpt-image-1'
  ];

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { return res.status(400).json({ error: 'invalid_json_body' }); }
  }
  body = body || {};
  const userPrompt = (body.prompt || '').toString().trim();
  if (!userPrompt) return res.status(400).json({ error: 'missing_prompt' });
  const size = body.size || '1024x1536';
  const quality = body.quality || 'high';
  const validSizes = ['1024x1024', '1536x1024', '1024x1536'];
  const validQualities = ['low', 'medium', 'high', 'auto'];
  if (validSizes.indexOf(size) < 0) return res.status(400).json({ error: 'invalid_size', allowed: validSizes });
  if (validQualities.indexOf(quality) < 0) return res.status(400).json({ error: 'invalid_quality', allowed: validQualities });

  // Compose final prompt with brand safeguards prepended
  const finalPrompt = (IMAGE_PROMPT_PREAMBLE + userPrompt).substring(0, 4000);

  // ── Try models in cascade: gpt-image-2 → gpt-image-1, each with all keys ─
  if (openaiKeys.length > 0) {
    let allQuotaExhausted = false;

    for (let mi = 0; mi < imageModels.length; mi++) {
      const imageModel = imageModels[mi];
      let modelUnavailable = false;
      let exhaustedCount = 0;

      for (let ki = 0; ki < openaiKeys.length; ki++) {
        const key = openaiKeys[ki];
        const keySuffix = '...' + key.slice(-4);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);

        console.log('[image] Trying model=' + imageModel + ' key #' + (ki + 1) + ' (' + keySuffix + ') size=' + size);

        try {
          const fetchRes = await fetch(OPENAI_BASE + '/images/generations', {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
            // All models now use output_format: 'png' (returns base64 in b64_json field)
            // Note: 'b64_json' is deprecated and rejected by both gpt-image-1 and gpt-image-2
            body: JSON.stringify({ model: imageModel, prompt: finalPrompt, n: 1, size, quality, output_format: 'png' }),
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (!fetchRes.ok) {
            const errText = await fetchRes.text().catch(() => '');
            console.warn('[image] ' + imageModel + ' key #' + (ki + 1) + ' → HTTP ' + fetchRes.status, errText.substring(0, 200));

            // Model not available — break inner loop, try next model
            const isModelError = fetchRes.status === 404 ||
              errText.includes('model_not_found') ||
              errText.includes('does not exist') ||
              errText.includes('not supported') ||
              (fetchRes.status === 400 && errText.includes(imageModel));
            if (isModelError) {
              console.warn('[image] Model ' + imageModel + ' unavailable — falling back to gpt-image-1');
              modelUnavailable = true;
              break;
            }

            // Quota exhaustion — rotate to next key
            const isQuota = (fetchRes.status === 429 || fetchRes.status === 402) &&
              (errText.includes('insufficient_quota') || errText.includes('quota') || errText.includes('billing') || errText.includes('credit'));
            if (isQuota && ki < openaiKeys.length - 1) {
              exhaustedCount++;
              console.warn('[image] Key #' + (ki + 1) + ' quota exhausted — rotating to key #' + (ki + 2));
              continue;
            }
            if (isQuota) {
              exhaustedCount++;
              allQuotaExhausted = (exhaustedCount === openaiKeys.length);
              console.warn('[image] All keys quota exhausted on ' + imageModel);
              break; // all keys exhausted for this model — try next model or Pollinations
            }

            // Non-quota, non-model error — try next model before giving up
            if (mi < imageModels.length - 1) {
              console.warn('[image] ' + imageModel + ' error ' + fetchRes.status + ' — trying next model');
              modelUnavailable = true;
              break;
            }
            return res.status(fetchRes.status).json({ error: 'openai_image_error', status: fetchRes.status, detail: errText.substring(0, 500) });
          }

          // ── Success ────────────────────────────────────────────────────────
          const data = await fetchRes.json();
          const imgEntry = data.data && data.data[0];
          if (!imgEntry) return res.status(502).json({ error: 'no_image_returned', provider: 'openai' });

          let dataUrl = '';
          if (imgEntry.b64_json) {
            dataUrl = 'data:image/png;base64,' + imgEntry.b64_json;
          } else if (imgEntry.url) {
            try {
              const imgFetch = await fetch(imgEntry.url);
              const buf = await imgFetch.arrayBuffer();
              dataUrl = 'data:image/png;base64,' + Buffer.from(buf).toString('base64');
            } catch (e) {
              return res.status(502).json({ error: 'fetch_image_url_failed', provider: 'openai', url: imgEntry.url });
            }
          } else {
            return res.status(502).json({ error: 'unrecognised_image_response', provider: 'openai' });
          }

          console.log('[image] Success · model=' + imageModel + ' key #' + (ki + 1) + ' size=' + size);
          return res.status(200).json({
            ok: true, provider: 'openai', model: imageModel, size, quality,
            image_data_url: dataUrl, key_index: ki + 1
          });

        } catch (e) {
          clearTimeout(timeout);
          console.error('[image] ' + imageModel + ' key #' + (ki + 1) + ' exception:', String(e.message || e).substring(0, 200));
          if (mi < imageModels.length - 1) { modelUnavailable = true; break; }
          break;
        }
      } // end key loop

      if (!modelUnavailable && !allQuotaExhausted) {
        // Non-recoverable error on all keys for this model
        if (mi === imageModels.length - 1) break; // no more models — fall through to Pollinations
      }
    } // end model loop
  }

  // ── Pollinations fallback (free, no auth, FLUX model) ─────────────────────
  // Reached when: no OpenAI keys configured, OR all OpenAI keys quota-exhausted
  const quotaWarning = openaiKeys.length > 0; // had keys but all quota-exhausted
  if (quotaWarning) {
    console.warn('[image] Using Pollinations fallback (OpenAI quota exhausted on all ' + openaiKeys.length + ' key(s))');
  }

  const sizeMap = {
    '1024x1024': { w: 1024, h: 1024 },
    '1024x1536': { w: 1024, h: 1536 },
    '1536x1024': { w: 1536, h: 1024 }
  };
  const dim = sizeMap[size] || sizeMap['1024x1536'];
  const seed = Math.floor(Math.random() * 1000000);
  const pollinationsModel = 'flux';
  const pollUrl = 'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(finalPrompt.substring(0, 1500)) +
    '?width=' + dim.w + '&height=' + dim.h +
    '&seed=' + seed + '&nologo=true&model=' + pollinationsModel + '&enhance=true';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const imgFetch = await fetch(pollUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!imgFetch.ok) {
      return res.status(imgFetch.status).json({
        error: 'pollinations_error',
        provider: 'pollinations',
        status: imgFetch.status,
        quota_warning: quotaWarning
      });
    }
    const buf = await imgFetch.arrayBuffer();
    const contentType = imgFetch.headers.get('content-type') || 'image/jpeg';
    const dataUrl = 'data:' + contentType + ';base64,' + Buffer.from(buf).toString('base64');

    return res.status(200).json({
      ok: true,
      provider: 'pollinations',
      model: pollinationsModel,
      size, quality,
      image_data_url: dataUrl,
      // Client uses this to show a note: "OpenAI quota reached — images via Pollinations"
      quota_warning: quotaWarning,
      quota_note: quotaWarning
        ? 'OpenAI image quota exhausted on all ' + openaiKeys.length + ' key(s). Using Pollinations (free). Add credits at platform.openai.com to restore high-quality image generation.'
        : null
    });
  } catch (e) {
    clearTimeout(timeout);
    return res.status(502).json({
      error: 'pollinations_fetch_failed',
      provider: 'pollinations',
      quota_warning: quotaWarning,
      detail: String(e.message || e).substring(0, 200)
    });
  }
};
