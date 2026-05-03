'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Shared LLM caller — OpenAI → Gemini waterfall
// Used by all pipeline stages. Keeps provider logic in ONE place.
//
// Anti-repetition hardening (v81):
//   • cache: 'no-store' on every fetch — prevents CDN/network response caching
//   • GEN_SEED appended to every user message — unique token makes each request
//     body distinct so identical prompts cannot be served from any cache layer
//   • Console logging at call + response — full debug trail per stage
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_BASE = 'https://api.openai.com/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Unique entropy seed: ms timestamp + 4 random hex chars.
// Appended to every user message so no two requests share an identical body.
function genSeed() {
  return Date.now().toString(36) + '-' + Math.floor(Math.random() * 0xffff).toString(16);
}

/**
 * callLLM({ systemPrompt, userMessage, responseFormat, maxTokens, temperature, timeoutMs, stage })
 * Returns { text, provider, model, seed }
 * Throws on provider error or timeout.
 */
module.exports = async function callLLM(opts) {
  const {
    systemPrompt = '',
    userMessage = '',
    responseFormat = null,   // { type: 'json_object' } or null
    maxTokens = 2000,
    temperature = 0.7,
    timeoutMs = 30000,
    stage = 'llm'            // debug label — logged to console
  } = opts;

  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!openaiKey && !geminiKey) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY in Vercel env.');
  }

  const provider = openaiKey ? 'openai' : 'gemini';
  const textModel = provider === 'openai'
    ? (process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini')
    : (process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash');

  // Unique seed — injected into user message to defeat any response caching
  const seed = genSeed();
  // Append seed as a non-visible JSON comment so the LLM ignores it
  // but the request body hash is always unique
  const seededUserMessage = userMessage + '\n\n<!-- gen_seed:' + seed + ' -->';

  console.log('[llm][' + stage + '] provider=' + provider + ' model=' + textModel +
    ' temp=' + temperature + ' maxTokens=' + maxTokens + ' seed=' + seed);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let text = '';

    if (provider === 'openai') {
      const r = await fetch(OPENAI_BASE + '/chat/completions', {
        method: 'POST',
        cache: 'no-store',   // ← disable fetch-level caching
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + openaiKey },
        body: JSON.stringify({
          model: textModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: seededUserMessage }
          ],
          max_tokens: maxTokens,
          temperature,
          ...(responseFormat ? { response_format: responseFormat } : {})
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        console.error('[llm][' + stage + '] OpenAI error', r.status, err.substring(0, 200));
        throw new Error('OpenAI ' + r.status + ': ' + err.substring(0, 300));
      }
      const data = await r.json();
      text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';

    } else {
      // Gemini — system prompt prepended to user message (different message shape)
      const combined = systemPrompt + '\n\n---\nUSER REQUEST:\n' + seededUserMessage;
      const r = await fetch(
        GEMINI_BASE + '/models/' + encodeURIComponent(textModel) + ':generateContent?key=' + encodeURIComponent(geminiKey),
        {
          method: 'POST',
          cache: 'no-store',   // ← disable fetch-level caching
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: combined }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              ...(responseFormat ? { responseMimeType: 'application/json' } : {})
            }
          }),
          signal: controller.signal
        }
      );
      clearTimeout(timer);
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        console.error('[llm][' + stage + '] Gemini error', r.status, err.substring(0, 200));
        throw new Error('Gemini ' + r.status + ': ' + err.substring(0, 300));
      }
      const data = await r.json();
      text = (
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text
      ) || '';
    }

    console.log('[llm][' + stage + '] response length=' + text.length + ' chars');
    return { text, provider, model: textModel, seed };

  } catch (e) {
    clearTimeout(timer);
    console.error('[llm][' + stage + '] threw:', e.message);
    throw e;
  }
};

/**
 * parseJSON(text) — strips markdown fences then parses.
 * Throws SyntaxError if still invalid.
 */
module.exports.parseJSON = function parseJSON(text) {
  try { return JSON.parse(text); } catch (_) {}
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(stripped);
};

/**
 * corsHeaders(res) — apply standard CORS to a Vercel response.
 */
module.exports.corsHeaders = function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};
