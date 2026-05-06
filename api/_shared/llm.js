'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Shared LLM caller — 4-provider waterfall
//
// CASCADE ORDER (first available key wins at each tier):
//   1. OpenAI    (OPENAI_API_KEY / _2 / _3)   — ChatGPT, highest quality
//   2. Anthropic (ANTHROPIC_API_KEY)           — Claude, strong fallback
//   3. Gemini    (GEMINI_API_KEY)              — free tier, multi-model
//   4. Grok/xAI  (XAI_API_KEY)               — OpenAI-compatible fallback
//
// Within each provider, quota exhaustion rotates keys/models before
// falling to the next provider. Rate-limits also fall through.
//
// Anti-repetition: GEN_SEED appended to every user message so identical
// prompts cannot be served from any response cache layer.
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_BASE    = 'https://api.openai.com/v1';
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const GEMINI_BASE    = 'https://generativelanguage.googleapis.com/v1beta';
const GROK_BASE      = 'https://api.x.ai/v1';

function genSeed() {
  return Date.now().toString(36) + '-' + Math.floor(Math.random() * 0xffff).toString(16);
}

/**
 * callLLM({ systemPrompt, userMessage, responseFormat, maxTokens, temperature, timeoutMs, stage })
 * Returns { text, provider, model, seed, quota_warning?, exhausted_keys? }
 * Throws on all providers failing.
 */
