#!/usr/bin/env python3
"""
VAHDAM MAILER ARCHITECT — SIGNAL LOGIC TEST HARNESS
Mirrors the fixed JS logic for all 10 test cases.
Run: python test_signal_logic.py
"""

import re

# ── has() — mirrors JS: any keyword found in p (case-insensitive) ──
def has(p, *kws):
    pl = p.lower()
    return any(k in pl for k in kws)

# ── hasWord() — word-boundary-safe version (mirrors JS hasWord) ──
def has_word(p, *kws):
    return any(bool(re.search(r'\b' + k + r'\b', p, re.IGNORECASE)) for k in kws)

# ── Extract signals: src = preField + PRODUCT FOCUS field ──
def get_signals(raw):
    # Layer 1: preField = everything BEFORE any labeled field
    pre_field = re.split(r'\n\n?(?:PRODUCT FOCUS|OFFER|AUDIENCE|TONE|KEY HOOK|MULTI-MARKET)\s*:', raw, flags=re.IGNORECASE)[0]
    pre_field_l = pre_field.lower()
    # Layer 2: PRODUCT FOCUS field value
    pf_match = re.search(r'PRODUCT FOCUS\s*:?\s*([^\n]+)', raw, re.IGNORECASE)
    pf_field_l = pf_match.group(1).lower() if pf_match else ''
    # catSrc = ONLY trusted source
    cat_src = pre_field_l + ' ' + pf_field_l
    # pct + oc scan full raw
    pct_match = re.search(r'(\d{1,3})\s*%\s*off', raw, re.IGNORECASE)
    pct = pct_match.group(1) if pct_match else None
    oc_match = re.search(r'(?:code|coupon|use)\s*[:\-]?\s*([A-Z][A-Z0-9]{2,15})', raw, re.IGNORECASE)
    oc = oc_match.group(1).upper() if oc_match else None
    return {'src': cat_src, 'pct': pct, 'oc': oc}

