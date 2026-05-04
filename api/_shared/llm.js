'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Shared LLM caller — OpenAI (multi-key) → Gemini waterfall
// Used by all pipeline stages. Keeps provider logic in ONE place.
//
// Multi-key support (v90):
//   • Tries OPENAI_API_KEY → OPENAI_API_KEY_2 → OPENAI_API_KEY_3 in sequence
//   • Rotates on 429 with insufficient_quota error code (billing quota)
//   • Falls back to Gemini on rate-limit 429 (non-quota)
//   • Sets result._quota_exhausted_keys = count of exhausted OpenAI keys
//   • Sets result._quota_warning if all OpenAI keys exhausted but Gemini succeeded
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
 * Returns { text, provider, model, seed, quota_warning?, exhausted_keys? }
 * Throws on provider error or timeout.
 */
module.exports = async function callLLM(opts) {
  const {
    systemPrompt = '',
    userMessage = '',
    responseFormat = null,
    maxTokens = 2000,
    temperature = 0.7,
    timeoutMs = 30000,
    stage = 'llm'
  } = opts;

  // Collect all configured OpenAI keys (primary + backups)
  const openaiKeys = [
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEY_2,
    process.env.OPENAI_API_KEY_3
  ].filter(Boolean);

  const geminiKey = process.env.GEMINI_API_KEY;

  if (openaiKeys.length === 0 && !geminiKey) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY in Vercel env.');
  }

  const primaryProvider = openaiKeys.length > 0 ? 'openai' : 'gemini';
  const seed = genSeed();
  const seededUserMessage = userMessage + '\n\n<!-- gen_seed:' + seed + ' -->';

  // ── Internal fetch helper: OpenAI (accepts specific key) ────────────────────
  async function _openai(model, key) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    console.log('[llm][' + stage + '] openai model=' + model + ' temp=' + temperature + ' maxTokens=' + maxTokens + ' seed=' + seed + ' key_suffix=...' + key.slice(-4));
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
        const errText = await r.text().catch(() => '');
        console.error('[llm][' + stage + '] OpenAI ' + r.status, errText.substring(0, 200));
        // Detect quota exhaustion — OpenAI returns 429 with code=insufficient_quota
        const isQuotaExhausted = r.status === 429 &&
          (errText.includes('insufficient_quota') || errText.includes('quota') || errText.includes('billing'));
        return { ok: false, status: r.status, err: errText, quotaExhausted: isQuotaExhausted };
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

  // ── Internal fetch helper: Gemini ────────────────────────────────────────
  async function _gemini(model) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const combined = systemPrompt + '\n\n---\nUSER REQUEST:\n' + seededUserMessage;
    console.log('[llm][' + stage + '] gemini model=' + model + ' temp=' + temperature + ' maxTokens=' + maxTokens + ' seed=' + seed);
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
              ...(responseFormat ? { responseMimeType: 'application/json' } : {})
            }
          }),
          signal: ctrl.signal
        }
      );
      clearTimeout(t);
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        console.error('[llm][' + stage + '] Gemini ' + r.status + ' model=' + model, err.substring(0, 200));
        return { ok: false, status: r.status, err, model };
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
      return { ok: false, status: 0, err: e.message || String(e), model };
    }
  }

  // ── Model cascade ─────────────────────────────────────────────────────────
  let result = null;
  let openaiKeysExhausted = 0;
  let allKeysQuotaExhausted = false;

  if (primaryProvider === 'openai') {
    const oModel = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';

    // Try each OpenAI key in sequence — rotate on quota exhaustion
    for (let ki = 0; ki < openaiKeys.length; ki++) {
      result = await _openai(oModel, openaiKeys[ki]);
      if (result.ok) break;

      if (result.quotaExhausted) {
        openaiKeysExhausted++;
        console.warn('[llm][' + stage + '] OpenAI key #' + (ki + 1) + ' quota exhausted — trying next key (' + (ki + 2) + '/' + openaiKeys.length + ')');
        continue; // try next key
      }

      // Non-quota error (rate limit 429, 500, etc.)
      if (result.status === 429 && geminiKey) {
        console.warn('[llm][' + stage + '] OpenAI 429 (rate limit) on key #' + (ki + 1) + ' — falling back to Gemini');
        break; // handled below
      }
      break; // other error (400, 401, 500) — stop OpenAI cascade
    }

    // All OpenAI keys exhausted → fall back to Gemini
    if (!result.ok && openaiKeysExhausted === openaiKeys.length && geminiKey) {
      allKeysQuotaExhausted = true;
      console.warn('[llm][' + stage + '] All ' + openaiKeys.length + ' OpenAI key(s) quota exhausted — trying Gemini fallback');
      for (const gm of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash-8b']) {
        result = await _gemini(gm);
        if (result.ok) break;
        // 404 = model not found/deprecated (continue to next model, not just rate-limit)
        if (result.status === 429 || result.status === 503 || result.status === 404) {
          console.warn('[llm][' + stage + '] Gemini ' + result.status + ' on ' + gm + ' — trying next Gemini model');
          continue;
        }
        break;
      }
    }
    // OpenAI rate-limit (non-quota) → fall back to Gemini
    else if (!result.ok && result.status === 429 && !result.quotaExhausted && geminiKey) {
      for (const gm of ['gemini-2.0-flash', 'gemini-2.0-flash-lite']) {
        result = await _gemini(gm);
        if (result.ok || (result.status !== 429 && result.status !== 404)) break;
      }
    }

  } else {
    // Gemini primary — cascade models on 429/503/404 (each model has its own quota bucket)
    const geminiCascade = [
      process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash', // latest — highest capability
      'gemini-2.0-flash',                                   // stable, separate quota bucket
      'gemini-2.0-flash-lite',                              // fastest, highest free quota
      'gemini-1.5-flash-8b'                                 // lightweight fallback
    ];
    for (const gm of geminiCascade) {
      result = await _gemini(gm);
      if (result.ok) break;
      // 429 = rate limited, 503 = RESOURCE_EXHAUSTED, 404 = model deprecated/not found
      // All three: try next model (different quota bucket or model)
      if (result.status === 429 || result.status === 503 || result.status === 404) {
        console.warn('[llm][' + stage + '] Gemini ' + result.status + ' on ' + gm + ' — trying next model');
        continue; // try next model immediately — separate quota bucket
      }
      break; // other error (400, 401, 500) — stop cascade, won't help
    }
    // All Gemini models rate-limited → try OpenAI keys if available
    if (!result.ok && (result.status === 429 || result.status === 503) && openaiKeys.length > 0) {
      const oModel = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';
      console.warn('[llm][' + stage + '] All Gemini models rate-limited — trying OpenAI fallback');
      for (let ki = 0; ki < openaiKeys.length; ki++) {
        result = await _openai(oModel, openaiKeys[ki]);
        if (result.ok) break;
        if (result.quotaExhausted) {
          openaiKeysExhausted++;
          console.warn('[llm][' + stage + '] OpenAI key #' + (ki + 1) + ' quota exhausted during Gemini fallback — trying next');
          continue;
        }
        break;
      }
    }
  }

  if (!result || !result.ok) {
    const errMsg = (result && result.err) ? result.err : 'All providers failed';
    const status = result && result.status;
    const isQuota = allKeysQuotaExhausted || (result && result.quotaExhausted);
    throw new Error(
      (isQuota
        ? 'OpenAI quota exhausted on all ' + openaiKeys.length + ' key(s)'
        : status === 429 || status === 503
          ? 'Rate limited (' + status + ')'
          : 'Provider error ' + (status || '')) +
      ' [' + stage + ']: ' + String(errMsg).substring(0, 250)
    );
  }

  return {
    text: result.text,
    provider: result.provider,
    model: result.model,
    seed,
    // Surfaced so callers can show user-facing notes
    quota_warning: allKeysQuotaExhausted || openaiKeysExhausted > 0,
    exhausted_keys: openaiKeysExhausted
  };
};