module.exports = async function callLLM(opts) {
  const {
    systemPrompt  = '',
    userMessage   = '',
    responseFormat = null,   // { type: 'json_object' } or null
    maxTokens     = 2000,
    temperature   = 0.7,
    timeoutMs     = 30000,
    stage         = 'llm'
  } = opts;

  const openaiKeys = [
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEY_2,
    process.env.OPENAI_API_KEY_3
  ].filter(Boolean);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;
  const grokKey      = process.env.XAI_API_KEY;

  if (!openaiKeys.length && !anthropicKey && !geminiKey && !grokKey) {
    throw new Error('No AI provider configured. Set at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, XAI_API_KEY');
  }

  const seed             = genSeed();
  const seededUserMessage = userMessage + '\n\n<!-- gen_seed:' + seed + ' -->';

  // ── Provider helpers ────────────────────────────────────────────────────────

  async function _openai(model, key) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    console.log('[llm][' + stage + '] openai model=' + model + ' key=...' + key.slice(-4) + ' seed=' + seed);
    try {
      const r = await fetch(OPENAI_BASE + '/chat/completions', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: seededUserMessage }],
          max_tokens: maxTokens, temperature,
          ...(responseFormat ? { response_format: responseFormat } : {})
        }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        console.error('[llm][' + stage + '] OpenAI ' + r.status, err.substring(0, 200));
        const isQuota = (r.status === 429 || r.status === 402 || r.status === 400) &&
          (err.includes('insufficient_quota') || err.includes('quota') || err.includes('billing') || err.includes('billing_hard_limit') || err.includes('billing_limit') || err.includes('credit'));
        return { ok: false, status: r.status, err, quotaExhausted: isQuota };
      }
      const data = await r.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      console.log('[llm][' + stage + '] openai ok len=' + text.length);
      return { ok: true, text, provider: 'openai', model };
    } catch (e) {
      clearTimeout(t);
      return { ok: false, status: 0, err: e.message || String(e) };
    }
  }

  async function _anthropic(model) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    console.log('[llm][' + stage + '] anthropic model=' + model + ' seed=' + seed);
    // Claude has no native JSON mode — inject instruction into system prompt
    const claudeSystem = responseFormat
      ? systemPrompt + '\n\nCRITICAL: Return ONLY valid JSON. First character must be { and last must be }. No markdown fences, no commentary, no text before or after.'
      : systemPrompt;
    try {
      const r = await fetch(ANTHROPIC_BASE + '/messages', {
        method: 'POST', cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system: claudeSystem,
          messages: [{ role: 'user', content: seededUserMessage }]
        }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        console.error('[llm][' + stage + '] Anthropic ' + r.status, err.substring(0, 200));
        return { ok: false, status: r.status, err };
      }
      const data = await r.json();
      const text = (data.content && data.content[0] && data.content[0].text) || '';
      console.log('[llm][' + stage + '] anthropic ok model=' + model + ' len=' + text.length);
      return { ok: true, text, provider: 'anthropic', model };
    } catch (e) {
      clearTimeout(t);
      return { ok: false, status: 0, err: e.message || String(e) };
    }
  }

  async function _gemini(model) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const combined = systemPrompt + '\n\n---\nUSER REQUEST:\n' + seededUserMessage;
    console.log('[llm][' + stage + '] gemini model=' + model + ' seed=' + seed);
    try {
      const r = await fetch(
        GEMINI_BASE + '/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(geminiKey),
        {
          method: 'POST', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: combined }] }],
            generationConfig: {
              temperature, maxOutputTokens: maxTokens,
              ...(responseFormat ? { responseMimeType: 'application/json' } : {}),
              // thinkingConfig only for 2.5 thinking models — causes 400 on 2.0-flash/lite
              ...(responseFormat && model.includes('2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {})
            }
          }),
          signal: ctrl.signal
        }
      );
      clearTimeout(t);
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        console.error('[llm][' + stage + '] Gemini ' + r.status + ' model=' + model, err.substring(0, 200));
        return { ok: false, status: r.status, err };
      }
      const data = await r.json();
      const text = (
        data.candidates && data.candidates[0] &&
        data.candidates[0].content && data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text
      ) || '';
      console.log('[llm][' + stage + '] gemini ok model=' + model + ' len=' + text.length);
      return { ok: true, text, provider: 'gemini', model };
    } catch (e) {
      clearTimeout(t);
      return { ok: false, status: 0, err: e.message || String(e) };
    }
  }

  async function _grok(model) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    console.log('[llm][' + stage + '] grok model=' + model + ' seed=' + seed);
    try {
      const r = await fetch(GROK_BASE + '/chat/completions', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + grokKey },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: seededUserMessage }],
          max_tokens: maxTokens, temperature,
          ...(responseFormat ? { response_format: responseFormat } : {})
        }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        console.error('[llm][' + stage + '] Grok ' + r.status, err.substring(0, 200));
        return { ok: false, status: r.status, err };
      }
      const data = await r.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      console.log('[llm][' + stage + '] grok ok model=' + model + ' len=' + text.length);
      return { ok: true, text, provider: 'grok', model };
    } catch (e) {
      clearTimeout(t);
      return { ok: false, status: 0, err: e.message || String(e) };
    }
  }

  // ── Helper: is this a retryable error (rate limit / model issue) ────────────
  function isRetryable(status) {
    return status === 429 || status === 503 || status === 404 || status === 400 || status === 529;
  }

  // ── 4-provider cascade ──────────────────────────────────────────────────────
  let result = null;
  let openaiKeysExhausted = 0;

  // === 1. OpenAI (ChatGPT) ===
  if (openaiKeys.length > 0) {
    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';
    for (let ki = 0; ki < openaiKeys.length; ki++) {
      result = await _openai(model, openaiKeys[ki]);
      if (result.ok) break;
      if (result.quotaExhausted) {
        openaiKeysExhausted++;
        console.warn('[llm][' + stage + '] OpenAI key #' + (ki + 1) + ' quota exhausted — rotating');
        continue;
      }
      // Rate limit or other error → fall to next provider
      console.warn('[llm][' + stage + '] OpenAI ' + result.status + ' — falling through to Claude');
      break;
    }
    if (result.ok) {
      return { text: result.text, provider: result.provider, model: result.model, seed,
               quota_warning: openaiKeysExhausted > 0, exhausted_keys: openaiKeysExhausted };
    }
  }

  // === 2. Anthropic (Claude) ===
  if (anthropicKey && (!result || !result.ok)) {
    console.warn('[llm][' + stage + '] Trying Anthropic (Claude)');
    const claudeModels = [
      process.env.ANTHROPIC_TEXT_MODEL || 'claude-3-5-haiku-20241022',
      'claude-3-5-sonnet-20241022'
    ];
    for (const model of claudeModels) {
      result = await _anthropic(model);
      if (result.ok) break;
      if (isRetryable(result.status)) {
        console.warn('[llm][' + stage + '] Anthropic ' + result.status + ' on ' + model + ' — trying next Claude model');
        continue;
      }
      break; // auth or server error
    }
    if (result.ok) {
      return { text: result.text, provider: result.provider, model: result.model, seed,
               quota_warning: openaiKeysExhausted > 0, exhausted_keys: openaiKeysExhausted };
    }
  }

  // === 3. Gemini ===
  //    De-duplicate: env var might equal a hardcoded fallback
  if (geminiKey && (!result || !result.ok)) {
    console.warn('[llm][' + stage + '] Trying Gemini');
    const _gmRaw = [
      process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite'
    ];
    const _gmSeen = new Set();
    const geminiModels = _gmRaw.filter(m => { if (_gmSeen.has(m)) return false; _gmSeen.add(m); return true; });
    for (const model of geminiModels) {
      result = await _gemini(model);
      if (result.ok) break;
      if (isRetryable(result.status)) {
        console.warn('[llm][' + stage + '] Gemini ' + result.status + ' on ' + model + ' — trying next');
        continue;
      }
      break;
    }
    if (result.ok) {
      return { text: result.text, provider: result.provider, model: result.model, seed,
               quota_warning: openaiKeysExhausted > 0, exhausted_keys: openaiKeysExhausted };
    }
  }

  // === 4. Grok (xAI) ===
  if (grokKey && (!result || !result.ok)) {
    console.warn('[llm][' + stage + '] Trying Grok (xAI)');
    const grokModels = [
      process.env.GROK_TEXT_MODEL || 'grok-3-mini-fast',
      'grok-3-mini'
    ];
    for (const model of grokModels) {
      result = await _grok(model);
      if (result.ok) break;
      if (isRetryable(result.status)) {
        console.warn('[llm][' + stage + '] Grok ' + result.status + ' on ' + model + ' — trying next');
        continue;
      }
      break;
    }
    if (result.ok) {
      return { text: result.text, provider: result.provider, model: result.model, seed,
               quota_warning: openaiKeysExhausted > 0, exhausted_keys: openaiKeysExhausted };
    }
  }

  // === All providers exhausted ===
  const errMsg = (result && result.err) ? String(result.err).substring(0, 250) : 'All providers exhausted';
  const status = result && result.status;
  throw new Error(
    'All providers failed [' + stage + '] status=' + (status || 'none') + ': ' + errMsg
  );
};

/**
 * parseJSON(text) — multi-strategy JSON extractor.
 * Handles: clean JSON, markdown fences, prose prefix/suffix, nested fences.
 */
module.exports.parseJSON = function parseJSON(text) {
  if (!text || typeof text !== 'string') throw new SyntaxError('Empty or non-string LLM response');
  try { return JSON.parse(text); } catch (_) {}
  const stripped = text.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/m, '').trim();
  try { return JSON.parse(stripped); } catch (_) {}
  const bs = text.indexOf('{'), be = text.lastIndexOf('}');
  if (bs !== -1 && be > bs) { try { return JSON.parse(text.slice(bs, be + 1)); } catch (_) {} }
  const ss = stripped.indexOf('{'), se = stripped.lastIndexOf('}');
  if (ss !== -1 && se > ss) { try { return JSON.parse(stripped.slice(ss, se + 1)); } catch (_) {} }
  throw new SyntaxError('Could not parse JSON from LLM response. First 200 chars: ' + text.substring(0, 200));
};

/**
 * corsHeaders(res) — apply standard CORS to a Vercel response.
 */
module.exports.corsHeaders = function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};