# ── hookLine waterfall (mirrors the fixed buildEnhancedPrompt section) ──
def get_hook_line(raw):
    sig = get_signals(raw)
    pct = sig['pct']
    oc = sig['oc']
    s = sig['src']

    # Detect category from catSrc for pct+cat branch
    cat = None
    if has(s, 'chai', 'masala'): cat = 'Masala Chai Collection'
    elif has(s, 'darjeeling', 'first flush'): cat = 'Darjeeling Teas'
    elif has(s, 'green tea', 'himalayan green'): cat = 'Green Teas'
    elif has(s, 'turmeric', 'ginger'): cat = 'Turmeric & Ginger Teas'
    elif has(s, 'wellness', 'immunity', 'detox'): cat = 'Wellness Teas'

    if pct and cat:
        return {'hook': f"{pct}% off our {cat} — farm-direct from Indian estates, freshness-sealed at source", 'branch': 'pct+cat'}
    if pct and oc:
        return {'hook': f"{pct}% off with code {oc} — India's finest teas at your best price yet", 'branch': 'pct+oc'}
    if pct:
        return {'hook': f"{pct}% off — farm-direct Indian teas, freshness-sealed, at your best price yet", 'branch': 'pct'}

    # Occasion checks (highest intent) — sig.src ONLY
    # Note: 'mom'/'mum'/'dad' use word-boundary matching to avoid false positives (e.g. 'mom' in 'cardamom')
    if has(s, "mother's day", "mothers day", "mum's day") or has_word(s, 'mum', 'mom'):
        return {'hook': "The gift that shows how much you care — premium Indian tea, beautifully packaged", 'branch': "mother's day"}
    if has(s, "father's day", 'father') or has_word(s, 'dad'):
        return {'hook': "For the dad who deserves something extraordinary — premium Indian tea, gift-ready", 'branch': "father's day"}
    if has(s, 'diwali'):
        return {'hook': "Gift the taste of India this Diwali — premium teas, beautifully presented", 'branch': 'diwali'}
    if has(s, 'christmas', 'holiday season'):
        return {'hook': "The gift that warms every cup this Christmas — single-estate Indian teas, beautifully boxed", 'branch': 'christmas'}
    if has(s, 'eid', 'ramadan'):
        return {'hook': "Celebrate with the finest teas from India — premium, gifted with love", 'branch': 'eid'}

    # Specific product checks — BEFORE generic categories (THE CRITICAL FIX)
    if has(s, 'first flush', '2026', 'arya', 'jungpana', 'giddapahar', 'muscatel'):
        return {'hook': "A once-a-year harvest — the finest Darjeeling First Flush, available now before it sells out", 'branch': 'first flush'}
    if has(s, 'chai', 'masala'):
        return {'hook': "The most authentic masala chai outside India — bold, warming, utterly real", 'branch': 'chai'}
    if has(s, 'darjeeling'):
        return {'hook': "Single-estate Darjeeling — hand-picked from the Himalayan foothills, the world's most coveted tea", 'branch': 'darjeeling'}
    if has(s, 'assam', 'english breakfast', 'breakfast tea'):
        return {'hook': "Bold, malty Assam — the world's definitive breakfast tea, sourced direct from estate", 'branch': 'assam'}
    if has(s, 'green tea', 'himalayan green', 'mint melody', 'matcha'):
        return {'hook': "Pure Himalayan green tea — antioxidant-rich, farm-direct, brewed in minutes", 'branch': 'green tea'}
    if has(s, 'earl grey'):
        return {'hook': "The finest Earl Grey — bergamot and Indian black tea, a timeless classic perfected", 'branch': 'earl grey'}
    if has(s, 'oolong'):
        return {'hook': "High-mountain oolong — complex, smooth, and extraordinary from India's rarest gardens", 'branch': 'oolong'}
    if has(s, 'white tea', 'silver needle'):
        return {'hook': "Rare silver needle white tea — the most delicate, antioxidant-rich tea on earth", 'branch': 'white tea'}
    if has(s, 'ashwagandha'):
        return {'hook': "Clinically studied adaptogen — 5,000 years of Ayurvedic wisdom, now in your daily cup", 'branch': 'ashwagandha'}
    if has(s, 'moringa'):
        return {'hook': "92 nutrients, 46 antioxidants — moringa is the most nutrient-dense plant on earth", 'branch': 'moringa'}
    if has(s, 'turmeric', 'ginger turmeric', 'turmeric ginger'):
        return {'hook': "Turmeric + ginger + black pepper — nature's most powerful anti-inflammatory trio, in your cup", 'branch': 'turmeric'}
    if has(s, 'vedic kadha', 'kadha'):
        return {'hook': "Ancient Ayurvedic kadha — centuries of immunity wisdom, freshness-sealed from Indian farms", 'branch': 'kadha'}
    if has(s, 'sleep', 'chamomile', 'butterfly pea', 'spearmint'):
        return {'hook': "Your natural wind-down ritual — pure, calming, caffeine-free botanicals from Indian farms", 'branch': 'sleep'}

    # Generic category — only reached if no specific product matched
    if has(s, 'sampler', 'discovery', 'explore', 'variety', 'assorted'):
        return {'hook': "One box, the best of Indian tea — find your new favourite and never look back", 'branch': 'sampler'}
    if has(s, 'bestseller', 'most loved', '50,000', 'popular', 'top seller'):
        return {'hook': "50,000+ customers choose these every day — join them and taste the difference", 'branch': 'bestseller'}
    if has(s, 'immunity', 'detox', 'wellness', 'gut health'):
        return {'hook': "Nature's most powerful wellness botanicals — straight from Indian farms to your cup", 'branch': 'wellness/immunity'}
    if has(s, 'routine', 'daily', 'morning', 'ritual', 'every morning', 'habit'):
        return {'hook': "The one ritual that makes every morning worth waking up for — pure, farm-direct Indian tea", 'branch': 'routine'}
    if has(s, 'gift', 'gifting', 'hamper', 'present'):
        return {'hook': "The gift they'll actually use — premium Indian tea, beautifully packaged and freshness-sealed", 'branch': 'gift'}
    if has(s, 'premium', 'luxury', 'finest', 'rare', 'single estate'):
        return {'hook': "Rare, single-estate teas — hand-picked from the world's highest tea gardens, for those who know the difference", 'branch': 'premium'}

    return {'hook': "Your best price yet on India's finest teas — farm-direct, ethically sourced, freshness-sealed", 'branch': 'fallback'}

