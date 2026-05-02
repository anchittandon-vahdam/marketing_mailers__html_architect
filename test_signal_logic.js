// ═══════════════════════════════════════════════════════════════
// VAHDAM MAILER ARCHITECT — SIGNAL LOGIC TEST HARNESS
// Tests all 7 definitive test cases against the fixed logic.
// Run: node test_signal_logic.js
// ═══════════════════════════════════════════════════════════════

function has(p, ...kws) { return kws.some(k => p.toLowerCase().includes(k)); }

// ── Simulates the key signal extraction used in buildEnhancedPrompt ──
function getSignals(raw) {
  // Layer 1: preField = everything BEFORE any labeled field
  const preFieldL = (raw || '').split(/\n\n?(?:PRODUCT FOCUS|OFFER|AUDIENCE|TONE|KEY HOOK|MULTI-MARKET)\s*:/i)[0].toLowerCase();
  // Layer 2: PRODUCT FOCUS field value
  const pfFieldMatch = (raw || '').match(/PRODUCT FOCUS\s*:?\s*([^\n]+)/i);
  const pfFieldL = pfFieldMatch ? pfFieldMatch[1].toLowerCase() : '';
  // catSrc = THE ONLY trusted source for product/category detection
  const catSrc = preFieldL + ' ' + pfFieldL;
  // pct + oc = full raw (% and promo codes can appear anywhere)
  const pctMatch = raw.match(/(\d{1,3})\s*%\s*off/i);
  const pct = pctMatch ? pctMatch[1] : null;
  const ocMatch = raw.match(/(?:code|coupon|use)\s*[:\-]?\s*([A-Z][A-Z0-9]{2,15})/i);
  const oc = ocMatch ? ocMatch[1].toUpperCase() : null;
  return { src: catSrc, pct, oc };
}

