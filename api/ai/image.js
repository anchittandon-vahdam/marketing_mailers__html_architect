// ════════════════════════════════════════════════════════════════════════════
// /api/ai/image — Vercel serverless function
// Server-side OpenAI image generation (gpt-image-1).
// Returns base64 data URL (browser embeds directly into <img src=...>).
// Browser never sees OPENAI_API_KEY.
//
// POST body:
//   { prompt: string, size?: '1024x1024'|'1536x1024'|'1024x1536', quality?: 'low'|'medium'|'high'|'auto' }
//
// Env vars:
//   OPENAI_API_KEY        — required
//   OPENAI_IMAGE_MODEL    — default 'gpt-image-1'
// ════════════════════════════════════════════════════════════════════════════

const OPENAI_BASE = 'https://api.openai.com/v1';

// HERO-ONLY IMAGE MASTER PROMPT — server-side wrapper that gets prepended to
// whatever prompt the client sends. Keeps every hero generation on-brand
// regardless of what client-side code passes.
const IMAGE_PROMPT_PREAMBLE = `Generate a HERO LIFESTYLE PHOTOGRAPH only. NOT a full email design. NOT a UI mockup. NOT a layout with sections.

Premium photoreal lifestyle product photography for VAHDAM India tea brand. Editorial luxury - reference language: Aesop product campaigns × Kinfolk magazine editorial × AG1 wellness × Net-a-Porter.

Soft natural afternoon light, warm tone. Shallow depth of field - crisp on product, gentle blur on background. Organic textures only - linen, raw stone, brushed wood, cream paper, brushed brass. Never plastic, never glossy white seamless.

Single dominant focal point. Generous whitespace. Slight asymmetry, never centered-symmetric template.

NO TEXT IN IMAGE. NO LOGOS. NO UI FRAMES. NO BUTTONS. NO ANN-BARS. NO HEADLINES. NO PRICE STAMPS. The HTML email layer renders all text - this image is pure photography.

Real VAHDAM tin design where applicable - tin colour matches the actual SKU named (deep forest green, warm cream, terracotta, or rich pink/magenta for hibiscus iced-tea SKUs). Gold typography and botanical illustration on tin. NEVER substitute generic packaging.

Render at maximum sharpness: razor-crisp product surfaces, gallery-print resolution, no soft-focus haze, no AI smear artifacts.

SCENE BRIEF FROM CLIENT:
`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'server_misconfigured', detail: 'OPENAI_API_KEY not set in Vercel env' });
  }
  const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

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

  // Compose final prompt with hero-only safeguards prepended
  const finalPrompt = (IMAGE_PROMPT_PREAMBLE + userPrompt).substring(0, 4000);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000); // image gen takes longer
  try {
    const fetchRes = await fetch(OPENAI_BASE + '/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: imageModel,
        prompt: finalPrompt,
        n: 1,
        size: size,
        quality: quality
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!fetchRes.ok) {
      const errBody = await fetchRes.text().catch(() => '');
      return res.status(fetchRes.status).json({ error: 'openai_image_error', status: fetchRes.status, detail: errBody.substring(0, 500) });
    }
    const data = await fetchRes.json();
    const imgEntry = data.data && data.data[0];
    if (!imgEntry) return res.status(502).json({ error: 'no_image_returned' });

    let dataUrl = '';
    if (imgEntry.b64_json) {
      dataUrl = 'data:image/png;base64,' + imgEntry.b64_json;
    } else if (imgEntry.url) {
      // gpt-image-1 returns b64 by default; URL fallback for older models
      try {
        const imgFetch = await fetch(imgEntry.url);
        const buf = await imgFetch.arrayBuffer();
        const b64 = Buffer.from(buf).toString('base64');
        dataUrl = 'data:image/png;base64,' + b64;
      } catch (e) {
        return res.status(502).json({ error: 'fetch_image_url_failed', url: imgEntry.url });
      }
    } else {
      return res.status(502).json({ error: 'unrecognised_image_response' });
    }
    return res.status(200).json({ ok: true, model: imageModel, size, quality, image_data_url: dataUrl });
  } catch (e) {
    clearTimeout(timeout);
    return res.status(500).json({ error: 'server_error', detail: String(e && e.message || e).substring(0, 300) });
  }
};