# ── audienceLine detection ──
def get_audience_line(raw):
    sig = get_signals(raw)
    s = sig['src']
    base = 'US wellness shoppers, 28-45, health-conscious D2C buyers'
    if has(s, "mother's day", "mothers day", "father's day", 'father') or has_word(s, 'mum', 'mom', 'dad'):
        return base + ' — gifting occasion, emotionally driven purchase'
    if has(s, 'diwali', 'christmas', 'festive', 'holiday', 'eid', 'raksha'):
        return base + ' — festive shoppers, gifting mindset, occasion urgency'
    if has(s, 'chai', 'masala'):
        return base + ' — chai & spiced tea lovers, Indian diaspora, spice-forward palates'
    if has(s, 'darjeeling', 'first flush', 'muscatel'):
        return base + ' — premium tea connoisseurs, single-estate enthusiasts'
    if has(s, 'green tea', 'matcha', 'himalayan green'):
        return base + ' — health-conscious consumers, antioxidant-aware buyers'
    if has(s, 'wellness', 'detox', 'immunity', 'gut health', 'moringa', 'ashwagandha', 'turmeric'):
        return base + ' — health-first buyers, repeat purchase potential'
    return base

# ── occasion detection (catSrc only) ──
def get_occasion(raw):
    pre_field = re.split(r'\n\n?(?:PRODUCT FOCUS|OFFER|AUDIENCE|TONE|KEY HOOK|MULTI-MARKET)\s*:', raw, flags=re.IGNORECASE)[0]
    pf_match = re.search(r'PRODUCT FOCUS\s*:?\s*([^\n]+)', raw, re.IGNORECASE)
    pf_field_l = pf_match.group(1).lower() if pf_match else ''
    cat_src = pre_field.lower() + ' ' + pf_field_l

    # Word-boundary keywords — these short words can appear inside other words
    wb_kws = {'mom', 'mum', 'dad', 'father'}
    occasion_table = [
        (["mother's day", "mothers day", "mum's day", "mom"], "For the One Who Deserves the Best.", "For Mum."),
        (["diwali", "deepawali"], "Celebrate Diwali with Tea.", "This Festive Season."),
        (["christmas", "xmas", "holiday season"], "The Gift That Warms Every Cup.", "This Christmas."),
        (["valentine's", "valentines", "love"], "Love in Every Sip.", "This Valentine's Day."),
        (["eid", "ramadan"], "Celebrate Eid.", "Premium Indian Teas for the Occasion."),
        (["father", "dad"], "For the Dad Who", "Deserves the Finest."),
        (["new year", "nye"], "New Year.", "A New Tea Ritual."),
        (["summer"], "Summer in", "Every Sip."),
    ]
    for keys, line1, line2 in occasion_table:
        matched = False
        for k in keys:
            if k in wb_kws:
                matched = bool(re.search(r'\b' + k + r'\b', cat_src, re.IGNORECASE))
            else:
                matched = k in cat_src
            if matched:
                break
        if matched:
            return {'line1': line1, 'line2': line2}
    return None

# ═══════════════════════════════════════════════════════════
# TEST RUNNER
# ═══════════════════════════════════════════════════════════
passed = 0
failed = 0
results = []

