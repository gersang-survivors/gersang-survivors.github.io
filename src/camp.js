// 營地：傭兵永久養成（練級、裝備、轉職、合成、訓練所、市場、倉庫）
import { CITIES, ROUTES, routesFrom, otherEnd, GOODS, buyPrice, sellPrice2, carryCap, cargoWeight } from './rules.js';
import { GS, M, mercName, itemName, HEROES, SLOTS, SLOT_NAME, combatStats, styleOf, STYLE_NAME, skillEffect, jobTargets, FUSION_RECIPES, itemPrice, sellPrice, canEquip, HIRABLE, hireCost, partySize, levelFromExp, expProgress, MAX_LV } from './rules.js';
import { portrait } from './render.js';
import { setOverlay, overlay, startRun, fmtTime, enterTownView } from './main.js';
import { NPCS } from './town.js';

const SAVE_KEY = 'gersang-survivors-save-v2';
const EXP = GS.exp;
const expAt = lv => EXP[Math.max(0, lv - 1)][1];

export let save = migrate(load());
function migrate(s) { if (s) { s.city ||= '漢陽'; s.visited ||= ['漢陽']; s.cargo ||= {}; s.day ||= 1; } return s; }
function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; } }
export function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }
export const hasSave = () => !!save;

function refreshLv(r) { r.lv = Math.min(MAX_LV, levelFromExp(r.exp)); return r; }
function newRec(id, lv) { const r = { uid: save.nextUid++, id, exp: expAt(Math.max(1, lv)), equip: {} }; refreshLv(r); save.roster.push(r); return r; }
const heroRec = () => save.roster.find(r => r.uid === 0);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => Math.round(n).toLocaleString();

// ---------------- new game ----------------
export function openNewGame() {
  setOverlay(`<div class="panel title"><h1>巨商 Survivors</h1><p class="sub">GERSANG SURVIVORS</p>
    <p class="story">十六世紀末嘅朝鮮。商路上山賊橫行、妖獸出沒。<br>揀一位主角，招募傭兵、轉職合成，由小商人行到「巨商」。</p>
    <div class="cards">${HEROES.map(id => `<button class="card hero" data-id="${id}"><img class="pt" data-pid="${id}" src="${portrait(id, M(id))}"><div class="ct">${mercName(id)}</div><div class="cd">${M(id).sex === 'F' || /明花/.test(mercName(id)) ? '轉職路線：大商人 → 砲手' : '轉職路線：獵人 → 神弓'}</div></button>`).join('')}</div>
    <p class="muted">WASD / 方向鍵移動 ・ 手機拖動畫面 ・ P 暫停<br>資料來源：巨商全能百科（非官方同人作品）</p></div>`);
  overlay.querySelectorAll('.card').forEach(b => b.onclick = () => {
    save = migrate({ v: 2, nextUid: 1, roster: [], party: [], silver: 500, items: {}, cleared: 0, runs: 0 });
    save.roster.push(refreshLv({ uid: 0, id: b.dataset.id, exp: 0, equip: {} }));
    const archer = newRec('guU02', M('guU02').lv); save.party.push(archer.uid);
    persist(); enterTownView();
  });
}

// ---------------- run result ----------------
export function applyRunResult(g, win) {
  const levelUps = [];
  const gain = (rec, exp) => { const from = rec.lv; rec.exp += exp; refreshLv(rec); if (rec.lv > from) levelUps.push({ name: mercName(rec.id), from, to: rec.lv }); };
  gain(heroRec(), g.exp);
  for (const uid of save.party) { const r = save.roster.find(x => x.uid === uid); if (r) gain(r, g.fielded.includes(uid) ? g.exp : g.exp * 0.5); }
  let silver = g.silver;
  if (win) silver += Math.round(100 * Math.pow(2, g.zoneIdx));
  save.silver += silver;
  // 貨物：贏咗按完好度送到目的地；輸咗退返出發地，再損失一半
  const keep = win ? g.cargoHp : g.cargoHp * 0.5, lost = [];
  for (const [id, c] of Object.entries(save.cargo)) { const n = Math.floor(c.n * keep); if (n < c.n) lost.push(`${GOODS[id]?.zh || id} ×${c.n - n}`); if (n > 0) c.n = n; else delete save.cargo[id]; }
  let arrived = null;
  if (win && g.dest) { save.city = g.dest; if (!save.visited.includes(g.dest)) save.visited.push(g.dest); arrived = g.dest; }
  save.day++;
  for (const [i, n] of Object.entries(g.loot)) save.items[i] = (save.items[i] || 0) + n;
  for (const id of g.tamed) newRec(id, M(id).lv || 1);
  save.runs++; persist();
  return { silver, levelUps, unlocked: arrived ? `抵達 ${arrived}` : null, lost };
}