// ── Simulates the hookLine waterfall (the critical fixed section) ──
function getHookLine(raw) {
  const sig = getSignals(raw);
  const pct = sig.pct;
  const oc = sig.oc;

  // % discount hooks (scan full raw — pct can appear anywhere)
  const catL = sig.src;
  let cat = null;
  if (has(catL, 'chai', 'masala')) cat = 'Masala Chai Collection';
  else if (has(catL, 'darjeeling', 'first flush')) cat = 'Darjeeling Teas';
  else if (has(catL, 'green tea', 'himalayan green')) cat = 'Green Teas';
  else if (has(catL, 'turmeric', 'ginger')) cat = 'Turmeric & Ginger Teas';
  else if (has(catL, 'wellness', 'immunity', 'detox')) cat = 'Wellness Teas';

  if (pct && cat)
    return { hook: `${pct}% off our ${cat} — farm-direct from Indian estates, freshness-sealed at source`, branch: 'pct+cat' };
  if (pct && oc)
    return { hook: `${pct}% off with code ${oc} — India's finest teas at your best price yet`, branch: 'pct+oc' };
  if (pct)
    return { hook: `${pct}% off — farm-direct Indian teas, freshness-sealed, at your best price yet`, branch: 'pct' };

  // Occasion checks (highest intent) — uses sig.src ONLY
  if (has(sig.src, "mother's day", "mothers day", "mum's day", 'mum', 'mom'))
    return { hook: "The gift that shows how much you care — premium Indian tea, beautifully packaged", branch: "mother's day" };
  if (has(sig.src, "father's day", 'dad', 'father'))
    return { hook: "For the dad who deserves something extraordinary — premium Indian tea, gift-ready", branch: "father's day" };
  if (has(sig.src, 'diwali'))
    return { hook: "Gift the taste of India this Diwali — premium teas, beautifully presented", branch: 'diwali' };
  if (has(sig.src, 'christmas', 'holiday season'))
    return { hook: "The gift that warms every cup this Christmas — single-estate Indian teas, beautifully boxed", branch: 'christmas' };
  if (has(sig.src, 'eid', 'ramadan'))
    return { hook: "Celebrate with the finest teas from India — premium, gifted with love", branch: 'eid' };

  // Specific product checks — BEFORE generic category checks (THE CRITICAL ORDER FIX)
  if (has(sig.src, 'first flush', '2026', 'arya', 'jungpana', 'giddapahar', 'muscatel'))
    return { hook: "A once-a-year harvest — the finest Darjeeling First Flush, available now before it sells out", branch: 'first flush' };
  if (has(sig.src, 'chai', 'masala'))
    return { hook: "The most authentic masala chai outside India — bold, warming, utterly real", branch: 'chai' };
  if (has(sig.src, 'darjeeling'))
    return { hook: "Single-estate Darjeeling — hand-picked from the Himalayan foothills, the world's most coveted tea", branch: 'darjeeling' };
  if (has(sig.src, 'assam', 'english breakfast', 'breakfast tea'))
    return { hook: "Bold, malty Assam — the world's definitive breakfast tea, sourced direct from estate", branch: 'assam' };
  if (has(sig.src, 'green tea', 'himalayan green', 'mint melody', 'matcha'))
    return { hook: "Pure Himalayan green tea — antioxidant-rich, farm-direct, brewed in minutes", branch: 'green tea' };
  if (has(sig.src, 'earl grey'))
    return { hook: "The finest Earl Grey — bergamot and Indian black tea, a timeless classic perfected", branch: 'earl grey' };
  if (has(sig.src, 'oolong'))
    return { hook: "High-mountain oolong — complex, smooth, and extraordinary from India's rarest gardens", branch: 'oolong' };
  if (has(sig.src, 'white tea', 'silver needle'))
    return { hook: "Rare silver needle white tea — the most delicate, antioxidant-rich tea on earth", branch: 'white tea' };
  if (has(sig.src, 'ashwagandha'))
    return { hook: "Clinically studied adaptogen — 5,000 years of Ayurvedic wisdom, now in your daily cup", branch: 'ashwagandha' };
  if (has(sig.src, 'moringa'))
    return { hook: "92 nutrients, 46 antioxidants — moringa is the most nutrient-dense plant on earth", branch: 'moringa' };
  if (has(sig.src, 'turmeric', 'ginger turmeric', 'turmeric ginger'))
    return { hook: "Turmeric + ginger + black pepper — nature's most powerful anti-inflammatory trio, in your cup", branch: 'turmeric' };
  if (has(sig.src, 'vedic kadha', 'kadha'))
    return { hook: "Ancient Ayurvedic kadha — centuries of immunity wisdom, freshness-sealed from Indian farms", branch: 'kadha' };
  if (has(sig.src, 'sleep', 'chamomile', 'butterfly pea', 'spearmint'))
    return { hook: "Your natural wind-down ritual — pure, calming, caffeine-free botanicals from Indian farms", branch: 'sleep' };

  // Generic category — only reached if no specific product matched
  if (has(sig.src, 'sampler', 'discovery', 'explore', 'variety', 'assorted'))
    return { hook: "One box, the best of Indian tea — find your new favourite and never look back", branch: 'sampler' };
  if (has(sig.src, 'bestseller', 'most loved', '50,000', 'popular', 'top seller'))
    return { hook: "50,000+ customers choose these every day — join them and taste the difference", branch: 'bestseller' };
  if (has(sig.src, 'immunity', 'detox', 'wellness', 'gut health'))
    return { hook: "Nature's most powerful wellness botanicals — straight from Indian farms to your cup", branch: 'wellness/immunity' };
  if (has(sig.src, 'routine', 'daily', 'morning', 'ritual', 'every morning', 'habit'))
    return { hook: "The one ritual that makes every morning worth waking up for — pure, farm-direct Indian tea", branch: 'routine' };
  if (has(sig.src, 'gift', 'gifting', 'hamper', 'present'))
    return { hook: "The gift they'll actually use — premium Indian tea, beautifully packaged and freshness-sealed", branch: 'gift' };
  if (has(sig.src, 'premium', 'luxury', 'finest', 'rare', 'single estate'))
    return { hook: "Rare, single-estate teas — hand-picked from the world's highest tea gardens, for those who know the difference", branch: 'premium' };

  return { hook: "Your best price yet on India's finest teas — farm-direct, ethically sourced, freshness-sealed", branch: 'fallback' };
}