def test(id_, desc, raw, checks):
    global passed, failed
    sig = get_signals(raw)
    hook = get_hook_line(raw)
    aud = get_audience_line(raw)
    occ = get_occasion(raw)
    ctx = {'sig': sig, 'hook': hook, 'aud': aud, 'occ': occ}

    failures = []
    for label, fn in checks:
        try:
            ok = fn(ctx)
        except Exception as e:
            ok = False
            label = f"{label} [EXCEPTION: {e}]"
        if not ok:
            failures.append(label)

    status = '✅ PASS' if not failures else '❌ FAIL'
    if not failures: passed += 1
    else: failed += 1

    print(f"\n{status}  {id_}: {desc}")
    print(f"   src: \"{sig['src'].strip()[:90]}...\"")
    print(f"   pct={sig['pct']} | oc={sig['oc']}")
    print(f"   branch: [{hook['branch']}]")
    print(f"   hook: \"{hook['hook'][:90]}...\"")
    if failures:
        for f in failures:
            print(f"   ✗  {f}")

    results.append({'id': id_, 'desc': desc, 'status': status, 'failures': failures})


# ─────────────────────────────────────────────────────────────────
# TC-1: Chai + wellness audience — chai hook must fire, NOT wellness
# ─────────────────────────────────────────────────────────────────
test('TC-1', 'masala chai for wellness shoppers → chai hook (NOT wellness)',
     'Promote masala chai for wellness shoppers',
     [
         # Core correctness: chai hook fires even though "wellness" is in user's own text
         ('hookBranch must be chai',                  lambda c: c['hook']['branch'] == 'chai'),
         ('hookLine contains chai language',           lambda c: 'chai' in c['hook']['hook'].lower()),
         ('hookLine NOT wellness botanicals',          lambda c: 'wellness botanicals' not in c['hook']['hook'].lower()),
         ('audienceLine: chai & spiced tea lovers',    lambda c: 'chai' in c['aud'].lower()),
         ('audienceLine NOT health-first buyers',      lambda c: 'health-first buyers' not in c['aud'].lower()),
         # Note: "wellness shoppers" IS in src here because user typed it in preField (no field label)
         # The priority order fix (chai before wellness in waterfall) is what protects this — not src filtering.
         # src filtering only protects against AUDIENCE:/TONE: field words leaking in.
         ('chai is in src (user typed it in preField)', lambda c: 'chai' in c['sig']['src']),
     ])

# ─────────────────────────────────────────────────────────────────
# TC-2: 20% off turmeric — pct+cat hook
# ─────────────────────────────────────────────────────────────────
test('TC-2', '20% off turmeric teas → pct+cat hook',
     'Get 20% off our turmeric teas this weekend',
     [
         ('pct is 20',                              lambda c: c['sig']['pct'] == '20'),
         ('hookBranch is pct+cat',                 lambda c: c['hook']['branch'] == 'pct+cat'),
         ('hookLine contains 20%',                 lambda c: '20%' in c['hook']['hook']),
         ('hookLine contains turmeric',            lambda c: 'turmeric' in c['hook']['hook'].lower()),
     ])

# ─────────────────────────────────────────────────────────────────
# TC-3: Re-enhancement isolation — AUDIENCE field words must NOT leak
# ─────────────────────────────────────────────────────────────────
test('TC-3', 'Re-enhanced prompt: AUDIENCE wellness text must NOT override chai hook',
     """Masala chai campaign for Indian diaspora

PRODUCT FOCUS: India's Original Masala Chai 100ct, Cardamom Masala Chai
OFFER: Free shipping on orders $49+
AUDIENCE: US wellness shoppers, health-conscious D2C buyers — chai lovers
TONE: Warm, heritage-led, authentic
KEY HOOK: Bold, warming, utterly real masala chai""",
     [
         ('src excludes AUDIENCE text (health-conscious)',  lambda c: 'health-conscious' not in c['sig']['src']),
         ('src excludes AUDIENCE text (d2c buyers)',        lambda c: 'd2c buyers' not in c['sig']['src']),
         ('hookBranch is chai (not wellness)',              lambda c: c['hook']['branch'] == 'chai'),
         ('hookLine about chai',                           lambda c: 'chai' in c['hook']['hook'].lower()),
         ('hookLine NOT wellness botanicals',              lambda c: 'wellness botanicals' not in c['hook']['hook'].lower()),
     ])