/**
 * parseJSON(text) — multi-strategy JSON extractor.
 * Handles: clean JSON, markdown fences, prose prefix/suffix (Gemini habit), nested fences.
 * Throws SyntaxError only when all strategies fail.
 */
module.exports.parseJSON = function parseJSON(text) {
  if (!text || typeof text !== 'string') throw new SyntaxError('Empty or non-string LLM response');

  // 1. Direct parse (fastest path — clean JSON response)
  try { return JSON.parse(text); } catch (_) {}

  // 2. Strip markdown fences (```json ... ``` or ``` ... ```)
  const stripped = text.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/m, '').trim();
  try { return JSON.parse(stripped); } catch (_) {}

  // 3. Extract first complete { ... } block — handles Gemini prose-before-JSON habit
  //    Uses a greedy match from first { to last } to capture nested objects correctly
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try { return JSON.parse(text.slice(braceStart, braceEnd + 1)); } catch (_) {}
  }

  // 4. Same extraction on the stripped version (catches fence + prose combo)
  const strippedStart = stripped.indexOf('{');
  const strippedEnd = stripped.lastIndexOf('}');
  if (strippedStart !== -1 && strippedEnd > strippedStart) {
    try { return JSON.parse(stripped.slice(strippedStart, strippedEnd + 1)); } catch (_) {}
  }

  // All strategies failed — throw with context
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