// ── Simulates audienceLine detection ──
function getAudienceLine(raw) {
  const sig = getSignals(raw);
  let base = 'US wellness shoppers, 28–45, health-conscious D2C buyers';
  if (has(sig.src, "mother's day", "mothers day", 'mum', 'mom', 'dad', 'father', "father's day"))
    return base + ' — gifting occasion, emotionally driven purchase';
  if (has(sig.src, 'diwali', 'christmas', 'festive', 'holiday', 'eid', 'raksha'))
    return base + ' — festive shoppers, gifting mindset, occasion urgency';
  if (has(sig.src, 'chai', 'masala'))
    return base + ' — chai & spiced tea lovers, Indian diaspora, spice-forward palates';
  if (has(sig.src, 'darjeeling', 'first flush', 'muscatel'))
    return base + ' — premium tea connoisseurs, single-estate enthusiasts';
  if (has(sig.src, 'green tea', 'matcha', 'himalayan green'))
    return base + ' — health-conscious consumers, antioxidant-aware buyers';
  if (has(sig.src, 'wellness', 'detox', 'immunity', 'gut health', 'moringa', 'ashwagandha', 'turmeric'))
    return base + ' — health-first buyers, repeat purchase potential';
  return base;
}

// ── Simulates occasion detection in extractPromptSignals ──
function getOccasion(raw) {
  const preFieldL = (raw || '').split(/\n\n?(?:PRODUCT FOCUS|OFFER|AUDIENCE|TONE|KEY HOOK|MULTI-MARKET)\s*:/i)[0].toLowerCase();
  const pfFieldMatch = (raw || '').match(/PRODUCT FOCUS\s*:?\s*([^\n]+)/i);
  const pfFieldL = pfFieldMatch ? pfFieldMatch[1].toLowerCase() : '';
  const catSrc = preFieldL + ' ' + pfFieldL;

  const occasionTable = [
    [["mother's day", 'mothers day', "mum's day", 'mom'], "For the One Who Deserves the Best.", "For Mum."],
    [['diwali', 'deepawali'], "Celebrate Diwali with Tea.", "This Festive Season."],
    [['christmas', 'xmas', 'holiday season'], "The Gift That Warms Every Cup.", "This Christmas."],
    [["valentine's", 'valentines', 'love'], "Love in Every Sip.", "This Valentine's Day."],
    [['eid', 'ramadan'], "Celebrate Eid.", "Premium Indian Teas for the Occasion."],
    [['father', 'dad'], "For the Dad Who", "Deserves the Finest."],
    [['new year', 'nye'], "New Year.", "A New Tea Ritual."],
    [['summer'], "Summer in", "Every Sip."],
  ];

  for (const [keys, line1, line2] of occasionTable) {
    if (keys.some(k => catSrc.includes(k))) return { line1, line2 };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════
let passed = 0;
let failed = 0;
const results = [];

function test(id, description, raw, checks) {
  const sig = getSignals(raw);
  const hook = getHookLine(raw);
  const aud = getAudienceLine(raw);
  const occ = getOccasion(raw);

  const context = { sig, hook, aud, occ };
  const failures = [];

  for (const [label, assertion] of Object.entries(checks)) {
    const pass = assertion(context);
    if (!pass) failures.push(label);
  }

  const status = failures.length === 0 ? '✅ PASS' : '❌ FAIL';
  if (failures.length === 0) passed++;
  else failed++;

  results.push({ id, description, status, failures, context });

  console.log(`\n${status} ${id}: ${description}`);
  console.log(`   src (cleanSrc): "${sig.src.trim().substring(0, 80)}..."`);
  console.log(`   pct=${sig.pct} | oc=${sig.oc}`);
  console.log(`   hookBranch: [${hook.branch}]`);
  console.log(`   hookLine: "${hook.hook.substring(0, 80)}..."`);
  if (failures.length > 0) {
    console.log(`   ⚠ FAILED ASSERTIONS: ${failures.join(', ')}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// TC-1: Chai + wellness — chai hook must fire BEFORE wellness hook
// ─────────────────────────────────────────────────────────────────
test('TC-1', 'masala chai for wellness shoppers → chai hook (not wellness)',
  'Promote masala chai for wellness shoppers',
  {
    'hookBranch must be chai (not wellness/immunity)': ({ hook }) => hook.branch === 'chai',
    'hookLine contains masala chai language': ({ hook }) => hook.hook.toLowerCase().includes('chai'),
    'hookLine must NOT say wellness botanicals': ({ hook }) => !hook.hook.toLowerCase().includes('wellness botanicals'),
    'audienceLine contains chai audience': ({ aud }) => aud.toLowerCase().includes('chai'),
    'audienceLine must NOT say health-first buyers': ({ aud }) => !aud.toLowerCase().includes('health-first buyers'),
    'src must NOT include AUDIENCE field text': ({ sig }) => !sig.src.includes('wellness shoppers'),
  }
);

// ─────────────────────────────────────────────────────────────────
// TC-2: Turmeric 20% off — pct+cat hook
// ─────────────────────────────────────────────────────────────────
test('TC-2', '20% off turmeric teas → pct+cat hook',
  'Get 20% off our turmeric teas this weekend',
  {
    'pct detected as 20': ({ sig }) => sig.pct === '20',
    'hookBranch is pct+cat': ({ hook }) => hook.branch === 'pct+cat',
    'hookLine contains 20%': ({ hook }) => hook.hook.includes('20%'),
    'hookLine contains turmeric': ({ hook }) => hook.hook.toLowerCase().includes('turmeric'),
  }
);

// ─────────────────────────────────────────────────────────────────
// TC-3: Re-enhancement isolation — AUDIENCE field words must NOT affect hookLine
// ─────────────────────────────────────────────────────────────────
test('TC-3', 'Re-enhanced prompt: AUDIENCE field "wellness" must not override chai hook',
  `Masala chai campaign for Indian diaspora

PRODUCT FOCUS: India's Original Masala Chai 100ct, Cardamom Masala Chai
OFFER: Free shipping on orders $49+
AUDIENCE: US wellness shoppers, health-conscious D2C buyers — chai & spiced tea lovers
TONE: Warm, heritage-led, authentic
KEY HOOK: Bold, warming, utterly real masala chai`,
  {
    'src is preField+PRODUCT FOCUS only (does not include AUDIENCE text)': ({ sig }) =>
      !sig.src.includes('health-conscious') && !sig.src.includes('d2c buyers'),
    'hookBranch is chai (AUDIENCE wellness text did not override)': ({ hook }) => hook.branch === 'chai',
    'hookLine is about chai': ({ hook }) => hook.hook.toLowerCase().includes('chai'),
    'hookLine NOT about wellness botanicals': ({ hook }) => !hook.hook.toLowerCase().includes('wellness botanicals'),
  }
);

// ─────────────────────────────────────────────────────────────────
// TC-4: Green tea before routine — green tea must fire before routine
// ─────────────────────────────────────────────────────────────────
test('TC-4', 'green tea morning routine → green tea hook (not routine hook)',
  'Himalayan green tea for morning routine',
  {
    'hookBranch is green tea (not routine)': ({ hook }) => hook.branch === 'green tea',
    'hookLine contains green tea language': ({ hook }) => hook.hook.toLowerCase().includes('green tea'),
    'hookLine NOT about morning routine': ({ hook }) => !hook.hook.toLowerCase().includes('morning worth waking'),
    'audienceLine contains antioxidant': ({ aud }) => aud.toLowerCase().includes('antioxidant'),
  }
);

// ─────────────────────────────────────────────────────────────────
// TC-5: Mother's Day — occasion fires (no %)
// ─────────────────────────────────────────────────────────────────
test('TC-5', "Mother's Day campaign → gifting occasion hook",
  "Mother's Day gifting campaign — premium tea sets",
  {
    "hookBranch is mother's day": ({ hook }) => hook.branch === "mother's day",
    'hookLine is about gifting care': ({ hook }) => hook.hook.toLowerCase().includes('gift that shows how much you care'),
    'occasion detected correctly': ({ occ }) => occ !== null && occ.line1.includes("Deserves the Best"),
    'audienceLine contains gifting occasion': ({ aud }) => aud.toLowerCase().includes('gifting occasion'),
  }
);

// ─────────────────────────────────────────────────────────────────
// TC-6: Diwali 15% off code DIWALI15 — pct+oc fires BEFORE occasion
// ─────────────────────────────────────────────────────────────────
test('TC-6', 'Diwali 15% off code DIWALI15 → pct+oc hook fires before Diwali occasion',
  'Diwali sale — 15% off with code DIWALI15',
  {
    'pct detected as 15': ({ sig }) => sig.pct === '15',
    'oc detected as DIWALI15': ({ sig }) => sig.oc === 'DIWALI15',
    'hookBranch is pct+oc (NOT diwali occasion)': ({ hook }) => hook.branch === 'pct+oc',
    'hookLine contains 15% and DIWALI15': ({ hook }) => hook.hook.includes('15%') && hook.hook.includes('DIWALI15'),
    'hookLine NOT about Diwali gift taste': ({ hook }) => !hook.hook.toLowerCase().includes('taste of india this diwali'),
  }
);

// ─────────────────────────────────────────────────────────────────
// TC-7: Darjeeling First Flush 2026 — first-flush hook
// ─────────────────────────────────────────────────────────────────
test('TC-7', 'Darjeeling First Flush 2026 → first flush hook (most specific)',
  'Darjeeling first flush 2026 — the new harvest has arrived',
  {
    'hookBranch is first flush (most specific)': ({ hook }) => hook.branch === 'first flush',
    'hookLine mentions harvest': ({ hook }) => hook.hook.toLowerCase().includes('harvest'),
    'hookLine NOT generic darjeeling': ({ hook }) => !hook.hook.toLowerCase().includes('most coveted tea'),
  }
);

// ─────────────────────────────────────────────────────────────────
// TC-8: Wellness-only prompt — wellness hook fires (no chai/product keywords)
// ─────────────────────────────────────────────────────────────────
test('TC-8', 'Pure wellness prompt (no specific product) → wellness/immunity hook',
  'Boost immunity with our wellness teas this season',
  {
    'hookBranch is wellness/immunity': ({ hook }) => hook.branch === 'wellness/immunity',
    'hookLine contains wellness botanicals': ({ hook }) => hook.hook.toLowerCase().includes('wellness botanicals'),
    'audienceLine contains health-first buyers': ({ aud }) => aud.toLowerCase().includes('health-first buyers'),
  }
);

// ─────────────────────────────────────────────────────────────────
// TC-9: Kadha in PRODUCT FOCUS field — should trigger kadha hook
// ─────────────────────────────────────────────────────────────────
test('TC-9', 'kadha in PRODUCT FOCUS field → kadha hook via sig.src',
  `Ayurvedic immunity campaign

PRODUCT FOCUS: Vedic Kadha Herbal Tea, Turmeric Ginger Herbal Tea
AUDIENCE: US wellness buyers
TONE: Warm, Ayurvedic, heritage`,
  {
    'src includes kadha from PRODUCT FOCUS': ({ sig }) => sig.src.includes('vedic kadha'),
    'hookBranch is kadha': ({ hook }) => hook.branch === 'kadha',
    'hookLine mentions ayurvedic': ({ hook }) => hook.hook.toLowerCase().includes('ayurvedic'),
  }
);

// ─────────────────────────────────────────────────────────────────
// TC-10: occasion in AUDIENCE field only — must NOT trigger occasion detection
// ─────────────────────────────────────────────────────────────────
test('TC-10', "\"mother's day\" only in AUDIENCE field → must NOT trigger Mother's Day occasion",
  `Green tea campaign for freshness

PRODUCT FOCUS: Himalayan Green Tea, Mint Melody Green Tea
AUDIENCE: Perfect for mother's day shoppers
TONE: Fresh, clean, wellness`,
  {
    "occasion is NULL (mother's day in AUDIENCE must not fire)": ({ occ }) => occ === null,
    'hookBranch is green tea (not mothers day)': ({ hook }) => hook.branch === 'green tea',
  }
);

// ─────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${passed} PASSED | ${failed} FAILED | ${passed + failed} TOTAL`);
console.log('═'.repeat(60));
if (failed === 0) {
  console.log('\n🎉 ALL TEST CASES PASS — signal architecture is working correctly.');
} else {
  console.log('\n⚠  FAILURES DETECTED — review the cases above.');
  results.filter(r => r.failures.length > 0).forEach(r => {
    console.log(`\n  ${r.id}: ${r.description}`);
    r.failures.forEach(f => console.log(`    ✗ ${f}`));
  });
}