// ---------------- camp ----------------
let tab = 'go', selUid = 0;
export function openCamp(t) {
  if (t) tab = t;
  const h = heroRec();
  const npc = NPCS.find(n => n.key === tab) || NPCS[0];
  setOverlay(`<div class="panel camp"><div class="camphead"><img class="pt sm" data-pid="${h.id}" src="${portrait(h.id, M(h.id))}"><div><b>${mercName(h.id)}</b> Lv ${h.lv}</div><div class="gold">銀兩 ${money(save.silver)}</div><button class="btn small close" id="leaveNpc">離開</button></div>
    <div class="npcline"><b>${npc.name}</b>：「${npc.line}」</div>
    <div class="tabbody">${({ go: tabGo, mercs: tabMercs, fuse: tabFuse, hire: tabHire, market: tabMarket, store: tabStore })[tab]()}</div></div>`);
  document.getElementById('leaveNpc').onclick = () => setOverlay('');
  bind();
}
function bind() {
  overlay.querySelectorAll('[data-act]').forEach(el => el.onclick = e => { e.stopPropagation(); ACT[el.dataset.act](el.dataset); });
}
const ACT = {
  route: d => { const r = ROUTES[+d.r]; startRun(r.zone, otherEnd(r, save.city)); },
  gbuy: d => { const n = +d.n, cost = buyPrice(d.item) * n; if (save.silver < cost) return; const cap = carryCap(partyRecs()) - cargoWeight(save.cargo); if (GOODS[d.item].w * n > cap) return;
    save.silver -= cost; const c = save.cargo[d.item] ||= { n: 0, cost: 0 }; c.cost = (c.cost * c.n + cost) / (c.n + n); c.n += n; persist(); openCamp(); },
  gsell: d => { const c = save.cargo[d.item]; if (!c) return; const n = d.all ? c.n : 1; save.silver += sellPrice2(d.item, save.city, save.day) * n; c.n -= n; if (c.n <= 0) delete save.cargo[d.item]; persist(); openCamp(); },
  party: d => {
    const uid = +d.uid, i = save.party.indexOf(uid);
    if (i >= 0) save.party.splice(i, 1);
    else if (save.party.length < partySize(heroRec().lv)) save.party.push(uid);
    persist(); openCamp();
  },
  sel: d => { selUid = +d.uid; tab = 'mercs'; openCamp(); },
  equip: d => { const r = save.roster.find(x => x.uid === +d.uid); const old = r.equip[d.slot]; if (old) save.items[old] = (save.items[old] || 0) + 1;
    if (d.item) { r.equip[d.slot] = d.item; if (--save.items[d.item] <= 0) delete save.items[d.item]; } else delete r.equip[d.slot]; persist(); openCamp(); },
  skill: d => { const r = save.roster.find(x => x.uid === +d.uid); r.skillOff = r.skillOff || []; const i = r.skillOff.indexOf(d.sk); if (i >= 0) r.skillOff.splice(i, 1); else r.skillOff.push(d.sk); persist(); openCamp(); },
  slot: d => { slotPick = slotPick === d.slot ? null : d.slot; openCamp(); },
  job: d => {
    const r = save.roster.find(x => x.uid === +d.uid), j = jobTargets(r.id).find(x => x.to === d.to);
    if (!j || r.lv < j.lv || save.silver < j.cost || !hasItems(j.items)) return;
    if (!confirm(`將 ${mercName(r.id)} 轉職為 ${mercName(j.to)}？`)) return;
    save.silver -= j.cost; takeItems(j.items); r.id = j.to; persist(); openCamp();
  },
  fuse: d => {
    const rc = FUSION_RECIPES[+d.i], picks = fusionPicks(rc); if (!picks || !hasItems(rc.items)) return;
    if (!confirm(`用 ${rc.mercs.map(mercName).join(' + ')} ${rc.kind}成 ${mercName(rc.out)}？材料傭兵會消失（裝備會退返倉庫）。`)) return;
    const minExp = Math.min(...picks.map(p => p.exp));
    for (const p of picks) { for (const it of Object.values(p.equip)) save.items[it] = (save.items[it] || 0) + 1; save.roster.splice(save.roster.indexOf(p), 1); save.party = save.party.filter(u => u !== p.uid); }
    takeItems(rc.items);
    const r = newRec(rc.out, 1); r.exp = minExp; refreshLv(r); selUid = r.uid; tab = 'mercs'; persist(); openCamp();
  },
  hire: d => { const c = hireCost(d.id); if (save.silver < c) return; save.silver -= c; const r = newRec(d.id, M(d.id).lv || 1); if (save.party.length < partySize(heroRec().lv)) save.party.push(r.uid); persist(); openCamp(); },
  dismiss: d => { const r = save.roster.find(x => x.uid === +d.uid); if (!r || r.uid === 0 || !confirm(`解僱 ${mercName(r.id)}？`)) return;
    for (const it of Object.values(r.equip)) save.items[it] = (save.items[it] || 0) + 1;
    save.roster.splice(save.roster.indexOf(r), 1); save.party = save.party.filter(u => u !== r.uid); selUid = 0; persist(); openCamp(); },
  buy: d => { const c = itemPrice(d.item) * (+d.n || 1); if (save.silver < c) return; save.silver -= c; save.items[d.item] = (save.items[d.item] || 0) + (+d.n || 1); persist(); openCamp(); },
  sell: d => { const n = save.items[d.item] || 0; if (!n) return; const k = d.all ? n : 1; save.silver += sellPrice(d.item) * k; save.items[d.item] = n - k; if (!save.items[d.item]) delete save.items[d.item]; persist(); openCamp(); },
  reset: () => { if (confirm('刪除存檔重新開始？')) { localStorage.removeItem(SAVE_KEY); save = null; openNewGame(); } },
};
let slotPick = null;
const partyRecs = () => [heroRec(), ...save.party.map(u => save.roster.find(r => r.uid === u)).filter(Boolean)];
const hasItems = items => items.every(([i, q]) => (save.items[i] || 0) >= q);
const takeItems = items => { for (const [i, q] of items) { save.items[i] -= q; if (save.items[i] <= 0) delete save.items[i]; } };
function fusionPicks(rc) {
  if (rc.locked) return null;
  const used = new Set(), picks = [];
  for (const id of rc.mercs) { const r = save.roster.filter(x => x.id === id && x.uid !== 0 && !used.has(x.uid)).sort((a, b) => b.exp - a.exp)[0]; if (!r) return null; used.add(r.uid); picks.push(r); }
  return picks;
}
function itemReq(items) { return items.map(([i, q]) => `<span class="chip ${(save.items[i] || 0) >= q ? 'ok' : 'no'}">${esc(itemName(i))} ${save.items[i] || 0}/${q}</span>`).join(''); }

