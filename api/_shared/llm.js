'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Shared LLM caller — OpenAI → Gemini waterfall
// Used by all pipeline stages. Keeps provider logic in ONE place.
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_BASE = 'https://api.openai.com/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * callLLM({ systemPrompt, userMessage, responseFormat, maxTokens, temperature, timeoutMs })
 * Returns { text, provider, model }
 * Throws on provider error or timeout.
 */
module.exports = async function callLLM(opts) {
  const {
    systemPrompt = '',
    userMessage = '',
    responseFormat = null,   // { type: 'json_object' } or null
    maxTokens = 2000,
    temperature = 0.7,
    timeoutMs = 30000
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let text = '';

    if (provider === 'openai') {
      const r = await fetch(OPENAI_BASE + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + openaiKey },
        body: JSON.stringify({
          model: textModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
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
        throw new Error('OpenAI ' + r.status + ': ' + err.substring(0, 300));
      }
      const data = await r.json();
      text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';

    } else {
      // Gemini — system prompt prepended to user message (different message shape)
      const combined = systemPrompt + '\n\n---\nUSER REQUEST:\n' + userMessage;
      const r = await fetch(
        GEMINI_BASE + '/models/' + encodeURIComponent(textModel) + ':generateContent?key=' + encodeURIComponent(geminiKey),
        {
          method: 'POST',
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

    return { text, provider, model: textModel };

  } catch (e) {
    clearTimeout(timer);
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
