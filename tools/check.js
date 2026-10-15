#!/usr/bin/env node
'use strict';
/*
 * データの整合性チェック
 *   node tools/check.js
 * ・POPULAR_ABILITIES のポケモンが本当にそのとくせいを持っているか
 * ・知識問題の選択肢が重複していないか、必須項目があるか
 * ・アプリが名前で参照するポケモン・技がデータにあるか
 * ・タイプ相性表に 18 タイプがそろっているか
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
['data-stats.js', 'data-moves.js', 'data-rules.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx));
vm.runInContext('this.D = { POKEMON_STATS, MOVES, TYPES, TYPE_CHART, POPULAR_ABILITIES, KNOWLEDGE, DEF_ABILITIES, ATK_ABILITIES, NATURES, DMG_FACTORS, TYPE_MEMO, TRAINING, BATTLE_MOVES, SWAP_MOVES };', ctx);
const D = ctx.D;
let bad = 0;
const ng = (msg) => { bad++; console.log('NG', msg); };
const mon = Object.fromEntries(D.POKEMON_STATS.map((r) => [r[3], r]));
const abOf = (n) => mon[n][7].map((a) => a.replace('*', ''));

D.POPULAR_ABILITIES.forEach(([n, a]) => {
  if (!mon[n]) return ng(`POPULAR_ABILITIES: ${n} がいない`);
  if (!abOf(n).includes(a)) ng(`POPULAR_ABILITIES: ${n} は ${a} を持たない（${abOf(n).join('・')}）`);
});
Object.keys(D.DEF_ABILITIES).concat(Object.keys(D.ATK_ABILITIES)).forEach((a) => {
  if (!D.POKEMON_STATS.some((r) => r[7].some((x) => x.replace('*', '') === a))) ng(`とくせい ${a} を持つポケモンがいない`);
});
// app.js が名前で使うポケモン
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const named = ['ニャオハ', 'ニャローテ', 'マスカーニャ', 'ホゲータ', 'アチゲータ', 'ラウドボーン', 'クワッス', 'ウェルカモ', 'ウェーニバル', 'イーブイ', 'シャワーズ', 'サンダース', 'ブースター', 'エーフィ', 'ブラッキー', 'リーフィア', 'グレイシア', 'ニンフィア', 'カラミンゴ', 'オノノクス', 'デカヌチャン', 'モルフォン', 'エクスレッグ', 'オーロンゲ', 'ヤミラミ', 'クレッフィ', 'タギングル'];
named.forEach((n) => { if (!mon[n]) ng(`ポケモン ${n} がいない`); });
[['ニンフィア', 'フェアリースキン'], ['カラミンゴ', 'きもったま'], ['オノノクス', 'かたやぶり'], ['デカヌチャン', 'かたやぶり'], ['モルフォン', 'いろめがね'], ['エクスレッグ', 'いろめがね'], ['オーロンゲ', 'いたずらごころ'], ['ヤミラミ', 'いたずらごころ'], ['クレッフィ', 'いたずらごころ'], ['タギングル', 'いたずらごころ']]
  .forEach(([n, a]) => { if (mon[n] && !abOf(n).includes(a)) ng(`${n} は ${a} を持たない`); });
const moves = new Set(D.MOVES.map((m) => m[0]));
['ハイパーボイス', 'はかいこうせん', 'スピードスター', 'すてみタックル', 'じしん', '10まんばりき', 'じだんだ', 'フリーズドライ', 'フライングプレス', 'テラバースト', 'ウェザーボール', 'レイジングブル', 'でんじは', 'おにび', 'どくどく', 'やどりぎのタネ', 'キノコのほうし', 'ねむりごな']
  .forEach((m) => { if (!moves.has(m)) ng(`技 ${m} がない`); });
D.TRAINING.forEach((t) => {
  if (!mon[t.mon]) return ng(`TRAINING: ${t.mon} がいない`);
  const a = t.ab.replace(/（.*/, '');
  if (!t.ab.includes('めん') && !abOf(t.mon).includes(a)) ng(`TRAINING: ${t.mon} は ${a} を持たない`);
  t.moves.forEach(([m]) => { if (!moves.has(m)) ng(`TRAINING: 技 ${m} がない`); });
});
D.BATTLE_MOVES.concat(D.SWAP_MOVES).forEach(([n]) => n.split('／').forEach((m) => { if (!moves.has(m)) ng(`技 ${m} がない（説明の一覧）`); }));
if (D.TYPES.length !== 18 || D.TYPES.some((t) => !D.TYPE_CHART[t])) ng('タイプ相性表が18タイプそろっていない');
Object.keys(D.TYPE_MEMO).forEach((k) => {
  const [a, d] = k.split('>');
  const v = D.TYPE_CHART[a][d];
  if (v == null) ng(`TYPE_MEMO ${k} は相性が1倍（メモ不要）`);
});
D.KNOWLEDGE.forEach((k) => {
  if (!k.c || !k.l || !k.q || !k.ex || !k.tag || !Array.isArray(k.a) || k.a.length < 4) ng(`知識問題の項目不足: ${k.q}`);
  if (new Set(k.a).size !== k.a.length) ng(`知識問題の選択肢が重複: ${k.q}`);
});
if (D.NATURES.length !== 25) ng('せいかくが25種でない');
console.log(bad ? `\n${bad} 件の問題があります` : 'OK: ' + D.POKEMON_STATS.length + ' 匹, ' + D.MOVES.length + ' 技, ' + D.KNOWLEDGE.length + ' 問の知識問題');
process.exit(bad ? 1 : 0);