function unitCard(r, extra = '') {
  const st = combatStats(r), m = M(r.id);
  return `<div class="unit ${m.legend ? 'legend' : ''}" data-act="sel" data-uid="${r.uid}"><img class="pt" data-pid="${r.id}" src="${portrait(r.id, m)}"><div class="un">${esc(mercName(r.id))}</div><div class="ul">Lv ${r.lv}</div><div class="us">${STYLE_NAME[st.style].split('・')[0]}${st.style !== 'porter' ? ` ${Math.round(st.dmg)}` : ''}</div>${extra}</div>`;
}

// 朝鮮地圖（經緯度投影；輪廓係簡化示意）
const COAST = [[124.3,40],[125,40.5],[126.5,41.5],[128,41.8],[129.5,42.4],[130.6,42.5],[129.8,41],[129.4,40.7],[128.6,40],[127.6,39.4],[127.6,39],[128.4,38.6],[128.6,38],[129.4,37],[129.5,36],[129.4,35.5],[129.1,35.1],[128.5,34.9],[127.6,34.7],[126.5,34.4],[126.3,34.8],[126.4,35.6],[126.7,36],[126.2,36.8],[126.7,37.2],[126.5,37.7],[125.7,37.7],[125.1,38],[124.8,38.5],[125.3,39.3],[124.7,39.7]];
const PX = lon => (lon - 123.8) * 62, PY = lat => (42.8 - lat) * 74;
function koreaMap() {
  const cur = save.city, adj = new Set(routesFrom(cur).map(r => r.i));
  const lines = ROUTES.map(r => { const A = CITIES[r.a], B = CITIES[r.b], on = adj.has(r.i);
    return `<line x1="${PX(A.lon)}" y1="${PY(A.lat)}" x2="${PX(B.lon)}" y2="${PY(B.lat)}" stroke="${on ? '#ffd84a' : '#8a7a58'}" stroke-width="${on ? 3 : 1.5}" stroke-dasharray="${on ? '' : '4 4'}"/>`; }).join('');
  const dots = Object.entries(CITIES).map(([n, c]) => { const v = save.visited.includes(n), here = n === cur;
    return `<circle cx="${PX(c.lon)}" cy="${PY(c.lat)}" r="${here ? 7 : c.big ? 5 : 4}" fill="${here ? '#ff6040' : v ? '#ffd84a' : '#c8bca0'}" stroke="#1a120a" stroke-width="1.5"/><text x="${PX(c.lon) + 8}" y="${PY(c.lat) + 4}" font-size="12" fill="${here ? '#ff9070' : '#f2ead8'}" font-weight="${here ? 700 : 400}">${n}</text>`; }).join('');
  return `<svg class="kmap" viewBox="0 0 450 700"><polygon points="${COAST.map(([lo, la]) => `${PX(lo)},${PY(la)}`).join(' ')}" fill="#4a6a3a" stroke="#2a3a20" stroke-width="2"/><ellipse cx="${PX(126.55)}" cy="${PY(33.38)}" rx="26" ry="12" fill="#4a6a3a" stroke="#2a3a20" stroke-width="2"/>${lines}${dots}</svg>`;
}
function tabGo() {
  const h = heroRec(), size = partySize(h.lv), cur = save.city;
  const routes = routesFrom(cur).map(r => { const z = GS.zones[r.zone], to = otherEnd(r, cur);
    return `<button class="zone" data-act="route" data-r="${r.i}"><div class="ct">${esc(cur)} → ${esc(to)}</div><div class="cs">經 ${esc(z.zh)}</div><div class="cd">${esc(z.reg.map(m => m.zh).join('、'))}</div><div class="cs">首領：${esc(z.boss.map(m => m.zh).join('、'))}</div></button>`; }).join('');
  const roster = save.roster.filter(r => r.uid !== 0).map(r => {
    const on = save.party.includes(r.uid);
    return `<div class="pick ${on ? 'on' : ''}" data-act="party" data-uid="${r.uid}"><img class="pt sm" data-pid="${r.id}" src="${portrait(r.id, M(r.id))}"><span>${esc(mercName(r.id))}</span><span class="muted">Lv ${r.lv}</span></div>`;
  }).join('') || '<p class="muted">未有傭兵，去訓練所招募。</p>';
  const cap = carryCap(partyRecs()), wt = cargoWeight(save.cargo);
  const cargo = Object.entries(save.cargo).map(([id, c]) => `${esc(GOODS[id]?.zh || id)} ×${c.n}`).join('、') || '（冇）';
  return `<div class="gogrid"><div>${koreaMap()}<p class="muted small">城市位置按現實地理；商路經邊個野外係遊戲安排。</p></div><div>
    <h3>由 ${esc(cur)} 出發</h3><div class="zones one">${routes}</div>
    <h3>貨物（${wt}/${cap}）</h3><p>${cargo}</p><p class="muted small">載重 = 主角同出戰名單傭兵嘅載重相加（挑夫特別多）。戰鬥中主角每次受傷，貨物都會損壞；輸咗退返出發地，再損失一半貨物。</p>
    <h3>出戰名單（${save.party.length}/${size}）</h3><p class="muted small">開局只帶第一位，其餘要喺戰鬥升級時招募上場。</p><div class="picks">${roster}</div></div></div>`;
}

