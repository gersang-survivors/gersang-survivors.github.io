// 將巨商數值轉換成 Survivors 戰鬥數值（遊戲化改編）
import GS from './gsdata.js';
export { GS };

export const RUN_SECONDS = 10 * 60;
export const MID_BOSS_AT = 5 * 60;
export const SLOTS = ['W', 'A', 'H', 'G', 'B', 'S', 'R', 'P'];
export const SLOT_NAME = { W: '武器', A: '盔甲', H: '頭盔', G: '手套', B: '腰帶', S: '鞋子', R: '戒指', P: '飾物' };
export const HEROES = ['guC00', 'guC01'];
// 主角轉職要求等級（原作冇列明，遊戲化設定）
const HERO_JOB_LV = { guC02: 30, guC03: 30, guB10: 100, guB11: 100 };

export const M = id => GS.mercs[id];
export const mercName = id => (GS.mercs[id] || GS.foreign[id] || { zh: id }).zh;
export const itemName = id => (GS.items[id] || { zh: id }).zh;

// ---------- exp ----------
const EXP = GS.exp; // [lv, cumulative]
export const MAX_LV = EXP.length;
export function levelFromExp(exp) {
  let lv = 1;
  for (const [l, need] of EXP) { if (exp >= need) lv = l; else break; }
  return lv;
}
export function expProgress(exp) {
  const lv = levelFromExp(exp), cur = EXP[lv - 1]?.[1] ?? 0, next = EXP[lv]?.[1] ?? cur + 1;
  return { lv, cur: exp - cur, need: next - cur };
}

// ---------- attack style ----------
export function styleOf(id) {
  const m = M(id); if (!m) return 'melee';
  if (id === 'guU00') return 'porter';
  if (m.hero) return { guC00: 'coin', guC01: 'coin', guC02: 'arrow', guC03: 'coin', guB10: 'arrow', guB11: 'bullet' }[id];
  const n = m.zh;
  if (/車/.test(n)) return /雷/.test(n) ? 'needle' : 'arrow';
  if (/朱蒙/.test(n)) return 'arrow';
  if (/崔茂宣/.test(n)) return 'bullet';
  switch (m.wt) {
    case '弓箭': return 'arrow';
    case '針': return 'needle';
    case '劍': case '鐵刀': case '手環': return 'melee';
    case '長槍': return 'sweep';
    case '木魚': case '扇': return 'orb';
  }
  if (m.int > Math.max(m.str, m.dex)) return 'orb';
  return 'melee';
}
const BASE_CD = { arrow: 1.0, needle: 1.1, melee: 0.8, sweep: 1.1, orb: 1.4, bullet: 1.7, coin: 0.8, porter: 99 };
export const STYLE_NAME = { arrow: '遠程・弓', needle: '遠程・針', melee: '近戰', sweep: '近戰・橫掃', orb: '法術・範圍', bullet: '遠程・砲', coin: '遠程・銅錢', porter: '挑夫・拾取 +30% 銀兩 +20%' };

function primaryStat(m, style) {
  if (style === 'orb') return m.int;
  if (style === 'melee' || style === 'sweep') return m.str;
  return m.dex;
}
export function equipBonus(equip) {
  const b = { atk: 0, s: 0, d: 0, i: 0, v: 0, ac: 0 };
  for (const slot of SLOTS) {
    const it = equip && equip[slot] && GS.items[equip[slot]]; if (!it || !it.eq) continue;
    const e = it.eq;
    if (e.mn != null) b.atk += ((e.mn || 0) + (e.mx || 0)) / 2;
    b.s += e.s || 0; b.d += e.d || 0; b.i += e.i || 0; b.v += e.v || 0; b.ac += e.ac || 0;
  }
  return b;
}
// unit = {id, lv, equip}
export function combatStats(unit) {
  const m = M(unit.id), style = styleOf(unit.id), eb = equipBonus(unit.equip);
  const stat = primaryStat(m, style) + (style === 'orb' ? eb.i : style === 'melee' || style === 'sweep' ? eb.s : eb.d);
  const atk = (m.atk[0] + m.atk[1]) / 2 + eb.atk;
  const dmg = 4 * Math.pow(atk, 0.85) * (1 + unit.lv * 0.06) * (1 + stat / 150);
  const cd = BASE_CD[style] / (1 + (m.dex + eb.d) / 400);
  const hp = Math.round(m.hp + unit.lv * 8 + (m.str + eb.v) * 1.5 + eb.v * 2);
  return { style, dmg, cd, hp, ac: m.ac + eb.ac, range: { arrow: 300, needle: 240, orb: 240, bullet: 340, coin: 280 }[style] || 0 };
}

