'use strict';
// ════════════════════════════════════════════════════════════════════════════
// /api/ai/pipeline/html  — Stage 4: HTML generation per variant
//
// Receives the variant's creative plan (sections, layout, copy) and generates
// production-grade email HTML. TIGHTLY BOUND to the layout_plan — not a
// generic template. Image URLs are passed as placeholders that the client
// replaces after generation.
//
// POST body:  { variant, variant_plan, strategy_output, market, products[], brief }
// Response:   { ok, variant, html, subject_lines[], preheader, char_count }
// ════════════════════════════════════════════════════════════════════════════

const { corsHeaders } = require('../../_shared/llm');
const callLLM = require('../../_shared/llm');

const SYSTEM = `You are a senior email HTML engineer building production-grade email creatives for VAHDAM India — a premium $100M D2C tea brand. You receive a FULLY SPECIFIED creative plan and generate exact, pixel-perfect HTML.

━━ ABSOLUTE RULES ━━
1. TABLE-BASED LAYOUT ONLY. Every layout element uses <table>, <tr>, <td>. No <div> for structure.
2. 600px max-width. Outer wrapper: <table width="100%" bgcolor="#fdf6e8"><tr><td align="center"><table width="600" ...>.
3. INLINE CSS ONLY. No <style> blocks (Outlook strips them). No external stylesheets.
4. Mobile: use align="center" + max-width style on inner tables. Stackable on 480px viewport.
5. ALL images: width="600" or proportional, alt="...", border="0", display:block, max-width:100%.
6. IMAGE PLACEHOLDERS (replace these exactly as written):
   {{HERO_IMAGE_URL}}      → hero section image
   {{PRODUCT_IMAGE_URL}}   → product section image
   {{LIFESTYLE_IMAGE_URL}} → lifestyle section image
7. Google Fonts link: <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"> in <head>.
8. FOLLOW THE PROVIDED LAYOUT PLAN EXACTLY. Do not invent sections. Do not reorder sections.
9. Output limit: ≤80KB. Do not pad with unnecessary whitespace.
10. Start with <!DOCTYPE html>. End with </html>. No explanations. No markdown.

━━ COLOR PALETTE (hardcode these — never deviate) ━━
Background:   #fdf6e8  (cream)
Dark green:   #0f2a1c  (headings, nav bar, footer)
Amber gold:   #d4873a  (CTA buttons, accent borders, offer badges)
Body text:    #1a1a1a
Muted text:   #5c5047
Dividers:     #e5ddd0
Button text:  #ffffff

━━ TYPOGRAPHY (inline, always) ━━
Headings:  font-family:'Cormorant Garamond',Georgia,serif; font-weight:600; color:#0f2a1c; letter-spacing:0.02em;
Eyebrow:   font-family:'DM Sans',Arial,sans-serif; font-size:11px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase; color:#d4873a;
Body:      font-family:'DM Sans',Arial,sans-serif; font-size:15px; line-height:1.65; color:#1a1a1a;
CTA:       font-family:'DM Sans',Arial,sans-serif; font-size:13px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase;

━━ VARIANT A STRUCTURAL SIGNATURE ━━
- Announcement bar: forest green background, amber text, 1 line
- Hero: split table (2 cells) or centered with copy below image
- Benefit strip: 3 cells in one row, icon (emoji or SVG) + short caption each
- Product cards: 2-3 per row, each with image + name + price + button
- CTA button: bgcolor="#d4873a", 48px height, 200px min-width, border-radius:4px
- Offer banner: full-width, bgcolor="#0f2a1c", white text, centered

━━ VARIANT B STRUCTURAL SIGNATURE ━━
- No announcement bar
- Hero: full-width image (600px wide), headline below in editorial style
- Narrative: single full-width prose block, 20px+ font, generous line-height (1.8)
- Lifestyle: full-width image + right-aligned italic caption
- Product: single large product image + editorial description (NO price grid)
- Origin proof: dark green section, italic estate/sourcing quote, amber accent border-left
- CTA: ghost-style button (border:2px solid #0f2a1c, transparent bg, dark text) OR plain text link
- Offer: subtle 1-line inline mention, no banner

━━ SECTION HTML PATTERN ━━
Each section should be wrapped:
<!-- SECTION: [section_id] -->
<tr><td style="padding:[top]px 40px [bottom]px;">
  [section content]
</td></tr>
<!-- END: [section_id] -->

This allows the scoring stage to parse section structure.

━━ FOOTER (always include) ━━
Dark green footer: VAHDAM India logo text, address, unsubscribe link.
Style: bgcolor="#0f2a1c", padding:32px 40px, font-size:12px, color:#fdf6e8.`;

