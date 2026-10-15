#!/usr/bin/env node
'use strict';
/*
 * PokéAPI から種族値・とくせいを集めて data-stats.js を作るスクリプト（開発用）
 *   node tools/fetch-data.js
 * パルデア図鑑の一覧（番号・日本語名・タイプ・ネタバレ段階）は、兄弟アプリ ../pokemon-motoneta/data-pokemon.js を読みます。
 * キタカミ図鑑・ブルーベリー図鑑は PokéAPI の図鑑から取ります。進化の段階は PokéAPI の進化の系統から数えます。取得した JSON は tools/.cache/ に保存します。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');
fs.mkdirSync(CACHE, { recursive: true });

const TYPE_EN = { ノーマル: 'normal', ほのお: 'fire', みず: 'water', でんき: 'electric', くさ: 'grass', こおり: 'ice', かくとう: 'fighting', どく: 'poison', じめん: 'ground', ひこう: 'flying', エスパー: 'psychic', むし: 'bug', いわ: 'rock', ゴースト: 'ghost', ドラゴン: 'dragon', あく: 'dark', はがね: 'steel', フェアリー: 'fairy' };
const TYPE_JA = Object.fromEntries(Object.entries(TYPE_EN).map(([j, e]) => [e, j]));

async function get(url) {
  const f = path.join(CACHE, url.replace(/^https:\/\/pokeapi\.co\/api\/v2\//, '').replace(/[\/?=&]/g, '_') + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status + ' ' + url);
      const j = await r.json();
      fs.writeFileSync(f, JSON.stringify(j));
      return j;
    } catch (e) { if (i === 3) throw e; await new Promise((ok) => setTimeout(ok, 1000 * (i + 1))); }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
// 全角の英数字（ポリゴン２・ポリゴンＺ など）は半角にする
const half = (s) => s && s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
const jaName = (names) => half((names.find((n) => n.language.name === 'ja-Hrkt') || names.find((n) => n.language.name === 'ja') || {}).name);

// 追加コンテンツの図鑑とネタバレ段階（4〜7）。パルデア図鑑にもいるポケモンはパルデアの段階のまま
const DLC = [
  { dex: 'K', id: 'kitakami', sp: 4, spLeg: 5 },
  { dex: 'B', id: 'blueberry', sp: 6, spLeg: 7 }
];
const PARADOX = /^(great-tusk|scream-tail|brute-bonnet|flutter-mane|slither-wing|sandy-shocks|roaring-moon|iron-|walking-wake|gouging-fire|raging-bolt)/;

async function monRow(speciesId, want) {
  const sp = await get(`https://pokeapi.co/api/v2/pokemon-species/${speciesId}`);
  const vars = await Promise.all(sp.varieties.map((v) => get(v.pokemon.url)));
  const tyOf = (v) => v.types.map((t) => t.type.name).join('/');
  let pk = want ? vars.find((v) => tyOf(v) === want) : vars.find((v) => v.is_default) || vars[0];
  // パルデアのすがた（ウパー・ケンタロス）を優先
  const paldea = want ? vars.filter((v) => v.name.includes('paldea') && tyOf(v) === want) : [];
  if (paldea.length) pk = paldea[0];
  if (!pk) { console.warn('type mismatch', sp.name, want, vars.map((v) => v.name)); pk = vars[0]; }
  const st = Object.fromEntries(pk.stats.map((s) => [s.stat.name, s.base_stat]));
  return {
    species: sp.name, no: sp.id, ja: jaName(sp.names), en: (sp.names.find((n) => n.language.name === 'en') || {}).name || sp.name,
    chain: sp.evolution_chain.url,
    ty: pk.types.map((t) => TYPE_JA[t.type.name]),
    bs: [st.hp, st.attack, st.defense, st['special-attack'], st['special-defense'], st.speed],
    ab: pk.abilities.map((a) => [a.ability.name, a.is_hidden ? 1 : 0]),
    kind: PARADOX.test(pk.name) ? 4 : sp.is_legendary ? 2 : sp.is_mythical ? 3 : 0
  };
}

(async () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, '..', 'pokemon-motoneta', 'data-pokemon.js'), 'utf8') + ';this.P = POKEMON_ENTRIES;', ctx);
  const P = ctx.P;
  // パルデア図鑑（元ネタ図鑑のデータ：番号・タイプ・ネタバレ段階）
  const rows = await pool(P, 8, async (e) => Object.assign(await monRow(e.no, (e.ty || []).map((t) => TYPE_EN[t]).join('/')), { dex: 'P', dn: e.p, sp: e.sp || 0, ja: e.ja }));
  const have = new Map(rows.map((r) => [r.species, r]));
  // 追加コンテンツの図鑑
  for (const d of DLC) {
    const dexj = await get(`https://pokeapi.co/api/v2/pokedex/${d.id}`);
    const add = await pool(dexj.pokemon_entries, 8, async (en) => {
      if (have.has(en.pokemon_species.name)) return null;
      const r = await monRow(en.pokemon_species.name);
      return Object.assign(r, { dex: d.dex, dn: en.entry_number, sp: r.kind ? d.spLeg : d.sp });
    });
    add.filter(Boolean).forEach((r) => { if (!have.has(r.species)) { have.set(r.species, r); rows.push(r); } });
  }
  // 進化：PokéAPI の進化の系統のうち、このデータにいるポケモンだけで段階を数える
  const chains = new Map();
  for (const r of rows) if (!chains.has(r.chain)) chains.set(r.chain, await get(r.chain));
  for (const [, c] of chains) {
    const nodes = [];
    const walk = (n, depth, top) => {
      const present = have.has(n.species.name);
      const d = present ? depth + 1 : depth;
      const t = top || (present ? n.species.name : null);
      if (present) nodes.push({ name: n.species.name, d, top: t });
      n.evolves_to.forEach((x) => walk(x, d, t));
    };
    walk(c.chain, 0, null);
    const maxD = {};
    nodes.forEach((x) => { maxD[x.top] = Math.max(maxD[x.top] || 0, x.d); });
    nodes.forEach((x) => { const r = have.get(x.name); r.stage = x.d; r.stages = maxD[x.top]; r.root = have.get(x.top).ja; });
  }
  const abilityIds = new Set();
  rows.forEach((r) => r.ab.forEach(([id]) => abilityIds.add(id)));
  const abil = await pool([...abilityIds], 8, async (id) => {
    const a = await get(`https://pokeapi.co/api/v2/ability/${id}`);
    return [id, jaName(a.names) || id];
  });
  const AB = Object.fromEntries(abil);
  const out = rows.map((r) => [r.dex, r.dn, r.no, r.ja, r.en, r.ty, r.bs, r.ab.map(([id, h]) => (h ? '*' : '') + AB[id]), r.stage || 1, r.stages || 1, r.kind, r.sp, r.root || r.ja]);
  const txt = `/*
 * ポケモンSV育成クイズ ― ポケモンの種族値
 * パルデア図鑑 400 種・本編で手に入る図鑑外の2種・追加コンテンツ「ゼロの秘宝」のキタカミ図鑑とブルーベリー図鑑（パルデア図鑑と重なる分は除く）
 * PokéAPI の値をもとに tools/fetch-data.js で作ったものです（手で書き換えない）。
 *
 * [図鑑(P パルデア / K キタカミ / B ブルーベリー), 図鑑番号, 全国図鑑番号, 日本語名, 英語名, タイプ, 種族値[HP,攻撃,防御,特攻,特防,素早さ],
 *  とくせい（* は隠れ特性）, 進化の段階, 系統の段階数, 区分(0 ふつう / 2 伝説 / 3 幻 / 4 パラドックス),
 *  ネタバレ段階(0 序盤〜3 クリア後は元ネタ図鑑と同じ。4 碧の仮面 / 5 碧の仮面の終盤 / 6 藍の円盤 / 7 藍の円盤の終盤・番外編), 進化の系統のいちばん最初のポケモン]
 */
var POKEMON_STATS = [
${out.map((r) => '  ' + JSON.stringify(r)).join(',\n')}
];
`;
  fs.writeFileSync(path.join(ROOT, 'data-stats.js'), txt);
  console.log('wrote', out.length, 'pokemon,', abil.length, 'abilities');
})();
