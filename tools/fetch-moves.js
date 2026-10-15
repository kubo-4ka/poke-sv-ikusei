#!/usr/bin/env node
'use strict';
/*
 * PokéAPI から SV で覚えられる技を集めて data-moves.js を作るスクリプト（開発用）
 *   node tools/fetch-data.js のあとに node tools/fetch-moves.js
 * tools/.cache/ にあるポケモンの JSON から「SV で覚える技」を数え、技ごとの JSON を取得します。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');
const TYPE_JA = { normal: 'ノーマル', fire: 'ほのお', water: 'みず', electric: 'でんき', grass: 'くさ', ice: 'こおり', fighting: 'かくとう', poison: 'どく', ground: 'じめん', flying: 'ひこう', psychic: 'エスパー', bug: 'むし', rock: 'いわ', ghost: 'ゴースト', dragon: 'ドラゴン', dark: 'あく', steel: 'はがね', fairy: 'フェアリー' };
const CAT = { physical: '物理', special: '特殊', status: '変化' };
// 技の範囲（ダブルバトルの説明に使う）
const TARGET = {
  'selected-pokemon': '1体', 'all-opponents': '相手全体', 'all-other-pokemon': '自分以外全員', 'ally': '味方', 'user': '自分',
  'user-or-ally': '自分か味方', 'user-and-allies': '自分と味方', 'users-field': '味方の場', 'opponents-field': '相手の場',
  'entire-field': '全体の場', 'random-opponent': 'ランダムな相手', 'all-allies': '味方全体', 'all-pokemon': '全員', 'specific-move': '特殊', 'selected-pokemon-me-first': '1体', 'fainting-pokemon': '自分'
};

async function get(url) {
  const f = path.join(CACHE, url.replace(/^https:\/\/pokeapi\.co\/api\/v2\//, '').replace(/[\/?=&]/g, '_') + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(r.status + ' ' + url); const j = await r.json(); fs.writeFileSync(f, JSON.stringify(j)); return j; }
    catch (e) { if (i === 3) throw e; await new Promise((ok) => setTimeout(ok, 1000 * (i + 1))); }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

(async () => {
  const learners = {};
  for (const f of fs.readdirSync(CACHE)) {
    if (!f.startsWith('pokemon_')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));
    if (!j.moves) continue;
    for (const mv of j.moves) if (mv.version_group_details.some((v) => v.version_group.name === 'scarlet-violet')) (learners[mv.move.name] = learners[mv.move.name] || new Set()).add(j.species.name);
  }
  const ids = Object.keys(learners).sort();
  const rows = await pool(ids, 8, async (id) => {
    const m = await get(`https://pokeapi.co/api/v2/move/${id}`);
    const ja = (m.names.find((n) => n.language.name === 'ja-Hrkt') || m.names.find((n) => n.language.name === 'ja') || {}).name;
    const en = (m.names.find((n) => n.language.name === 'en') || {}).name || id;
    return [ja.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)), en, TYPE_JA[m.type.name], CAT[m.damage_class.name], m.power || 0, learners[id].size, TARGET[m.target.name] || '他', m.priority, m.accuracy];
  });
  rows.sort((a, b) => b[5] - a[5]);
  const txt = `/*
 * ポケモンSV育成クイズ ― 技（SV で覚えられる技）
 * PokéAPI の値をもとに tools/fetch-moves.js で作ったものです（手で書き換えない）。
 * [日本語名, 英語名, タイプ, 分類, 威力（0 = なし・変動）, 覚えるポケモンの種類数, 範囲, 優先度, 命中（null = 必中）]
 * 覚えるポケモンが多い順（＝よく見る技の順）に並んでいます。
 */
var MOVES = [
${rows.map((r) => '  ' + JSON.stringify(r)).join(',\n')}
];
`;
  fs.writeFileSync(path.join(ROOT, 'data-moves.js'), txt);
  console.log('wrote', rows.length, 'moves');
})();