function tabMercs() {
  const sel = save.roster.find(r => r.uid === selUid) || heroRec(); selUid = sel.uid;
  const list = save.roster.map(r => unitCard(r)).join('');
  const m = M(sel.id), st = combatStats(sel), pr = expProgress(sel.exp);
  const off = sel.skillOff || [];
  const skills = (m.sk || []).map(s => `<div class="sk"><button class="chip ${off.includes(s.id) ? 'no' : 'ok'}" data-act="skill" data-uid="${sel.uid}" data-sk="${s.id}">${off.includes(s.id) ? '關' : '自動施放'}</button> <b>${esc(s.n)}</b> <span class="muted">${esc(s.d || '')}</span></div>`).join('') || '<p class="muted">冇技能</p>';
  const slots = SLOTS.map(s => { const it = sel.equip[s]; return `<button class="slot ${slotPick === s ? 'on' : ''}" data-act="slot" data-slot="${s}"><span class="muted">${SLOT_NAME[s]}</span><br>${it ? esc(itemName(it)) : '—'}</button>`; }).join('');
  let pickList = '';
  if (slotPick) {
    const cands = Object.keys(save.items).filter(i => GS.items[i]?.eq?.g === slotPick && canEquip(sel, i));
    pickList = `<div class="picklist">${sel.equip[slotPick] ? `<button class="chip" data-act="equip" data-uid="${sel.uid}" data-slot="${slotPick}" data-item="">卸下</button>` : ''}
      ${cands.map(i => { const e = GS.items[i].eq; return `<button class="chip ok" data-act="equip" data-uid="${sel.uid}" data-slot="${slotPick}" data-item="${i}">${esc(itemName(i))} <span class="muted">Lv${e.lv || 1}${e.mn != null ? ` 攻${e.mn}-${e.mx}` : ''}${e.ac ? ` 防${e.ac}` : ''}</span></button>`; }).join('') || '<span class="muted">倉庫冇合用嘅裝備（睇等級同兵器類型：' + esc(m.wt || '無') + '）</span>'}</div>`;
  }
  const jobs = jobTargets(sel.id).map(j => {
    const ok = sel.lv >= j.lv && save.silver >= j.cost && hasItems(j.items);
    return `<div class="job"><img class="pt sm" data-pid="${j.to}" src="${portrait(j.to, M(j.to))}"><div><b>${esc(mercName(j.to))}</b> <span class="muted">需要 Lv ${j.lv} ・ ${money(j.cost)} 兩</span><div>${itemReq(j.items)}</div></div><button class="btn small" data-act="job" data-uid="${sel.uid}" data-to="${j.to}" ${ok ? '' : 'disabled'}>轉職</button></div>`;
  }).join('');
  const usedIn = FUSION_RECIPES.filter(rc => rc.mercs.includes(sel.id)).map(rc => `<span class="chip">${rc.kind}→${esc(mercName(rc.out))}</span>`).join('');
  return `<div class="mercgrid">${list}</div>
    <div class="detail"><div class="dhead"><img class="pt" data-pid="${sel.id}" src="${portrait(sel.id, m)}"><div><h3>${esc(mercName(sel.id))} <span class="muted">${esc(m.ko || '')}</span></h3>
      <div>Lv ${sel.lv} <span class="muted">（${money(pr.cur)}/${money(pr.need)}）</span></div><div class="bar"><i style="width:${Math.min(100, pr.cur / pr.need * 100)}%"></i></div>
      <div class="muted">${STYLE_NAME[st.style]}${m.wt ? ` ・ 兵器：${esc(m.wt)}` : ''}${m.el ? ` ・ ${esc(m.el)}屬性` : ''}</div></div></div>
      <p class="muted">${esc(m.desc)}</p>
      <div class="stats"><span>力 ${m.str}</span><span>敏 ${m.dex}</span><span>智 ${m.int}</span><span>傷害 ${Math.round(st.dmg)}</span><span>攻速 ${st.cd.toFixed(2)}s</span>${sel.uid === 0 ? `<span>血 ${st.hp}</span><span>防 ${st.ac}</span>` : ''}</div>
      <h4>技能</h4>${skills}
      <h4>裝備</h4><div class="slots">${slots}</div>${pickList}
      ${jobs ? `<h4>轉職</h4>${jobs}` : ''}
      ${usedIn ? `<h4>可作合成材料</h4>${usedIn}` : ''}
      ${sel.uid !== 0 ? `<p><button class="btn small" data-act="dismiss" data-uid="${sel.uid}">解僱</button></p>` : ''}</div>`;
}