module.exports = async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { return res.status(400).json({ error: 'invalid_json' }); }
  }
  body = body || {};

  const variant_plan = body.variant_plan || {};
  const strategy_output = body.strategy_output || {};
  const variant = (body.variant || variant_plan.variant || 'A').toString().toUpperCase() === 'B' ? 'B' : 'A';
  const market = (body.market || 'US').toString();
  const products = Array.isArray(body.products) ? body.products : [];
  const brief = (body.brief || '').toString().substring(0, 300);

  // Serialize sections for the prompt — keep prompt size under control
  const sections = (Array.isArray(variant_plan.sections) ? variant_plan.sections : []).slice(0, 8);
  const sectionsBlock = sections.map(s => {
    const copy = s.copy || {};
    return `[${s.id}] type:${s.type} | layout:${s.layout || 'standard'} | image_slot:${s.image_slot || 'none'}
  copy: eyebrow="${copy.eyebrow || ''}" | headline="${copy.headline || ''}" | subcopy="${copy.subcopy || ''}" | cta="${copy.cta || ''}"
  purpose: ${s.purpose || ''}`;
  }).join('\n\n');

  const productsBlock = products.slice(0, 4)
    .map(p => `- "${p.name || p.n || ''}" | $${p.price || '?'} | URL:${p.url || '#'} | img:${p.image_url || p.i || '{{PRODUCT_IMAGE_URL}}'}`)
    .join('\n');

  const layoutPlan = variant_plan.layout_plan || {};
  const copyFramework = variant_plan.copy_framework || {};

  const userMessage = `━━ VARIANT ${variant} BRIEF ━━
Strategy: ${strategy_output.strategy || ''}
Theme: ${(strategy_output.theme && strategy_output.theme.name) || ''}
Market: ${market}

━━ LAYOUT PLAN (follow exactly) ━━
${JSON.stringify(layoutPlan, null, 2)}

━━ COPY FRAMEWORK ━━
Tone: ${copyFramework.tone || ''} | Voice: ${copyFramework.voice || ''} | CTA verb: ${copyFramework.cta_verb || 'Shop'}

━━ SECTIONS TO BUILD (in order) ━━
${sectionsBlock || '(no sections provided — generate standard ' + variant + ' layout)'}

━━ PRODUCTS ━━
${productsBlock || '(none — do not show product cards)'}

━━ IMAGE PLACEHOLDERS ━━
Use exactly these strings where images go:
- Hero image:      {{HERO_IMAGE_URL}}
- Product image:   {{PRODUCT_IMAGE_URL}}
- Lifestyle image: {{LIFESTYLE_IMAGE_URL}}

━━ BRIEF ━━
${brief}

Generate the complete Variant ${variant} HTML now. Start with <!DOCTYPE html>. Follow every layout, typography, and structural rule from your instructions. Wrap each section with <!-- SECTION: [id] --> comments.`;

  try {
    const { text, provider, model } = await callLLM({
      systemPrompt: SYSTEM,
      userMessage,
      maxTokens: 8500,
      temperature: 0.25,  // Low — deterministic HTML, not creative
      timeoutMs: 50000
    });

    // Strip accidental markdown fences
    let html = text.trim();
    if (html.startsWith('```html')) html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
    else if (html.startsWith('```')) html = html.replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

    // Validate it looks like HTML
    if (!html.includes('<table') || !html.includes('</html>')) {
      return res.status(502).json({ error: 'html_invalid', detail: 'Response does not contain valid email HTML', raw: html.substring(0, 400) });
    }

    return res.status(200).json({
      ok: true,
      stage: 'html',
      provider,
      model,
      variant,
      html,
      char_count: html.length,
      subject_lines: variant_plan.subject_lines || [],
      preheader: variant_plan.preheader || ''
    });

  } catch (e) {
    return res.status(500).json({ error: 'html_gen_failed', stage: 'html', variant, detail: String(e.message || e).substring(0, 300) });
  }
};