# ─────────────────────────────────────────────────────────────────
# TC-3b: CARDAMOM regression — 'mom' in 'cardamom' must NOT trigger Mother's Day
# ─────────────────────────────────────────────────────────────────
test('TC-3b', "'mom' in 'cardamom' must NOT trigger Mother's Day hook",
     "Cardamom masala chai campaign — the authentic spice blend",
     [
         ("hookBranch is chai (NOT mother's day)",         lambda c: c['hook']['branch'] == 'chai'),
         ("hookLine NOT gifting care language",            lambda c: 'gift that shows how much you care' not in c['hook']['hook'].lower()),
         ("occasion is None (no false mom match)",         lambda c: c['occ'] is None),
         ("audienceLine chai lovers not gifting occasion", lambda c: 'chai' in c['aud'].lower() and 'gifting occasion' not in c['aud'].lower()),
     ])

# ─────────────────────────────────────────────────────────────────
# TC-4: Green tea morning routine — green tea fires before routine
# ─────────────────────────────────────────────────────────────────
test('TC-4', 'himalayan green tea morning routine → green tea hook (NOT routine)',
     'Himalayan green tea for morning routine',
     [
         ('hookBranch is green tea (not routine)',  lambda c: c['hook']['branch'] == 'green tea'),
         ('hookLine mentions green tea',            lambda c: 'green tea' in c['hook']['hook'].lower()),
         ('hookLine NOT morning waking up',         lambda c: 'morning worth waking' not in c['hook']['hook'].lower()),
         ('audienceLine: antioxidant-aware buyers', lambda c: 'antioxidant' in c['aud'].lower()),
     ])

# ─────────────────────────────────────────────────────────────────
# TC-5: Mother's Day — occasion fires (no %)
# ─────────────────────────────────────────────────────────────────
test("TC-5", "Mother's Day campaign → gifting occasion hook",
     "Mother's Day gifting campaign — premium tea sets",
     [
         ("hookBranch is mother's day",                    lambda c: c['hook']['branch'] == "mother's day"),
         ("hookLine: gift that shows how much you care",   lambda c: 'gift that shows how much you care' in c['hook']['hook'].lower()),
         ("occasion detected (line1 correct)",             lambda c: c['occ'] is not None and 'Deserves the Best' in c['occ']['line1']),
         ("audienceLine: gifting occasion",                lambda c: 'gifting occasion' in c['aud'].lower()),
     ])

# ─────────────────────────────────────────────────────────────────
# TC-6: Diwali 15% off code DIWALI15 — pct+oc fires BEFORE occasion
# ─────────────────────────────────────────────────────────────────
test('TC-6', 'Diwali 15% off DIWALI15 → pct+oc hook fires BEFORE diwali occasion',
     'Diwali sale — 15% off with code DIWALI15',
     [
         ('pct is 15',                                          lambda c: c['sig']['pct'] == '15'),
         ('oc is DIWALI15',                                    lambda c: c['sig']['oc'] == 'DIWALI15'),
         ('hookBranch is pct+oc (NOT diwali occasion)',        lambda c: c['hook']['branch'] == 'pct+oc'),
         ('hookLine contains 15% and DIWALI15',               lambda c: '15%' in c['hook']['hook'] and 'DIWALI15' in c['hook']['hook']),
         ('hookLine NOT "taste of india this diwali"',        lambda c: 'taste of india this diwali' not in c['hook']['hook'].lower()),
     ])

# ─────────────────────────────────────────────────────────────────
# TC-7: Darjeeling First Flush 2026 — most specific hook wins
# ─────────────────────────────────────────────────────────────────
test('TC-7', 'Darjeeling first flush 2026 → first flush hook (most specific)',
     'Darjeeling first flush 2026 — the new harvest has arrived',
     [
         ('hookBranch is first flush',                 lambda c: c['hook']['branch'] == 'first flush'),
         ('hookLine mentions harvest',                 lambda c: 'harvest' in c['hook']['hook'].lower()),
         ('hookLine NOT generic darjeeling coveted',   lambda c: 'most coveted tea' not in c['hook']['hook'].lower()),
     ])