function tabFuse() {
  return `<p class="muted">巨商原版合成配方（材料數量已按比例縮減）。標住「未開放」嘅需要其他國傭兵，之後版本加入。</p>` + FUSION_RECIPES.map((rc, i) => {
    const picks = fusionPicks(rc), ok = picks && hasItems(rc.items);
    return `<div class="recipe ${rc.locked ? 'locked' : ''}"><img class="pt" data-pid="${rc.out}" src="${portrait(rc.out, M(rc.out))}"><div><b>${esc(mercName(rc.out))}</b> <span class="chip">${rc.kind}</span>${M(rc.out).legend ? '<span class="chip gold">傳說</span>' : ''}
      <div>${rc.mercs.map(id => { const own = save.roster.some(r => r.id === id && r.uid !== 0); return `<span class="chip ${GS.mercs[id] ? (own ? 'ok' : 'no') : 'lock'}">${esc(mercName(id))}${GS.mercs[id] ? '' : '（未開放）'}</span>`; }).join(' + ')}</div>
      <div>${itemReq(rc.items)}</div></div><button class="btn small" data-act="fuse" data-i="${i}" ${ok ? '' : 'disabled'}>${rc.kind}</button></div>`;
  }).join('');
}

function tabHire() {
  const lv = heroRec().lv;
  return `<p class="muted">朝鮮訓練所。主角等級要夠先招募到（需要等級 = 傭兵等級一半）。招募後傭兵由佢嘅原始等級開始。</p><div class="mercgrid">` + HIRABLE.map(id => {
    const m = M(id), need = Math.ceil((m.lv || 1) / 2), c = hireCost(id), ok = lv >= need && save.silver >= c;
    const st = combatStats({ id, lv: m.lv || 1, equip: {} });
    return `<div class="unit"><img class="pt" data-pid="${id}" src="${portrait(id, m)}"><div class="un">${esc(m.zh)}</div><div class="ul">Lv ${m.lv}</div><div class="us">${STYLE_NAME[st.style].split('・')[0]}</div><div class="muted small">${esc(m.desc).slice(0, 40)}</div>
      <button class="btn small" data-act="hire" data-id="${id}" ${ok ? '' : 'disabled'}>${lv < need ? `主角 Lv ${need}` : `${money(c)} 兩`}</button></div>`;
  }).join('') + `</div><p class="muted">怪物傭兵（石爺爺、白虎、九尾狐…）要喺地圖打怪時「收服」。</p>`;
}