// ---------- skills: parse description into an effect ----------
export function skillEffect(sk) {
  const d = (sk.d || '') + sk.n;
  if (/恢復|淨化|治療/.test(d)) return 'heal';
  if (/暫停|捕縛|陷阱|設伏|八門|降低移動/.test(d)) return 'bind';
  if (/召喚|分身/.test(d)) return 'summon';
  if (/直線|前方/.test(d)) return 'line';
  if (/閃電|雷/.test(d)) return 'lightning';
  if (/火|砲彈|震天/.test(d)) return 'fire';
  if (/連射|自動發射/.test(d)) return 'volley';
  if (/提升|增加|激勵|敏捷|信物/.test(d)) return 'buff';
  if (/無法|沉默|失明/.test(d)) return 'bind';
  if (/熄火/.test(d)) return 'fire';
  return 'blast';
}
export const SKILL_CD = { heal: 6, bind: 7, summon: 9, line: 5, lightning: 5, fire: 6, volley: 4, buff: 12, blast: 5 };

// ---------- job change & fusion ----------
export function jobTargets(id) {
  return (M(id)?.to || []).filter(t => t.k === '轉職' && GS.mercs[t.id]).map(t => {
    const lv = t.lv || HERO_JOB_LV[t.id] || 100;
    const from = (GS.mercs[t.id].from || []).find(f => f.id === id) || { items: [] };
    return { to: t.id, lv, items: scaleItems(from.items), cost: lv * 400 };
  });
}
function scaleItems(items) { return (items || []).map(([i, q]) => [i, Math.max(1, Math.ceil(q / 5))]); }
export const FUSION_RECIPES = Object.entries(GS.mercs)
  .filter(([, m]) => m.from.some(f => f.k === '合成' || f.k === '傳說'))
  .map(([out, m]) => {
    const parts = m.from.filter(f => f.k === '合成' || f.k === '傳說');
    return { out, kind: parts[0].k, mercs: parts.map(f => f.id), items: scaleItems(parts.flatMap(f => f.items || [])),
      locked: parts.some(f => !GS.mercs[f.id]) };
  });
export function itemPrice(id) { const it = GS.items[id]; return Math.max(200, Math.round((it?.p || 4000) / 20)); }
export function sellPrice(id) { const it = GS.items[id]; return Math.max(1, Math.round((it?.p || 100) / 50)); }

export function canEquip(unit, itemId) {
  const it = GS.items[itemId]; if (!it || !it.eq) return false;
  const m = M(unit.id);
  if ((it.eq.lv || 0) > unit.lv) return false;
  if (it.eq.g !== 'W') return true;
  if (it.only) return (GS.groups[it.only] || []).includes(unit.id.slice(2)) || (it.only.startsWith('C_Main') && m.hero);
  return !!m.wt && it.eq.wt === m.wt;
}

// ---------- hiring ----------
export const HIRABLE = Object.entries(GS.mercs).filter(([id, m]) => m.hire && !m.hero && !m.from.length && m.cost > 0 && /^guU/.test(id)).map(([id]) => id);
export const hireCost = id => Math.round(M(id).cost / 20);
export const partySize = heroLv => Math.min(8, 2 + Math.floor(heroLv / 8));
// monster mercs that can be tamed when their monster appears
export const TAMEABLE = Object.fromEntries(Object.entries(GS.mercs).filter(([id, m]) => /^guM/.test(id) && m.cost > 0).map(([id, m]) => [m.zh, id]));

// ---------- enemies ----------
export function enemyStats(mon, isBoss, zone) {
  let hp = 3 * Math.pow(mon.hp, 0.75);
  if (isBoss) {
    const regMed = zone.reg.map(x => 3 * Math.pow(x.hp, 0.75)).sort((a, b) => a - b)[Math.floor(zone.reg.length / 2)];
    hp = Math.max(regMed * 40, Math.min(hp, regMed * 120));
  }
  return { hp, dmg: 4 + 2 * Math.pow(mon.atk, 0.6) * (isBoss ? 1.5 : 1), speed: isBoss ? 55 : 50 + (mon.hp % 7) * 6, r: isBoss ? 30 : 12 + Math.min(6, Math.log10(mon.hp + 1) * 1.5) };
}