# ─────────────────────────────────────────────────────────────────
# TC-8: Wellness-only (no specific product) → wellness/immunity hook
# ─────────────────────────────────────────────────────────────────
test('TC-8', 'Pure wellness prompt → wellness/immunity hook',
     'Boost immunity with our wellness teas this season',
     [
         ('hookBranch is wellness/immunity',            lambda c: c['hook']['branch'] == 'wellness/immunity'),
         ('hookLine: wellness botanicals',              lambda c: 'wellness botanicals' in c['hook']['hook'].lower()),
         ('audienceLine: health-first buyers',          lambda c: 'health-first buyers' in c['aud'].lower()),
     ])

# ─────────────────────────────────────────────────────────────────
# TC-9: Kadha in PRODUCT FOCUS — sig.src picks it up
# ─────────────────────────────────────────────────────────────────
test('TC-9a', 'Vedic Kadha (no other specific products) in PRODUCT FOCUS → kadha hook fires',
     """Ayurvedic kadha immunity campaign

PRODUCT FOCUS: Vedic Kadha Herbal Tea 100ct, Vedic Kadha Herbal Tea 30ct
AUDIENCE: US wellness buyers
TONE: Warm, Ayurvedic, heritage""",
     [
         ('src includes kadha from PRODUCT FOCUS',  lambda c: 'vedic kadha' in c['sig']['src']),
         ('hookBranch is kadha',                    lambda c: c['hook']['branch'] == 'kadha'),
         ('hookLine mentions ayurvedic',            lambda c: 'ayurvedic' in c['hook']['hook'].lower()),
         ('AUDIENCE field did NOT bleed into src',  lambda c: 'wellness buyers' not in c['sig']['src']),
     ])

# TC-9b: When PRODUCT FOCUS has both Kadha AND Turmeric Ginger, turmeric wins (earlier in waterfall)
# This is CORRECT priority behavior — turmeric > kadha in the hook waterfall.
test('TC-9b', 'Vedic Kadha + Turmeric Ginger in PRODUCT FOCUS → turmeric wins (correct priority)',
     """Ayurvedic immunity campaign

PRODUCT FOCUS: Vedic Kadha Herbal Tea, Turmeric Ginger Herbal Tea
AUDIENCE: US wellness buyers
TONE: Warm, Ayurvedic, heritage""",
     [
         ('src includes both kadha and turmeric',   lambda c: 'vedic kadha' in c['sig']['src'] and 'turmeric' in c['sig']['src']),
         ('hookBranch is turmeric (correct, before kadha in waterfall)', lambda c: c['hook']['branch'] == 'turmeric'),
         ('AUDIENCE field did NOT bleed into src',  lambda c: 'wellness buyers' not in c['sig']['src']),
     ])

# ─────────────────────────────────────────────────────────────────
# TC-10: "mother's day" in AUDIENCE field only → must NOT trigger occasion
# ─────────────────────────────────────────────────────────────────
test("TC-10", "mother's day only in AUDIENCE field → must NOT fire occasion",
     """Green tea campaign for freshness

PRODUCT FOCUS: Himalayan Green Tea, Mint Melody Green Tea
AUDIENCE: Perfect for mother's day shoppers
TONE: Fresh, clean, wellness""",
     [
         ("occasion is None (AUDIENCE field must not bleed)", lambda c: c['occ'] is None),
         ("hookBranch is green tea (not mother's day)",       lambda c: c['hook']['branch'] == 'green tea'),
     ])

# ─────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────
print('\n' + '═' * 62)
print(f"RESULTS: {passed} PASSED | {failed} FAILED | {passed+failed} TOTAL")
print('═' * 62)
if failed == 0:
    print('\n🎉  ALL TEST CASES PASS — signal architecture is correct.')
else:
    print('\n⚠   FAILURES DETECTED:')
    for r in results:
        if r['failures']:
            print(f"\n  {r['id']}: {r['desc']}")
            for f in r['failures']:
                print(f"    ✗ {f}")