function tabMarket() {
  const lv = heroRec().lv;
  const equipShop = Object.entries(GS.items).filter(([, it]) => it.shop && it.eq && (it.eq.lv || 0) <= lv + 10).sort((a, b) => (a[1].eq.lv || 0) - (b[1].eq.lv || 0));
  const mats = [...new Set([...FUSION_RECIPES.filter(r => !r.locked).flatMap(r => r.items.map(x => x[0])), ...Object.values(GS.mercs).flatMap(m => m.from.flatMap(f => (f.items || []).map(x => x[0])))])].filter(i => GS.items[i]);
  const row = (i, it) => `<div class="mrow"><span>${esc(it.zh)}</span><span class="muted">${it.eq ? `${SLOT_NAME[it.eq.g] || ''} Lv${it.eq.lv || 1}${it.eq.mn != null ? ` 攻${it.eq.mn}-${it.eq.mx}` : ''}${it.eq.ac ? ` 防${it.eq.ac}` : ''}${it.eq.wt ? ` ${esc(it.eq.wt)}` : ''}` : esc(it.cat)}</span><span class="muted">有 ${save.items[i] || 0}</span><button class="chip ok" data-act="buy" data-item="${i}" ${save.silver < itemPrice(i) ? 'disabled' : ''}>${money(itemPrice(i))} 兩</button></div>`;
  const city = save.city, cap = carryCap(partyRecs()), wt = cargoWeight(save.cargo);
  const local = (GS.towns[city] || []).map(g => { const can = Math.max(0, Math.min(Math.floor(save.silver / g.p), Math.floor((cap - wt) / g.w)));
    return `<div class="mrow"><span>${esc(g.zh)}</span><span class="muted">${esc(g.cat || '')} ・ 重 ${g.w}</span><span class="gold">${money(g.p)} 兩</span><span><button class="chip ok" data-act="gbuy" data-item="${g.id}" data-n="1" ${can < 1 ? 'disabled' : ''}>買 1</button><button class="chip ok" data-act="gbuy" data-item="${g.id}" data-n="${Math.max(1, can)}" ${can < 1 ? 'disabled' : ''}>買 ${can}</button></span></div>`; }).join('');
  const mine = Object.entries(save.cargo).map(([id, c]) => { const sp = sellPrice2(id, city, save.day), diff = sp - c.cost;
    return `<div class="mrow"><span>${esc(GOODS[id]?.zh || id)} ×${c.n}</span><span class="muted">買入 ${money(c.cost)}</span><span class="${diff >= 0 ? 'gold' : 'bad'}">賣 ${money(sp)}（${diff >= 0 ? '+' : ''}${money(diff)}）</span><span><button class="chip" data-act="gsell" data-item="${id}">賣 1</button><button class="chip" data-act="gsell" data-item="${id}" data-all="1">全賣</button></span></div>`; }).join('');
  return `<h3>${esc(city)} 特產</h3><p class="muted small">原作城市特產同價錢。喺有賣嘅城市平啲，運去冇賣、越遠嘅城市越貴，價錢每日浮動。載重 ${wt}/${cap}</p><div class="mlist">${local}</div>
    <h3>你嘅貨物</h3><div class="mlist">${mine || '<p class="muted">未有貨物</p>'}</div>
    <h3>村莊武器店</h3><div class="mlist">${equipShop.map(([i, it]) => row(i, it)).join('') || '<p class="muted">冇貨</p>'}</div>
    <h3>轉職・合成材料</h3><div class="mlist">${mats.map(i => row(i, GS.items[i])).join('')}</div>`;
}

function tabStore() {
  const rows = Object.entries(save.items).filter(([, n]) => n > 0).map(([i, n]) => { const it = GS.items[i] || { zh: i, cat: '' };
    return `<div class="mrow"><span>${esc(it.zh)}</span><span class="muted">${esc(it.cat || '')}${it.eq ? ` Lv${it.eq.lv || 1}` : ''}</span><span>×${n}</span><span><button class="chip" data-act="sell" data-item="${i}">賣 ${sellPrice(i)}</button> <button class="chip" data-act="sell" data-item="${i}" data-all="1">全賣</button></span></div>`; }).join('');
  return `<div class="mlist">${rows || '<p class="muted">倉庫空空如也。打怪會掉落道具。</p>'}</div><p class="muted">已出戰 ${save.runs} 次 ・ 已平定 ${save.cleared}/${GS.zones.length} 張地圖</p><button class="btn small" data-act="reset">刪除存檔</button>`;
}
