(() => {
  'use strict';

  /* ================= helpers ================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const sum = (arr) => arr.reduce((x, y) => x + y, 0);
  const avg = (arr) => (arr.length ? sum(arr) / arr.length : 0);
  const pad = (v) => String(v).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const pct = (s) => (s && s.a ? Math.round((100 * s.c) / s.a) : null);
  const toHira = (s) => String(s).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const norm = (s) => toHira(String(s).normalize('NFKC').toLowerCase());
  /** 重み付きで1つ選ぶ */
  const wpick = (items, w) => {
    const ws = items.map(w);
    let r = Math.random() * sum(ws);
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };

  /* ================= storage ================= */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('pik.' + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('pik.' + key, JSON.stringify(value)); } catch (e) { /* private mode etc. */ }
    }
  };
  const settings = Object.assign(
    { level: 1, count: '10', goal: '20', weak: true, auto: false, spoil: null, step: -1, dexSort: 'p', dexFinal: false },
    store.get('settings', {})
  );
  settings.level = Math.max(1, Math.min(3, +settings.level || 1));
  const saveSettings = () => { store.set('settings', settings); renderSummary(); };
  let stats = store.get('stats', {});   // tag -> { a, c, l: 表示名, m: 分野 }
  let modeStats = store.get('modes', {}); // mode -> { a, c }
  let days = store.get('days', {});     // "2026-10-14" -> { a, c }

  const SPOILERS = [
    { label: '序盤', desc: 'ゲーム開始〜テーブルシティ・アカデミー入学のころ' },
    { label: '本編', desc: '3つのストーリー（ジム・スター団・ヌシ）の道中' },
    { label: '終盤', desc: 'チャンピオンテスト・ポケモンリーグ、伝説・災厄のポケモンまで' },
    { label: 'クリア後', desc: 'エンディング以降、エリアゼロ、パラドックスポケモンまで' },
    { label: '碧の仮面', desc: '追加コンテンツ前編：キタカミの里で出会うポケモン' },
    { label: '碧の仮面の終盤', desc: 'ともっこ（イイネイヌ・マシマシラ・キチキギス）・オーガポンまで' },
    { label: '藍の円盤', desc: '追加コンテンツ後編：ブルーベリー学園・テラリウムドームで出会うポケモン' },
    { label: '藍の円盤の終盤・番外編', desc: 'テラパゴス、新しいパラドックスポケモン、モモワロウまで' }
  ];
  const DEX_NAME = { P: 'パルデア', K: 'キタカミ', B: 'ブルーベリー' };
  const DEX_ORD = { P: 0, K: 1, B: 2 };
  const spoil = () => (settings.spoil == null ? 1 : settings.spoil);

  /* ================= data ================= */
  const MONS = POKEMON_STATS.map((r) => ({
    dex: r[0], dn: r[1], no: r[2], ja: r[3], en: r[4], ty: r[5], bs: r[6],
    ab: r[7].map((a) => ({ n: a.replace('*', ''), h: a[0] === '*' })),
    stage: r[8], stages: r[9], kind: r[10], sp: r[11], root: r[12], tot: sum(r[6])
  }));
  MONS.forEach((m) => {
    m.final = m.stage === m.stages;
    m.p = DEX_ORD[m.dex] * 1000 + (m.dn || 999); // 並び順（パルデア → キタカミ → ブルーベリー）
    m.k = norm(m.ja) + ' ' + m.en.toLowerCase() + ' ' + (m.dn || '') + ' ' + m.no;
  });
  const dexLabel = (m) => `${DEX_NAME[m.dex]} ${m.dn ? String(m.dn).padStart(3, '0') : '—'}`;
  /** とくせいの名前（隠れ特性なら印をつける） */
  const abName = (m, a) => { const x = m.ab.find((y) => y.n === a); return x && x.h ? `${a}（隠れ特性）` : a; };
  const MON = Object.fromEntries(MONS.map((m) => [m.ja, m]));
  const visMons = () => MONS.filter((m) => m.sp <= spoil());
  const hasAb = (m, a) => m.ab.some((x) => x.n === a);
  const lineOf = (m) => MONS.filter((x) => x.root === m.root);
  const lineOfRoot = (root) => MONS.filter((x) => x.root === root);

  // 技（変わったタイプの決まり方をする技は、ふつうの相性問題から外す）
  const ODD_MOVES = new Set(['テラバースト', 'ウェザーボール', 'めざめるダンス', 'レイジングブル', 'フリーズドライ', 'フライングプレス', 'わるあがき', 'さばきのつぶて', 'マルチアタック', 'テラクラスター', 'ツタこんぼう']);
  const MV = MOVES.map((r) => ({ ja: r[0], en: r[1], ty: r[2], cat: r[3], pw: r[4], n: r[5], tgt: r[6], pri: r[7], acc: r[8] }));
  const ATK_MOVES = MV.filter((m) => m.pw > 1 && m.cat !== '変化' && !ODD_MOVES.has(m.ja) && !SPECIAL_DMG[m.ja]);
  const movesOfType = (t, top) => {
    const l = ATK_MOVES.filter((m) => m.ty === t);
    return l.slice(0, Math.max(3, top || 12));
  };
  const pickMove = (t, level) => pick(movesOfType(t, level >= 3 ? 6 : 12));

  const eff1 = (mt, dt) => { const r = TYPE_CHART[mt][dt]; return r == null ? 1 : r; };
  const eff = (mt, dts) => dts.reduce((x, t) => x * eff1(mt, t), 1);

  /* ---------- 集計（説明・ヒントに使う） ---------- */
  const NORMAL = (m) => m.kind === 0;
  const GROUPS = [
    { id: 's31', label: '3段階進化の1段階め', f: (m) => NORMAL(m) && m.stages === 3 && m.stage === 1 },
    { id: 's32', label: '3段階進化の2段階め', f: (m) => NORMAL(m) && m.stages === 3 && m.stage === 2 },
    { id: 's33', label: '3段階進化の最終形', f: (m) => NORMAL(m) && m.stages === 3 && m.stage === 3 },
    { id: 's21', label: '2段階進化の進化前', f: (m) => NORMAL(m) && m.stages === 2 && m.stage === 1 },
    { id: 's22', label: '2段階進化の最終形', f: (m) => NORMAL(m) && m.stages === 2 && m.stage === 2 },
    { id: 's11', label: '進化しないポケモン', f: (m) => NORMAL(m) && m.stages === 1 },
    { id: 'para', label: 'パラドックスポケモン', f: (m) => m.kind === 4, sp: 3 },
    { id: 'leg', label: '伝説のポケモン', f: (m) => m.kind === 2, sp: 2 }
  ];
  // 集計は「いまのネタバレ範囲で見えるポケモン」で計算しなおす（範囲を変えたら recomputeStats）
  const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
  const groupOf = (m) => GROUPS.find((g) => g.f(m));
  const TYPE_AVG = {};
  let FAST_TYPES = [], SLOW_TYPES = [];
  function recomputeStats() {
    const vis = visMons();
    GROUPS.forEach((g) => {
      const l = vis.filter(g.f).map((m) => m.tot);
      g.n = l.length; g.avg = Math.round(avg(l)); g.min = l.length ? Math.min(...l) : 0; g.max = l.length ? Math.max(...l) : 0;
    });
    // タイプごとの平均（最終進化・伝説やパラドックスを除く）
    TYPES.forEach((t) => {
      const l = vis.filter((m) => m.final && NORMAL(m) && m.ty.includes(t));
      TYPE_AVG[t] = { n: l.length, tot: avg(l.map((m) => m.tot)), st: [0, 1, 2, 3, 4, 5].map((i) => avg(l.map((m) => m.bs[i]))) };
    });
    FAST_TYPES = typeRank(5).slice(0, 4);
    SLOW_TYPES = typeRank(5).slice(-4).reverse();
  }
  const typeRank = (key) => TYPES.slice().sort((a, b) => valOf(b, key) - valOf(a, key));
  const valOf = (t, key) => (key === 't' ? TYPE_AVG[t].tot : TYPE_AVG[t].st[key]);

  /* ---------- 能力の計算 ---------- */
  const calcStat = (b, iv, ev, lv, hp, nat) => {
    const core = Math.floor(((2 * b + iv + Math.floor(ev / 4)) * lv) / 100);
    if (hp) return core + lv + 10;
    return Math.floor((core + 5) * (nat || 1));
  };
  const speed50 = (m) => calcStat(m.bs[5], 31, 252, 50, false, 1); // 個体値31・努力値252・補正なし

  /* ---------- 表示の部品 ---------- */
  const typeTag = (t) => `<span class="type t-${TYPE_CLASS[t]}">${esc(t)}</span>`;
  const typesHTML = (ts, hide) => `<span class="types">${hide ? '<span class="type unknown">タイプ？</span>' : ts.map(typeTag).join('')}</span>`;
  const STAT_JA = STAT_NAMES;
  const STAT_KANJI = ['HP', '攻撃', '防御', '特攻', '特防', '素早'];
  const FR = { 0: '0', 0.25: '1/4', 0.5: '1/2', 1: '1', 2: '2', 4: '4', 0.125: '1/8' };
  const fmtNum = (v) => {
    const r = Math.round(v * 1000) / 1000;
    const exact = Math.abs(r - v) < 1e-9;
    const s = String(Math.round(v * 100) / 100);
    return (exact ? '' : '約') + s;
  };
  const fmtMult = (v) => (FR[v] != null ? FR[v] : fmtNum(v)) + '倍';
  const fmtFactor = (v) => (v > 0 && v < 1 ? fracStr(v) : String(Math.round(v * 1000) / 1000));
  const effWord = (v) => (v === 0 ? 'こうかなし' : v < 1 ? 'いまひとつ' : v === 1 ? 'ふつう' : 'こうかばつぐん');
  const EFF_WORDS = [
    { w: 'こうかばつぐん', s: '2倍・4倍' }, { w: 'ふつう', s: '1倍' }, { w: 'いまひとつ', s: '1/2倍・1/4倍' }, { w: 'こうかなし', s: '0倍' }
  ];
  const STD_MULTS = [0, 0.25, 0.5, 1, 2, 4];
  const sbars = (m, hl, max = 160) => `<div class="sbars">${m.bs.map((v, i) =>
    `<span class="k${hl === i ? ' hl' : ''}">${STAT_JA[i]}</span><span class="v${hl === i ? ' hl' : ''}">${v}</span><span class="b"><span class="s${i}" style="width:${Math.min(100, (100 * v) / max)}%"></span></span>`).join('')}
    <span class="tot">合計 <b>${m.tot}</b></span></div>`;
  const kindBadge = (m) => (m.kind === 2 ? '<span class="badge leg">伝説</span>' : m.kind === 4 ? '<span class="badge para">パラドックス</span>' : '');
  const stageText = (m) => (m.stages === 1 ? '進化しない' : `${m.stages}段階進化の${m.stage === m.stages ? '最終形' : m.stage + '段階め'}`);

  /* ================= theme ================= */
  const THEMES = [
    { id: 'auto', label: '自動（端末の設定）', sw: ['#b0001f', '#1c1826'] },
    { id: 'scarlet', label: 'スカーレット', sw: ['#9c0019', '#db6a00'], bar: '#9c0019' },
    { id: 'violet', label: 'バイオレット', sw: ['#3f0b86', '#1c77bd'], bar: '#3f0b86' },
    { id: 'orange', label: 'オレンジ', sw: ['#c24e00', '#1b58a3'], bar: '#c24e00' },
    { id: 'grape', label: 'グレープ', sw: ['#34094f', '#4b8a16'], bar: '#34094f' },
    { id: 'star', label: 'スター', sw: ['#17130a', '#f2b705'], bar: '#17130a' },
    { id: 'cassiopeia', label: 'カシオペア', sw: ['#a98cf2', '#121019'], bar: '#241c3a' }
  ];
  const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };
  let themeChoice = 'auto';
  try { themeChoice = localStorage.getItem('pik.theme') || 'auto'; } catch (e) {}
  if (!THEMES.some((t) => t.id === themeChoice)) themeChoice = 'auto';
  function applyTheme() {
    const id = themeChoice === 'auto' ? (darkMQ.matches ? 'cassiopeia' : 'scarlet') : themeChoice;
    document.documentElement.dataset.theme = id;
    const t = THEMES.find((x) => x.id === id);
    $('meta[name="theme-color"]').setAttribute('content', t ? t.bar : '#9c0019');
    const swatch = (t) => `<span class="swatch" style="background:linear-gradient(135deg, ${t.sw[0]} 50%, ${t.sw[1]} 50%)"></span>`;
    $('#themeMenu').innerHTML = THEMES.map((t) =>
      `<button class="theme-opt" role="menuitemradio" aria-checked="${t.id === themeChoice}" data-theme="${t.id}" type="button">${swatch(t)}${esc(t.label)}</button>`).join('');
    $('#themeChips').innerHTML = THEMES.map((t) =>
      `<button class="chip" type="button" aria-pressed="${t.id === themeChoice}" data-theme="${t.id}">${esc(t.label)}</button>`).join('');
  }
  function setTheme(id) {
    themeChoice = id;
    try { localStorage.setItem('pik.theme', id); } catch (e) {}
    applyTheme();
  }
  darkMQ.addEventListener && darkMQ.addEventListener('change', () => { if (themeChoice === 'auto') applyTheme(); });
  $('#themeBtn').addEventListener('click', (ev) => {
    const menu = $('#themeMenu');
    menu.hidden = !menu.hidden;
    $('#themeBtn').setAttribute('aria-expanded', String(!menu.hidden));
    ev.stopPropagation();
  });
  document.addEventListener('click', (ev) => {
    const opt = ev.target.closest('[data-theme]');
    if (opt && (opt.classList.contains('theme-opt') || opt.classList.contains('chip'))) setTheme(opt.dataset.theme);
    if (!ev.target.closest('.theme-wrap')) { $('#themeMenu').hidden = true; $('#themeBtn').setAttribute('aria-expanded', 'false'); }
  });

  /* ================= views ================= */
  const VIEWS = ['learn', 'quiz', 'dmg', 'dex', 'record', 'settings'];
  let current = store.get('view', 'learn');
  if (!VIEWS.includes(current)) current = 'learn';
  let learnBuilt = false;
  function show(view) {
    if (quiz && view !== 'quiz') stopQuiz();
    current = view;
    store.set('view', view);
    VIEWS.forEach((v) => {
      const s = $('#view-' + v);
      s.hidden = v !== view;
      if (v === view) s.setAttribute('data-active', ''); else s.removeAttribute('data-active');
    });
    $$('.nav-item').forEach((b) => b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'));
    $('#spoilBar').hidden = view === 'settings';
    if (view === 'learn') renderLearn();
    if (view === 'quiz') renderToday();
    if (view === 'dex') renderDex();
    if (view === 'record') renderRecord();
    if (view === 'dmg') renderDmg();
    window.scrollTo(0, 0);
  }
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

  function renderSpoilBar() {
    $('#spoilBar').innerHTML = `<span>🔒 ネタバレ範囲：<b>${esc(SPOILERS[spoil()].label)}まで</b></span><button class="text-btn" type="button" id="spoilChange">変える</button>`;
    $('#spoilChange').addEventListener('click', () => {
      show('settings');
      const p = $('#spoilPanel');
      p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash');
    });
  }
  function spoilRadios(container, name) {
    container.innerHTML = SPOILERS.map((s, i) => `<label class="check"><input type="radio" name="${name}" value="${i}"${i === spoil() ? ' checked' : ''}>
      <span><b>${esc(s.label)}まで</b><small>${esc(s.desc)}</small></span></label>`).join('');
  }
  function setSpoil(v) {
    settings.spoil = v;
    saveSettings();
    recomputeStats();
    renderSpoilBar();
    learnBuilt = false;
    dexPage = 1;
    if (current === 'learn') renderLearn();
    if (current === 'dex') renderDex();
  }
  $('#spoilRadios').addEventListener('change', (ev) => setSpoil(+ev.target.value));

  /* ================= record ================= */
  function record(q, ok) {
    q.tags.forEach(([id, label]) => {
      const s = stats[id] || (stats[id] = { a: 0, c: 0 });
      s.a++; if (ok) s.c++;
      s.l = label; s.m = q.mode;
    });
    const ms = modeStats[q.mode] || (modeStats[q.mode] = { a: 0, c: 0 });
    ms.a++; if (ok) ms.c++;
    const d = dayKey();
    const t = days[d] || (days[d] = { a: 0, c: 0 });
    t.a++; if (ok) t.c++;
    store.set('stats', stats); store.set('modes', modeStats); store.set('days', days);
  }
  const missRate = (id) => { const s = stats[id]; return s && s.a ? (s.a - s.c) / s.a : 0; };
  const weakW = (id) => (settings.weak ? 1 + 4 * missRate(id) : 1);
  function streak() {
    let n = 0;
    const d = new Date();
    if (!days[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (days[dayKey(d)] && days[dayKey(d)].a > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ================= quiz: question makers ================= */
  const QMODES = [
    { id: 'base', title: '種族値くらべ', desc: 'どっちが合計が高い？どっちが速い？', icon: 'base' },
    { id: 'iv', title: '個体値', desc: '0〜31・すごいとっくん・ジャッジ', icon: 'iv' },
    { id: 'ev', title: '努力値', desc: '252と510・増やす・減らす', icon: 'ev' },
    { id: 'nature', title: 'せいかく・ミント', desc: '1.1倍と0.9倍、どの能力？', icon: 'nature' },
    { id: 'dmg', title: 'ダメージの倍率', desc: 'タイプ一致・きゅうしょ・いかく…のかけ算', icon: 'dmg' },
    { id: 'type', title: 'タイプ相性', desc: '技とポケモンで0〜4倍', icon: 'type' },
    { id: 'cat', title: '技の分類', desc: '物理？特殊？どっちの技を使う？', icon: 'cat' },
    { id: 'special', title: '特殊な技', desc: 'フリーズドライ・テラスタル など', icon: 'special' },
    { id: 'ability', title: 'とくせいも考える', desc: 'ふゆう・ちょすい・かたやぶり…', icon: 'ability' },
    { id: 'item', title: 'もちものも考える', desc: 'ふうせん・半減きのみ・スカーフ…', icon: 'item' },
    { id: 'chip', title: '割合ダメージ', desc: 'ステルスロック・やけど・ゴツメ', icon: 'chip' },
    { id: 'battle', title: '対戦の技・ダブル', desc: '変化技・入れ替え・ダブル・ルール', icon: 'battle' },
    { id: 'raid', title: 'テラレイド', desc: 'HP何倍？バリア？', icon: 'raid' },
    { id: 'mix', title: '総まとめ', desc: 'すべての分野からランダムに', icon: 'mix' }
  ];
  const MODE_TITLE = Object.fromEntries(QMODES.map((m) => [m.id, m.title]));
  const LEVELS = { 1: 'やさしい', 2: 'ふつう', 3: 'むずかしい' };
  const LEVEL_HINT = {
    1: '差がはっきりした比較。タイプ相性は「ばつぐん・いまひとつ」などの言葉で答えます。',
    2: 'タイプ相性は 0〜4倍 の倍率で答えます。種族値の比較は差が小さめに。',
    3: 'タイプを隠して、技とポケモンの名前だけで答えます。とくせいは名前を伏せて「対戦でよく見るもの」を考えます。'
  };
  const STEPS = [
    { t: '種族値くらべ', d: '進化・伝説で差がつく', mode: 'base', lv: 1 },
    { t: 'タイプ相性', d: 'ばつぐん？いまひとつ？', mode: 'type', lv: 1 },
    { t: '個体値', d: '0〜31・おうかん', mode: 'iv', lv: 1 },
    { t: '努力値', d: '252・510・きのみ', mode: 'ev', lv: 1 },
    { t: 'せいかく', d: '1.1倍と0.9倍', mode: 'nature', lv: 1 },
    { t: 'ダメージの倍率', d: 'タイプ一致×ばつぐん', mode: 'dmg', lv: 1 },
    { t: '技の分類', d: '物理？特殊？変化？', mode: 'cat', lv: 1 },
    { t: 'タイプ相性②', d: '0〜4倍で答える', mode: 'type', lv: 2 },
    { t: '種族値くらべ②', d: '速さ・得意な能力', mode: 'base', lv: 2 },
    { t: '数字で比べる', d: '実数値はいくつ変わる？', mode: 'ev', lv: 2 },
    { t: '特殊な技', d: 'フリーズドライ・テラスタル', mode: 'special', lv: 2 },
    { t: 'とくせい', d: 'ふゆう・ちょすい など', mode: 'ability', lv: 2 },
    { t: 'もちもの', d: 'ふうせん・半減きのみ', mode: 'item', lv: 2 },
    { t: '割合ダメージ', d: 'ステルスロック・やけど', mode: 'chip', lv: 2 },
    { t: '対戦の技', d: '変化技・入れ替え・ダブル', mode: 'battle', lv: 2 },
    { t: 'テラレイド', d: 'HPとバリア', mode: 'raid', lv: 2 },
    { t: 'ダメージの倍率②', d: 'ランク・天気・もちもの', mode: 'dmg', lv: 3 },
    { t: 'タイプ相性③', d: '名前だけで答える', mode: 'type', lv: 3 },
    { t: '総まとめ', d: 'とくせい・もちものも', mode: 'mix', lv: 3 }
  ];

  /**
   * 問題のかたち
   * { mode, lead, card(html), choices: [{ html, ok }], layout: 'list'|'grid6'|'grid2', ex(html), tags: [[id, 表示名]], title(ふりかえり用) }
   */
  const multChoices = (ans, extra = []) => {
    const set = new Set(STD_MULTS);
    set.add(ans); extra.forEach((x) => set.add(x));
    return Array.from(set).sort((a, b) => a - b).map((v) => ({ html: fmtMult(v), ok: Math.abs(v - ans) < 1e-9, v }));
  };
  const wordChoices = (ans) => EFF_WORDS.map((w) => ({ html: `${w.w}<small>${w.s}</small>`, ok: w.w === effWord(ans) }));
  const listChoices = (ans, wrongs) => {
    const ws = [];
    wrongs.forEach((w) => { if (w !== ans && !ws.includes(w) && ws.length < 3) ws.push(w); });
    return shuffle([{ html: ans, ok: true }, ...ws.map((w) => ({ html: w, ok: false }))]);
  };
  /** 分数で表せる倍率は分数で（2/3, 2/5 など） */
  const fracStr = (x) => {
    if (x >= 1) return String(Math.round(x * 1000) / 1000);
    for (let d = 2; d <= 10; d++) { const n = x * d; if (Math.abs(n - Math.round(n)) < 1e-9) { return `${Math.round(n)}/${d}`; } }
    return String(Math.round(x * 100) / 100);
  };
  /** 倍率の4択（答えと、まちがえやすい値） */
  const numChoices = (ans, traps) => {
    const out = [ans];
    const key = (v) => fmtMult(v);
    const seen = new Set([key(ans)]);
    for (const t of traps.concat([ans * 2, ans / 2, ans * 1.5, ans + 1, 1, 2])) {
      if (out.length >= 4) break;
      if (!(t >= 0) || !isFinite(t) || seen.has(key(t))) continue;
      seen.add(key(t)); out.push(t);
    }
    return shuffle(out.map((v) => ({ html: fmtMult(v), ok: v === ans })));
  };

  /** タイプ相性の内訳 */
  function effBreakdown(mt, dts, opts = {}) {
    const parts = dts.map((t) => {
      let v = eff1(mt, t);
      if (opts.override && opts.override[t] != null) v = opts.override[t];
      return { t, v };
    });
    const line = parts.map((p) => `${mt}→${p.t} ${fmtMult(p.v)}`).join(' × ');
    const memos = parts.filter((p) => p.v !== 1 && TYPE_MEMO[`${mt}>${p.t}`]).map((p) => `${typeTag(mt)}→${typeTag(p.t)} ${esc(TYPE_MEMO[`${mt}>${p.t}`])}`);
    return { parts, line, memos, v: parts.reduce((x, p) => x * p.v, 1) };
  }
  const memoHTML = (memos) => (memos.length ? `<ul>${memos.map((m) => `<li>${m}</li>`).join('')}</ul>` : '');

  /** タイプ相性の基本問題の部品：相手を選んで、出したい倍率になる技のタイプを決める */
  function pickTypeMatch(mons, wantFn) {
    for (let i = 0; i < 300; i++) {
      const m = pick(mons);
      const want = wpick([0, 0.25, 0.5, 1, 2, 4], (v) => ({ 0: 1, 0.25: 1, 0.5: 2.2, 1: 1.6, 2: 2.4, 4: 1.2 }[v]));
      const types = TYPES.filter((t) => eff(t, m.ty) === want && (!wantFn || wantFn(t, m)));
      if (!types.length) continue;
      const mt = wpick(types, (t) => weakW('mt:' + t));
      return { m, mt };
    }
    return null;
  }
  const answerLayout = (level, ans) => (level === 1 ? { choices: wordChoices(ans), layout: 'list4w' } : { choices: multChoices(ans), layout: 'grid6' });

  // ---------- タイプ相性 ----------
  function qType(level) {
    const r = pickTypeMatch(visMons());
    if (!r) return null;
    const { m, mt } = r;
    const mv = pickMove(mt, level);
    const hide = level >= 3;
    const bd = effBreakdown(mt, m.ty);
    const card = `<div class="q-lead">${hide ? '技とポケモンの名前から考えよう' : ''}</div>
      <div class="vs">
        <div class="vs-side"><span class="vs-name">${esc(mv.ja)}</span>${typesHTML([mt], hide)}<span class="vs-sub">${esc(mv.cat)}・威力${mv.pw}</span></div>
        <span class="vs-arrow">→</span>
        <div class="vs-side"><span class="vs-name">${esc(m.ja)}</span>${typesHTML(m.ty, hide)}</div>
      </div>`;
    return {
      mode: 'type', lead: level === 1 ? 'この技の相性は？' : 'この技のダメージは何倍？',
      card, ...answerLayout(level, bd.v),
      ex: `<p>${typesHTML([mt])} の ${esc(mv.ja)} → ${typesHTML(m.ty)} の ${esc(m.ja)}</p>
        <p class="calc-line">${esc(bd.line)}${m.ty.length > 1 ? ' ＝ ' + fmtMult(bd.v) : ''}</p>${memoHTML(bd.memos)}`,
      ans: `${fmtMult(bd.v)}（${effWord(bd.v)}）`,
      tags: [[`tc:${mt}>${m.ty.join('・')}`, `${mt}技 → ${m.ty.join('・')}`], ['mt:' + mt, `${mt}タイプの技の相性`]],
      title: `${mv.ja} → ${m.ja}`
    };
  }

  // ---------- 特殊な技 ----------
  const TAUROS_FORMS = [
    { n: 'ケンタロス（パルデアのすがた・コンバット種）', ty: ['かくとう'], mt: 'かくとう' },
    { n: 'ケンタロス（パルデアのすがた・ブレイズ種）', ty: ['かくとう', 'ほのお'], mt: 'ほのお' },
    { n: 'ケンタロス（パルデアのすがた・ウォーター種）', ty: ['かくとう', 'みず'], mt: 'みず' }
  ];
  const WEATHERS = [['はれ', 'ほのお'], ['あめ', 'みず'], ['すなあらし', 'いわ'], ['ゆき', 'こおり']];
  function qSpecial(level) {
    const mons = visMons();
    const hide = level >= 3;
    const kinds = ['freeze', 'freeze', 'press', 'teraDef', 'teraDef', 'teraBlast', 'weather', 'status', 'status', 'bull'];
    const kind = wpick(kinds, (k) => weakW('sp:' + k));
    const mk = (o) => Object.assign({ mode: 'special', tags: [['sp:' + kind, o.tagLabel]] }, o);
    const sideMon = (m, label) => `<div class="vs-side"><span class="vs-name">${esc(label || m.ja)}</span>${typesHTML(m.ty, hide)}</div>`;
    const sideMove = (name, t, sub) => `<div class="vs-side"><span class="vs-name">${esc(name)}</span>${t ? typesHTML([t], hide && sub !== 'show') : ''}${sub && sub !== 'show' ? `<span class="vs-sub">${sub}</span>` : ''}</div>`;
    const vsCard = (a, b, extra = '') => `<div class="vs">${a}<span class="vs-arrow">→</span>${b}</div>${extra}`;
    if (kind === 'freeze') {
      const pool = Math.random() < 0.75 ? mons.filter((m) => m.ty.includes('みず')) : mons;
      const m = pick(pool);
      const bd = effBreakdown('こおり', m.ty, { override: { みず: 2 } });
      const plain = eff('こおり', m.ty);
      return mk({
        lead: level === 1 ? 'この技の相性は？' : 'この技のダメージは何倍？',
        card: vsCard(sideMove('フリーズドライ', 'こおり', '特殊・威力70'), sideMon(m)), ...answerLayout(level, bd.v),
        ex: `<p><b>フリーズドライ</b>は、こおりタイプの技なのに<strong>みずタイプにもこうかばつぐん</strong>になる特別な技。</p>
          <p class="calc-line">${esc(bd.line)}${m.ty.length > 1 ? ' ＝ ' + fmtMult(bd.v) : ''}</p>
          ${m.ty.includes('みず') ? `<p>ふつうのこおり技なら ${fmtMult(plain)}。</p>` : '<p>みずタイプがいないので、ふつうのこおり技と同じ。</p>'}`,
        ans: fmtMult(bd.v), tagLabel: 'フリーズドライ', title: `フリーズドライ → ${m.ja}`
      });
    }
    if (kind === 'press') {
      const m = pick(mons);
      const a = effBreakdown('かくとう', m.ty), b = effBreakdown('ひこう', m.ty);
      const v = a.v * b.v;
      return mk({
        lead: level === 1 ? 'この技の相性は？' : 'この技のダメージは何倍？',
        card: vsCard(sideMove('フライングプレス', 'かくとう', '物理・威力100'), sideMon(m)), ...answerLayout(level, v),
        ex: `<p><b>フライングプレス</b>は、かくとうタイプの技だが<strong>ひこうタイプの相性もかけ合わせる</strong>。</p>
          <p class="calc-line">かくとうの相性 ${fmtMult(a.v)} × ひこうの相性 ${fmtMult(b.v)} ＝ ${fmtMult(v)}</p>${memoHTML(a.memos.concat(b.memos))}`,
        ans: fmtMult(v), tagLabel: 'フライングプレス', title: `フライングプレス → ${m.ja}`
      });
    }
    if (kind === 'teraDef') {
      for (let i = 0; i < 100; i++) {
        const m = pick(mons);
        const tera = pick(TYPES);
        const mt = pick(TYPES);
        const before = eff(mt, m.ty), after = eff1(mt, tera);
        if (Math.random() < 0.7 && before === after) continue;
        const mv = pickMove(mt, level);
        return mk({
          lead: level === 1 ? 'テラスタルしたあとの相性は？' : 'テラスタルしたあと、ダメージは何倍？',
          card: vsCard(sideMove(mv.ja, mt), `<div class="vs-side"><span class="vs-name">${esc(m.ja)}</span>${typesHTML(m.ty, hide)}<span class="cond">テラスタル：${esc(tera)}</span></div>`),
          ...answerLayout(level, after),
          ex: `<p>テラスタルすると、受けるときのタイプは<strong>テラスタイプ（${typeTag(tera)}）だけ</strong>になる。</p>
            <p class="calc-line">${esc(mt)}→${esc(tera)} ＝ ${fmtMult(after)}</p>
            <p>テラスタル前（${typesHTML(m.ty)}）なら ${fmtMult(before)} だった。</p>`,
          ans: fmtMult(after), tagLabel: 'テラスタル（受ける側）', title: `${mv.ja} → テラスタル${tera}の${m.ja}`
        });
      }
      return null;
    }
    if (kind === 'teraBlast') {
      const a = pick(mons), tera = pick(TYPES), m = pick(mons);
      const bd = effBreakdown(tera, m.ty);
      return mk({
        lead: level === 1 ? 'この技の相性は？' : 'この技のダメージは何倍？',
        card: vsCard(`<div class="vs-side"><span class="vs-name">テラバースト</span><span class="vs-sub">${esc(a.ja)}が使う</span><span class="cond">テラスタル：${esc(tera)}</span></div>`, sideMon(m)),
        ...answerLayout(level, bd.v),
        ex: `<p><b>テラバースト</b>は、ふだんはノーマルタイプ。テラスタルすると<strong>テラスタイプ（${typeTag(tera)}）の技</strong>になる。</p>
          <p class="calc-line">${esc(bd.line)}${m.ty.length > 1 ? ' ＝ ' + fmtMult(bd.v) : ''}</p>${memoHTML(bd.memos)}`,
        ans: fmtMult(bd.v), tagLabel: 'テラバースト', title: `テラバースト（${tera}）→ ${m.ja}`
      });
    }
    if (kind === 'weather') {
      const [w, wt] = pick(WEATHERS);
      const m = pick(mons);
      const bd = effBreakdown(wt, m.ty);
      return mk({
        lead: level === 1 ? 'この技の相性は？' : 'この技のダメージは何倍？',
        card: vsCard(`<div class="vs-side"><span class="vs-name">ウェザーボール</span><span class="cond item">天気：${esc(w)}</span></div>`, sideMon(m)),
        ...answerLayout(level, bd.v),
        ex: `<p><b>ウェザーボール</b>は天気でタイプが変わる。${esc(w)}のときは ${typeTag(wt)} タイプ（威力も100になる）。</p>
          <p class="calc-line">${esc(bd.line)}${m.ty.length > 1 ? ' ＝ ' + fmtMult(bd.v) : ''}</p>${memoHTML(bd.memos)}`,
        ans: fmtMult(bd.v), tagLabel: 'ウェザーボール', title: `ウェザーボール（${w}）→ ${m.ja}`
      });
    }
    if (kind === 'bull') {
      const f = pick(TAUROS_FORMS), m = pick(mons);
      const bd = effBreakdown(f.mt, m.ty);
      return mk({
        lead: level === 1 ? 'この技の相性は？' : 'この技のダメージは何倍？',
        card: vsCard(`<div class="vs-side"><span class="vs-name">レイジングブル</span><span class="vs-sub">${esc(f.n)}が使う</span>${typesHTML(f.ty, hide)}</div>`, sideMon(m)),
        ...answerLayout(level, bd.v),
        ex: `<p><b>レイジングブル</b>は、パルデアのケンタロスが使うと<strong>すがたによってタイプが変わる</strong>（コンバット種＝かくとう、ブレイズ種＝ほのお、ウォーター種＝みず）。このケンタロスなら ${typeTag(f.mt)}。</p>
          <p class="calc-line">${esc(bd.line)}${m.ty.length > 1 ? ' ＝ ' + fmtMult(bd.v) : ''}</p>${memoHTML(bd.memos)}`,
        ans: fmtMult(bd.v), tagLabel: 'レイジングブル', title: `レイジングブル → ${m.ja}`
      });
    }
    // status
    const sm = pick(STATUS_MOVES);
    const immune = Math.random() < 0.5;
    const pool = mons.filter((m) => m.ty.some((t) => sm.immune.includes(t)) === immune);
    const m = pick(pool);
    const works = !immune;
    return mk({
      lead: 'この技は効く？', layout: 'grid2',
      card: vsCard(sideMove(sm.move, null, '変化技'), sideMon(m)),
      choices: [{ html: '効く', ok: works }, { html: '効かない', ok: !works }],
      ex: `<p>${esc(sm.note)}</p><p>${esc(m.ja)}は ${typesHTML(m.ty)} なので、<strong>${works ? '効く' : '効かない'}</strong>。</p>`,
      ans: works ? '効く' : '効かない', tagLabel: '状態異常にならないタイプ', title: `${sm.move} → ${m.ja}`
    });
  }

  // ---------- とくせい ----------
  function qAbility(level) {
    const r = Math.random();
    if (r < 0.3) return qKnow('ab', level);
    const mons = visMons();
    const hide = level >= 3;
    if (r < 0.45) return qAbilityAtk(level, mons);
    if (r < 0.55) return qSpeedRace(level, 'ability');
    if (r < 0.62) return qPrankster(level, mons);
    // 受ける側のとくせい
    let m, a;
    if (hide) {
      const pop = POPULAR_ABILITIES.filter(([n, ab]) => MON[n] && MON[n].sp <= spoil() && DEF_ABILITIES[ab]);
      if (!pop.length) return null;
      const [n, ab] = wpick(pop, (p) => weakW('ab:' + p[1]));
      m = MON[n]; a = ab;
    } else {
      const cands = mons.filter((x) => x.ab.some((y) => DEF_ABILITIES[y.n]));
      m = pick(cands);
      a = pick(m.ab.filter((y) => DEF_ABILITIES[y.n])).n;
    }
    const def = DEF_ABILITIES[a];
    let mt;
    if (Math.random() < 0.7) {
      if (def.t) mt = pick(Object.keys(def.t));
      else mt = pick(TYPES.filter((t) => eff(t, m.ty) > 1)) || pick(TYPES);
    } else mt = pick(TYPES);
    const base = eff(mt, m.ty);
    let v = base;
    if (def.t && def.t[mt] != null) v = def.t[mt] === 0 ? 0 : base * def.t[mt];
    if (def.se && base > 1) v = base * def.se;
    const mv = pickMove(mt, level);
    const popNote = (POPULAR_ABILITIES.find((x) => x[0] === m.ja && x[1] === a) || [])[2];
    return {
      mode: 'ability', lead: hide ? '対戦でよく見るとくせいも考えて、ダメージは何倍？' : 'とくせいも考えて、ダメージは何倍？',
      card: `<div class="vs"><div class="vs-side"><span class="vs-name">${esc(mv.ja)}</span>${typesHTML([mt], hide)}</div><span class="vs-arrow">→</span>
        <div class="vs-side"><span class="vs-name">${esc(m.ja)}</span>${typesHTML(m.ty, hide)}<span class="cond${hide ? ' hidden' : ''}">とくせい：${hide ? '？' : esc(abName(m, a))}</span></div></div>`,
      choices: multChoices(v, [base]), layout: 'grid6',
      ex: `<p>${esc(m.ja)}（${typesHTML(m.ty)}）のとくせい「<b>${esc(abName(m, a))}</b>」。${popNote ? esc(popNote) : ''}</p>
        <p>${esc(def.note)}</p>
        <p class="calc-line">${typeTag(mt)} の相性 ${fmtMult(base)}${v !== base ? ` → とくせいで ${fmtMult(v)}` : '（とくせいは関係なし）'}</p>`,
      ans: fmtMult(v), tags: [['ab:' + a, `とくせい「${a}」`]], title: `${mv.ja} → ${m.ja}（${a}）`
    };
  }
  function qAbilityAtk(level, mons) {
    const hide = level >= 3;
    const kind = pick(['skin', 'scrappy', 'moldbreaker', 'tinted']);
    let user, mv, mt, target, v, base, note;
    if (kind === 'skin') {
      user = MON['ニンフィア'];
      mv = pick(MV.filter((x) => ['ハイパーボイス', 'はかいこうせん', 'スピードスター', 'すてみタックル'].includes(x.ja)));
      target = pick(mons);
      base = eff('ノーマル', target.ty); v = eff('フェアリー', target.ty); mt = 'ノーマル';
      note = 'フェアリースキン：ノーマル技がフェアリータイプになる（威力も1.2倍）。だから相性はフェアリー技として計算する。';
    } else if (kind === 'scrappy') {
      user = MON['カラミンゴ'];
      mt = pick(['ノーマル', 'かくとう']);
      mv = pickMove(mt, 1);
      target = pick(mons.filter((m) => m.ty.includes('ゴースト')));
      base = eff(mt, target.ty);
      v = target.ty.reduce((x, t) => x * (t === 'ゴースト' ? 1 : eff1(mt, t)), 1);
      note = 'きもったま：ノーマル・かくとうの技がゴーストタイプにも当たる（ゴーストの部分は1倍として計算）。';
    } else if (kind === 'moldbreaker') {
      user = pick([MON['オノノクス'], MON['デカヌチャン']]);
      mt = 'じめん';
      mv = pick(MV.filter((x) => ['じしん', '10まんばりき', 'じだんだ'].includes(x.ja)));
      target = pick(mons.filter((m) => hasAb(m, 'ふゆう') || hasAb(m, 'どしょく')));
      base = 0; v = eff('じめん', target.ty);
      note = `かたやぶり：相手のとくせいを無視する。${target.ja}の「${hasAb(target, 'ふゆう') ? 'ふゆう' : 'どしょく'}」も無視して、じめん技が当たる。`;
    } else {
      user = pick([MON['モルフォン'], MON['エクスレッグ']]);
      mt = 'むし';
      mv = pickMove('むし', 1);
      target = pick(mons.filter((m) => { const e = eff('むし', m.ty); return e > 0 && e < 1; }));
      base = eff('むし', target.ty); v = base * 2;
      note = 'いろめがね：いまひとつの技のダメージが2倍になる。';
    }
    if (!user || !target || user.sp > spoil()) return null;
    const ab = { skin: 'フェアリースキン', scrappy: 'きもったま', moldbreaker: 'かたやぶり', tinted: 'いろめがね' }[kind];
    return {
      mode: 'ability', lead: '攻める側のとくせいも考えて、相性は何倍？',
      card: `<div class="vs"><div class="vs-side"><span class="vs-name">${esc(mv.ja)}</span>${typesHTML([mt], hide)}<span class="vs-sub">${esc(user.ja)}が使う</span><span class="cond">とくせい：${esc(abName(user, ab))}</span></div>
        <span class="vs-arrow">→</span><div class="vs-side"><span class="vs-name">${esc(target.ja)}</span>${typesHTML(target.ty, hide)}${target.ab.some((x) => DEF_ABILITIES[x.n]) && kind === 'moldbreaker' ? `<span class="cond${hide ? ' hidden' : ''}">とくせい：${hide ? '？' : hasAb(target, 'ふゆう') ? 'ふゆう' : 'どしょく'}</span>` : ''}</div></div>`,
      choices: multChoices(v, [base]), layout: 'grid6',
      ex: `<p>${esc(note)}</p><p class="calc-line">ふつうなら ${fmtMult(base)} → ${fmtMult(v)}</p>`,
      ans: fmtMult(v), tags: [['ab:' + ab, `とくせい「${ab}」`]], title: `${user.ja}（${ab}）の${mv.ja} → ${target.ja}`
    };
  }
  function qPrankster(level, mons) {
    const user = pick(['オーロンゲ', 'ヤミラミ', 'クレッフィ', 'タギングル'].map((n) => MON[n]).filter((m) => m && m.sp <= spoil()));
    if (!user) return null;
    const dark = Math.random() < 0.55;
    const target = pick(mons.filter((m) => m.ty.includes('あく') === dark && !m.ty.includes('でんき') && !m.ty.includes('じめん')));
    const works = !dark;
    return {
      mode: 'ability', lead: 'この技は効く？', layout: 'grid2',
      card: `<div class="vs"><div class="vs-side"><span class="vs-name">でんじは</span><span class="vs-sub">${esc(user.ja)}が使う</span><span class="cond">とくせい：いたずらごころ</span></div>
        <span class="vs-arrow">→</span><div class="vs-side"><span class="vs-name">${esc(target.ja)}</span>${typesHTML(target.ty, level >= 3)}</div></div>`,
      choices: [{ html: '効く', ok: works }, { html: '効かない', ok: !works }],
      ex: `<p>いたずらごころで先に出した変化技は、<strong>あくタイプには効かない</strong>。${esc(target.ja)}は ${typesHTML(target.ty)} なので${works ? '、ふつうに効く（まひになる）' : '効かない'}。</p>`,
      ans: works ? '効く' : '効かない', tags: [['ab:いたずらごころ', 'とくせい「いたずらごころ」']], title: `いたずらごころのでんじは → ${target.ja}`
    };
  }

  /** どっちが先に動く？（とくせい・もちもの） */
  function qSpeedRace(level, mode) {
    const SP_AB = [
      { ab: 'すいすい', cond: '天気：あめ', mul: 2, note: 'すいすい：あめのとき、すばやさが2倍。' },
      { ab: 'ようりょくそ', cond: '天気：はれ', mul: 2, note: 'ようりょくそ：はれのとき、すばやさが2倍。' },
      { ab: 'すなかき', cond: '天気：すなあらし', mul: 2, note: 'すなかき：すなあらしのとき、すばやさが2倍。' },
      { ab: 'ゆきかき', cond: '天気：ゆき', mul: 2, note: 'ゆきかき：ゆきのとき、すばやさが2倍。' },
      { ab: 'かそく', cond: '1ターンたったあと', mul: 1.5, note: 'かそく：ターンの終わりにすばやさが1段階（1.5倍）上がる。' }
    ];
    const SP_ITEM = [
      { item: 'こだわりスカーフ', mul: 1.5, note: 'こだわりスカーフ：すばやさが1.5倍。' },
      { item: 'くろいてっきゅう', mul: 0.5, note: 'くろいてっきゅう：すばやさが半分になる。' }
    ];
    const mons = visMons().filter((m) => m.final);
    for (let i = 0; i < 200; i++) {
      let a, mod;
      if (mode === 'ability') {
        mod = pick(SP_AB);
        const c = mons.filter((m) => hasAb(m, mod.ab));
        if (!c.length) continue;
        a = pick(c);
      } else {
        mod = pick(SP_ITEM);
        a = pick(mons);
      }
      const b = pick(mons);
      if (a === b) continue;
      const sa = speed50(a), sb = speed50(b);
      const sa2 = Math.floor(sa * mod.mul);
      if (sa2 === sb || sa === sb) continue;
      if (Math.random() < 0.6 && (sa > sb) === (sa2 > sb)) continue; // 補正で順番が変わる問題を多めに
      const tr = level >= 3 && Math.random() < 0.3; // トリックルーム
      const first = tr ? (sa2 < sb ? a : b) : (sa2 > sb ? a : b);
      const label = mod.ab ? `とくせい：${mod.ab}` : `もちもの：${mod.item}`;
      return {
        mode: mode === 'ability' ? 'ability' : 'item', lead: 'どっちが先に動く？（2匹ともレベル50・個体値31・すばやさに努力値252・せいかく補正なし）', layout: 'grid2',
        card: `<div class="vs"><div class="vs-side"><span class="vs-name">${esc(a.ja)}</span><span class="vs-sub">すばやさ種族値 ${level >= 3 ? '？' : a.bs[5]}</span><span class="cond${mod.item ? ' item' : ''}">${esc(label)}</span></div>
          <span class="vs-mid">vs</span><div class="vs-side"><span class="vs-name">${esc(b.ja)}</span><span class="vs-sub">すばやさ種族値 ${level >= 3 ? '？' : b.bs[5]}</span></div></div>
          <div class="conds">${mod.cond ? `<span class="cond item">${esc(mod.cond)}</span>` : ''}${tr ? '<span class="cond">トリックルーム中</span>' : ''}</div>`,
        choices: [{ html: esc(a.ja), ok: first === a }, { html: esc(b.ja), ok: first === b }],
        ex: `<p>${esc(mod.note)}${tr ? ' トリックルームの中では、<strong>遅いほうが先</strong>に動く。' : ''}</p>
          <p class="calc-line">${esc(a.ja)}：${sa} × ${mod.mul} ＝ ${sa2}　／　${esc(b.ja)}：${sb}</p>
          <p class="hint">この育て方（個体値31・努力値252）なら、レベル50のすばやさは「種族値＋52」になる。</p>`,
        ans: first.ja, tags: [[mod.ab ? 'ab:' + mod.ab : 'it:' + mod.item, mod.ab ? `とくせい「${mod.ab}」` : `もちもの「${mod.item}」`]],
        title: `${a.ja}（${mod.ab || mod.item}）vs ${b.ja}`
      };
    }
    return null;
  }

  // ---------- もちもの ----------
  function qItem(level) {
    const r = Math.random();
    if (r < 0.35) return qKnow('item', level);
    if (r < 0.45) return qSpeedRace(level, 'item');
    const mons = visMons();
    const hide = level >= 3;
    const kind = pick(['balloon', 'berry', 'berry', 'belt', 'target']);
    let m, mt, base, v, item, note;
    if (kind === 'balloon') {
      m = pick(mons.filter((x) => !x.ty.includes('ひこう') && !hasAb(x, 'ふゆう')));
      mt = Math.random() < 0.7 ? 'じめん' : pick(TYPES);
      base = eff(mt, m.ty); v = mt === 'じめん' ? 0 : base;
      item = 'ふうせん'; note = TYPE_ITEMS.ふうせん + (mt === 'じめん' ? '' : ' じめん以外の技には関係ない。');
    } else if (kind === 'berry') {
      const rr = pickTypeMatch(mons, (t, x) => eff(t, x.ty) > 1);
      if (!rr) return null;
      m = rr.m;
      const match = Math.random() < 0.65;
      mt = match ? rr.mt : pick(TYPES.filter((t) => eff(t, m.ty) > 1 && t !== rr.mt)) || rr.mt;
      item = RESIST_BERRIES[rr.mt];
      base = eff(mt, m.ty);
      v = mt === rr.mt ? base / 2 : base;
      note = `${item}は「${rr.mt}タイプのこうかばつぐんの技」を1回だけ半分にする。${mt === rr.mt ? '' : `今回の技は${mt}タイプなので、関係ない。`}`;
    } else if (kind === 'belt') {
      const rr = pickTypeMatch(mons);
      if (!rr) return null;
      m = rr.m; mt = rr.mt; base = eff(mt, m.ty);
      v = base > 1 ? Math.round(base * 1.2 * 100) / 100 : base;
      item = 'たつじんのおび（攻める側）'; note = TYPE_ITEMS.たつじんのおび + (base > 1 ? '' : ' こうかばつぐんではないので、変わらない。');
    } else {
      const c = mons.filter((x) => TYPES.some((t) => eff(t, x.ty) === 0));
      m = pick(c);
      mt = pick(TYPES.filter((t) => eff(t, m.ty) === 0));
      base = 0;
      v = m.ty.reduce((x, t) => x * (eff1(mt, t) || 1), 1);
      item = 'ねらいのまと'; note = TYPE_ITEMS.ねらいのまと + ' 「こうかなし」の部分は1倍として計算する。';
    }
    const mv = pickMove(mt, level);
    const onAtk = kind === 'belt';
    return {
      mode: 'item', lead: 'もちものも考えて、ダメージは何倍？',
      card: `<div class="vs"><div class="vs-side"><span class="vs-name">${esc(mv.ja)}</span>${typesHTML([mt], hide)}${onAtk ? `<span class="cond item">もちもの：たつじんのおび</span>` : ''}</div><span class="vs-arrow">→</span>
        <div class="vs-side"><span class="vs-name">${esc(m.ja)}</span>${typesHTML(m.ty, hide)}${onAtk ? '' : `<span class="cond item">もちもの：${esc(item)}</span>`}</div></div>`,
      choices: numChoices(v, [base, base * 2, v * 2]), layout: 'list',
      ex: `<p>${esc(note)}</p><p class="calc-line">${typeTag(mt)}→${typesHTML(m.ty)} の相性 ${fmtMult(base)}${v !== base ? ` → ${fmtMult(v)}` : '（変わらない）'}</p>`,
      ans: fmtMult(v), tags: [['it:' + item.replace(/（.*/, ''), `もちもの「${item.replace(/（.*/, '')}」`]], title: `${mv.ja} → ${m.ja}（${item}）`
    };
  }

  // ---------- 種族値 ----------
  function baseHints(a, b, key) {
    const hs = [];
    if (a.root === b.root) hs.push('同じ進化の系統なので、<b>進化が進んでいるほう</b>が合計は高い。');
    [a, b].forEach((m) => {
      if (m.kind === 2) hs.push(`${esc(m.ja)}は<b>伝説のポケモン</b>。伝説は合計がとても高い（いまの範囲の伝説は ${GROUP.leg.min}〜${GROUP.leg.max}）。`);
      if (m.kind === 4) hs.push(`${esc(m.ja)}は<b>パラドックスポケモン</b>（合計 ${GROUP.para.min}〜${GROUP.para.max}）。`);
    });
    if (key === 't') {
      [a, b].forEach((m) => {
        if (m.kind) return;
        const g = groupOf(m);
        if (g) hs.push(`${esc(m.ja)}は${g.label}（平均 ${g.avg}）。`);
      });
    }
    if (key === 5) {
      [a, b].forEach((m) => {
        const f = m.ty.filter((t) => FAST_TYPES.includes(t)), s = m.ty.filter((t) => SLOW_TYPES.includes(t));
        if (f.length) hs.push(`${f.join('・')}タイプは素早いことが多い（最終進化の平均 ${Math.round(TYPE_AVG[f[0]].st[5])}）。`);
        if (s.length) hs.push(`${s.join('・')}タイプはゆっくりなことが多い（最終進化の平均 ${Math.round(TYPE_AVG[s[0]].st[5])}）。`);
      });
    }
    return hs.length ? `<ul>${Array.from(new Set(hs)).map((h) => `<li>${h}</li>`).join('')}</ul>` : '';
  }
  function qBase(level) {
    const kinds = level === 1 ? ['evo', 'evo', 'total', 'total', 'speed', 'band']
      : level === 2 ? ['total', 'speed', 'speed', 'high', 'band', 'trend', 'evo']
        : ['total', 'speed', 'high', 'low', 'trend', 'band'];
    const kind = wpick(kinds, (k) => weakW('base:' + k));
    const mons = visMons();
    const mk = (o) => Object.assign({ mode: 'base' }, o);
    const cmpCard = (a, b, showTypes = true) => `<div class="vs"><div class="vs-side"><span class="vs-name">${esc(a.ja)}</span>${showTypes ? typesHTML(a.ty) : ''}<span class="vs-sub">${esc(stageText(a))}</span>${kindBadge(a)}</div>
      <span class="vs-mid">vs</span><div class="vs-side"><span class="vs-name">${esc(b.ja)}</span>${showTypes ? typesHTML(b.ty) : ''}<span class="vs-sub">${esc(stageText(b))}</span>${kindBadge(b)}</div></div>`;
    const cmpEx = (a, b, key) => `<div class="cmp2"><div><h4>${esc(a.ja)}</h4>${sbars(a, key === 't' ? -1 : key)}</div><div><h4>${esc(b.ja)}</h4>${sbars(b, key === 't' ? -1 : key)}</div></div>${baseHints(a, b, key)}`;

    if (kind === 'evo') {
      const lines = Array.from(new Set(mons.filter((m) => m.stages > 1).map((m) => m.root)));
      for (let i = 0; i < 50; i++) {
        const l = lineOfRoot(pick(lines)).filter((m) => m.sp <= spoil());
        if (l.length < 2) continue;
        const [a, b] = shuffle(l).slice(0, 2);
        if (a.stage === b.stage || a.tot === b.tot) continue;
        const hi = a.tot > b.tot ? a : b;
        return mk({
          lead: '種族値の合計が高いのはどっち？', layout: 'grid2', card: cmpCard(a, b),
          choices: [{ html: esc(a.ja), ok: hi === a }, { html: esc(b.ja), ok: hi === b }],
          ex: `<p><b>${esc(hi.ja)}</b>（${hi.tot}）のほうが高い。${esc((hi === a ? b : a).ja)}は ${(hi === a ? b : a).tot}。</p>${cmpEx(a, b, 't')}`,
          ans: hi.ja, tags: [['base:evo', '進化の前と後']], title: `${a.ja} vs ${b.ja}（合計）`
        });
      }
      return null;
    }
    if (kind === 'total' || kind === 'speed') {
      const key = kind === 'total' ? 't' : 5;
      const val = (m) => (key === 't' ? m.tot : m.bs[5]);
      const [lo, hi] = key === 't' ? [[120, 999], [40, 119], [5, 39]][level - 1] : [[40, 999], [15, 39], [1, 14]][level - 1];
      const pool = level === 1 ? mons : mons.filter((m) => m.final || Math.random() < 0.4);
      for (let i = 0; i < 400; i++) {
        const a = pick(pool), b = pick(pool);
        if (a === b) continue;
        const d = Math.abs(val(a) - val(b));
        if (d < lo || d > hi) continue;
        const w = val(a) > val(b) ? a : b;
        return mk({
          lead: key === 't' ? '種族値の合計が高いのはどっち？' : 'すばやさの種族値が高いのはどっち？', layout: 'grid2', card: cmpCard(a, b),
          choices: [{ html: esc(a.ja), ok: w === a }, { html: esc(b.ja), ok: w === b }],
          ex: `<p><b>${esc(w.ja)}</b>（${val(w)}）のほうが高い。${esc((w === a ? b : a).ja)}は ${val(w === a ? b : a)}（差 ${d}）。</p>${cmpEx(a, b, key)}`,
          ans: w.ja, tags: [['base:' + kind, key === 't' ? '合計の比較' : 'すばやさの比較']], title: `${a.ja} vs ${b.ja}（${key === 't' ? '合計' : 'すばやさ'}）`
        });
      }
      return null;
    }
    if (kind === 'high' || kind === 'low') {
      for (let i = 0; i < 300; i++) {
        const m = pick(mons);
        const idx = [0, 1, 2, 3, 4, 5].sort((x, y) => (kind === 'high' ? m.bs[y] - m.bs[x] : m.bs[x] - m.bs[y]));
        const margin = Math.abs(m.bs[idx[0]] - m.bs[idx[1]]);
        if (margin === 0 || (level === 2 && margin < 15) || (level === 3 && margin > 25)) continue;
        const wrong = shuffle(idx.slice(1)).slice(0, 3);
        return mk({
          lead: kind === 'high' ? 'いちばん高い能力はどれ？（種族値）' : 'いちばん低い能力はどれ？（種族値）',
          card: `<div class="vs-side"><span class="vs-name">${esc(m.ja)}</span>${typesHTML(m.ty)}<span class="vs-sub">${esc(stageText(m))}</span></div>`,
          choices: shuffle([idx[0], ...wrong]).map((s) => ({ html: STAT_JA[s], ok: s === idx[0] })), layout: 'list',
          ex: `<p><b>${STAT_JA[idx[0]]}</b>（${m.bs[idx[0]]}）が${kind === 'high' ? 'いちばん高い' : 'いちばん低い'}。</p>${sbars(m, idx[0])}`,
          ans: STAT_JA[idx[0]], tags: [['base:' + kind, kind === 'high' ? '得意な能力' : '苦手な能力']], title: `${m.ja}の${kind === 'high' ? '高い' : '低い'}能力`
        });
      }
      return null;
    }
    if (kind === 'band') {
      const BANDS = [[0, 299, '300未満'], [300, 399, '300台'], [400, 499, '400台'], [500, 599, '500台'], [600, 999, '600以上']];
      const m = pick(mons);
      const bi = BANDS.findIndex(([a, b]) => m.tot >= a && m.tot <= b);
      const start = Math.max(0, Math.min(BANDS.length - 4, bi - rnd(0, 3)));
      const opts = BANDS.slice(start, start + 4);
      const g = groupOf(m);
      return mk({
        lead: '種族値の合計はどのくらい？',
        card: `<div class="vs-side"><span class="vs-name">${esc(m.ja)}</span>${typesHTML(m.ty)}<span class="vs-sub">${esc(stageText(m))}</span>${kindBadge(m)}</div>`,
        choices: opts.map((o) => ({ html: o[2], ok: o === BANDS[bi] })), layout: 'list',
        ex: `<p>合計は <b>${m.tot}</b>。${g ? `${esc(g.label)}の平均は ${g.avg}。` : ''}</p>${sbars(m)}`,
        ans: BANDS[bi][2], tags: [['base:band', '合計のだいたいの値']], title: `${m.ja}の合計`
      });
    }
    // trend
    const key = pick([5, 't', 2, 3, 1]);
    const order = typeRank(key);
    const ans = order[0];
    const wrong = shuffle(order.slice(6)).slice(0, 3);
    const what = key === 't' ? '種族値の合計' : STAT_JA[key];
    return mk({
      lead: `最終進化のポケモン（伝説・パラドックスを除く。いまのネタバレ範囲の中）で、${what}の平均がいちばん高いタイプは？`,
      card: `<div class="q-main">${esc(what)}の平均がいちばん高いタイプ</div>`,
      choices: shuffle([ans, ...wrong]).map((t) => ({ html: typeTag(t), ok: t === ans })), layout: 'list',
      ex: `<p><b>${typeTag(ans)}</b>（平均 ${Math.round(valOf(ans, key))}）。上位：${order.slice(0, 4).map((t) => `${typeTag(t)} ${Math.round(valOf(t, key))}`).join(' ')}</p>
        <p class="hint">下位：${order.slice(-3).map((t) => `${typeTag(t)} ${Math.round(valOf(t, key))}`).join(' ')}</p>`,
      ans, tags: [['base:trend', 'タイプごとの傾向']], title: `${what}の平均が高いタイプ`
    });
  }

  // ---------- 知識問題 ----------
  function qKnow(c, level) {
    // 1回のクイズの中では、同じ知識問題は出さない（出し切ったら null）
    const pool = KNOWLEDGE.filter((k) => k.c === c && k.l <= level && (k.sp || 0) <= spoil() && !(quiz && quiz.used.has(k.q)));
    if (!pool.length) return null;
    const k = wpick(pool, (x) => weakW('k:' + x.tag) * (x.l === level ? 2 : 1));
    if (quiz) quiz.used.add(k.q);
    return {
      mode: c === 'ab' ? 'ability' : c === 'base' ? 'base' : c, lead: '',
      card: `<div class="q-main long">${esc(k.q)}</div>`,
      choices: listChoices(esc(k.a[0]), k.a.slice(1).map(esc)), layout: 'list',
      ex: `<p>${esc(k.ex)}</p>`, ans: k.a[0], tags: [['k:' + k.tag, k.tag]], title: k.q
    };
  }

  // ---------- 個体値・努力値・せいかくの数字 ----------
  function pickStatMon() {
    const m = pick(visMons().filter((x) => x.final));
    const s = rnd(0, 5);
    return { m, s };
  }
  function qIV(level) {
    const r = Math.random();
    if (r < 0.55) return qKnow('iv', level) || qIVJudge();
    if (r < 0.75 || level === 1) return qIVJudge();
    return qIVNum();
  }
  function qIVJudge() {
    {
      const iv = pick([0, rnd(1, 15), rnd(16, 25), rnd(26, 29), 30, 31]);
      const J = [[31, 31, 'さいこう'], [30, 30, 'すばらしい'], [26, 29, 'すごくいい'], [16, 25, 'かなりいい'], [1, 15, 'まあまあ'], [0, 0, 'ダメかも']];
      const ans = J.find(([a, b]) => iv >= a && iv <= b)[2];
      return {
        mode: 'iv', lead: 'ジャッジでは、何と表示される？',
        card: `<div class="q-main">個体値 ${iv}</div>`,
        choices: listChoices(ans, shuffle(J.map((j) => j[2]).filter((w) => w !== ans))), layout: 'list',
        ex: `<p>さいこう＝31、すばらしい＝30、すごくいい＝26〜29、かなりいい＝16〜25、まあまあ＝1〜15、ダメかも＝0。</p>`,
        ans, tags: [['iv:judge', 'ジャッジの言葉']], title: `個体値${iv}のジャッジ`
      };
    }
  }
  function qIVNum() {
    const { m, s } = pickStatMon();
    const hp = s === 0;
    const v0 = calcStat(m.bs[s], 0, 0, 50, hp), v31 = calcStat(m.bs[s], 31, 0, 50, hp);
    return {
      mode: 'iv', lead: 'レベル50・努力値0・せいかく補正なしのとき',
      card: `<div class="q-main long">${esc(m.ja)}の${STAT_JA[s]}（種族値 ${m.bs[s]}）は、個体値0なら <b>${v0}</b>。<br>個体値31なら？</div>`,
      choices: numberChoices(v31, [v0 + 31, v0 + 4, v0 + 62]), layout: 'list',
      ex: `<p>レベル50では、個体値2につき実数値が約1上がる。0→31で <b>＋${v31 - v0}</b>。</p><p class="calc-line">${v0} → ${v31}</p><p class="hint">レベル100なら個体値1につき1上がるので、差は31になる。</p>`,
      ans: String(v31), tags: [['iv:num', '個体値で変わる実数値']], title: `${m.ja}の${STAT_JA[s]}（個体値31）`
    };
  }
  function numberChoices(ans, traps) {
    const set = [ans];
    traps.concat([ans + 8, ans - 8, ans + 16]).forEach((t) => { if (set.length < 4 && t > 0 && !set.includes(t)) set.push(t); });
    return shuffle(set.map((v) => ({ html: String(v), ok: v === ans })));
  }
  const EV_ITEMS = [
    ['マックスアップ', 'タウリン', 'ブロムヘキシン', 'リゾチウム', 'キトサン', 'インドメタシン'],
    ['ザロクのみ', 'ネコブのみ', 'タポルのみ', 'ロメのみ', 'ウブのみ', 'マトマのみ']
  ];
  function qEV(level) {
    const r = Math.random();
    if (r < 0.45) return qKnow('ev', level);
    if (r < 0.65 || level === 1) {
      const which = rnd(0, 1), s = rnd(0, 5);
      const ans = EV_ITEMS[which][s];
      const reverse = level >= 2 && Math.random() < 0.4;
      if (reverse) {
        return {
          mode: 'ev', lead: which ? 'このきのみで努力値が減るのは？' : 'このアイテムで努力値が増えるのは？',
          card: `<div class="q-main">${esc(ans)}</div>`,
          choices: listChoices(STAT_JA[s], shuffle(STAT_JA.filter((x, i) => i !== s))), layout: 'list',
          ex: `<p>${esc(ans)}は${STAT_JA[s]}の努力値を${which ? '10減らす' : '10増やす'}。</p>${evTableMini(which, s)}`,
          ans: STAT_JA[s], tags: [['ev:item' + which, which ? '努力値を減らすきのみ' : 'えいようドリンク']], title: `${ans}の能力`
        };
      }
      return {
        mode: 'ev', lead: which ? 'この能力の努力値を10減らすきのみは？' : 'この能力の努力値を10増やすアイテムは？',
        card: `<div class="q-main">${STAT_JA[s]}</div>`,
        choices: listChoices(esc(ans), shuffle(EV_ITEMS[which].filter((x) => x !== ans))), layout: 'list',
        ex: `${evTableMini(which, s)}`,
        ans, tags: [['ev:item' + which, which ? '努力値を減らすきのみ' : 'えいようドリンク']], title: `${STAT_JA[s]}の${which ? 'きのみ' : 'アイテム'}`
      };
    }
    if (r < 0.8) {
      const a = pick([252, 252, 244, 196, 180, 156, 124, 100, 60, 4]), b = pick([252, 252, 236, 212, 164, 92, 52, 20, 4].filter((x) => x + a <= 510));
      const s = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 2);
      const ans = 510 - a - b;
      return {
        mode: 'ev', lead: '努力値の合計は510まで。のこりはいくつ？',
        card: `<div class="q-main">${STAT_JA[s[0]]} ${a}　${STAT_JA[s[1]]} ${b}</div>`,
        choices: numberChoices(ans, [Math.abs(504 - a - b), Math.abs(512 - a - b), ans + 10].filter((x) => x !== ans)), layout: 'list',
        ex: `<p class="calc-line">510 − ${a} − ${b} ＝ ${ans}</p><p>1つの能力は252まで、合計は510まで。252を2つ入れると残りは6になる（レベル50では4だけ使えば十分）。</p>`,
        ans: String(ans), tags: [['ev:budget', '努力値の合計（510）']], title: `のこりの努力値（${a}・${b}）`
      };
    }
    const { m, s } = pickStatMon();
    const hp = s === 0;
    const lv = level >= 3 && Math.random() < 0.5 ? 100 : 50;
    const v0 = calcStat(m.bs[s], 31, 0, lv, hp), v252 = calcStat(m.bs[s], 31, 252, lv, hp);
    return {
      mode: 'ev', lead: `レベル${lv}・個体値31・せいかく補正なしのとき`,
      card: `<div class="q-main long">${esc(m.ja)}の${STAT_JA[s]}（種族値 ${m.bs[s]}）は、努力値0なら <b>${v0}</b>。<br>努力値252なら？</div>`,
      choices: numberChoices(v252, lv === 50 ? [v0 + 63, v0 + 16, v0 + 25] : [v0 + 32, v0 + 126, v0 + 25]), layout: 'list',
      ex: `<p>レベル${lv}では、努力値${lv === 50 ? 8 : 4}につき実数値が1上がる。252で <b>＋${v252 - v0}</b>。</p><p class="calc-line">${v0} → ${v252}</p>`,
      ans: String(v252), tags: [['ev:num', '努力値で変わる実数値']], title: `${m.ja}の${STAT_JA[s]}（努力値252）`
    };
  }
  const evTableMini = (which, s) => `<p class="hint">${EV_ITEMS[which].map((x, i) => `${i === s ? '<b>' : ''}${STAT_JA[i]}＝${esc(x)}${i === s ? '</b>' : ''}`).join('、')}</p>`;

  const POP_NATURES = ['いじっぱり', 'ようき', 'ひかえめ', 'おくびょう', 'ずぶとい', 'おだやか', 'わんぱく', 'しんちょう', 'ゆうかん', 'れいせい'];
  const natText = (n) => (n[1] ? `${STAT_JA[n[1]]}↑ ${STAT_JA[n[2]]}↓` : '補正なし');
  // やさしい：アタッカーの定番4つだけを出す
  const BASIC_NATURES = ['いじっぱり', 'ようき', 'ひかえめ', 'おくびょう'];
  const natByName = (name) => NATURES.find((n) => n[0] === name);
  /** せいかくの名前（show なら補正もつける） */
  const natLabel = (name, show) => (show ? `${name}（${natText(natByName(name))}）` : name);
  function qNature(level) {
    // 出題の割合：最初は「アタッカーとして育てるなら？」を多めに。せいかくの補正の暗記は少なめ
    const W = {
      1: { know: 15, fit: 75, stat: 5, name: 5, calc: 0 },
      2: { know: 20, fit: 50, stat: 15, name: 15, calc: 0 },
      3: { know: 20, fit: 40, stat: 10, name: 10, calc: 20 }
    }[level];
    const kind = wpick(Object.keys(W), (k) => W[k]);
    if (kind === 'know') return qKnow('nature', level) || qNatureFit(level);
    if (kind === 'fit') return qNatureFit(level);
    const basic = level === 1;
    const nats = NATURES.filter((n) => n[1] && (level >= 3 || (basic ? BASIC_NATURES : POP_NATURES).includes(n[0])));
    if (kind === 'stat') {
      const n = pick(nats);
      const wrong = shuffle(NATURES.filter((x) => x[1] && x !== n && (!basic || BASIC_NATURES.includes(x[0])))).slice(0, 3);
      if (Math.random() < 0.5) wrong[0] = [null, n[2], n[1]]; // 上下を逆にしたひっかけ
      return {
        mode: 'nature', lead: 'このせいかくで、上がる能力と下がる能力は？',
        card: `<div class="q-main">${esc(n[0])}</div>`,
        choices: listChoices(natText(n), wrong.map(natText).concat(shuffle(NATURES.filter((x) => x[1] && x !== n)).map(natText))), layout: 'list',
        ex: `<p>${esc(n[0])}は ${STAT_JA[n[1]]}が1.1倍、${STAT_JA[n[2]]}が0.9倍。</p>`,
        ans: natText(n), tags: [['nat:' + n[0], `せいかく「${n[0]}」`]], title: `${n[0]}の補正`
      };
    }
    if (kind === 'name') {
      const n = pick(nats);
      // やさしいは定番4つの中から選ぶ。ふつう以上は、上がる・下がる能力が似たせいかくでまぎらわしくする
      const wrong = basic ? NATURES.filter((x) => x !== n && BASIC_NATURES.includes(x[0]))
        : shuffle(NATURES.filter((x) => x[1] && x !== n && (x[1] === n[1] || x[2] === n[2] || x[1] === n[2]))).slice(0, 3);
      return {
        mode: 'nature', lead: basic ? 'この補正になるせいかくは？（よく使う4つから）' : 'この補正になるせいかくは？',
        card: `<div class="q-main">${esc(natText(n))}</div>`,
        choices: listChoices(esc(n[0]), wrong.map((x) => esc(x[0])).concat(basic ? [] : shuffle(NATURES.filter((x) => x[1] && x !== n)).map((x) => esc(x[0])))), layout: 'list',
        ex: `<p>${esc(n[0])}：${esc(natText(n))}。${wrong.map((x) => `${esc(x[0])}：${esc(natText(x))}`).join('、')}</p>`,
        ans: n[0], tags: [['nat:' + n[0], `せいかく「${n[0]}」`]], title: `${natText(n)}のせいかく`
      };
    }
    return qNatureCalc();
  }
  function qNatureFit(level) {
    const basic = level === 1;
    {
      // このポケモンに合うせいかく
      for (let i = 0; i < 200; i++) {
        const m = pick(visMons().filter((x) => x.final));
        const A = m.bs[1], C = m.bs[3];
        const phys = A >= C + 25, spec = C >= A + 25;
        if (!phys && !spec) continue;
        const good = phys ? ['いじっぱり', 'ようき'] : ['ひかえめ', 'おくびょう'];
        const bad = phys ? ['ひかえめ', 'おくびょう', 'ずぶとい', 'おだやか'] : ['いじっぱり', 'ようき', 'わんぱく', 'しんちょう'];
        // やさしいは、攻撃に使う能力が上がるせいかく（いじっぱり・ひかえめ）を正解にすることが多い
        const ans = basic && Math.random() < 0.8 ? good[0] : pick(good);
        const show = basic; // やさしいは選択肢に補正も書く
        const main = phys ? 'こうげき' : 'とくこう', sub = phys ? 'とくこう' : 'こうげき';
        const why = ans === good[0]
          ? `${natLabel(ans, true)} は、攻撃に使う${main}が上がり、使わない${sub}が下がるので、アタッカーにぴったり。`
          : `この選択肢には「${main}↑」のせいかくがない。${natLabel(ans, true)} は、すばやさが上がって先に動きやすくなり、下がるのは使わない${sub}なので、選択肢の中ではいちばん合う（${natLabel(good[0], true)} があれば、それもよい選択）。`;
        return {
          mode: 'nature', lead: 'このポケモンを、攻撃技でダメージを与えるアタッカーとして育てるなら、選択肢の中でいちばん合うせいかくは？',
          card: `<div class="vs-side"><span class="vs-name">${esc(m.ja)}</span>${typesHTML(m.ty)}</div>${sbars(m)}`,
          choices: listChoices(esc(natLabel(ans, show)), shuffle(bad).slice(0, 3).map((x) => esc(natLabel(x, show)))), layout: 'list',
          ex: `<p>${esc(m.ja)}は${phys ? 'こうげき' : 'とくこう'}（${phys ? A : C}）のほうが${phys ? 'とくこう' : 'こうげき'}（${phys ? C : A}）より高い<b>${phys ? '物理' : '特殊'}アタッカー</b>向き。</p><p>${why}ほかの選択肢はどれも、攻撃に使う${main}が下がってしまう。</p><p class="hint">パーティでの役割によっては、攻撃を受け止める耐久型（ぼうぎょ↑のわんぱく・ずぶとい、とくぼう↑のしんちょう・おだやか など）に育てることもある。この問題は「アタッカーとして育てるなら」の場合。</p>`,
          ans: natLabel(ans, true), tags: [['nat:fit', 'アタッカーに合うせいかく']], title: `${m.ja}をアタッカーにするなら`
        };
      }
      return null;
    }
  }
  function qNatureCalc() {
    const base = rnd(80, 200), up = Math.random() < 0.6;
    const ans = Math.floor(base * (up ? 1.1 : 0.9));
    return {
      mode: 'nature', lead: 'せいかく補正なしの実数値がこの値のとき',
      card: `<div class="q-main long">実数値 <b>${base}</b> の能力が、せいかくで${up ? '上がる' : '下がる'}と？</div>`,
      choices: numberChoices(ans, [up ? base + 10 : base - 10, Math.floor(base * (up ? 1.5 : 0.5)), Math.floor(base * (up ? 0.9 : 1.1))]), layout: 'list',
      ex: `<p class="calc-line">${base} × ${up ? '1.1' : '0.9'} ＝ ${ans}（小数点以下は切り捨て）</p>`,
      ans: String(ans), tags: [['nat:calc', 'せいかく補正の計算']], title: `実数値${base}の${up ? '1.1' : '0.9'}倍`
    };
  }

  // ---------- ダメージの倍率 ----------
  function qDmg(level) {
    const r = Math.random();
    if (r < 0.35) return qKnow('dmg', level);
    if (r < 0.5 && level >= 2) {
      const n = pick([-6, -4, -3, -2, -1, 1, 2, 3, 4, 6]);
      const v = n > 0 ? (2 + n) / 2 : 2 / (2 - n);
      const fr = fracStr;
      const opts = n > 0 ? [v, 1 + n, 1 + 0.5 * n + 0.5, n * 2] : [v, 1 - 0.1 * -n, 1 / (1 - n), 0.5 ** -n];
      const uniq = []; opts.forEach((x) => { if (!uniq.some((y) => Math.abs(x - y) < 1e-9) && x > 0) uniq.push(x); });
      while (uniq.length < 4) uniq.push(uniq[uniq.length - 1] * 1.5);
      return {
        mode: 'dmg', lead: 'ランク（能力変化）がこのとき、能力は何倍？',
        card: `<div class="q-main">ランク ${n > 0 ? '＋' : '−'}${Math.abs(n)}</div>`,
        choices: shuffle(uniq.slice(0, 4).map((x) => ({ html: `${fr(x)}倍`, ok: Math.abs(x - v) < 1e-9 }))), layout: 'list',
        ex: `<p>上がるときは ＋1ごとに0.5ずつ増える（1.5, 2, 2.5 … 4倍）。下がるときは 2/3, 1/2, 2/5, 1/3, 2/7, 1/4倍。</p><p class="calc-line">${n > 0 ? `(2＋${n}) ÷ 2` : `2 ÷ (2＋${-n})`} ＝ ${fr(v)}倍</p>`,
        ans: fr(v) + '倍', tags: [['dmg:rank', 'ランクの倍率']], title: `ランク${n > 0 ? '+' : ''}${n}`
      };
    }
    const nF = level === 1 ? 2 : level === 2 ? rnd(2, 3) : rnd(3, 4);
    const kind = pick(['p', 's']);
    for (let t = 0; t < 100; t++) {
      const pool = shuffle(DMG_FACTORS.filter((f) => f.l <= level && (!f.k || f.k === kind)));
      const fs = [];
      const gs = new Set();
      for (const f of pool) {
        if (fs.length >= nF) break;
        if (gs.has(f.g)) continue;
        fs.push(f); gs.add(f.g);
      }
      if (fs.length < nF) continue;
      if (level === 1 && !fs.some((f) => f.g === 'stab' || f.g === 'eff')) continue;
      const ans = fs.reduce((x, f) => x * f.v, 1);
      const sumTrap = 1 + sum(fs.map((f) => f.v - 1));
      const drop = fs.slice(1).reduce((x, f) => x * f.v, 1);
      return {
        mode: 'dmg', lead: 'なにもないときとくらべて、ダメージはだいたい何倍？',
        card: `<div class="q-lead">${kind === 'p' ? '物理技' : '特殊技'}で攻撃</div><ul class="factor-list">${fs.map((f) => `<li>${esc(f.n)}</li>`).join('')}</ul>`,
        choices: numChoices(ans, [sumTrap, drop, ans * 1.5]), layout: 'list',
        ex: `<p>倍率は<strong>かけ算</strong>。</p><p class="calc-line">${fs.map((f) => fmtFactor(f.v)).join(' × ')} ＝ ${fmtMult(ans)}</p><ul>${fs.map((f) => `<li><b>${esc(f.n)}</b>：${esc(f.ex)}</li>`).join('')}</ul>`,
        ans: fmtMult(ans), tags: [['dmg:combo', '倍率のかけ算']], title: fs.map((f) => f.n).join('＋')
      };
    }
    return null;
  }

  // ---------- 技の分類 ----------
  const CALC_ODD = new Set(['サイコショック', 'サイコブレイク', 'ボディプレス', 'イカサマ', 'テラバースト', 'しぜんのちから', 'ジャイロボール', 'けたぐり', 'くさむすび', 'ヘビーボンバー', 'ヒートスタンプ', 'エレキボール', 'ふんか', 'しおふき', 'じたばた', 'きしかいせい', 'からげんき', 'アシストパワー']);
  const SPECIAL_DMG_GROUP = { fixed: '固定ダメージの技', counter: '受けたダメージを返す技', ohko: '一撃必殺の技', vary: '威力が条件で変わる技' };
  /** 技の分類の解説（威力で決まらない技は特例として説明する） */
  function catExplain(mv) {
    const sd = SPECIAL_DMG[mv.ja];
    const head = `<p>${esc(mv.ja)}（${typeTag(mv.ty)}）は <b>${mv.cat}技</b>${mv.pw > 1 ? `（威力${mv.pw}）` : ''}。`;
    if (sd) {
      const noStat = sd[0] === 'fixed' || sd[0] === 'counter' || sd[0] === 'ohko';
      return `${head}</p><div class="worked-mini"><b>特例：${SPECIAL_DMG_GROUP[sd[0]]}</b><br>${esc(sd[1])}。${noStat ? `ダメージは${mv.cat === '物理' ? 'こうげき' : 'とくこう'}の高さでは決まらない。分類は、カウンター（物理技を返す）・ミラーコート（特殊技を返す）で返されるかどうか などに関係する。` : `分類どおり${mv.cat === '物理' ? 'こうげき' : 'とくこう'}で計算するが、威力が決まっていない。`}</div>`;
    }
    return head + (mv.cat === '物理' ? 'こうげきで計算し、やけど・リフレクターで弱まる。' : mv.cat === '特殊' ? 'とくこうで計算し、ひかりのかべ・とつげきチョッキで弱まる。' : 'ダメージは与えない。ちょうはつされると出せない。') + '</p>';
  }
  function qCat(level) {
    const r = Math.random();
    if (r < 0.3) { const k = qKnow('cat', level); if (k) return k; }
    if (r < 0.6) {
      // この技の分類は？
      // やさしいでは、威力で決まらない技（ナイトヘッド など）は出さない
      const pool = MV.filter((m) => m.n >= (level === 1 ? 60 : level === 2 ? 25 : 8) && !ODD_MOVES.has(m.ja) && !(level === 1 && SPECIAL_DMG[m.ja]));
      const want = wpick(['物理', '特殊', '変化'], (c) => (c === '変化' ? 1 : 1.5));
      const mv = pick(pool.filter((m) => m.cat === want));
      return {
        mode: 'cat', lead: 'この技の分類は？', layout: 'list',
        card: `<div class="vs-side"><span class="vs-name">${esc(mv.ja)}</span>${typesHTML([mv.ty], level >= 3)}${mv.pw && level === 1 ? `<span class="vs-sub">威力${mv.pw}</span>` : ''}</div>`,
        choices: [['物理', 'こうげきで、ぼうぎょに当てる'], ['特殊', 'とくこうで、とくぼうに当てる'], ['変化', 'ダメージを与えない']].map(([c, d]) => ({ html: `${c}${level === 1 ? `<small>${d}</small>` : ''}`, ok: c === mv.cat })),
        ex: catExplain(mv),
        ans: `${mv.cat}`, tags: [['cat:kind', '技の分類（物理・特殊・変化）']], title: `${mv.ja}の分類`
      };
    }
    // どっちの技を使う？
    const usable = ATK_MOVES.filter((m) => !CALC_ODD.has(m.ja) && m.pw >= 60 && m.n >= (level === 1 ? 15 : 5));
    for (let i = 0; i < 200; i++) {
      if (level === 1) {
        const t = pick(TYPES);
        const ph = usable.filter((m) => m.ty === t && m.cat === '物理'), sp = usable.filter((m) => m.ty === t && m.cat === '特殊');
        if (!ph.length || !sp.length) continue;
        const a = pick(ph), b = pick(sp);
        if (a.pw / b.pw > 1.6 || b.pw / a.pw > 1.6) continue; // 威力が近い組だけ（分類で決まるように）
        const phys = Math.random() < 0.5;
        const ans = phys ? a : b;
        return {
          mode: 'cat', lead: `${t}タイプの${phys ? '物理' : '特殊'}アタッカー（${phys ? 'こうげき' : 'とくこう'}が高い）なら、どっちの技を使う？`, layout: 'grid2',
          card: `<div class="q-main">${typeTag(t)} の${phys ? '物理' : '特殊'}アタッカー</div><div class="q-sub">${phys ? 'こうげき' : 'とくこう'}が高く、${phys ? 'とくこう' : 'こうげき'}は低い</div>`,
          choices: shuffle([a, b]).map((m) => ({ html: `${esc(m.ja)}<small>${m.cat}・威力${m.pw}</small>`, ok: m === ans })),
          ex: `<p>${esc(a.ja)}は<b>物理</b>（威力${a.pw}）、${esc(b.ja)}は<b>特殊</b>（威力${b.pw}）。${phys ? 'こうげき' : 'とくこう'}が高いので、<b>${esc(ans.ja)}</b>のほうが大きなダメージになる。</p><p class="hint">タイプが同じでも、物理技と特殊技がある。自分の高い能力を使う分類の技を選ぼう。</p>`,
          ans: ans.ja, tags: [['cat:pick', 'アタッカーに合う技の分類']], title: `${t}・${phys ? '物理' : '特殊'}：${a.ja}と${b.ja}`
        };
      }
      const m = pick(visMons().filter((x) => x.final && Math.abs(x.bs[1] - x.bs[3]) >= 30));
      if (!m) return null;
      const t = pick(m.ty);
      const ph = usable.filter((x) => x.ty === t && x.cat === '物理'), sp = usable.filter((x) => x.ty === t && x.cat === '特殊');
      if (!ph.length || !sp.length) continue;
      const a = pick(ph), b = pick(sp);
      const va = a.pw * m.bs[1], vb = b.pw * m.bs[3];
      if (Math.max(va, vb) / Math.min(va, vb) < 1.2) continue; // 差がはっきりした組だけ
      const ans = va > vb ? a : b;
      const hide = level >= 3;
      return {
        mode: 'cat', lead: `${m.ja}がタイプ一致の${t}技を使うなら、どっちの技がダメージが大きい？`, layout: 'grid2',
        card: `<div class="vs-side"><span class="vs-name">${esc(m.ja)}</span>${typesHTML(m.ty)}</div>${sbars(m, ans === a ? 1 : 3)}`,
        choices: shuffle([a, b]).map((x) => ({ html: `${esc(x.ja)}${hide ? '' : `<small>威力${x.pw}</small>`}`, ok: x === ans })),
        ex: `<p>${esc(a.ja)}は<b>物理</b>（威力${a.pw}）、${esc(b.ja)}は<b>特殊</b>（威力${b.pw}）。</p>
          <p class="calc-line">${esc(a.ja)}：${a.pw} × こうげき${m.bs[1]} ＝ ${va}　／　${esc(b.ja)}：${b.pw} × とくこう${m.bs[3]} ＝ ${vb}</p>
          <p>ざっくり「威力 × 使う能力（種族値）」でくらべると、<b>${esc(ans.ja)}</b>のほうが約${(Math.max(va, vb) / Math.min(va, vb)).toFixed(1)}倍強い。</p>`,
        ans: ans.ja, tags: [['cat:pick', 'アタッカーに合う技の分類']], title: `${m.ja}：${a.ja}と${b.ja}`
      };
    }
    return null;
  }

  // ---------- 割合ダメージ ----------
  const FRAC = { 0.5: '1/2', 0.25: '1/4', 0.125: '1/8', 0.0625: '1/16', 0.03125: '1/32' };
  function qChip(level) {
    const r = Math.random();
    if (r < 0.45) return qKnow('chip', level);
    if (r < 0.85) {
      const pool = visMons().filter((m) => m.final || level === 1);
      const want = pick([4, 2, 1, 0.5, 0.25]);
      const c = pool.filter((m) => eff('いわ', m.ty) === want);
      const m = pick(c.length ? c : pool);
      const v = eff('いわ', m.ty) / 8;
      const hide = level >= 3;
      const bd = effBreakdown('いわ', m.ty);
      return {
        mode: 'chip', lead: 'ステルスロックがまかれた場に出てきた。最大HPのどれだけ減る？', layout: 'grid6',
        card: `<div class="vs-side"><span class="vs-name">${esc(m.ja)}</span>${typesHTML(m.ty, hide)}</div>`,
        choices: [0.5, 0.25, 0.125, 0.0625, 0.03125].map((x) => ({ html: FRAC[x], ok: x === v })),
        ex: `<p>ステルスロックは「1/8 × いわタイプの相性」。</p><p class="calc-line">${esc(bd.line)}${m.ty.length > 1 ? ' ＝ ' + fmtMult(bd.v) : ''} → 1/8 × ${fracStr(bd.v)} ＝ <b>${FRAC[v]}</b></p>`,
        ans: FRAC[v], tags: [['chip:sr', 'ステルスロックの割合']], title: `ステルスロック → ${m.ja}`
      };
    }
    const turn = rnd(1, 5);
    return {
      mode: 'chip', lead: 'もうどく状態。このターンの終わりに減るのは最大HPの？', layout: 'list',
      card: `<div class="q-main">もうどく ${turn}ターンめ</div>`,
      choices: listChoices(`${turn}/16`, [`1/${16 / Math.min(turn, 4) | 0}`, '1/8', `${turn + 1}/16`, '1/16', `${Math.max(1, turn - 1)}/16`].filter((x) => x !== `${turn}/16`)),
      ex: `<p>もうどくは 1/16 → 2/16 → 3/16 … とターンごとに増える。${turn}ターンめは <b>${turn}/16</b>。交代すると 1/16 に戻る。ふつうのどくはいつも 1/8。</p>`,
      ans: `${turn}/16`, tags: [['chip:toxic', 'もうどくのダメージ']], title: `もうどく${turn}ターンめ`
    };
  }

  // ---------- 対戦の技・ダブル ----------
  const TGT_ANS = { '1体': '選んだ相手1体', '相手全体': '相手2体', '自分以外全員': '相手2体と味方' };
  function qBattle(level) {
    if (Math.random() < 0.7) return qKnow('battle', level);
    const pool = MV.filter((m) => m.pw > 0 && TGT_ANS[m.tgt] && m.n >= (level >= 3 ? 10 : 40));
    const want = pick(Object.keys(TGT_ANS));
    const c = pool.filter((m) => m.tgt === want);
    const mv = pick(c.length ? c : pool);
    const ans = TGT_ANS[mv.tgt];
    return {
      mode: 'battle', lead: 'ダブルバトルで、この技が当たるのは？', layout: 'list',
      card: `<div class="vs-side"><span class="vs-name">${esc(mv.ja)}</span>${typesHTML([mv.ty], level >= 3)}<span class="vs-sub">${esc(mv.cat)}・威力${mv.pw}</span></div>`,
      choices: listChoices(ans, ['選んだ相手1体', '相手2体', '相手2体と味方', '味方だけ']),
      ex: `<p>${esc(mv.ja)}の範囲は「${esc(mv.tgt)}」。${mv.tgt === '自分以外全員' ? '<b>味方にも当たる</b>ので、ふゆう・ひこう・とくせいで無効にできる味方と組むか、ワイドガードで守る。' : mv.tgt === '相手全体' ? '相手2体だけに当たる（味方には当たらない）。' : '選んだ1体だけに当たる。'}${mv.tgt !== '1体' ? ' 2体以上に当たるときは威力が0.75倍。' : ''}</p>`,
      ans, tags: [['bt:target', 'ダブルの技の範囲']], title: `${mv.ja}の範囲`
    };
  }

  // ---------- テラレイド ----------
  function qRaid(level) {
    if (Math.random() < 0.65) { const k = qKnow('raid', level); if (k) return k; }
    const [star, mult] = pick([['★3', 8], ['★4', 12], ['★5', 20], ['★6', 25]]);
    const pct = pick([10, 20, 25, 50, 100]);
    const n = Math.ceil((100 * mult) / pct);
    return {
      mode: 'raid', lead: 'バリアやおうえんを考えないと、何回くらいで倒せる？', layout: 'list',
      card: `<div class="q-main long">${star}のテラレイド（HPはふつうの約${mult}倍）。ふつうの相手なら1回でHPの<b>${pct}%</b>を削れる攻撃。</div>`,
      choices: numberChoices(n, [Math.ceil(100 / pct), Math.ceil(n / 4), n * 2, Math.ceil((100 * mult) / pct / 2)].filter((x) => x !== n)),
      ex: `<p class="calc-line">100% × ${mult}倍 ÷ ${pct}% ＝ ${n}回</p><p>レイドでは1回で約${Math.round((pct / mult) * 10) / 10}%しか削れない。4人なら1人あたり約${Math.ceil(n / 4)}回。</p>`,
      ans: String(n), tags: [['raid:hp', 'レイドのHP']], title: `${star}・1回${pct}%`
    };
  }

  const MAKERS = { base: qBase, iv: qIV, ev: qEV, nature: qNature, dmg: qDmg, type: qType, special: qSpecial, ability: qAbility, item: qItem, cat: qCat, chip: qChip, battle: qBattle, raid: qRaid };
  function makeQuestion(mode, level) {
    for (let i = 0; i < 80; i++) {
      const m = mode === 'mix' ? wpick(Object.keys(MAKERS), (k) => (settings.weak ? 1 + 3 * (modeStats[k] && modeStats[k].a ? 1 - modeStats[k].c / modeStats[k].a : 0.3) : 1)) : mode;
      let q = null;
      try { q = MAKERS[m](level); } catch (e) { console.error(e); }
      if (q && q.choices && q.choices.filter((c) => c.ok).length === 1) {
        if (quiz && quiz.titles.has(q.title)) continue; // 同じ問題は出さない
        q.level = level;
        return q;
      }
    }
    return null;
  }

  /* ================= quiz: flow ================= */
  let quiz = null;
  const ICONS = {
    base: '<svg viewBox="0 0 48 28"><path d="M6 25V15M14 25V6M22 25V12M30 25V18M38 25V9"/><path d="M3 25.5h42"/></svg>',
    iv: '<svg viewBox="0 0 48 28"><path d="M14 22l3-12 7 6 7-6 3 12z"/><circle class="f" cx="17" cy="9" r="2"/><circle class="f" cx="24" cy="14" r="2"/><circle class="f" cx="31" cy="9" r="2"/></svg>',
    ev: '<svg viewBox="0 0 48 28"><path d="M24 3l9 5v11l-9 5-9-5V8z"/><path class="f" d="M24 7l6 4-2 7-4 2-5-4z" opacity=".55"/></svg>',
    nature: '<svg viewBox="0 0 48 28"><path d="M24 24c-7-3-10-9-6-16 5 1 8 6 6 16zM24 24c5-4 11-4 14-1-4 4-10 4-14 1z"/><path d="M24 24v3"/></svg>',
    dmg: '<svg viewBox="0 0 48 28"><text x="4" y="19" class="t">1.5</text><path d="M18 10l5 5M23 10l-5 5"/><text x="26" y="19" class="t">2</text><text x="34" y="19" class="t">=3</text></svg>',
    type: '<svg viewBox="0 0 48 28"><circle cx="12" cy="14" r="7"/><circle cx="36" cy="14" r="7"/><path d="M21 14h6M24 11l3 3-3 3"/></svg>',
    special: '<svg viewBox="0 0 48 28"><path d="M24 3l3 7 7 1-5 5 2 8-7-4-7 4 2-8-5-5 7-1z"/></svg>',
    ability: '<svg viewBox="0 0 48 28"><path d="M12 22c0-6 5-10 12-10s12 4 12 10"/><path d="M18 8l6-5 6 5"/><circle class="f" cx="24" cy="18" r="2.5"/></svg>',
    item: '<svg viewBox="0 0 48 28"><rect x="14" y="8" width="20" height="16" rx="3"/><path d="M19 8V5h10v3M14 14h20"/></svg>',
    cat: '<svg viewBox="0 0 48 28"><path d="M8 20l8-12 4 6"/><circle cx="31" cy="14" r="6"/><path d="M36 9l5-5M36 19l5 5" opacity=".5"/></svg>',
    chip: '<svg viewBox="0 0 48 28"><rect x="6" y="9" width="36" height="10" rx="5"/><path class="f" d="M8 11h14v6H8z" opacity=".6"/><path d="M28 6l3 3-3 3M34 16l3 3-3 3"/></svg>',
    battle: '<svg viewBox="0 0 48 28"><circle cx="13" cy="10" r="4"/><circle cx="21" cy="18" r="4"/><circle cx="35" cy="10" r="4"/><circle cx="27" cy="18" r="4" opacity=".5"/></svg>',
    raid: '<svg viewBox="0 0 48 28"><path d="M24 3l8 5v12l-8 5-8-5V8z"/><path d="M14 4l20 20M34 4L14 24" opacity=".35"/><circle class="f" cx="24" cy="14" r="2.5"/></svg>',
    mix: '<svg viewBox="0 0 48 28"><path d="M6 8h8l12 12h10M6 20h8l12-12h10M33 5l4 3-4 3M33 17l4 3-4 3"/></svg>'
  };

  function renderModes() {
    const list = $('#modeList');
    list.innerHTML = '';
    QMODES.forEach((m) => {
      const b = el('button', 'mode');
      b.type = 'button';
      const ms = modeStats[m.id];
      b.innerHTML = `<span class="mode-icon" aria-hidden="true">${ICONS[m.icon]}</span><span class="mode-title">${m.title}</span><span class="mode-desc">${m.desc}</span>${ms && ms.a && m.id !== 'mix' ? `<span class="mode-acc">正答率 ${pct(ms)}%（${ms.a}問）</span>` : ''}`;
      b.addEventListener('click', () => { settings.step = -1; saveSettings(); startQuiz(m.id); });
      list.appendChild(b);
    });
  }
  function renderSteps() {
    const box = $('#stepBox');
    box.innerHTML = '<p class="steps-head">はじめての人は、ステップ1から順に（押すとすぐ始まります）</p>';
    const row = el('div', 'steps');
    STEPS.forEach((st, i) => {
      const b = el('button', 'step' + (settings.step === i ? ' on' : ''));
      b.type = 'button';
      b.innerHTML = `<span class="step-no">${i + 1}</span><span class="step-t">${st.t}</span><span class="step-d">${st.d}</span><span class="step-lv">${LEVELS[st.lv]}</span>`;
      b.addEventListener('click', () => {
        settings.level = st.lv; settings.step = i;
        saveSettings(); renderLevel();
        startQuiz(st.mode);
      });
      row.appendChild(b);
    });
    box.appendChild(row);
    const on = row.querySelector('.step.on');
    if (on) row.scrollLeft = on.offsetLeft - 16;
  }
  function renderLevel() {
    const seg = $('#levelSeg');
    seg.innerHTML = '';
    [1, 2, 3].forEach((lv) => {
      const b = el('button', null, LEVELS[lv]);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(settings.level === lv));
      b.addEventListener('click', () => { settings.level = lv; settings.step = -1; saveSettings(); renderLevel(); renderSteps(); });
      seg.appendChild(b);
    });
    $('#levelHint').textContent = LEVEL_HINT[settings.level];
  }
  function renderToday() {
    const t = days[dayKey()] || { a: 0, c: 0 };
    const goal = +settings.goal;
    const s = streak();
    const done = t.a >= goal;
    $('#todayBox').innerHTML = `
      <div class="today-main">
        <span class="today-label">今日の練習</span>
        <span class="today-count"><b>${t.a}</b> / ${goal} 問</span>
        <span class="today-sub">${t.a ? `正答率 ${pct(t)}%` : 'まだ練習していません'}${done ? ' · 目標達成' : ''}</span>
      </div>
      <div class="today-streak"><b>${s}</b><span>日連続</span></div>
      <div class="today-bar" aria-hidden="true"><span style="width:${Math.min(100, (100 * t.a) / goal)}%"></span></div>`;
    $('#todayBox').classList.toggle('done', done);
    renderSteps();
    renderLevel();
    renderModes();
  }
  function renderSummary() {
    $('#settingsSummary').textContent = [settings.count + '問', '目標' + settings.goal + '問', settings.weak ? '苦手を多めに' : null, settings.auto ? '自動で次へ' : null].filter(Boolean).join(' · ');
  }
  function initSettings() {
    const bind = (id, key, isCheck) => {
      const n = $(id);
      if (isCheck) n.checked = !!settings[key]; else n.value = settings[key];
      n.addEventListener('change', () => { settings[key] = isCheck ? n.checked : n.value; saveSettings(); if (key === 'goal') renderToday(); });
    };
    bind('#optCount', 'count'); bind('#optGoal', 'goal');
    bind('#optWeak', 'weak', true); bind('#optAuto', 'auto', true);
    renderSummary();
  }

  function startQuiz(mode) {
    quiz = { mode, level: settings.level, total: +settings.count, i: 0, score: 0, log: [], used: new Set(), titles: new Set(), q: null };
    document.body.classList.add('playing');
    $('#quizSetup').hidden = true; $('#quizResult').hidden = true; $('#quizPlay').hidden = false;
    nextQuestion();
  }
  function stopQuiz() {
    quiz = null;
    document.body.classList.remove('playing');
    $('#quizPlay').hidden = true; $('#quizResult').hidden = true; $('#quizSetup').hidden = false;
    renderToday();
  }
  function nextQuestion() {
    if (quiz.i >= quiz.total) return finishQuiz();
    const q = makeQuestion(quiz.mode, quiz.level);
    if (!q) { quiz.exhausted = quiz.i > 0; quiz.total = quiz.i; return finishQuiz(); }
    quiz.q = q;
    quiz.titles.add(q.title);
    renderQuestion();
  }
  function renderQuestion() {
    const q = quiz.q;
    $('#progressLabel').textContent = `${quiz.i + 1} / ${quiz.total}`;
    $('#scoreLabel').textContent = `${MODE_TITLE[quiz.mode]}・${LEVELS[quiz.level]}　正解 ${quiz.score}`;
    $('#progressBar').style.width = (100 * quiz.i) / quiz.total + '%';
    $('#prompt').textContent = q.lead || (quiz.mode === 'mix' ? MODE_TITLE[q.mode] : '');
    $('#qCard').innerHTML = q.card;
    const box = $('#choices');
    box.className = 'choices' + (q.layout === 'grid6' ? ' grid6' : q.layout === 'grid2' ? ' grid2' : '');
    box.innerHTML = '';
    q.choices.forEach((c, i) => {
      const b = el('button', 'choice', `<span class="key">${i + 1}</span><span>${c.html}</span>`);
      b.type = 'button';
      b.addEventListener('click', () => answer(b, c));
      c.btn = b;
      box.appendChild(b);
    });
    $('#explain').innerHTML = '';
    $('#nextBtn').hidden = true;
    window.scrollTo(0, 0);
  }
  function answer(btn, c) {
    const q = quiz.q;
    if (q.answered) return;
    q.answered = true;
    const ok = c.ok;
    q.choices.forEach((x) => { x.btn.disabled = true; if (x.ok) x.btn.classList.add('correct'); });
    if (!ok) btn.classList.add('wrong');
    if (ok) quiz.score++;
    record(q, ok);
    quiz.log.push({ q, ok, picked: c.html });
    $('#explain').innerHTML = `<div class="ex"><p class="ex-head ${ok ? 'ok' : 'ng'}">${ok ? '正解！' : `ざんねん… 正解は「${esc(String(q.ans))}」`}</p>${q.ex}</div>`;
    $('#scoreLabel').textContent = `${MODE_TITLE[quiz.mode]}・${LEVELS[quiz.level]}　正解 ${quiz.score}`;
    quiz.i++;
    $('#nextBtn').hidden = false;
    $('#nextBtn').textContent = quiz.i >= quiz.total ? '結果を見る' : '次へ';
    if (ok && settings.auto) setTimeout(() => { if (quiz && quiz.q === q) nextQuestion(); }, 1100);
    else $('#explain').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  $('#nextBtn').addEventListener('click', () => nextQuestion());
  $('#quitBtn').addEventListener('click', () => stopQuiz());
  document.addEventListener('keydown', (ev) => {
    if (!quiz || $('#quizPlay').hidden) return;
    if (ev.key === 'Escape') return stopQuiz();
    if (ev.key === 'Enter' && !$('#nextBtn').hidden) { ev.preventDefault(); return nextQuestion(); }
    const n = +ev.key;
    if (n >= 1 && n <= 9 && quiz.q && !quiz.q.answered && quiz.q.choices[n - 1]) quiz.q.choices[n - 1].btn.click();
  });
  function finishQuiz() {
    $('#quizPlay').hidden = true; $('#quizResult').hidden = false;
    const n = quiz.total || 0;
    $('#resultMode').textContent = `${MODE_TITLE[quiz.mode]}・${LEVELS[quiz.level]}`;
    $('#resultScore').textContent = quiz.score;
    $('#resultTotal').textContent = ` / ${n}`;
    const r = n ? quiz.score / n : 0;
    $('#resultTitle').textContent = !n ? '出せる問題がありませんでした（ネタバレ範囲を広げてみてください）'
      : quiz.exhausted ? `この分野・難しさで出せる問題を、すべて出しました（${n}問）。難しさを上げると、さらに問題が増えます。`
      : r === 1 ? 'パーフェクト！ 育成マスター！' : r >= 0.8 ? 'すばらしい！ かなりわかってきた！' : r >= 0.5 ? 'いい調子！ 解説を読んでもう一度' : 'まずは「まなぶ」で確かめてみよう';
    $('#review').innerHTML = quiz.log.map(({ q, ok, picked }) => `<div class="entry ${ok ? 'hit' : 'miss'}"><div class="entry-head"><span class="entry-name" style="font-size:15px">${esc(q.title)}</span>
      <span class="entry-badges"><span class="badge">${ok ? '○' : '×'}</span></span></div>
      <p style="margin:4px 0 0;font-size:13px">正解：<b>${esc(String(q.ans))}</b>${ok ? '' : `　あなたの答え：${picked}`}</p></div>`).join('');
    window.scrollTo(0, 0);
  }
  $('#againBtn').addEventListener('click', () => startQuiz(quiz.mode));
  $('#backBtn').addEventListener('click', () => stopQuiz());

  /* ================= まなぶ ================= */
  function renderLearn() {
    $$('#view-learn [data-sp]').forEach((n) => { n.hidden = +n.dataset.sp > spoil(); });
    if (learnBuilt) return;
    learnBuilt = true;
    $('#learnToc').innerHTML = $$('#view-learn .lsec').map((s) => `<a href="#${s.id}">${esc($('h2', s).textContent.replace(/[：:（].*/, ''))}</a>`).join('');
    renderCalc();
    renderBaseTips();
    renderStarters();
    renderEevee();
    renderTrends();
    renderNatureGrid();
    renderDmgTable();
    renderTypeChart();
    renderDefCalc();
    renderKCards();
    renderRanking();
    renderCategory();
    renderSpecialAbilities();
    renderStageLab();
    renderChip();
    renderBattleMoves();
    renderTraining();
    renderDouble();
    renderRaid();
    renderRules();
  }
  $('#learnToc').addEventListener('click', (ev) => {
    const a = ev.target.closest('a');
    if (!a) return;
    ev.preventDefault();
    const t = $(a.getAttribute('href'));
    if (!t) return;
    t.open = true;
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#learnOpen').addEventListener('click', () => $$('#view-learn details.lsec').forEach((d) => { d.open = true; }));
  $('#learnClose').addEventListener('click', () => $$('#view-learn details.lsec').forEach((d) => { d.open = false; }));
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-goto]');
    if (b) show(b.dataset.goto);
  });

  const calcState = { mon: 'マスカーニャ', s: 5, iv: 31, ev: 252, nat: 1, lv: 50 };
  function renderCalc() {
    const box = $('#calc');
    const mons = visMons().slice().sort((a, b) => a.p - b.p);
    if (!mons.some((m) => m.ja === calcState.mon)) calcState.mon = mons[0].ja;
    box.innerHTML = `
      <div class="calc-top">
        <select id="cMon" aria-label="ポケモン">${mons.map((m) => `<option${m.ja === calcState.mon ? ' selected' : ''}>${esc(m.ja)}</option>`).join('')}</select>
        <select id="cStat" aria-label="能力">${STAT_JA.map((s, i) => `<option value="${i}"${i === calcState.s ? ' selected' : ''}>${s}</option>`).join('')}</select>
        <div class="seg" id="cLv"></div>
      </div>
      <div class="calc-row"><label>種族値</label><span id="cBase" class="hint" style="margin:0"></span><output id="cBaseV"></output></div>
      <div class="calc-row"><label for="cIv">個体値</label><input type="range" id="cIv" min="0" max="31" step="1" value="${calcState.iv}"><output id="cIvV"></output></div>
      <div class="calc-row"><label for="cEv">努力値</label><input type="range" id="cEv" min="0" max="252" step="4" value="${calcState.ev}"><output id="cEvV"></output></div>
      <div class="calc-row"><label>せいかく</label><div class="seg" id="cNat"></div><span></span></div>
      <div class="calc-presets"><button class="chip" type="button" data-pre="min">いちばん低く</button><button class="chip" type="button" data-pre="wild">ふつうに捕まえた（個体値15・努力値0）</button><button class="chip" type="button" data-pre="max">いちばん高く</button></div>
      <div class="calc-out"><b id="cOut"></b><span id="cOutNote"></span></div>
      <div><div class="calc-range"><span id="cMark"></span></div><div class="calc-range-lbl"><span id="cMin"></span><span id="cMax"></span></div></div>`;
    const segFill = (id, opts, key) => {
      const s = $(id, box);
      s.innerHTML = '';
      opts.forEach(([v, label]) => {
        const b = el('button', null, label);
        b.type = 'button'; b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(calcState[key] === v));
        b.addEventListener('click', () => { calcState[key] = v; segFill(id, opts, key); upd(); });
        s.appendChild(b);
      });
    };
    const upd = () => {
      const m = MON[calcState.mon], s = calcState.s, hp = s === 0, lv = calcState.lv;
      const nat = hp ? 1 : calcState.nat;
      const v = calcStat(m.bs[s], calcState.iv, calcState.ev, lv, hp, nat);
      const lo = calcStat(m.bs[s], 0, 0, lv, hp, hp ? 1 : 0.9), hi = calcStat(m.bs[s], 31, 252, lv, hp, hp ? 1 : 1.1);
      $('#cBaseV').textContent = m.bs[s];
      $('#cBase').textContent = `${m.ja}の${STAT_JA[s]}`;
      $('#cIvV').textContent = calcState.iv; $('#cEvV').textContent = calcState.ev;
      $('#cOut').textContent = v;
      $('#cOutNote').textContent = `レベル${lv}の${STAT_JA[s]}${hp ? '（HPはせいかくの影響を受けない）' : ''}　最低 ${lo} 〜 最高 ${hi}（差 ${hi - lo}）`;
      $('#cMin').textContent = lo; $('#cMax').textContent = hi;
      $('#cMark').style.left = (hi > lo ? (100 * (v - lo)) / (hi - lo) : 0) + '%';
    };
    segFill('#cLv', [[50, 'Lv50'], [100, 'Lv100']], 'lv');
    segFill('#cNat', [[1.1, '↑ 1.1倍'], [1, '補正なし'], [0.9, '↓ 0.9倍']], 'nat');
    $('#cMon', box).addEventListener('change', (e) => { calcState.mon = e.target.value; upd(); });
    $('#cStat', box).addEventListener('change', (e) => { calcState.s = +e.target.value; upd(); });
    $('#cIv', box).addEventListener('input', (e) => { calcState.iv = +e.target.value; upd(); });
    $('#cEv', box).addEventListener('input', (e) => { calcState.ev = +e.target.value; upd(); });
    box.onclick = (e) => {
      const p = e.target.closest('[data-pre]');
      if (!p) return;
      const pre = { min: [0, 0, 0.9], wild: [15, 0, 1], max: [31, 252, 1.1] }[p.dataset.pre];
      [calcState.iv, calcState.ev, calcState.nat] = pre;
      $('#cIv').value = pre[0]; $('#cEv').value = pre[1];
      segFill('#cNat', [[1.1, '↑ 1.1倍'], [1, '補正なし'], [0.9, '↓ 0.9倍']], 'nat');
      upd();
    };
    upd();
  }

  function renderBaseTips() {
    const g = GROUP;
    const tips = [
      `<b>進化すると合計が増える</b>：3段階進化なら平均 ${g.s31.avg} → ${g.s32.avg} → ${g.s33.avg}、2段階進化なら ${g.s21.avg} → ${g.s22.avg}。`,
      `<b>3段階進化の最終形は500台が多い</b>（${g.s33.min}〜${g.s33.max}、平均 ${g.s33.avg}）。御三家もここ。`,
      (() => { const l = MONS.filter((m) => NORMAL(m) && m.tot === 600 && m.sp <= spoil()).map((m) => m.ja); return l.length ? `<b>合計600ちょうどのポケモン</b>（いわゆる「600族」）：${l.map(esc).join('・')}。3段階進化の最終形で、伝説ではないのに伝説なみに強い。` : ''; })(),
      `<b>進化しないポケモン</b>は平均 ${g.s11.avg}。2段階進化の最終形（平均 ${g.s22.avg}）と同じくらい。`,
      g.leg.n ? `<b>伝説のポケモンはとても高い</b>：いまの範囲の伝説は ${g.leg.min}〜${g.leg.max}。${g.para.n ? `パラドックスポケモンも ${g.para.min}〜${g.para.max} と高い。` : ''}` : '<b>伝説のポケモンはとても高い</b>：600以上のことが多い。',
      `<b>素早いことが多いタイプ</b>：${FAST_TYPES.map((t) => `${typeTag(t)} ${Math.round(TYPE_AVG[t].st[5])}`).join(' ')}（最終進化のすばやさの平均）`,
      `<b>ゆっくりなことが多いタイプ</b>：${SLOW_TYPES.map((t) => `${typeTag(t)} ${Math.round(TYPE_AVG[t].st[5])}`).join(' ')}`,
      '<b>合計が同じでも配分はさまざま</b>：HPが高い・すばやさが高い など、どこが高いかでポケモンの「役割」が決まる。'
    ];
    $('#baseTips').innerHTML = tips.filter(Boolean).map((t) => `<li>${t}</li>`).join('');
  }
  function statTable(list, opts = {}) {
    const rows = list.map((m) => {
      if (typeof m === 'string') return `<tr class="grp"><td colspan="9">${esc(m)}</td></tr>`;
      const mx = Math.max(...m.bs), mn = Math.min(...m.bs);
      return `<tr><td class="nm">${esc(m.ja)}</td><td>${m.ty.map(typeTag).join('')}</td>${m.bs.map((v) => `<td class="n${v === mx ? ' hi' : v === mn ? ' lo' : ''}">${v}</td>`).join('')}<td class="n"><b>${m.tot}</b></td></tr>`;
    }).join('');
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ポケモン</th><th>タイプ</th>${STAT_KANJI.map((s, i) => `<th class="n" title="${STAT_JA[i]}">${s}</th>`).join('')}<th class="n">合計</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint" style="margin-top:0">色のついた数字がいちばん高い能力、うすい数字がいちばん低い能力。</p>`;
  }
  function renderStarters() {
    const lines = [['ニャオハ', 'ニャローテ', 'マスカーニャ'], ['ホゲータ', 'アチゲータ', 'ラウドボーン'], ['クワッス', 'ウェルカモ', 'ウェーニバル']];
    const list = [];
    lines.forEach((l) => { list.push(`${l[0]}の系統`); l.forEach((n) => list.push(MON[n])); });
    const fin = lines.map((l) => MON[l[2]]);
    const stageTot = [0, 1, 2].map((i) => Array.from(new Set(lines.map((l) => MON[l[i]].tot))));
    const top = (i) => fin.slice().sort((a, b) => b.bs[i] - a.bs[i])[0];
    $('#starterBox').innerHTML = statTable(list, { short: true }) + `<div class="insight"><b>気づき</b><ul>
      <li>合計は3系統とも <b>${stageTot.map((t) => t.join('/')).join(' → ')}</b>。どの子を選んでも総合力は同じ。</li>
      <li>すばやさ：<b>${top(5).ja}</b>（${top(5).bs[5]}）がいちばん速い。ラウドボーンは ${MON['ラウドボーン'].bs[5]} でゆっくり。</li>
      <li>HP：<b>${top(0).ja}</b>（${top(0).bs[0]}）、とくこう：<b>${top(3).ja}</b>（${top(3).bs[3]}）、こうげき：<b>${top(1).ja}</b>（${top(1).bs[1]}）が高い。</li>
      <li>マスカーニャは「速くて物理で攻める」、ラウドボーンは「耐えて特殊で攻める」、ウェーニバルは「物理でバランスよく」。合計が同じでも、得意なことがまったく違う。</li>
      <li>最終進化で2つめのタイプが付く：マスカーニャ ${MON['マスカーニャ'].ty.map(typeTag).join('')}、ラウドボーン ${MON['ラウドボーン'].ty.map(typeTag).join('')}、ウェーニバル ${MON['ウェーニバル'].ty.map(typeTag).join('')}。</li></ul></div>`;
  }
  function renderEevee() {
    const names = ['イーブイ', 'シャワーズ', 'サンダース', 'ブースター', 'エーフィ', 'ブラッキー', 'リーフィア', 'グレイシア', 'ニンフィア'];
    const list = names.map((n) => MON[n]).filter(Boolean);
    const evos = list.slice(1);
    const tots = Array.from(new Set(evos.map((m) => m.tot)));
    $('#eeveeBox').innerHTML = statTable(list, { short: true }) + `<div class="insight"><b>気づき</b><ul>
      <li>8種とも合計は <b>${tots.join('/')}</b>。イーブイ（${MON['イーブイ'].tot}）から <b>＋${tots[0] - MON['イーブイ'].tot}</b>。</li>
      <li>どの進化も「130が1つ、110が1つ」を持っていて、そこが得意分野：<br>${evos.map((m) => {
        const i130 = m.bs.indexOf(130), i110 = m.bs.indexOf(110);
        return `${esc(m.ja)}＝${STAT_JA[i130]}130・${STAT_JA[i110]}110`;
      }).join('、')}</li>
      <li>サンダースはすばやさ130でいちばん速く、シャワーズはHP130でいちばんタフ。ブースターはこうげき130なので物理技で戦うと強い。</li>
      <li>「同じ合計の配り方の違い」がそのまま個性になる、種族値を学ぶのにぴったりの例。</li></ul></div>`;
  }
  function renderTrends() {
    const gs = GROUPS.filter((g) => g.n);
    const order = typeRank(5);
    $('#trendBox').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>なかま</th><th class="n">数</th><th class="n">合計の平均</th><th class="n">範囲</th></tr></thead><tbody>
      ${gs.map((g) => `<tr><td>${esc(g.label)}</td><td class="n">${g.n}</td><td class="n"><b>${g.avg}</b></td><td class="n">${g.min}〜${g.max}</td></tr>`).join('')}</tbody></table></div>
      <h3>タイプごとの平均（最終進化・伝説やパラドックスを除く）</h3>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>タイプ</th><th class="n">数</th><th class="n">すばやさ</th><th class="n">こうげき</th><th class="n">ぼうぎょ</th><th class="n">とくこう</th><th class="n">合計</th></tr></thead><tbody>
      ${order.map((t, i) => { const a = TYPE_AVG[t]; return `<tr><td>${typeTag(t)}</td><td class="n">${a.n}</td><td class="n${i < 4 ? ' hi' : i >= 14 ? ' lo' : ''}">${Math.round(a.st[5])}</td><td class="n">${Math.round(a.st[1])}</td><td class="n">${Math.round(a.st[2])}</td><td class="n">${Math.round(a.st[3])}</td><td class="n">${Math.round(a.tot)}</td></tr>`; }).join('')}
      </tbody></table></div><p class="hint" style="margin-top:0">すばやさの平均が高い順。2つのタイプを持つポケモンは、両方のタイプで数えています。</p>`;
  }
  function renderNatureGrid() {
    const g = $('#natureGrid');
    let h = '<div class="h">↑＼↓</div>' + [1, 2, 3, 4, 5].map((s) => `<div class="h dn">${STAT_JA[s]}↓</div>`).join('');
    [1, 2, 3, 4, 5].forEach((up) => {
      h += `<div class="h up">${STAT_JA[up]}↑</div>`;
      [1, 2, 3, 4, 5].forEach((dn) => {
        if (up === dn) { const n = NATURES.filter((x) => !x[1])[up - 1]; h += `<div class="neutral">${esc(n[0])}</div>`; return; }
        const n = NATURES.find((x) => x[1] === up && x[2] === dn);
        h += `<div class="${POP_NATURES.slice(0, 4).includes(n[0]) ? 'pop' : ''}">${esc(n[0])}</div>`;
      });
    });
    g.innerHTML = h;
  }
  function renderDmgTable() {
    const rows = DMG_FACTORS.map((f) => `<tr><td>${esc(f.n)}</td><td class="n"><b>×${fmtFactor(f.v)}</b></td><td>${esc(f.ex)}</td></tr>`).join('');
    $('#dmgTable').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>条件</th><th class="n">倍率</th><th>説明</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="insight"><b>計算の例</b><ul>
      <li>タイプ一致 × こうかばつぐん ＝ 1.5 × 2 ＝ <b>3倍</b></li>
      <li>タイプ一致 × こうかばつぐん × きゅうしょ ＝ 1.5 × 2 × 1.5 ＝ <b>4.5倍</b></li>
      <li>タイプ一致 × いかくされた ＝ 1.5 × 2/3 ＝ <b>1倍</b>（いかくでタイプ一致ぶんが打ち消される）</li>
      <li>テラスタル（同じタイプ）× 4倍弱点 ＝ 2 × 4 ＝ <b>8倍</b></li></ul></div>`;
    $('#rankStrip').innerHTML = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((n) => {
      const v = n >= 0 ? (2 + n) / 2 : 2 / (2 - n);
      const lbl = n >= 0 ? String(v) : `2/${2 - n}`;
      const a = Math.abs(n) / 6 * 0.85;
      return `<div class="${n > 0 ? 'p' : n < 0 ? 'm' : ''}${a > 0.45 ? ' hi' : ''}" style="--a:${a}">${n > 0 ? '+' : ''}${n}<small>×${lbl.replace('2/4', '1/2').replace('2/6', '1/3').replace('2/8', '1/4')}</small></div>`;
    }).join('');
  }
  function renderTypeChart() {
    const head = `<tr><th>技＼相手</th>${TYPES.map((t, j) => `<th data-c="${j}">${typeTag(t)}</th>`).join('')}</tr>`;
    const body = TYPES.map((a, i) => `<tr data-r="${i}"><th>${typeTag(a)}</th>${TYPES.map((d, j) => {
      const v = eff1(a, d);
      const cls = v === 2 ? 'x2' : v === 0.5 ? 'xh' : v === 0 ? 'x0' : '';
      return `<td class="${cls}" data-a="${i}" data-d="${j}" title="${a}→${d} ${fmtMult(v)}">${v === 2 ? '2' : v === 0.5 ? '½' : v === 0 ? '0' : ''}</td>`;
    }).join('')}</tr>`).join('');
    $('#typeChart').innerHTML = `<table class="tchart"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    $('#typeChart').onclick = (ev) => {
      const td = ev.target.closest('td');
      if (!td) return;
      $$('#typeChart td.sel').forEach((x) => x.classList.remove('sel'));
      td.classList.add('sel');
      const a = TYPES[+td.dataset.a], d = TYPES[+td.dataset.d], v = eff1(a, d);
      const memo = TYPE_MEMO[`${a}>${d}`];
      $('#typeMemo').innerHTML = `${typeTag(a)} の技 → ${typeTag(d)}：<b>${fmtMult(v)}（${effWord(v)}）</b>${memo ? `　${esc(memo)}` : ''}`;
    };
  }
  const defSel = [];
  let defAtk = 'みず';
  function renderDefCalc() {
    const box = $('#defCalc');
    box.innerHTML = `<div class="type-btns">${TYPES.map((t) => `<button class="type type-btn t-${TYPE_CLASS[t]}" type="button" data-t="${t}" aria-pressed="${defSel.includes(t)}">${t}</button>`).join('')}</div>
      <div class="row" style="margin-top:8px"><label for="defAtk" class="hint" style="margin:0">技のタイプ</label><select id="defAtk"><option value="">（選ばない）</option>${TYPES.map((t) => `<option${t === defAtk ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="def-out" id="defOut"></div>`;
    $('#defAtk').onchange = (e) => { defAtk = e.target.value; upd(); };
    const upd = () => {
      $$('[data-t]', box).forEach((b) => b.setAttribute('aria-pressed', String(defSel.includes(b.dataset.t))));
      if (!defSel.length) { $('#defOut').innerHTML = '<p class="hint">タイプを1つか2つ選ぶと、そのタイプのポケモンの弱点・耐性が出ます。</p>'; return; }
      const groups = [4, 2, 0.5, 0.25, 0].map((v) => [v, TYPES.filter((t) => eff(t, defSel) === v)]);
      const ex = MONS.filter((m) => m.sp <= spoil() && m.ty.length === defSel.length && defSel.every((t) => m.ty.includes(t))).slice(0, 6).map((m) => m.ja);
      const bd = defAtk ? effBreakdown(defAtk, defSel) : null;
      $('#defOut').innerHTML = (bd ? `<div class="worked-mini">${typeTag(defAtk)} の技 → ${defSel.map(typeTag).join('')}：${esc(bd.line)}${defSel.length > 1 ? ` ＝ <b>${fmtMult(bd.v)}</b>` : ''}（${effWord(bd.v)}）</div>` : '') +
        groups.map(([v, ts]) => `<div class="row"><span class="lbl">${fmtMult(v)}</span>${ts.length ? ts.map(typeTag).join('') : '<span class="none">なし</span>'}</div>`).join('') +
        `<p class="hint">${ex.length ? `このタイプのポケモン：${ex.map(esc).join('、')}` : 'この組み合わせのポケモンは、いまの範囲にはいません。'}</p>`;
    };
    box.onclick = (ev) => {
      const b = ev.target.closest('[data-t]');
      if (!b) return;
      const t = b.dataset.t, i = defSel.indexOf(t);
      if (i >= 0) defSel.splice(i, 1); else { defSel.push(t); if (defSel.length > 2) defSel.shift(); }
      upd();
    };
    if (!defSel.length) defSel.push('くさ', 'ほのお');
    upd();
  }
  function renderKCards() {
    $('#specialList').innerHTML = `<div class="kcards">${SPECIAL_MOVES.map((s) => `<div class="kcard"><b>${esc(s.name)}</b>${TYPE_CLASS[s.type] ? typeTag(s.type) : `<small>${esc(s.type)}</small>`}<p>${esc(s.note)}</p></div>`).join('')}</div>`;
    $('#statusList').innerHTML = `<div class="kcards">${STATUS_MOVES.map((s) => `<div class="kcard"><b>${esc(s.move)}</b>${s.immune.map(typeTag).join(' ')} には効かない<p>${esc(s.note)}</p></div>`).join('')}</div>`;
    $('#abilityList').innerHTML = `<h3>受ける側</h3><div class="kcards">${Object.entries(DEF_ABILITIES).map(([a, d]) =>
      `<div class="kcard"><b>${esc(a)}</b><p>${esc(d.note.replace(/^[^：]+：/, ''))}</p>${exLine(whoHas(a))}</div>`).join('')}</div>
      <h3>攻める側</h3><div class="kcards">${Object.entries(ATK_ABILITIES).map(([a, d]) =>
      `<div class="kcard"><b>${esc(a)}</b><p>${esc(d)}</p>${exLine(whoHas(a))}</div>`).join('')}</div>`;
    $('#itemList').innerHTML = `<div class="kcards">${BATTLE_ITEMS.map(([n, d, k]) => `<div class="kcard"><b>${esc(n)}</b><small>${esc(k)}</small><p>${esc(d)}</p></div>`).join('')}</div>`;
  }

  /* ---------- 共通：セグメントボタン ---------- */
  function segButtons(box, opts, get, set) {
    box.innerHTML = '';
    opts.forEach(([v, label]) => {
      const b = el('button', null, label);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(get() === v));
      b.addEventListener('click', () => { set(v); segButtons(box, opts, get, set); });
      box.appendChild(b);
    });
  }
  const whoHas = (a, n = 5) => MONS.filter((m) => m.sp <= spoil() && hasAb(m, a)).slice(0, n).map((m) => esc(m.ja) + (m.ab.find((x) => x.n === a).h ? '<small>（隠れ）</small>' : ''));
  const exLine = (list) => (list.length ? `<small>例：${list.join('、')}</small>` : '');
  const moveTag = (name) => { const m = MV.find((x) => x.ja === name); return m ? typeTag(m.ty) : ''; };

  /* ---------- 技の分類：タイプごとの物理技・特殊技 ---------- */
  let catType = 'ほのお';
  function renderCategory() {
    $('#catTypes').innerHTML = TYPES.map((t) => `<button class="type type-btn t-${TYPE_CLASS[t]}" type="button" data-t="${t}" aria-pressed="${t === catType}">${t}</button>`).join('');
    $('#catTypes').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; catType = b.dataset.t; renderCategory(); };
    const list = (cat) => MV.filter((m) => m.ty === catType && m.cat === cat && m.pw > 0).slice(0, 8)
      .map((m) => `<span class="mchip">${esc(m.ja)}<small>${m.pw}</small></span>`).join('') || '<span class="hint">なし</span>';
    $('#catMoves').innerHTML = `<h4 class="mh">${typeTag(catType)} の物理技（覚えるポケモンが多い順・数字は威力）</h4><div class="mchips">${list('物理')}</div>
      <h4 class="mh">${typeTag(catType)} の特殊技</h4><div class="mchips">${list('特殊')}</div>`;
    const groups = Object.keys(SPECIAL_DMG_GROUP);
    $('#catSpecial').innerHTML = groups.map((g) => `<h4 class="mh">${SPECIAL_DMG_GROUP[g]}</h4><div class="kcards">${Object.entries(SPECIAL_DMG).filter(([, v]) => v[0] === g).map(([n, v]) => {
      const m = MV.find((x) => x.ja === n);
      return `<div class="kcard"><b>${esc(n)}</b>${m ? `${typeTag(m.ty)}<small>${m.cat}</small>` : ''}<p>${esc(v[1])}。</p></div>`;
    }).join('')}</div>`).join('');
  }

  /* ---------- 種族値ランキング ---------- */
  const rankState = { stat: 't', dir: 'hi', leg: false, final: true };
  function renderRanking() {
    const opts = [['t', '合計']].concat(STAT_KANJI.map((s, i) => [i, s]));
    segButtons($('#rankStat'), opts, () => rankState.stat, (v) => { rankState.stat = v; drawRanking(); });
    segButtons($('#rankDir'), [['hi', '高い順'], ['lo', '低い順']], () => rankState.dir, (v) => { rankState.dir = v; drawRanking(); });
    $('#rankLeg').checked = rankState.leg;
    $('#rankFinal').checked = rankState.final;
    $('#rankLeg').onchange = (e) => { rankState.leg = e.target.checked; drawRanking(); };
    $('#rankFinal').onchange = (e) => { rankState.final = e.target.checked; drawRanking(); };
    drawRanking();
  }
  function drawRanking() {
    const key = rankState.stat;
    const val = (m) => (key === 't' ? m.tot : m.bs[key]);
    const list = visMons().filter((m) => (rankState.leg || NORMAL(m)) && (!rankState.final || m.final))
      .sort((a, b) => (rankState.dir === 'hi' ? val(b) - val(a) : val(a) - val(b)) || a.p - b.p).slice(0, 15);
    const max = key === 't' ? 720 : 255;
    $('#rankList').innerHTML = list.map((m, i) => `<li><span class="rk-no">${i + 1}</span><span class="rk-name"><b>${esc(m.ja)}</b>${m.ty.map(typeTag).join('')}${kindBadge(m)}</span>
      <span class="rk-v">${val(m)}</span><span class="rk-bar"><span class="${key === 't' ? 'tot' : 's' + key}" style="width:${(100 * val(m)) / max}%"></span></span></li>`).join('');
  }

  /* ---------- 特別なとくせい ---------- */
  function renderSpecialAbilities() {
    const k = MON['ケッキング'];
    const cards = [
      ['なまけ', `ケッキングのとくせい。<b>1回動くと、次のターンは休んでしまう</b>。ケッキングの種族値の合計は <b>${k.tot}</b> で伝説なみ（HP${k.bs[0]}・こうげき${k.bs[1]}）だが、実際には半分しか動けない。「種族値が高い＝強い」とは限らない、いちばん分かりやすい例。進化前のヤルキモノは「やるき」（ねむらない）で、合計 ${MON['ヤルキモノ'].tot} でもよく動ける。`, 'なまけ'],
      ['へんげんじざい', '技を出す前に、その技と同じタイプに変わる（いつでもタイプ一致になる）。SVでは、場に出てから1回だけ。マスカーニャの隠れ特性。', 'へんげんじざい'],
      ['ばけのかわ', '最初の1回の攻撃を受け止める（HPが1/8減る）。', 'ばけのかわ'],
      ['マルチスケイル', 'HPまんたんのときダメージ半分。', 'マルチスケイル'],
      ['いかく', '場に出たとき相手のこうげきを1段階下げる（物理技のダメージ約2/3）。', 'いかく'],
      ['かそく', 'ターンの終わりにすばやさが1段階上がる。', 'かそく'],
      ['てんねん', '相手の能力の上がり下がりを無視する。', 'てんねん'],
      ['いたずらごころ', '変化技を先に出せる。ただしあくタイプには効かない。', 'いたずらごころ'],
      ['テクニシャン', '威力60以下の技が1.5倍。', 'テクニシャン'],
      ['ちからもち', 'こうげき2倍。', 'ちからもち'],
      ['マジックガード', '攻撃技以外のダメージ（どく・ステルスロック・いのちのたまの反動 など）を受けない。', 'マジックガード'],
      ['おうごんのからだ', '相手の変化技を受けない。', 'おうごんのからだ', 2],
      ['わざわいのうつわ／つるぎ／おふだ／たま', '災厄のポケモンのとくせい。自分以外の全員の とくこう／ぼうぎょ／こうげき／とくぼう を0.75倍にする。', 'わざわいのうつわ', 2],
      ['こだいかっせい／クォークチャージ', 'はれ／エレキフィールド（またはブーストエナジー）で、いちばん高い能力が1.3倍（すばやさなら1.5倍）。パラドックスポケモン。', 'こだいかっせい', 3],
      ['しれいとう', 'シャリタツが味方のヘイラッシャの口の中に入り、ヘイラッシャの全能力が2段階上がる。ダブルバトル専用の作戦。', 'しれいとう'],
      ['テラスチェンジ', 'テラパゴスが場に出るとテラスタルフォルムになる。', 'テラスチェンジ', 7]
    ];
    $('#specialAbilities').innerHTML = `<div class="kcards">${cards.filter((c) => (c[3] || 0) <= spoil()).map(([n, d, a]) => `<div class="kcard"><b>${esc(n)}</b><p>${d}</p>${exLine(whoHas(a))}</div>`).join('')}</div>`;
  }

  /* ---------- ランクの実験 ---------- */
  const stageState = { s: 2, acc: 0 };
  function renderStageLab() {
    const box = $('#stageLab');
    box.innerHTML = `<div class="calc">
      <div class="calc-row"><label for="stS">こうげきなど</label><input type="range" id="stS" min="-6" max="6" step="1" value="${stageState.s}"><output id="stSV"></output></div>
      <p class="hint" id="stSNote" style="margin:0"></p>
      <div class="calc-row"><label for="stA">命中−回避</label><input type="range" id="stA" min="-6" max="6" step="1" value="${stageState.acc}"><output id="stAV"></output></div>
      <p class="hint" id="stANote" style="margin:0"></p>
    </div>`;
    const sg = (n) => (n > 0 ? '＋' + n : n < 0 ? '−' + -n : '±0');
    const upd = () => {
      const s = stageState.s, a = stageState.acc;
      const m = s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
      const am = a >= 0 ? (3 + a) / 3 : 3 / (3 - a);
      $('#stSV').textContent = sg(s);
      $('#stAV').textContent = sg(a);
      $('#stSNote').innerHTML = `ランク${sg(s)} → <b>×${fracStr(m)}</b>（${s >= 0 ? `(2＋${s})÷2` : `2÷(2＋${-s})`}）。こうげき実数値150なら <b>${Math.floor(150 * m)}</b>。${s === 2 ? 'つるぎのまい1回。' : s === 4 ? 'つるぎのまい2回。' : s === -1 ? 'いかくを1回受けた。' : s === 6 ? 'はらだいこ（最大）。' : ''}`;
      $('#stANote').innerHTML = `命中${sg(a)} → <b>×${fracStr(am)}</b>。命中80の技なら <b>${Math.min(100, Math.round(80 * am))}%</b>、命中100の技なら <b>${Math.min(100, Math.round(100 * am))}%</b>。`;
    };
    $('#stS').oninput = (e) => { stageState.s = +e.target.value; upd(); };
    $('#stA').oninput = (e) => { stageState.acc = +e.target.value; upd(); };
    upd();
  }

  /* ---------- 割合ダメージ ---------- */
  function renderChip() {
    const rows = [4, 2, 1, 0.5, 0.25].map((v) => {
      const frac = { 4: '1/2', 2: '1/4', 1: '1/8', 0.5: '1/16', 0.25: '1/32' }[v];
      const ex = visMons().filter((m) => m.final && eff('いわ', m.ty) === v).sort((a, b) => b.tot - a.tot).slice(0, 4).map((m) => esc(m.ja));
      return `<tr><td class="n">${fmtMult(v)}</td><td class="n"><b>${frac}</b></td><td class="n">${Math.round(100 / 8 * v * 10) / 10}%</td><td>${ex.join('、') || '—'}</td></tr>`;
    }).join('');
    $('#srGrid').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="n">いわの相性</th><th class="n">減るHP</th><th class="n">%</th><th>例</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint" style="margin-top:0">計算：1/8 × いわタイプの相性。いわが4倍弱点のポケモンは、出てくるだけでHPが半分になる。ひこう・ほのお・こおり・むしタイプは要注意。</p>`;
    $('#chipList').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>名前</th><th>割合</th><th>くわしく</th></tr></thead><tbody>${CHIP.map(([n, f, d, k]) =>
      `<tr><td class="nm">${esc(n)}<br><small class="badge">${esc(k)}</small></td><td><b>${esc(f)}</b></td><td>${esc(d)}</td></tr>`).join('')}</tbody></table></div>`;
    $('#chipNotes').innerHTML = CHIP_NOTES.map((t) => `<li>${esc(t)}</li>`).join('');
  }

  /* ---------- 変化技・入れ替え ---------- */
  function renderBattleMoves() {
    const groups = Array.from(new Set(BATTLE_MOVES.map((x) => x[1])));
    $('#battleMoveList').innerHTML = groups.map((g) => `<h3>${esc(g)}</h3><div class="kcards">${BATTLE_MOVES.filter((x) => x[1] === g).map(([n, , d]) =>
      `<div class="kcard"><b>${esc(n)}</b>${n.split('／').map(moveTag).join('')}<p>${d}</p></div>`).join('')}</div>`).join('');
    const kinds = Array.from(new Set(SWAP_MOVES.map((x) => x[1])));
    $('#swapList').innerHTML = kinds.map((k) => `<h3>${esc(k)}を入れ替える・変える</h3><div class="kcards">${SWAP_MOVES.filter((x) => x[1] === k).map(([n, , d]) =>
      `<div class="kcard"><b>${esc(n)}</b>${n.split('／').map(moveTag).join('')}<p>${d}</p></div>`).join('')}</div>`).join('') +
      '<div class="insight"><b>整理のコツ</b><ul><li><b>ランク</b>（つるぎのまいの＋2 など）を動かす：パワースワップ・ガードスワップ・じこあんじ・ひっくりかえす</li><li><b>能力の数値そのもの</b>を動かす：スピードスワップ・パワーシェア・ガードシェア・パワートリック</li><li>ランクは交代で元に戻るが、とくせい・もちものの入れ替えは交代しても戻らない（とくせいは交代で元に戻る技もある）</li></ul></div>';
  }

  /* ---------- 育成の例 ---------- */
  function renderTraining() {
    const list = TRAINING.filter((t) => MON[t.mon] && MON[t.mon].sp <= spoil());
    const hidden = TRAINING.length - list.length;
    $('#trainList').innerHTML = list.map((t) => {
      const m = MON[t.mon];
      const nat = NATURES.find((n) => n[0] === t.nat);
      const abPlain = t.ab.replace(/（.*/, '');
      const abTxt = t.ab.includes('（') ? t.ab : abName(m, abPlain);
      return `<div class="train">
        <div class="train-head"><b>${esc(m.ja)}</b>${m.ty.map(typeTag).join('')}${kindBadge(m)}<span class="train-role">${esc(t.role)}</span></div>
        <div class="train-body">
          <div>${sbars(m)}</div>
          <dl class="train-dl">
            <dt>とくせい</dt><dd>${esc(abTxt)}</dd>
            <dt>せいかく</dt><dd>${esc(t.nat)}（${esc(natText(nat))}）</dd>
            <dt>努力値</dt><dd>${esc(t.ev)}</dd>
            <dt>もちもの</dt><dd>${esc(t.item)}</dd>
            <dt>テラスタイプ</dt><dd>${typeTag(t.tera)}</dd>
          </dl>
        </div>
        <ul class="train-moves">${t.moves.map(([n, r]) => `<li><b>${esc(n)}</b>${moveTag(n)}<span>${esc(r)}</span></li>`).join('')}</ul>
        <p class="train-why">${esc(t.why)}</p>
      </div>`;
    }).join('') + (hidden ? `<p class="hint">ネタバレ範囲の外の例が ${hidden} つあります（設定で範囲を広げると表示されます）。</p>` : '');
  }

  /* ---------- ダブルバトル ---------- */
  function renderDouble() {
    $('#doubleNotes').innerHTML = `<div class="kcards">${DOUBLE_NOTES.map(([n, d]) => `<div class="kcard"><b>${esc(n)}</b>${moveTag(n.split('／')[0])}<p>${esc(d)}</p></div>`).join('')}</div>`;
    const chips = (f, n) => MV.filter(f).slice(0, n).map((m) => `<span class="mchip">${typeTag(m.ty)}${esc(m.ja)}</span>`).join('');
    $('#doubleMoves').innerHTML = `
      <h4 class="mh">味方にも当たる攻撃技（自分以外全員）</h4><div class="mchips">${chips((m) => m.pw > 0 && m.tgt === '自分以外全員', 24)}</div>
      <h4 class="mh">相手2体だけに当たる攻撃技（相手全体）</h4><div class="mchips">${chips((m) => m.pw > 0 && m.tgt === '相手全体', 24)}</div>
      <h4 class="mh">味方を助ける技（味方・自分か味方・味方の場）</h4><div class="mchips">${chips((m) => m.cat === '変化' && ['味方', '自分か味方', '味方全体', '自分と味方'].includes(m.tgt), 24)}${['てだすけ', 'デコレーション', 'このゆびとまれ', 'いかりのこな', 'ワイドガード', 'ファストガード'].filter((n) => !MV.some((m) => m.ja === n && ['味方', '自分か味方', '味方全体', '自分と味方'].includes(m.tgt))).map((n) => `<span class="mchip">${moveTag(n)}${esc(n)}</span>`).join('')}</div>
      <p class="hint">範囲は PokéAPI のデータによります。全体技は2体以上に当たると0.75倍。</p>`;
  }

  /* ---------- テラレイド ---------- */
  const raidState = { mult: 20, pct: 25 };
  function renderRaid() {
    $('#raidHp').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>むずかしさ</th><th class="n">ボスのHP</th></tr></thead><tbody>${RAID_HP.map(([s, m]) => `<tr><td>${s}</td><td class="n"><b>ふつうの約${m}倍</b></td></tr>`).join('')}</tbody></table></div>`;
    const box = $('#raidCalc');
    box.innerHTML = `<div class="calc">
      <p class="formula-head" style="margin:0">何回で倒せる？（バリアやおうえんを考えない目安）</p>
      <div class="calc-row"><label>むずかしさ</label><div class="seg" id="rcStar"></div><span></span></div>
      <div class="calc-row"><label for="rcPct">1回で</label><input type="range" id="rcPct" min="5" max="100" step="5"><output id="rcPctV"></output></div>
      <p class="hint" style="margin:0">「ふつうの相手（同じポケモン）なら、1回でHPの◯%を削れる攻撃」として考えます。</p>
      <div class="calc-out"><b id="rcOut"></b><span id="rcNote"></span></div>
    </div>`;
    const upd = () => {
      const n = Math.ceil((100 * raidState.mult) / raidState.pct);
      $('#rcPct').value = raidState.pct;
      $('#rcPctV').textContent = raidState.pct + '%';
      $('#rcOut').textContent = n + '回';
      $('#rcNote').textContent = `レイドでは1回で約${Math.round((raidState.pct / raidState.mult) * 10) / 10}%しか削れない。4人なら1人あたり約${Math.ceil(n / 4)}回。`;
    };
    segButtons($('#rcStar'), [[5, '★1-2'], [8, '★3'], [12, '★4'], [20, '★5'], [25, '★6']], () => raidState.mult, (v) => { raidState.mult = v; upd(); });
    $('#rcPct').oninput = (e) => { raidState.pct = +e.target.value; upd(); };
    upd();
    $('#raidNotes').innerHTML = `<div class="kcards">${RAID_NOTES.map(([n, d]) => `<div class="kcard"><b>${esc(n)}</b><p>${esc(d)}</p></div>`).join('')}</div>`;
  }
  function renderRules() {
    $('#ruleNotes').innerHTML = `<div class="kcards">${RULE_NOTES.map(([n, d]) => `<div class="kcard"><b>${esc(n)}</b><p>${esc(d)}</p></div>`).join('')}</div>`;
  }

  /* ================= ダメージ計算機 ================= */
  const ATK_ITEMS = [['none', 'なし'], ['choice', 'こだわりハチマキ／メガネ（攻撃1.5倍）'], ['orb', 'いのちのたま（約1.3倍）'], ['type', 'タイプ強化アイテム（威力1.2倍）'], ['belt', 'たつじんのおび（ばつぐんのとき1.2倍）']];
  const DEF_ITEMS = [['none', 'なし'], ['vest', 'とつげきチョッキ（特殊を受けるとき1.5倍）'], ['eviolite', 'しんかのきせき（ぼうぎょ・とくぼう1.5倍）']];
  const dmg = Object.assign({ atkMon: '', cat: 'p', atk: 100, rank: 4, stab: 1.5, item: 'none', burn: false, pow: 50, eff: 4, weather: 1, crit: false,
    defMon: '', hp: 150, def: 100, drank: 0, ditem: 'none', wall: false, aEv: 252, aNat: 1, hEv: 0, dEv: 0, dNat: 1 }, store.get('dmg', {}));
  const saveDmg = () => store.set('dmg', dmg);
  const pokeRound = (x) => (x % 1 > 0.5 ? Math.ceil(x) : Math.floor(x));
  const rankMul = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
  /** ダメージの計算（レベル50）。ゲームの順番どおりにかけて、乱数85〜100の16通りを返す */
  function dmgCalc(o, trace) {
    const lv = Math.floor((2 * 50) / 5) + 2;
    let P = o.pow;
    if (o.item === 'type') P = pokeRound((P * 4915) / 4096);
    let aR = o.rank, dR = o.drank;
    if (o.crit) { if (aR < 0) aR = 0; if (dR > 0) dR = 0; }
    let A = Math.floor(o.atk * rankMul(aR));
    if (o.item === 'choice') A = Math.floor(A * 1.5);
    let D = Math.floor(o.def * rankMul(dR));
    if (o.ditem === 'eviolite' || (o.ditem === 'vest' && o.cat === 's')) D = Math.floor(D * 1.5);
    const base = Math.floor(Math.floor((lv * P * A) / D) / 50) + 2;
    const one = (r) => {
      const t = [];
      let d = base;
      if (o.weather !== 1) { d = pokeRound(d * o.weather); t.push(['天気', o.weather, d]); }
      if (o.crit) { d = Math.floor(d * 1.5); t.push(['きゅうしょ', 1.5, d]); }
      d = Math.floor((d * r) / 100); t.push([`乱数（${r}%）`, r / 100, d]);
      if (o.stab > 1) { d = pokeRound(d * o.stab); t.push(['タイプ一致', o.stab, d]); }
      d = Math.floor(d * o.eff); t.push(['タイプ相性', o.eff, d]);
      if (o.burn && o.cat === 'p') { d = Math.floor(d / 2); t.push(['やけど', 0.5, d]); }
      let mod = 1;
      const names = [];
      if (o.wall && !o.crit) { mod *= 0.5; names.push('壁 ×0.5'); }
      if (o.item === 'orb') { mod *= 5324 / 4096; names.push('いのちのたま ×1.3'); }
      if (o.item === 'belt' && o.eff > 1) { mod *= 4915 / 4096; names.push('たつじんのおび ×1.2'); }
      if (mod !== 1) { d = pokeRound(d * mod); t.push([names.join('・'), mod, d]); }
      if (o.eff > 0 && d < 1) d = 1;
      if (trace) trace[r] = t;
      return d;
    };
    const rolls = [];
    for (let r = 85; r <= 100; r++) rolls.push(one(r));
    return { lv, P, A, D, base, rolls, min: rolls[0], max: rolls[15] };
  }
  const koText = (res, hp) => {
    if (!res.max) return 'ダメージなし';
    const a = Math.ceil(hp / res.max), b = Math.ceil(hp / res.min);
    if (a === 1 && b === 1) return '確定1発（一撃で倒せる）';
    return a === b ? `確定${a}発` : `乱数${a}発（${b}発あれば確定）`;
  };
  const pctTxt = (d, hp) => (Math.round((1000 * d) / hp) / 10) + '%';

  function initDmg() {
    const mons = MONS.slice().sort((a, b) => a.p - b.p);
    const opt = (sel) => `<option value="">（数値を直接入れる）</option>${mons.filter((m) => m.sp <= spoil()).map((m) => `<option${m.ja === sel ? ' selected' : ''}>${esc(m.ja)}</option>`).join('')}`;
    $('#dAtkMon').innerHTML = opt(dmg.atkMon);
    $('#dDefMon').innerHTML = opt(dmg.defMon);
    $('#dItem').innerHTML = ATK_ITEMS.map(([v, l]) => `<option value="${v}"${dmg.item === v ? ' selected' : ''}>${l}</option>`).join('');
    $('#dDItem').innerHTML = DEF_ITEMS.map(([v, l]) => `<option value="${v}"${dmg.ditem === v ? ' selected' : ''}>${l}</option>`).join('');
    $('#dmgPresets').innerHTML = DMG_PRESETS.map((p, i) => `<button class="chip" type="button" data-pre="${i}">${esc(p.label)}</button>`).join('');
    syncDmgInputs();
  }
  const DMG_PRESETS = [
    { label: '例：こうげき100・威力50・つるぎのまい2回・タイプ一致', s: { atkMon: '', defMon: '', cat: 'p', atk: 100, pow: 50, rank: 4, stab: 1.5, item: 'none', eff: 4, crit: false, burn: false, weather: 1, hp: 150, def: 100, drank: 0, ditem: 'none', wall: false } },
    { label: '同じ条件で、いまひとつ', s: { eff: 0.5, item: 'none' } },
    { label: '同じ条件で、いのちのたま・等倍', s: { eff: 1, item: 'orb' } },
    { label: 'ハバタクカミのムーンフォース → カイリュー', s: { atkMon: 'ハバタクカミ', defMon: 'カイリュー', cat: 's', aEv: 252, aNat: 1, pow: 95, rank: 0, stab: 1.5, item: 'none', eff: 2, hEv: 252, dEv: 0, dNat: 1, drank: 0, ditem: 'none', crit: false, burn: false, weather: 1, wall: false } },
    { label: 'ガブリアスのじしん → ドドゲザン', s: { atkMon: 'ガブリアス', defMon: 'ドドゲザン', cat: 'p', aEv: 252, aNat: 1.1, pow: 100, rank: 0, stab: 1.5, item: 'choice', eff: 2, hEv: 252, dEv: 0, dNat: 1, drank: 0, ditem: 'none', crit: false, burn: false, weather: 1, wall: false } }
  ];
  function fillFromMons() {
    const si = dmg.cat === 'p' ? 1 : 3, di = dmg.cat === 'p' ? 2 : 4;
    const a = MON[dmg.atkMon], d = MON[dmg.defMon];
    if (a) dmg.atk = calcStat(a.bs[si], 31, dmg.aEv, 50, false, dmg.aNat);
    if (d) { dmg.hp = calcStat(d.bs[0], 31, dmg.hEv, 50, true); dmg.def = calcStat(d.bs[di], 31, dmg.dEv, 50, false, dmg.dNat); }
  }
  function syncDmgInputs() {
    fillFromMons();
    const phys = dmg.cat === 'p';
    $('#dAtkLabel').textContent = phys ? 'こうげき' : 'とくこう';
    $('#dDefLabel').textContent = phys ? 'ぼうぎょ' : 'とくぼう';
    $('#dWallLabel').textContent = phys ? 'リフレクター' : 'ひかりのかべ';
    $('#dAtk').value = dmg.atk; $('#dPow').value = dmg.pow; $('#dHp').value = dmg.hp; $('#dDef').value = dmg.def;
    $('#dRank').value = dmg.rank; $('#dDRank').value = dmg.drank;
    $('#dItem').value = dmg.item; $('#dDItem').value = dmg.ditem;
    $('#dBurn').checked = dmg.burn; $('#dCrit').checked = dmg.crit; $('#dWall').checked = dmg.wall;
    $('#dAtkMon').value = dmg.atkMon; $('#dDefMon').value = dmg.defMon;
    // しんかのきせきは、まだ進化できるポケモンにしか効かない
    const dm = MON[dmg.defMon];
    const evioOk = !dm || !dm.final;
    $('#dDItem').querySelector('option[value="eviolite"]').disabled = !evioOk;
    if (!evioOk && dmg.ditem === 'eviolite') { dmg.ditem = 'none'; $('#dDItem').value = 'none'; }
    let note = $('#dDItemNote');
    if (!note) { note = el('p', 'hint'); note.id = 'dDItemNote'; note.style.margin = '0'; $('#dDItem').after(note); }
    note.textContent = dm ? (evioOk ? `${dm.ja}はまだ進化できるので、しんかのきせきが効く。` : `${dm.ja}は最終進化（または進化しない）なので、しんかのきせきは効かない。`) : '';
    const re = () => { syncDmgInputs(); };
    segButtons($('#dCat'), [['p', '物理'], ['s', '特殊']], () => dmg.cat, (v) => { dmg.cat = v; re(); });
    segButtons($('#dStab'), [[1, 'なし'], [1.5, '1.5倍'], [2, '2倍（テラスタル同タイプ・てきおうりょく）']], () => dmg.stab, (v) => { dmg.stab = v; drawDmg(); });
    segButtons($('#dEff'), [[0, '0'], [0.25, '1/4'], [0.5, '1/2'], [1, '1'], [2, '2'], [4, '4']], () => dmg.eff, (v) => { dmg.eff = v; drawDmg(); });
    segButtons($('#dWeather'), [[1, 'なし'], [1.5, '強める（はれ＋ほのお 等）'], [0.5, '弱める（はれ＋みず 等）']], () => dmg.weather, (v) => { dmg.weather = v; drawDmg(); });
    const a = MON[dmg.atkMon], d = MON[dmg.defMon];
    $('#dAtkFill').hidden = !a; $('#dDefFill').hidden = !d;
    if (a) {
      $('#dAtkFill').innerHTML = `<span class="fill-note">${phys ? 'こうげき' : 'とくこう'}の種族値 ${a.bs[phys ? 1 : 3]}・個体値31</span><div class="seg" id="dAEv"></div><div class="seg" id="dANat"></div>`;
      segButtons($('#dAEv'), [[0, '努力値0'], [252, '252']], () => dmg.aEv, (v) => { dmg.aEv = v; re(); });
      segButtons($('#dANat'), [[1.1, '↑1.1'], [1, '補正なし'], [0.9, '↓0.9']], () => dmg.aNat, (v) => { dmg.aNat = v; re(); });
    }
    if (d) {
      $('#dDefFill').innerHTML = `<span class="fill-note">HP ${d.bs[0]}・${phys ? 'ぼうぎょ' : 'とくぼう'} ${d.bs[phys ? 2 : 4]}（種族値）・個体値31</span><div class="seg" id="dHEv"></div><div class="seg" id="dDEv"></div><div class="seg" id="dDNat"></div>`;
      segButtons($('#dHEv'), [[0, 'HP 0'], [252, 'HP 252']], () => dmg.hEv, (v) => { dmg.hEv = v; re(); });
      segButtons($('#dDEv'), [[0, '防御 0'], [252, '防御 252']], () => dmg.dEv, (v) => { dmg.dEv = v; re(); });
      segButtons($('#dDNat'), [[1.1, '↑1.1'], [1, '補正なし'], [0.9, '↓0.9']], () => dmg.dNat, (v) => { dmg.dNat = v; re(); });
    }
    drawDmg();
  }
  function drawDmg() {
    saveDmg();
    const sg = (n) => (n > 0 ? '＋' + n : n < 0 ? '−' + -n : '±0');
    $('#dRankOut').textContent = `${sg(dmg.rank)}（×${fracStr(rankMul(dmg.rank))}）`;
    $('#dDRankOut').textContent = `${sg(dmg.drank)}（×${fracStr(rankMul(dmg.drank))}）`;
    const trace = {};
    const r = dmgCalc(dmg, trace);
    const hp = Math.max(1, dmg.hp);
    const lo = Math.min(100, (100 * r.min) / hp), hi = Math.min(100, (100 * r.max) / hp);
    $('#dmgOut').innerHTML = `<div class="dmg-big"><b>${r.min}〜${r.max}</b><span>ダメージ</span></div>
      <div class="dmg-big"><b>${pctTxt(r.min, hp)}〜${pctTxt(r.max, hp)}</b><span>相手のHP ${hp} のうち</span></div>
      <div class="dmg-big ko"><b>${koText(r, hp)}</b><span>${r.max >= hp ? '一撃で倒せることがある' : `残りHP ${Math.max(0, hp - r.max)}〜${Math.max(0, hp - r.min)}`}</span></div>
      <div class="hpbar" aria-hidden="true"><span class="hp-left" style="width:${100 - hi}%"></span><span class="hp-roll" style="left:${100 - hi}%;width:${hi - lo}%"></span></div>`;
    const t85 = trace[85], t100 = trace[100];
    const rankTxt = (n, crit, neg) => (n === 0 ? '' : crit && ((neg && n < 0) || (!neg && n > 0)) ? `（ランク${sg(n)}はきゅうしょで無視）` : ` × ランク${sg(n)}（×${fracStr(rankMul(n))}）`);
    $('#dmgSteps').innerHTML = `<ol class="steps-list">
      <li><b>レベルの補正</b>：レベル50なら 2×50÷5＋2 ＝ <b>${r.lv}</b></li>
      <li><b>威力</b>：${dmg.pow}${dmg.item === 'type' ? ` × タイプ強化1.2 → <b>${r.P}</b>` : ''}</li>
      <li><b>${dmg.cat === 'p' ? 'こうげき' : 'とくこう'}</b>：${dmg.atk}${rankTxt(dmg.rank, dmg.crit, true)}${dmg.item === 'choice' ? ' × こだわり1.5' : ''} → <b>${r.A}</b></li>
      <li><b>${dmg.cat === 'p' ? 'ぼうぎょ' : 'とくぼう'}</b>：${dmg.def}${rankTxt(dmg.drank, dmg.crit, false)}${dmg.ditem === 'eviolite' || (dmg.ditem === 'vest' && dmg.cat === 's') ? ' × 1.5' : ''} → <b>${r.D}</b></li>
      <li><b>もとのダメージ</b>：${r.lv} × ${r.P} × ${r.A} ÷ ${r.D} ÷ 50 ＋ 2 ＝ <b>${r.base}</b>（小数は切り捨て）</li>
      <li><b>倍率をかける</b>（ゲームの順番。1回ごとに切り捨て）
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>倍率</th><th class="n">乱数いちばん低い</th><th class="n">乱数いちばん高い</th></tr></thead><tbody>
        ${t85.map((x, i) => `<tr><td>${esc(x[0].replace(/（\d+%）/, ''))} ×${fracStr(x[1])}${i === t85.findIndex((y) => y[0].startsWith('乱数')) ? '<small>（0.85〜1.00）</small>' : ''}</td><td class="n">${x[2]}</td><td class="n">${t100[i][2]}</td></tr>`).join('')}
        </tbody></table></div></li>
    </ol>
    <p class="hint">ポイント：威力・こうげき・ぼうぎょは「割り算の中」なので、ランクやもちもので<strong>こうげきが2倍ならダメージもほぼ2倍</strong>。相手のぼうぎょが2倍ならダメージはほぼ半分。乱数があるので、ダメージは最大の85%〜100%の幅でぶれる。</p>`;
    // くらべる
    const row = (label, o) => { const x = dmgCalc(Object.assign({}, dmg, o)); return `<tr><td>${label}</td><td class="n">${x.min}〜${x.max}</td><td class="n">${pctTxt(x.min, hp)}〜${pctTxt(x.max, hp)}</td><td>${koText(x, hp)}</td></tr>`; };
    const effRows = [4, 2, 1, 0.5, 0.25].map((v) => row(`相性 ${fmtMult(v)}${v === dmg.eff ? '（いま）' : ''}`, { eff: v })).join('');
    const vRows = [
      ['ランク ±0', { rank: 0 }], ['ランク ＋2（つるぎのまい1回）', { rank: 2 }], ['ランク ＋4（2回）', { rank: 4 }], ['ランク ＋6（最大）', { rank: 6 }],
      ['いかくされた（−1）', { rank: -1 }], ['タイプ一致なし', { stab: 1 }], ['テラスタル同タイプ（2倍）', { stab: 2 }],
      ['もちものなし', { item: 'none' }], ['いのちのたま', { item: 'orb' }], ['こだわりハチマキ／メガネ', { item: 'choice' }],
      ['きゅうしょ', { crit: true }], ['相手のぼうぎょ（とくぼう）2倍', { def: dmg.def * 2 }], ['相手に壁', { wall: true }]
    ].map(([l, o]) => row(l, o)).join('');
    $('#dmgCompare').innerHTML = `<h3>タイプ相性を変えると</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>条件</th><th class="n">ダメージ</th><th class="n">HPの割合</th><th>倒すまで</th></tr></thead><tbody>${effRows}</tbody></table></div>
      <h3>ほかの条件だけ変えると（ほかは今の設定のまま）</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>条件</th><th class="n">ダメージ</th><th class="n">HPの割合</th><th>倒すまで</th></tr></thead><tbody>${vRows}</tbody></table></div>`;
  }
  function bindDmg() {
    const num = (id, key) => $(id).addEventListener('input', (e) => { const v = Math.max(1, +e.target.value || 1); dmg[key] = v; if (key === 'atk') dmg.atkMon = ''; if (key === 'hp' || key === 'def') dmg.defMon = ''; $('#dAtkMon').value = dmg.atkMon; $('#dDefMon').value = dmg.defMon; $('#dAtkFill').hidden = !dmg.atkMon; $('#dDefFill').hidden = !dmg.defMon; drawDmg(); });
    num('#dAtk', 'atk'); num('#dPow', 'pow'); num('#dHp', 'hp'); num('#dDef', 'def');
    $('#dRank').addEventListener('input', (e) => { dmg.rank = +e.target.value; drawDmg(); });
    $('#dDRank').addEventListener('input', (e) => { dmg.drank = +e.target.value; drawDmg(); });
    $('#dItem').addEventListener('change', (e) => { dmg.item = e.target.value; drawDmg(); });
    $('#dDItem').addEventListener('change', (e) => { dmg.ditem = e.target.value; syncDmgInputs(); });
    $('#dBurn').addEventListener('change', (e) => { dmg.burn = e.target.checked; drawDmg(); });
    $('#dCrit').addEventListener('change', (e) => { dmg.crit = e.target.checked; drawDmg(); });
    $('#dWall').addEventListener('change', (e) => { dmg.wall = e.target.checked; drawDmg(); });
    $('#dAtkMon').addEventListener('change', (e) => { dmg.atkMon = e.target.value; syncDmgInputs(); });
    $('#dDefMon').addEventListener('change', (e) => { dmg.defMon = e.target.value; syncDmgInputs(); });
    $('#dPowChips').innerHTML = [40, 50, 60, 70, 80, 90, 100, 120, 150].map((p) => `<button class="chip" type="button" data-pow="${p}">${p}</button>`).join('');
    $('#dPowChips').addEventListener('click', (e) => { const b = e.target.closest('[data-pow]'); if (!b) return; dmg.pow = +b.dataset.pow; $('#dPow').value = dmg.pow; drawDmg(); });
    $('#dmgPresets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pre]');
      if (!b) return;
      const p = DMG_PRESETS[+b.dataset.pre];
      if ((p.s.atkMon && MON[p.s.atkMon].sp > spoil()) || (p.s.defMon && MON[p.s.defMon].sp > spoil())) { alert('この例は、いまのネタバレ範囲の外のポケモンを使います。設定で範囲を広げてください。'); return; }
      Object.assign(dmg, p.s);
      syncDmgInputs();
    });
  }
  let dmgReady = false;
  function renderDmg() {
    if (!dmgReady) { dmgReady = true; bindDmg(); }
    initDmg();
  }

  /* ================= 種族値ずかん ================= */
  const dexTypes = [];
  let dexPage = 1;
  const DEX_PAGE = 50;
  function renderDex() {
    const q = norm($('#dexSearch').value.trim());
    let list = visMons().filter((m) => (!q || m.k.includes(q)) && dexTypes.every((t) => m.ty.includes(t)) && (!settings.dexFinal || m.final));
    const key = settings.dexSort;
    if (key === 't') list.sort((a, b) => b.tot - a.tot);
    else if (key !== 'p') list.sort((a, b) => b.bs[+key] - a.bs[+key]);
    else list.sort((a, b) => a.p - b.p);
    const hidden = MONS.length - visMons().length;
    $('#dexCount').textContent = `${list.length} 匹${hidden ? `（ネタバレ範囲の外の ${hidden} 匹は出していません）` : ''}`;
    const shown = list.slice(0, dexPage * DEX_PAGE);
    $('#dexList').innerHTML = shown.length ? shown.map(dexRow).join('') : '<p class="empty">見つかりませんでした</p>';
    $('#dexMore').hidden = list.length <= shown.length;
  }
  function dexRow(m) {
    const key = settings.dexSort;
    return `<details class="dex-row" data-mon="${esc(m.ja)}"><summary>
      <div class="dex-name"><small>${dexLabel(m)}</small><b>${esc(m.ja)}</b>${m.ty.map(typeTag).join('')}${kindBadge(m)}</div>
      <div class="dex-tot">${m.tot}<small>合計</small></div>
      <div class="dex-mini">${m.bs.map((v, i) => `<div class="${String(i) === key ? 'sorted' : ''}"><em>${STAT_SHORT[i]}</em>${v}<i><span class="s${i}" style="width:${Math.min(100, (100 * v) / 160)}%"></span></i></div>`).join('')}</div>
    </summary><div class="dex-body"></div></details>`;
  }
  function dexDetail(m) {
    const line = lineOf(m).filter((x) => x.sp <= spoil()).sort((a, b) => a.stage - b.stage || a.p - b.p);
    const groups = [4, 2, 0.5, 0.25, 0].map((v) => [v, TYPES.filter((t) => eff(t, m.ty) === v)]).filter(([, ts]) => ts.length);
    return `${sbars(m)}
      <div><h4>とくせい</h4><div class="dex-abil">${m.ab.map((a) => `<span class="${a.h ? 'h' : ''}">${esc(a.n)}</span>`).join('')}</div></div>
      ${line.length > 1 ? `<div><h4>進化の系統と合計</h4><div class="dex-line">${line.map((x) => `<span class="${x === m ? 'cur' : ''}">${esc(x.ja)} <small>${x.tot}</small></span>`).join('<span>→</span>')}</div></div>` : `<div><h4>進化</h4><p class="hint" style="margin:0">${esc(stageText(m))}</p></div>`}
      <div><h4>受けるときの相性</h4><div class="def-out">${groups.map(([v, ts]) => `<div class="row"><span class="lbl">${fmtMult(v)}</span>${ts.map(typeTag).join('')}</div>`).join('')}</div></div>
      <p class="hint" style="margin:0">レベル50・個体値31・努力値252・補正なしのすばやさ：<b>${speed50(m)}</b>（最速なら ${calcStat(m.bs[5], 31, 252, 50, false, 1.1)}）</p>`;
  }
  $('#dexList').addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!d.open || !d.matches('.dex-row')) return;
    const body = $('.dex-body', d);
    if (!body.innerHTML) body.innerHTML = dexDetail(MON[d.dataset.mon]);
  }, true);
  $('#dexSearch').addEventListener('input', () => { dexPage = 1; renderDex(); });
  $('#dexSort').value = settings.dexSort;
  $('#dexSort').addEventListener('change', (e) => { settings.dexSort = e.target.value; saveSettings(); dexPage = 1; renderDex(); });
  $('#dexFinal').checked = !!settings.dexFinal;
  $('#dexFinal').addEventListener('change', (e) => { settings.dexFinal = e.target.checked; saveSettings(); dexPage = 1; renderDex(); });
  $('#dexMore').addEventListener('click', () => { dexPage++; renderDex(); });
  function renderDexTypes() {
    $('#dexTypes').innerHTML = TYPES.map((t) => `<button class="type type-btn t-${TYPE_CLASS[t]}" type="button" data-t="${t}" aria-pressed="${dexTypes.includes(t)}">${t}</button>`).join('');
    $('#dexTypeSel').innerHTML = dexTypes.map(typeTag).join('');
  }
  $('#dexTypes').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-t]');
    if (!b) return;
    const t = b.dataset.t, i = dexTypes.indexOf(t);
    if (i >= 0) dexTypes.splice(i, 1); else { dexTypes.push(t); if (dexTypes.length > 2) dexTypes.shift(); }
    renderDexTypes(); dexPage = 1; renderDex();
  });
  $('#dexTypeClear').addEventListener('click', () => { dexTypes.length = 0; renderDexTypes(); dexPage = 1; renderDex(); });

  /* ================= 記録 ================= */
  function renderRecord() {
    const today = days[dayKey()] || { a: 0, c: 0 };
    const total = Object.values(days).reduce((acc, d) => ({ a: acc.a + d.a, c: acc.c + d.c }), { a: 0, c: 0 });
    const nDays = Object.values(days).filter((d) => d.a > 0).length;
    $('#recTiles').innerHTML = `
      <div class="tile"><span class="tile-v">${streak()}<small>日</small></span><span class="tile-k">連続で練習</span></div>
      <div class="tile"><span class="tile-v">${today.a}<small>問</small></span><span class="tile-k">今日${today.a ? `（正答率 ${pct(today)}%）` : ''}</span></div>
      <div class="tile"><span class="tile-v">${total.a}<small>問</small></span><span class="tile-k">これまで（${nDays}日・正答率 ${total.a ? pct(total) + '%' : '—'}）</span></div>`;
    const list = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); list.push(d); }
    const max = Math.max(+settings.goal, ...list.map((d) => (days[dayKey(d)] || { a: 0 }).a));
    $('#recBars').innerHTML = list.map((d) => {
      const v = days[dayKey(d)] || { a: 0, c: 0 };
      const wd = '日月火水木金土'[d.getDay()];
      return `<div class="bar${dayKey(d) === dayKey() ? ' is-today' : ''}" title="${d.getMonth() + 1}/${d.getDate()}：${v.a}問（正解 ${v.c}）">
        <div class="bar-col"><span class="bar-all" style="height:${(100 * v.a) / max}%"></span><span class="bar-ok" style="height:${(100 * v.c) / max}%"></span></div>
        <span class="bar-v">${v.a || ''}</span><span class="bar-d">${d.getDate()}<small>${wd}</small></span></div>`;
    }).join('');
    $('#recBars').style.setProperty('--goal', (100 * settings.goal) / max + '%');

    $('#recHeat').innerHTML = QMODES.filter((m) => m.id !== 'mix').map((m) => {
      const s = modeStats[m.id], p = pct(s);
      const lvl = p == null ? 'none' : p >= 90 ? 'g4' : p >= 75 ? 'g3' : p >= 50 ? 'g2' : 'g1';
      return `<button class="heat-cell" type="button" data-mode="${m.id}" data-lvl="${lvl}"><b>${esc(m.title)}</b><span>${p == null ? 'まだ' : `${p}%（${s.c}/${s.a}）`}</span></button>`;
    }).join('');
    const weak = Object.entries(stats).filter(([, s]) => s.a >= 2 && s.c < s.a).map(([id, s]) => ({ id, s, p: s.c / s.a }))
      .sort((a, b) => a.p - b.p || b.s.a - a.s.a).slice(0, 12);
    $('#recWeak').innerHTML = weak.length
      ? `<ul class="weak-list">${weak.map((w) => `<li><span>${esc(w.s.l)}</span><small>${esc(MODE_TITLE[w.s.m] || '')}</small><b>${Math.round(w.p * 100)}%（${w.s.c}/${w.s.a}）</b></li>`).join('')}</ul>
        <p class="hint">分野のボタンを押すと、その分野の練習が始まります。「間違えた問題を多めに出す」がオンなら、ここに出ているものが多めに出題されます。</p>`
      : '<p class="hint">2回以上出題されて、間違えたことのある問題・組み合わせがここに並びます。</p>';
  }
  $('#recHeat').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-mode]');
    if (!b) return;
    show('quiz');
    startQuiz(b.dataset.mode);
  });
  $('#resetStats').addEventListener('click', () => {
    if (!confirm('正答率と練習した日の記録をすべて消します。よろしいですか？')) return;
    stats = {}; modeStats = {}; days = {};
    store.set('stats', stats); store.set('modes', modeStats); store.set('days', days);
    renderRecord();
  });

  /* ================= gate ================= */
  function openGate() {
    spoilRadios($('#gateRadios'), 'gsp');
    const d = $('#gate');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  $('#gateForm').addEventListener('submit', () => {
    const v = $('#gateRadios input:checked');
    setSpoil(v ? +v.value : 1);
    spoilRadios($('#spoilRadios'), 'sp');
  });
  $('#showGate').addEventListener('click', openGate);

  /* ================= install (PWA) ================= */
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    installEvt = null;
    $('#installBtn').hidden = true;
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  /* ================= start ================= */
  recomputeStats();
  applyTheme();
  initSettings();
  spoilRadios($('#spoilRadios'), 'sp');
  renderSpoilBar();
  renderDexTypes();
  show(current);
  if (settings.spoil == null) openGate();

  // 開発用：node から問題の生成を確かめる（tools/check.js）
  // simRun：1回のクイズで、重ならない問題を何問まで出せるか
  const simRun = (mode, level, n) => {
    const keep = quiz;
    quiz = { used: new Set(), titles: new Set() };
    let k = 0;
    for (; k < n; k++) { const q = makeQuestion(mode, level); if (!q) break; quiz.titles.add(q.title); }
    quiz = keep;
    return k;
  };
  window.__pik = { makeQuestion, MAKERS, MONS, GROUP, TYPE_AVG, eff, dmgCalc, simRun };
})();