// ---------------- 行商：城市、商路、價錢 ----------------
// 城市位置：用現實經緯度（原作資料冇座標）。商路同野外配對：按野外喺現實嘅位置安排，屬遊戲設定。
export const CITIES = {
  漢陽: { lat: 37.57, lon: 126.98, big: true }, 開城: { lat: 37.97, lon: 126.55 }, 平壤: { lat: 39.03, lon: 125.75, big: true },
  新義州: { lat: 40.10, lon: 124.40 }, 咸興: { lat: 39.92, lon: 127.54 }, 水原: { lat: 37.26, lon: 127.03 }, 春川: { lat: 37.88, lon: 127.73 },
  江陵: { lat: 37.75, lon: 128.88 }, 清州: { lat: 36.64, lon: 127.49 }, 全州: { lat: 35.82, lon: 127.15, big: true }, 光州: { lat: 35.16, lon: 126.85 },
  木浦: { lat: 34.81, lon: 126.39 }, 大邱: { lat: 35.87, lon: 128.60 }, 慶州: { lat: 35.86, lon: 129.22 }, 釜山: { lat: 35.18, lon: 129.08, big: true },
  西歸浦: { lat: 33.25, lon: 126.56 },
};
const Z = n => GS.zones.findIndex(z => z.zh === n);
export const ROUTES = [
  ['漢陽', '水原', '朝鮮地圖'], ['漢陽', '開城', '朝鮮地圖'], ['水原', '清州', '朝鮮地圖'],
  ['漢陽', '春川', '大觀嶺'], ['春川', '江陵', '大觀嶺'],
  ['開城', '平壤', '黑色商團野營地'], ['清州', '全州', '武寧王陵'], ['全州', '光州', '月奇峰'],
  ['清州', '大邱', '高手洞窟'], ['大邱', '慶州', '桂林庭園'], ['江陵', '慶州', '桂林庭園'], ['慶州', '釜山', '巨濟海底洞窟'], ['大邱', '釜山', '巨濟海底洞窟'],
  ['平壤', '咸興', '介馬莊園'], ['平壤', '新義州', '黑色商團營地'], ['光州', '木浦', '千年湖'], ['木浦', '西歸浦', '漢拏山'],
].map(([a, b, z], i) => ({ i, a, b, zone: Z(z) })).filter(r => r.zone >= 0);
export const routesFrom = city => ROUTES.filter(r => r.a === city || r.b === city);
export const otherEnd = (r, city) => (r.a === city ? r.b : r.a);
// hop distance between cities (BFS)
function hops(from, to) {
  const seen = new Map([[from, 0]]), q = [from];
  while (q.length) { const c = q.shift(); if (c === to) return seen.get(c); for (const r of routesFrom(c)) { const n = otherEnd(r, c); if (!seen.has(n)) { seen.set(n, seen.get(c) + 1); q.push(n); } } }
  return 6;
}
export const GOODS = {};
for (const [city, list] of Object.entries(GS.towns)) for (const g of list) (GOODS[g.id] ||= { ...g, cities: [] }).cities.push(city);
// 買入價 = 原作價錢；賣出價：本地有賣嘅打八折，冇賣嘅按離產地遠近加價，每日浮動
export function buyPrice(id) { return GOODS[id].p; }
export function sellPrice2(id, city, day) {
  const g = GOODS[id]; if (!g) return 0;
  if (g.cities.includes(city)) return Math.round(g.p * 0.8);
  const d = Math.min(...g.cities.map(c => hops(c, city)));
  let h = 0; for (const ch of id + city + day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const swing = 0.85 + (h % 31) / 100;
  return Math.round(g.p * (1.15 + 0.12 * d) * swing);
}
export function carryCap(recs) { return recs.reduce((s, r) => s + (M(r.id)?.lift || 0), 0); }
export function cargoWeight(cargo) { return Object.entries(cargo || {}).reduce((s, [id, c]) => s + (GOODS[id]?.w || 1) * c.n, 0); }
