import { GS, M, mercName, itemName, RUN_SECONDS, MID_BOSS_AT, combatStats, styleOf, skillEffect, SKILL_CD, enemyStats, TAMEABLE, levelFromExp, partySize, STYLE_NAME } from './rules.js';
import { drawGround, zoneTheme, mercSprite, monsterSprite, peddlerSprite, loadLocalPack, SCALE, detectLocalArt, localFrame, dirIndex, LOCAL } from './render.js';
import { save, persist, openCamp, applyRunResult, hasSave, openNewGame } from './camp.js';
import { town, enterTown, updateTown, drawTown, npcAt } from './town.js';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
export const overlay = document.getElementById('overlay');
let W = 0, H = 0;
function resize() { W = cv.width = innerWidth; H = cv.height = innerHeight; ctx.imageSmoothingEnabled = false; }
addEventListener('resize', resize); resize();

export function setOverlay(html) { overlay.innerHTML = html; overlay.style.display = html ? 'flex' : 'none'; overlay.scrollTop = 0; }

// ---------------- input ----------------
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if (game && (e.key === 'Escape' || e.key.toLowerCase() === 'p')) togglePause();
  if (game && game.mode === 'levelup' && ['1', '2', '3'].includes(e.key)) pickChoice(+e.key - 1);
  if (!game && town.on && town.near && overlay.style.display !== 'flex' && ['e', 'enter', ' '].includes(e.key.toLowerCase())) openCamp(town.near.key);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
const stick = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
cv.addEventListener('touchstart', e => { const t = e.changedTouches[0]; Object.assign(stick, { active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 }); e.preventDefault(); }, { passive: false });
cv.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) if (t.identifier === stick.id) {
    let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy; const l = Math.hypot(dx, dy), m = 50;
    if (l > m) { dx = dx / l * m; dy = dy / l * m; } stick.dx = dx / m; stick.dy = dy / m;
  }
  e.preventDefault();
}, { passive: false });
const endTouch = e => { for (const t of e.changedTouches) if (t.identifier === stick.id) { stick.active = false; stick.dx = stick.dy = 0; } };
cv.addEventListener('touchend', endTouch); cv.addEventListener('touchcancel', endTouch);

// ---------------- helpers ----------------
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function pickWeighted(list) { const tot = list.reduce((s, [, w]) => s + w, 0); let r = Math.random() * tot; for (const [v, w] of list) if ((r -= w) <= 0) return v; return list[0][0]; }
function nearestEnemy(x, y, maxR, exclude) {
  let best = null, bd = maxR * maxR;
  for (const e of game.enemies) { if (e.dead || (exclude && exclude.has(e))) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}
export const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------- run state ----------------
export let game = null;

function makeUnit(rec, isHero) {
  const st = combatStats(rec), m = M(rec.id);
  return { rec, id: rec.id, m, isHero, st, x: rand(-30, 30), y: rand(-30, 30), cd: rand(0, 0.6), face: 1, anim: rand(0, 1), atkFx: 0,
    atkUp: 0, spdUp: 0, skillLv: 0, dash: 0,
    skills: (m.sk || []).filter(s => !(rec.skillOff || []).includes(s.id)).map(s => ({ ...s, fx: skillEffect(s), cd: rand(2, SKILL_CD[skillEffect(s)]) })) };
}

// ---------------- 巨商原作系統：陣型・精靈・合擊技（數值由 wiki data 轉換） ----------------
const FORMS = GS.forms, SPIRITS = GS.spirits, COMBOS = GS.combos;
// 陣型效果 → 遊戲數值（原作數值好細，按比例放大，係遊戲化改編）
function formMods(f, lv) {
  const m = {};
  for (const [k, v] of f.lv[lv - 1]) {
    if (k === '生命力') m.hp = (m.hp || 0) + v / 100;
    else if (k === '打擊抵抗' || k === '法術抵抗') m.taken = (m.taken || 0) + v * 0.03;
    else if (k === '攻擊力') m.dmg = (m.dmg || 0) + v / 400;
    else if (k === '智力') m.magic = (m.magic || 0) + v / 200;
    else if (k === '攻擊速度') m.spd = (m.spd || 0) + v / 100;
    else if (k === '技能射程') m.range = (m.range || 0) + v * 0.1;
    else if (k === '移動速度') m.move = (m.move || 0) + v / 100;
    else if (k === '視野') m.magnet = (m.magnet || 0) + v * 0.1;
  }
  return m;
}
// 精靈效果：直接讀原作效果文字
function spiritMods(sp) {
  const t = sp.sk, m = {}, n = re => { const x = t.match(re); return x ? +x[1] : 0; };
  m.spd = n(/我[軍方]的?攻擊速度增加(\d+)%/) / 100;
  m.move = n(/我[軍方]的?(?:攻擊速度增加\d+%、)?移動速度增加(\d+)%/) / 100;
  m.dmg = (n(/攻擊力(?:增加)?\s*(\d+)/) / 2000) + n(/傷害增加(\d+)%/) / 100;
  m.slow = n(/敵人的攻擊速度減少\d+%、移動速度減少(\d+)%/) / 100;
  m.taken = n(/打擊抵抗(?:提升|增加)(\d+)/) / 200 + n(/魔法抵抗(?:力)?(?:提升|增加)(\d+)/) / 300;
  m.crit = n(/爆擊率增加(\d+)%/) / 100;
  m.regen = n(/體力恢復(\d+)/) / 50000;
  return m;
}
function computeMods() {
  const g = game, m = { dmg: 1, magic: 1, spd: 1, range: 1, move: 1, magnet: 1, taken: 1, slow: 0, crit: 0, regen: 0 };
  const add = x => { m.dmg += x.dmg || 0; m.magic += x.magic || 0; m.spd += x.spd || 0; m.range += x.range || 0; m.move += x.move || 0; m.magnet += x.magnet || 0; m.taken -= x.taken || 0; m.slow += x.slow || 0; m.crit += x.crit || 0; m.regen += x.regen || 0; };
  if (g.form) add(formMods(FORMS[g.form.i], g.form.lv));
  if (g.spirit != null) add(spiritMods(SPIRITS[g.spirit]));
  m.taken = Math.max(0.3, m.taken); m.dmg *= 1 + g.bonusDmg;
  return m;
}
function activeCombos() {
  const ids = new Set(game.mercs.map(u => u.id));
  return COMBOS.filter(c => c.sets.some(set => set.every(i => ids.has(i))));
}
const STYLE_GROUP = { arrow: 'bow', bullet: 'bow', melee: 'melee', sweep: 'melee', orb: 'magic', needle: 'magic' };

export function enterTownView() {
  setOverlay(''); town.heroId = save.roster.find(r => r.uid === 0).id;
  enterTown(save.party.map(uid => save.roster.find(r => r.uid === uid)?.id).filter(Boolean));
  townUI();
}
const tui = document.getElementById('townui');
function townUI() {
  tui.innerHTML = `<button id="tuTalk">對話</button><button id="tuMercs">傭兵</button><button id="tuGo">出征</button>`;
  document.getElementById('tuTalk').onclick = () => town.near && openCamp(town.near.key);
  document.getElementById('tuMercs').onclick = () => openCamp('mercs');
  document.getElementById('tuGo').onclick = () => openCamp('go');
}
cv.addEventListener('click', e => {
  if (game || !town.on) return;
  const n = npcAt(e.clientX + town.x - W / 2, e.clientY + town.y - H / 2);
  if (n && town.near === n) openCamp(n.key);
});

export function startRun(zoneIdx) {
  town.on = false;
  const zone = GS.zones[zoneIdx];
  const heroRec = save.roster.find(r => r.uid === 0);
  const hero = makeUnit(heroRec, true);
  const deck = save.party.map(uid => save.roster.find(r => r.uid === uid)).filter(Boolean);
  const first = deck.find(r => styleOf(r.id) !== 'porter') || deck[0];
  const party = first ? [makeUnit(first, false)] : [];
  game = {
    mode: 'play', zoneIdx, zone, theme: zoneTheme(zone.zh), t: 0, level: 1, xp: 0, xpNext: 5, pendingLevels: 0, kills: 0,
    silver: 0, exp: 0, loot: {}, tamed: [], porter: 0, deck: deck.filter(r => r !== first), fielded: first ? [first.uid] : [],
    form: null, spirit: null, comboT: {}, chests: [], nextElite: 60, regenT: 0, mods: null,
    player: { x: 0, y: 0, hp: hero.st.hp, maxHp: hero.st.hp, speed: 150, inv: 0, face: 1, moving: false, anim: 0 },
    hero, mercs: party, temps: [], enemies: [], projs: [], gems: [], coins: [], fx: [], texts: [], fields: [],
    passives: {}, rerolls: 1 + Math.floor(levelFromExp(heroRec.exp) / 30), choices: [], spawnAcc: 0, boss: null, midDone: false, finalDone: false,
    peddler: null, nextPeddler: 150, buffT: 0, bonusDmg: 0, won: false, lootMsgT: 0,
  };
  hero.x = hero.y = 0;
  setOverlay('');
  banner(`${zone.zh}`);
}

function unitDmg(u) {
  const md = game.mods || computeMods();
  let m = (1 + 0.2 * u.atkUp) * md.dmg * (game.buffT > 0 ? 1.25 : 1);
  if (STYLE_GROUP[u.st.style] === 'magic') m *= md.magic;
  if (md.crit && Math.random() < md.crit) m *= 2;
  return u.st.dmg * m;
}
const unitCd = u => u.st.cd / (1 + 0.15 * u.spdUp) / (game.mods ? game.mods.spd : 1);
const unitRange = (u, r) => r * (game.mods ? game.mods.range : 1);

// ---------------- combat ----------------
function hitEnemy(e, dmg, kx = 0, ky = 0, kb = 0) {
  if (e.dead) return;
  e.hp -= dmg; e.flash = 0.08;
  if (kb) { const l = Math.hypot(kx, ky) || 1, f = e.boss ? 0.1 : 1; e.x += kx / l * kb * f; e.y += ky / l * kb * f; }
  if (game.texts.length < 70) game.texts.push({ x: e.x + rand(-6, 6), y: e.y - e.r - 8, v: Math.round(dmg), life: 0.6, big: dmg >= 200 });
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; game.kills++;
  const mon = e.mon, g = game;
  g.exp += mon.exp;
  g.gems.push({ x: e.x, y: e.y, v: e.boss ? 40 : Math.max(1, Math.round(Math.sqrt(mon.exp) / 2)), big: e.boss || mon.exp > 50 });
  const coin = Math.round((4 + Math.sqrt(mon.hp) / 1.5) * (1 + 0.2 * g.porter));
  if (e.boss) for (let i = 0; i < 16; i++) g.coins.push({ x: e.x + rand(-40, 40), y: e.y + rand(-40, 40), v: coin * 4 });
  else if (Math.random() < 0.35) g.coins.push({ x: e.x, y: e.y, v: coin });
  for (const [it, p] of mon.drops) if (GS.items[it] && Math.random() < Math.min(0.25, p * (e.boss ? 20 : 1.5))) {
    g.loot[it] = (g.loot[it] || 0) + 1;
    if (g.lootMsgT <= 0) { g.texts.push({ x: e.x, y: e.y - 30, v: `獲得 ${itemName(it)}`, life: 1.2, loot: true }); g.lootMsgT = 0.4; }
  }
  const tame = TAMEABLE[mon.zh];
  if (tame && !e.boss && !g.tamed.includes(tame) && Math.random() < 0.003) { g.tamed.push(tame); banner(`收服咗 ${mon.zh}！`); }
  g.fx.push({ kind: 'puff', x: e.x, y: e.y, life: 0.3, max: 0.3 });
  if (e.elite || (e.boss && !e.final)) g.chests.push({ x: e.x, y: e.y });
  if (e.boss) { if (g.boss === e) g.boss = g.enemies.find(x => x.boss && !x.dead) || null; if (e.final) { g.won = true; endRun(true); } }
}
function spawnEnemy(mon, isBoss, final) {
  const p = game.player, a = rand(0, Math.PI * 2), R = Math.hypot(W, H) / 2 + 40;
  const s = enemyStats(mon, isBoss, game.zone), scale = isBoss ? (final ? 1 : 0.6) : 1 + game.t / 60 * 0.08;
  const e = { mon, boss: isBoss, final, x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R, hp: s.hp * scale, maxHp: s.hp * scale, dmg: s.dmg, speed: s.speed, r: s.r, flash: 0, slow: 0, anim: rand(0, 1), face: 1, dead: false };
  game.enemies.push(e); return e;
}
function healPlayer(v) {
  const p = game.player; if (p.hp >= p.maxHp) return;
  p.hp = Math.min(p.maxHp, p.hp + v); game.texts.push({ x: p.x, y: p.y - 44, v: '+' + Math.round(v), life: 0.8, heal: true });
}

function basicAttack(u, t) {
  const dmg = unitDmg(u), dx = t.x - u.x, dy = t.y - u.y, l = Math.hypot(dx, dy) || 1;
  u.face = dx < 0 ? -1 : 1; u.atkFx = 0.15;
  const P = (o) => game.projs.push(Object.assign({ x: u.x, y: u.y - 12, dmg, pierce: 1, hit: new Set() }, o));
  switch (u.st.style) {
    case 'arrow': P({ vx: dx / l * 540, vy: dy / l * 540, life: 0.8, kind: 'arrow', pierce: 1 + Math.floor(u.rec.lv / 40) }); break;
    case 'needle': for (const a of [-0.15, 0, 0.15]) { const c = Math.cos(a), s = Math.sin(a); P({ vx: (dx * c - dy * s) / l * 480, vy: (dx * s + dy * c) / l * 480, life: 0.6, kind: 'needle', dmg: dmg * 0.45 }); } break;
    case 'orb': P({ vx: dx / l * 320, vy: dy / l * 320, life: 1.1, kind: 'orb', splash: 55 }); break;
    case 'bullet': P({ vx: dx / l * 800, vy: dy / l * 800, life: 0.6, kind: 'bullet', dmg: dmg * 1.6, pierce: 2 }); game.fx.push({ kind: 'flash', x: u.x + dx / l * 14, y: u.y - 12 + dy / l * 14, life: 0.08, max: 0.08 }); break;
    case 'coin': {
      const hit = new Set([t]); const n = 1 + Math.floor((game.passives.coin || 0) / 2);
      for (let i = 0; i < n; i++) { const tt = i === 0 ? t : nearestEnemy(u.x, u.y, 280, hit); if (!tt) break; hit.add(tt); const ddx = tt.x - u.x, ddy = tt.y - u.y, ll = Math.hypot(ddx, ddy) || 1; P({ vx: ddx / ll * 460, vy: ddy / ll * 460, life: 0.8, kind: 'coin' }); }
      break;
    }
  }
}

function castSkill(u, sk) {
  const g = game, base = unitDmg(u) * (1 + 0.4 * u.skillLv), p = g.player;
  const t = nearestEnemy(u.x, u.y, 380);
  if (!t && !['heal', 'buff'].includes(sk.fx)) return false;
  g.texts.push({ x: u.x, y: u.y - 50, v: sk.n.replace(/\(.*\)/, ''), life: 1.0, skill: true });
  switch (sk.fx) {
    case 'heal': healPlayer(p.maxHp * 0.15 * (1 + 0.3 * u.skillLv)); g.fx.push({ kind: 'healfx', x: p.x, y: p.y, life: 0.5, max: 0.5 }); break;
    case 'buff': g.buffT = 6 + u.skillLv * 2; g.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 120, life: 0.5, max: 0.5, col: '#ffd84a' }); break;
    case 'bind': g.fields.push({ x: t.x, y: t.y, r: 95, life: 3.5, dps: base * 0.6, tick: 0, col: 'bind' }); break;
    case 'summon': {
      const clone = makeUnit(u.rec, false); clone.x = u.x; clone.y = u.y; clone.life = 8 + 2 * u.skillLv; clone.atkUp = u.atkUp; clone.skills = []; clone.ghost = true;
      if (clone.st.style === 'porter') break; g.temps.push(clone); break;
    }
    case 'line': {
      const dx = t.x - u.x, dy = t.y - u.y, l = Math.hypot(dx, dy) || 1;
      g.projs.push({ x: u.x, y: u.y - 12, vx: dx / l * 700, vy: dy / l * 700, life: 0.9, kind: 'beam', dmg: base * 4, pierce: 99, hit: new Set() }); break;
    }
    case 'lightning': {
      const hit = new Set();
      for (let i = 0; i < 4 + u.skillLv; i++) { const e = nearestEnemy(t.x + rand(-120, 120), t.y + rand(-120, 120), 200, hit); if (!e) break; hit.add(e);
        g.fx.push({ kind: 'strike', x: e.x, y: e.y, life: 0.25, max: 0.25 }); for (const o of g.enemies) if (!o.dead && dist2(o, e) < 50 * 50) hitEnemy(o, base * 2.5); }
      break;
    }
    case 'fire': g.fx.push({ kind: 'fire', x: t.x, y: t.y, r: 110, life: 0.5, max: 0.5 }); for (const e of g.enemies) if (!e.dead && dist2(e, t) < 110 * 110) hitEnemy(e, base * 3.5); break;
    case 'volley': { const dx = t.x - u.x, dy = t.y - u.y, b = Math.atan2(dy, dx);
      for (let i = -3; i <= 3; i++) { const a = b + i * 0.12; g.projs.push({ x: u.x, y: u.y - 12, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, life: 0.8, kind: 'arrow', dmg: base * 1.3, pierce: 2, hit: new Set() }); }
      break; }
    default: g.fx.push({ kind: 'ring', x: t.x, y: t.y, r: 75, life: 0.3, max: 0.3, col: '#ffb060' }); for (const e of g.enemies) if (!e.dead && dist2(e, t) < 75 * 75) hitEnemy(e, base * 3);
  }
  return true;
}

function updateUnit(u, i, n, dt) {
  const p = game.player;
  u.cd -= dt; u.atkFx = Math.max(0, u.atkFx - dt);
  for (const sk of u.skills) { sk.cd -= dt; if (sk.cd <= 0) { if (castSkill(u, sk)) sk.cd = SKILL_CD[sk.fx] * Math.max(0.4, 1 - 0.1 * u.skillLv); else sk.cd = 1; } }
  if (u.isHero) { u.x = p.x; u.y = p.y; u.face = p.face; u.anim = p.anim;
    if (u.cd <= 0) { const t = nearestEnemy(p.x, p.y, unitRange(u, u.st.range || 280)); if (t) { u.cd = unitCd(u); basicAttack(u, t); } } return; }
  const ang = (i / Math.max(1, n)) * Math.PI * 2 + game.t * 0.2;
  const spread = 1;
  let tx = p.x + Math.cos(ang) * 64 * spread, ty = p.y + Math.sin(ang) * 48 * spread, spd = Math.max(220, p.speed * 1.4);
  const style = u.st.style;
  if (style === 'melee' || style === 'sweep') {
    const t = nearestEnemy(p.x, p.y, 190);
    if (t) {
      const near = nearestEnemy(u.x, u.y, 260) || t; tx = near.x; ty = near.y; spd = 250;
      const reach = (style === 'sweep' ? 50 : 30) + near.r;
      if (dist2(u, near) < reach * reach) {
        tx = u.x; ty = u.y;
        if (u.cd <= 0) {
          u.cd = unitCd(u); u.atkFx = 0.15; u.face = near.x < u.x ? -1 : 1;
          if (style === 'sweep') { game.fx.push({ kind: 'ring', x: u.x, y: u.y, r: 58, life: 0.2, max: 0.2 }); for (const e of game.enemies) if (!e.dead && dist2(e, u) < (58 + e.r) ** 2) hitEnemy(e, unitDmg(u) * 0.8, e.x - u.x, e.y - u.y, 16); }
          else { game.fx.push({ kind: 'slash', x: near.x, y: near.y, life: 0.12, max: 0.12, f: u.face }); hitEnemy(near, unitDmg(u), near.x - u.x, near.y - u.y, 5); }
        }
      }
    }
  } else if (style !== 'porter' && u.cd <= 0) {
    const t = nearestEnemy(u.x, u.y, unitRange(u, u.st.range || 260)); if (t) { u.cd = unitCd(u); basicAttack(u, t); }
  }
  const dx = tx - u.x, dy = ty - u.y, l = Math.hypot(dx, dy);
  u.moving = l > 4;
  if (l > 4) { const s = Math.min(l, spd * dt * (l > 320 ? 3 : 1)); u.x += dx / l * s; u.y += dy / l * s; u.anim += dt * 2; u.dir = dirIndex(dx, dy); if (Math.abs(dx) > 2) u.face = dx < 0 ? -1 : 1; }
}

function separate() {
  const cell = 32, grid = new Map(), E = game.enemies;
  for (const e of E) { const k = ((e.x / cell) | 0) * 100003 + ((e.y / cell) | 0); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(e); }
  for (const e of E) {
    const cx = (e.x / cell) | 0, cy = (e.y / cell) | 0;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const b = grid.get((cx + ox) * 100003 + cy + oy); if (!b) continue;
      for (const o of b) { if (o === e) continue; const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy), m = (e.r + o.r) * 0.8;
        if (d > 0 && d < m) { const w = o.boss ? 1 : e.boss ? 0 : 0.5, push = (m - d) * 0.5 * w; e.x += dx / d * push; e.y += dy / d * push; } }
    }
  }
}

export function update(dt) {
  const g = game, p = g.player;
  g.t += dt; g.buffT = Math.max(0, g.buffT - dt); g.lootMsgT -= dt;
  let mx = 0, my = 0;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (stick.active) { mx = stick.dx; my = stick.dy; }
  const ml = Math.hypot(mx, my); p.moving = ml > 0.1;
  if (p.moving) { p.dir = dirIndex(mx, my); const s = p.speed * (g.mods ? g.mods.move : 1) * Math.min(1, ml) / ml; p.x += mx * s * dt; p.y += my * s * dt; p.anim += dt * 2.5; if (Math.abs(mx) > 0.1) p.face = mx < 0 ? -1 : 1; }
  p.inv = Math.max(0, p.inv - dt);

  // spawns: weight monsters by run progress
  const prog = Math.min(1, g.t / RUN_SECONDS), reg = g.zone.reg;
  if (!g.finalDone) {
    g.spawnAcc += dt * (1.0 + g.t / 60 * 0.6);
    while (g.spawnAcc >= 1 && g.enemies.length < 300) {
      g.spawnAcc -= 1;
      const c = prog * (reg.length - 1);
      spawnEnemy(pickWeighted(reg.map((m, i) => [m, Math.exp(-((i - c) ** 2) / 2) + 0.05])), false, false);
    }
  }
  const bosses = g.zone.boss;
  if (!g.midDone && g.t >= MID_BOSS_AT) { g.midDone = true; g.boss = spawnEnemy(bosses[0], true, false); banner(`${bosses[0].zh} 出現！`); }
  if (!g.finalDone && g.t >= RUN_SECONDS) { g.finalDone = true; const fb = bosses[bosses.length - 1]; g.boss = spawnEnemy(fb, true, true); banner(`首領 ${fb.zh} 出現！`); }

  if (!g.peddler && g.t >= g.nextPeddler) { const a = rand(0, Math.PI * 2); g.peddler = { x: p.x + Math.cos(a) * 320, y: p.y + Math.sin(a) * 320, life: 40, anim: 0 }; g.nextPeddler += 150; banner('行商人嚟咗！'); }
  if (g.peddler) { g.peddler.life -= dt; g.peddler.anim += dt; if (g.peddler.life <= 0) g.peddler = null; else if (dist2(g.peddler, p) < 34 * 34) openPeddler(); }

  g.mods = computeMods();
  periodic(dt);
  updateUnit(g.hero, 0, 1, dt);
  const all = g.mercs.concat(g.temps);
  all.forEach((u, i) => updateUnit(u, i, all.length, dt));
  for (const t of g.temps) t.life -= dt;
  g.temps = g.temps.filter(t => t.life > 0);

  const ac = g.hero.st.ac;
  for (const e of g.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt); e.slow = Math.max(0, e.slow - dt);
    const dx = p.x - e.x, dy = p.y - e.y, l = Math.hypot(dx, dy) || 1;
    const s = e.speed * (e.slow > 0 ? 0.4 : 1) * (1 - g.mods.slow) * dt; e.x += dx / l * s; e.y += dy / l * s; e.anim += dt * 2; e.face = dx < 0 ? -1 : 1; e.dir = dirIndex(dx, dy);
    if (l < e.r + 12 && p.inv <= 0) {
      p.hp -= e.dmg * 100 / (100 + ac * 2) * g.mods.taken; p.inv = 0.45; g.fx.push({ kind: 'hurt', x: p.x, y: p.y, life: 0.2, max: 0.2 });
      if (p.hp <= 0) { endRun(false); return; }
    }
    if (l > 1400 && !e.boss) { const a = rand(0, Math.PI * 2), R = Math.hypot(W, H) / 2 + 40; e.x = p.x + Math.cos(a) * R; e.y = p.y + Math.sin(a) * R; }
  }
  separate();

  for (const f of g.fields) { f.life -= dt; f.tick -= dt; for (const e of g.enemies) if (!e.dead && dist2(e, f) < f.r * f.r) { e.slow = 0.2; if (f.tick <= 0) hitEnemy(e, f.dps * 0.5); } if (f.tick <= 0) f.tick = 0.5; }
  g.fields = g.fields.filter(f => f.life > 0);

  for (const pr of g.projs) {
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    for (const e of g.enemies) {
      if (e.dead || pr.hit.has(e)) continue;
      if (dist2(e, pr) < (e.r + (pr.kind === 'phoenix' ? 26 : pr.kind === 'beam' ? 14 : 6)) ** 2) {
        pr.hit.add(e);
        if (pr.splash) { g.fx.push({ kind: 'ring', x: pr.x, y: pr.y, r: pr.splash, life: 0.25, max: 0.25, col: '#b080ff' }); for (const o of g.enemies) if (!o.dead && dist2(o, pr) < pr.splash ** 2) hitEnemy(o, pr.dmg); }
        else hitEnemy(e, pr.dmg, pr.vx, pr.vy, pr.kind === 'bullet' ? 12 : 3);
        if (--pr.pierce <= 0) { pr.life = 0; break; }
      }
    }
  }
  g.projs = g.projs.filter(pr => pr.life > 0);
  g.enemies = g.enemies.filter(e => !e.dead);

  const magnet = 70 * (1 + 0.3 * g.porter) * g.mods.magnet;
  for (const list of [g.gems, g.coins]) for (const o of list) {
    const d2 = dist2(o, p);
    if (d2 < magnet * magnet || o.pull) { o.pull = true; const dx = p.x - o.x, dy = p.y - o.y, l = Math.hypot(dx, dy) || 1; o.x += dx / l * 520 * dt; o.y += dy / l * 520 * dt; }
    if (d2 < 16 * 16) { o.got = true; if (list === g.gems) gainXp(o.v); else g.silver += o.v; }
  }
  g.gems = g.gems.filter(o => !o.got); g.coins = g.coins.filter(o => !o.got);
  if (g.gems.length > 500) { const extra = g.gems.splice(0, g.gems.length - 400); g.gems.push({ x: extra[0].x, y: extra[0].y, v: extra.reduce((s, x) => s + x.v, 0), big: true }); }

  for (const f of g.fx) f.life -= dt; g.fx = g.fx.filter(f => f.life > 0);
  for (const t of g.texts) { t.life -= dt; t.y -= 30 * dt; } g.texts = g.texts.filter(t => t.life > 0);
  if (g.pendingLevels > 0 && g.mode === 'play') openLevelUp();
}
function periodic(dt) {
  const g = game, p = g.player;
  // elites every 75s
  if (!g.finalDone && g.t >= g.nextElite) {
    g.nextElite += 75;
    const reg = g.zone.reg, mon = reg[Math.min(reg.length - 1, Math.floor(Math.min(1, g.t / RUN_SECONDS) * reg.length))];
    const e = spawnEnemy(mon, false, false); e.elite = true; e.hp *= 12; e.maxHp *= 12; e.r *= 1.4; e.dmg *= 1.5;
    banner(`精英 ${mon.zh} 出現！打低有寶箱`);
  }
  for (const c of g.chests) if (!c.got && dist2(c, p) < 30 * 30) { c.got = true; openChest(); }
  g.chests = g.chests.filter(c => !c.got);
  if (g.mods.regen && (g.regenT -= dt) <= 0) { g.regenT = 2; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * g.mods.regen * 100); }
  // 合擊技（原作：指定兩隻傭兵同時上場先會發動）
  for (const c of activeCombos()) {
    g.comboT[c.n] = (g.comboT[c.n] ?? 3) - dt;
    if (g.comboT[c.n] > 0) continue;
    g.comboT[c.n] = c.cd;
    const t = nearestEnemy(p.x, p.y, 420); if (!t && c.n !== '堅固之盾') continue;
    banner(`合擊技：${c.n}`);
    if (c.n === '召喚不死鳥') {
      const dx = t.x - p.x, dy = t.y - p.y, l = Math.hypot(dx, dy) || 1, dmg = g.mercs.reduce((s, u) => s + unitDmg(u), 0) * 2;
      g.projs.push({ x: p.x, y: p.y - 20, vx: dx / l * 520, vy: dy / l * 520, life: 2, kind: 'phoenix', dmg, pierce: 999, hit: new Set() });
    } else if (c.n === '堅固之盾') { g.buffT = 8; }
  }
}
function recruit(rec) {
  const g = game, u = makeUnit(rec, false); u.x = g.player.x + rand(-40, 40); u.y = g.player.y + rand(-40, 40);
  g.mercs.push(u); g.deck = g.deck.filter(r => r !== rec); g.fielded.push(rec.uid);
  g.porter = g.mercs.filter(m => m.st.style === 'porter').length;
  g.fx.push({ kind: 'ring', x: u.x, y: u.y, r: 50, life: 0.6, max: 0.6, col: '#ffd84a' }); banner(`${mercName(rec.id)} 加入戰鬥！`);
}
function gainXp(v) { const g = game; g.xp += v; while (g.xp >= g.xpNext) { g.xp -= g.xpNext; g.level++; g.pendingLevels++; g.xpNext = Math.floor(5 + g.level * 3 + Math.pow(g.level, 1.35)); } }

// ---------------- in-run level-up ----------------
function recruitCard(rec) {
  const m = M(rec.id), st = combatStats(rec);
  return { t: 'recruit', rec, title: `招募 ${mercName(rec.id)}`, sub: `Lv ${rec.lv} ・ ${STYLE_NAME[st.style].split('・')[0]}`, desc: (m.sk || []).map(s => s.n.replace(/\(.*\)/, '')).join('・') || STYLE_NAME[st.style], tag: 'recruit', rec_id: rec.id };
}
function spiritCards(bonus) {
  const maxGr = Math.min(5, 1 + Math.floor(game.t / 150) + bonus);
  return SPIRITS.map((sp, i) => ({ sp, i })).filter(({ sp, i }) => sp.gr <= maxGr && i !== game.spirit && (game.spirit == null || sp.gr >= SPIRITS[game.spirit].gr))
    .map(({ sp, i }) => ({ t: 'spirit', i, title: `精靈：${sp.zh}`, sub: `${sp.el} ・ ${sp.gr} 階${game.spirit != null ? `（取代 ${SPIRITS[game.spirit].zh}）` : ''}`, desc: sp.sk, tag: 'fuse' }));
}
function formCards() {
  const g = game, out = [];
  if (g.form) { if (g.form.lv < 5) { const f = FORMS[g.form.i]; out.push({ t: 'form', i: g.form.i, lv: g.form.lv + 1, title: `${f.n} 強化`, sub: `陣型 Lv ${g.form.lv} → ${g.form.lv + 1}`, desc: f.lv[g.form.lv].map(([k, v]) => `${k} +${v}`).join('、'), tag: 'job' }); } }
  else FORMS.forEach((f, i) => out.push({ t: 'form', i, lv: 1, title: `佈陣：${f.n}`, sub: '陣型 Lv 1（只可以用一種）', desc: f.desc, tag: 'job' }));
  return out;
}
function rareChoices() {
  const g = game, c = [];
  for (const rec of g.deck) c.push([recruitCard(rec), 4]);
  for (const sc of spiritCards(1)) c.push([sc, 3]);
  for (const u of [g.hero, ...g.mercs]) if (u.skills.length && u.skillLv < 5) c.push([{ t: 'awaken', u, title: `${mercName(u.id)} 技能覺醒`, sub: u.skills.map(s => s.n.replace(/\(.*\)/, '')).join('・'), desc: '技能等級 +2', tag: 'job' }, 2]);
  return c;
}
function openChest() {
  const g = game; g.mode = 'levelup'; g.chest = true;
  const c = rareChoices(), out = []; let guard = 0;
  while (out.length < 3 && c.length && guard++ < 60) { const x = pickWeighted(c); if (!out.includes(x)) out.push(x); }
  if (!out.length) out.push({ t: 'silver', title: '銀兩 +300', sub: '', desc: '寶箱入面得銀兩' });
  g.choices = out; renderLevelUp();
}
function buildChoices() {
  const g = game, c = [];
  for (const rec of g.deck) c.push([recruitCard(rec), g.mercs.length < 3 ? 7 : 4]);
  for (const fc of formCards()) c.push([fc, g.form ? 3 : 1]);
  for (const sc of spiritCards(0)) c.push([sc, 0.4]);
  for (const u of [g.hero, ...g.mercs]) {
    if (u.st.style === 'porter') continue;
    const nm = mercName(u.id);
    if (u.atkUp < 5) c.push([{ t: 'atk', u, title: `${nm} 攻擊強化`, sub: `Lv ${u.atkUp} → ${u.atkUp + 1}`, desc: '攻擊力 +20%' }, 3]);
    if (u.spdUp < 3) c.push([{ t: 'spd', u, title: `${nm} 攻速強化`, sub: `Lv ${u.spdUp} → ${u.spdUp + 1}`, desc: '攻擊速度 +15%' }, 2]);
    if (u.skills.length && u.skillLv < 3) c.push([{ t: 'skill', u, title: `${u.skills.map(s => s.n.replace(/\(.*\)/, '')).join('・')}`, sub: `${nm} 技能 Lv ${u.skillLv + 1}`, desc: '技能傷害 +40%、冷卻 -10%', tag: 'job' }, 3]);
  }
  const out = []; let guard = 0;
  const rc = c.filter(([x]) => x.t === 'recruit');
  if (rc.length && Math.random() < 0.6) out.push(pickWeighted(rc));
  while (out.length < 3 && c.length && guard++ < 60) { const x = pickWeighted(c); if (!out.includes(x)) out.push(x); }
  if (!out.length) out.push({ t: 'silver', title: '銀兩 +100', sub: '', desc: '全部滿晒' });
  return out;
}
function openLevelUp() { game.mode = 'levelup'; game.chest = false; game.choices = buildChoices(); renderLevelUp(); }
function renderLevelUp() {
  setOverlay(`<div class="panel"><h2>${game.chest ? '寶箱！' : '升級！'}</h2><div class="cards">${game.choices.map((v, i) => `<button class="card ${v.tag || ''}" data-i="${i}"><div class="key">${i + 1}</div><div class="ct">${v.title}</div><div class="cs">${v.sub}</div><div class="cd">${v.desc}</div></button>`).join('')}</div>
    ${game.rerolls > 0 && !game.chest ? `<button class="btn small" id="reroll">重抽（剩 ${game.rerolls}）</button>` : ''}</div>`);
  overlay.querySelectorAll('.card').forEach(b => b.onclick = () => pickChoice(+b.dataset.i));
  const rr = document.getElementById('reroll'); if (rr) rr.onclick = () => { game.rerolls--; game.choices = buildChoices(); renderLevelUp(); };
}
export function pickChoice(i) {
  const g = game, c = g.choices[i]; if (!c || g.mode !== 'levelup') return;
  if (c.t === 'atk') c.u.atkUp++;
  else if (c.t === 'spd') c.u.spdUp++;
  else if (c.t === 'skill') c.u.skillLv++;
  else if (c.t === 'recruit') recruit(c.rec);
  else if (c.t === 'form') { g.form = { i: c.i, lv: c.lv }; const hp = Math.round(g.hero.st.hp * (1 + (formMods(FORMS[c.i], c.lv).hp || 0))); g.player.hp += Math.max(0, hp - g.player.maxHp); g.player.maxHp = hp; }
  else if (c.t === 'spirit') g.spirit = c.i;
  else if (c.t === 'awaken') c.u.skillLv = Math.min(5, c.u.skillLv + 2);
  else g.silver += g.chest ? 300 : 100;
  if (g.chest) { g.chest = false; g.mode = 'play'; setOverlay(''); if (g.pendingLevels > 0) openLevelUp(); return; }
  g.pendingLevels--;
  if (g.pendingLevels > 0) { g.choices = buildChoices(); renderLevelUp(); } else { g.mode = 'play'; setOverlay(''); }
}

function openPeddler() {
  game.mode = 'peddler';
  // 原作道具（名、說明、價錢來自 wiki）；回復量係遊戲設定
  const HEAL = { 人蔘: 0.3, 人蔘酒: 0.2, 崔家藥丸: 0.6 };
  const items = Object.values(GS.cons).map(it => ({ ...it, heal: HEAL[it.zh] || 0.3, cost: Math.max(10, Math.round(it.p / 5)) }));
  const render = () => {
    setOverlay(`<div class="panel"><h2>行商人</h2><p class="muted">本局銀兩：<b class="gold">${game.silver}</b></p><div class="cards">
      ${items.map((it, i) => `<button class="card shop" data-i="${i}" ${game.silver < it.cost ? 'disabled' : ''}><div class="ct">${it.zh}</div><div class="cs gold">${it.cost} 兩</div><div class="cd">${it.desc}<br>回復 ${Math.round(it.heal * 100)}% 血量</div></button>`).join('')}
      </div><button class="btn" id="leave">告辭</button></div>`);
    overlay.querySelectorAll('.card').forEach(b => b.onclick = () => { const it = items[+b.dataset.i]; if (game.silver < it.cost) return; game.silver -= it.cost; healPlayer(game.player.maxHp * it.heal); render(); });
    document.getElementById('leave').onclick = () => { game.peddler = null; game.mode = 'play'; setOverlay(''); };
  };
  render();
}

let bannerText = '', bannerT = 0;
function banner(t) { bannerText = t; bannerT = 2.5; }
function togglePause() {
  if (game.mode === 'play') {
    game.mode = 'pause';
    setOverlay(`<div class="panel"><h2>暫停</h2><p>${game.zone.zh} ・ ${fmtTime(game.t)}</p><button class="btn" id="resume">繼續</button><button class="btn small" id="quit">撤退（保留經驗同戰利品）</button></div>`);
    document.getElementById('resume').onclick = togglePause; document.getElementById('quit').onclick = () => endRun(false);
  } else if (game.mode === 'pause') { game.mode = 'play'; setOverlay(''); }
}
export function endRun(win) {
  if (game.mode === 'over') return;
  game.mode = 'over';
  const res = applyRunResult(game, win);
  const lootList = Object.entries(game.loot).map(([i, n]) => `${itemName(i)} ×${n}`).join('、') || '（冇）';
  setOverlay(`<div class="panel"><h2>${win ? `${game.zone.zh} 平定！` : '撤退'}</h2>
    <p>存活 ${fmtTime(game.t)} ・ 擊殺 ${game.kills}</p>
    <p>經驗 <b>${Math.round(game.exp).toLocaleString()}</b> ・ 銀兩 <b class="gold">${res.silver.toLocaleString()} 兩</b>${win ? '（含平定獎勵）' : ''}</p>
    ${res.levelUps.length ? `<p>${res.levelUps.map(x => `${x.name} Lv ${x.from} → <b>${x.to}</b>`).join('<br>')}</p>` : ''}
    ${game.tamed.length ? `<p class="gold">收服：${game.tamed.map(mercName).join('、')}</p>` : ''}
    ${res.unlocked ? `<p class="gold">新地圖開放：${res.unlocked}</p>` : ''}
    <p class="muted">戰利品：${lootList}</p>
    <button class="btn" id="tocamp">返漢陽</button></div>`);
  document.getElementById('tocamp').onclick = () => { game = null; enterTownView(); };
}

// ---------------- render ----------------
function draw() {
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, W, H);
  if (!game && town.on) { drawTown(ctx, W, H, blit, label, shadow); drawStick(); return; }
  if (!game) { drawAttract(); return; }
  const g = game, p = g.player, camX = Math.round(p.x - W / 2), camY = Math.round(p.y - H / 2);
  drawGround(ctx, camX, camY, W, H, g.theme);
  const sx = x => Math.round(x - camX), sy = y => Math.round(y - camY);
  for (const f of g.fields) { ctx.fillStyle = 'rgba(240,220,90,0.18)'; ctx.strokeStyle = 'rgba(240,220,90,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), f.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  for (const gm of g.gems) { const s = gm.big ? 8 : 6; ctx.fillStyle = gm.big ? '#60e0ff' : '#40a0ff'; ctx.fillRect(sx(gm.x) - s / 2, sy(gm.y) - s / 2, s, s); }
  if (g.auraR) { ctx.strokeStyle = 'rgba(160,200,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y) - 6, g.auraR, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  for (const c of g.chests) { const x = sx(c.x), y = sy(c.y) + Math.sin(g.t * 4) * 2; ctx.fillStyle = '#7a4a1a'; ctx.fillRect(x - 12, y - 12, 24, 16); ctx.fillStyle = '#d0a020'; ctx.fillRect(x - 12, y - 7, 24, 3); ctx.fillRect(x - 2, y - 10, 4, 6); }
  for (const c of g.coins) { ctx.fillStyle = '#e8c040'; ctx.fillRect(sx(c.x) - 5, sy(c.y) - 5, 10, 10); ctx.fillStyle = '#7a5a10'; ctx.fillRect(sx(c.x) - 2, sy(c.y) - 2, 4, 4); }

  const ents = [];
  for (const e of g.enemies) ents.push([e.y, () => drawEnemy(e, sx, sy)]);
  for (const u of g.mercs.concat(g.temps)) ents.push([u.y, () => drawUnit(u, sx(u.x), sy(u.y))]);
  ents.push([p.y, () => drawHero(sx(p.x), sy(p.y))]);
  if (g.peddler) ents.push([g.peddler.y, () => { const img = peddlerSprite(Math.floor(g.peddler.anim * 2) % 2); blit(img, sx(g.peddler.x), sy(g.peddler.y), 1); label('行商人', sx(g.peddler.x), sy(g.peddler.y) - 70, '#9fe0b0'); }]);
  ents.sort((a, b) => a[0] - b[0]).forEach(e => e[1]());

  for (const pr of g.projs) {
    const x = sx(pr.x), y = sy(pr.y), a = Math.atan2(pr.vy, pr.vx);
    if (pr.kind === 'arrow' || pr.kind === 'needle') { ctx.strokeStyle = pr.kind === 'arrow' ? '#e0d0a0' : '#e0e8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * (pr.kind === 'arrow' ? 12 : 7), y - Math.sin(a) * (pr.kind === 'arrow' ? 12 : 7)); ctx.lineTo(x, y); ctx.stroke(); }
    else if (pr.kind === 'bullet') { ctx.fillStyle = '#303030'; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.fillStyle = '#ffa040'; ctx.fillRect(x - 2, y - 2, 4, 4); }
    else if (pr.kind === 'orb') { ctx.fillStyle = '#b080ff'; ctx.fillRect(x - 6, y - 6, 12, 12); ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 2, 4, 4); }
    else if (pr.kind === 'phoenix') { ctx.fillStyle = '#ff7020'; ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.fill(); ctx.fillStyle = '#ffd060'; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); ctx.strokeStyle = '#ff9040'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 60, y - Math.sin(a) * 60); ctx.lineTo(x, y); ctx.stroke(); }
    else if (pr.kind === 'beam') { ctx.strokeStyle = '#a0e0ff'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 40, y - Math.sin(a) * 40); ctx.lineTo(x, y); ctx.stroke(); }
    else { ctx.fillStyle = '#e8c040'; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.fillStyle = '#7a5a10'; ctx.fillRect(x - 1, y - 1, 3, 3); }
  }
  for (const f of g.fx) drawFx(f, sx, sy);
  ctx.textAlign = 'center';
  for (const t of g.texts) {
    ctx.globalAlpha = clamp(t.life / 0.3, 0, 1); ctx.font = `bold ${t.skill ? 15 : t.big ? 18 : 13}px sans-serif`;
    ctx.fillStyle = '#000'; ctx.fillText(t.v, sx(t.x) + 1, sy(t.y) + 1);
    ctx.fillStyle = t.heal ? '#70ff90' : t.skill ? '#7ad0ff' : t.loot ? '#ffb060' : t.big ? '#ffd84a' : '#fff'; ctx.fillText(t.v, sx(t.x), sy(t.y));
  }
  ctx.globalAlpha = 1;
  if (g.peddler) edgeArrow(sx(g.peddler.x), sy(g.peddler.y), '#70e090');
  if (g.boss && !g.boss.dead) edgeArrow(sx(g.boss.x), sy(g.boss.y), '#ff5050');
  drawHud();
  drawStick();
}
function drawStick() {
  if (stick.active) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(stick.ox, stick.oy, 50, 0, 7); ctx.fill(); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(stick.ox + stick.dx * 50, stick.oy + stick.dy * 50, 20, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
}
function blit(img, x, y, face, scale = SCALE) {
  scale *= img.pxScale || 1;
  const w = img.width * scale, h = img.height * scale;
  ctx.save(); ctx.translate(x, y); if (face < 0) ctx.scale(-1, 1); ctx.drawImage(img, -w / 2, -h + 6, w, h); ctx.restore();
}
function drawLocal(rot, idl, moving, dir, face, x, y, scale = 0.8) {
  const f = localFrame(rot, idl, moving, dir || 0, game ? game.t : attractT, face);
  if (!f) return false;
  const w = f.img.width * scale, h = f.img.height * scale;
  ctx.save(); ctx.translate(x, y + 6); if (f.flip) ctx.scale(-1, 1); ctx.drawImage(f.img, -w / 2, -h, w, h); ctx.restore();
  return true;
}
function shadow(x, y, r) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + 4, r, r * 0.4, 0, 0, 7); ctx.fill(); }
function label(t, x, y, col, size = 12) { ctx.font = `bold ${size}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#000'; ctx.fillText(t, x + 1, y + 1); ctx.fillStyle = col; ctx.fillText(t, x, y); }
function drawEnemy(e, sx, sy) {
  const x = sx(e.x), y = sy(e.y);
  if (x < -100 || y < -120 || x > W + 100 || y > H + 120) return;
  const img = monsterSprite(e.mon, Math.floor(e.anim * 2) % 2);
  shadow(x, y, e.r);
  if (e.elite) { ctx.fillStyle = `rgba(255,200,60,${0.25 + 0.1 * Math.sin(game.t * 6)})`; ctx.beginPath(); ctx.arc(x, y - e.r, e.r * 1.3, 0, 7); ctx.fill(); }
  if (!drawLocal(e.mon.rot, e.mon.idl, true, e.dir, e.face, x, y, e.boss ? 1.4 : e.elite ? 1.1 : 0.8)) blit(img, x, y, e.face, e.boss ? SCALE * 1.8 : e.elite ? SCALE * 1.4 : SCALE);
  if (e.flash > 0) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - e.r, e.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  if (e.boss || e.elite) label((e.elite ? '精英 ' : '') + e.mon.zh, x, y + 22, e.elite ? '#ffd84a' : '#ff8080', 13);
  else if (e.hp < e.maxHp) { ctx.fillStyle = '#300'; ctx.fillRect(x - 12, y + 8, 24, 3); ctx.fillStyle = '#e03030'; ctx.fillRect(x - 12, y + 8, 24 * e.hp / e.maxHp, 3); }
}
function drawUnit(u, x, y) {
  const img = mercSprite(u.id, u.m, Math.floor(u.anim * 2) % 2);
  shadow(x, y, 10);
  if (u.ghost) ctx.globalAlpha = 0.55;
  if (u.m.legend) { ctx.fillStyle = `rgba(255,216,74,${0.25 + 0.15 * Math.sin(game.t * 5)})`; ctx.beginPath(); ctx.arc(x, y - 22, 28, 0, 7); ctx.fill(); }
  if (!drawLocal(u.m.rot, u.m.idl, u.moving, u.dir, u.face, x, y - (u.atkFx > 0 ? 3 : 0))) blit(img, x, y - (u.atkFx > 0 ? 3 : 0), u.face);
  ctx.globalAlpha = 1;
  label(mercName(u.id), x, y + 18, u.m.legend ? '#ffb060' : '#e8e0c8', 11);
}
function drawHero(x, y) {
  const p = game.player, u = game.hero, img = mercSprite(u.id, u.m, p.moving ? Math.floor(p.anim * 2) % 2 : 0);
  shadow(x, y, 11);
  if (p.inv > 0 && Math.floor(p.inv * 20) % 2) ctx.globalAlpha = 0.5;
  if (!drawLocal(u.m.rot, u.m.idl, p.moving, p.dir, p.face, x, y)) blit(img, x, y, p.face); ctx.globalAlpha = 1;
  ctx.fillStyle = '#300'; ctx.fillRect(x - 20, y + 10, 40, 5); ctx.fillStyle = '#40d060'; ctx.fillRect(x - 20, y + 10, 40 * clamp(p.hp / p.maxHp, 0, 1), 5);
}
function drawFx(f, sx, sy) {
  const a = f.life / f.max, x = sx(f.x), y = sy(f.y); ctx.globalAlpha = a;
  switch (f.kind) {
    case 'puff': ctx.fillStyle = '#ddd'; for (let i = 0; i < 4; i++) ctx.fillRect(x + Math.cos(i * 1.6) * (1 - a) * 20 - 3, y - 10 + Math.sin(i * 1.6) * (1 - a) * 20 - 3, 6, 6); break;
    case 'slash': ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 12, 16, -f.f - 0.6, -f.f + 0.9); ctx.stroke(); break;
    case 'ring': ctx.strokeStyle = f.col || '#ffe0a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 6, f.r * (1.2 - a * 0.4), 0, 7); ctx.stroke(); break;
    case 'strike': ctx.fillStyle = '#e0f0ff'; ctx.fillRect(x - 3, y - 400, 6, 400); ctx.fillStyle = '#80c0ff'; ctx.beginPath(); ctx.arc(x, y - 6, 40 * (1 - a) + 10, 0, 7); ctx.fill(); break;
    case 'fire': ctx.fillStyle = '#ff7030'; ctx.beginPath(); ctx.arc(x, y - 6, f.r * (1.1 - a * 0.5), 0, 7); ctx.fill(); ctx.fillStyle = '#ffd060'; ctx.beginPath(); ctx.arc(x, y - 6, f.r * 0.5 * (1.1 - a * 0.5), 0, 7); ctx.fill(); break;
    case 'flash': ctx.fillStyle = '#fff4a0'; ctx.fillRect(x - 6, y - 6, 12, 12); break;
    case 'hurt': ctx.fillStyle = 'rgba(255,0,0,0.25)'; ctx.fillRect(0, 0, W, H); break;
    case 'healfx': ctx.fillStyle = '#70ff90'; for (let i = 0; i < 5; i++) ctx.fillRect(x - 16 + i * 8, y - 20 - (1 - a) * 30 - (i % 2) * 8, 4, 8); break;
  }
  ctx.globalAlpha = 1;
}
function edgeArrow(x, y, col) {
  if (x > 0 && x < W && y > 0 && y < H) return;
  const cx = W / 2, cy = H / 2, a = Math.atan2(y - cy, x - cx), ex = clamp(cx + Math.cos(a) * W, 30, W - 30), ey = clamp(cy + Math.sin(a) * H, 60, H - 30);
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.fill(); ctx.restore();
}
function drawHud() {
  const g = game;
  ctx.fillStyle = '#102030'; ctx.fillRect(0, 0, W, 10); ctx.fillStyle = '#40a0ff'; ctx.fillRect(0, 0, W * g.xp / g.xpNext, 10);
  const remain = g.finalDone ? 0 : Math.max(0, RUN_SECONDS - g.t);
  label(g.finalDone ? '討伐首領！' : fmtTime(remain), W / 2, 38, '#fff', 22);
  ctx.textAlign = 'left'; ctx.font = 'bold 14px sans-serif';
  const hl = (t, y, col = '#fff') => { ctx.fillStyle = '#000'; ctx.fillText(t, 13, y + 1); ctx.fillStyle = col; ctx.fillText(t, 12, y); };
  hl(`${g.zone.zh}`, 30, '#ffd84a'); hl(`Lv ${g.level} ・ 擊殺 ${g.kills}`, 50); hl(`銀兩 ${g.silver}`, 70, '#ffd84a'); hl(`經驗 ${Math.round(g.exp).toLocaleString()}`, 90, '#a0e0ff');
  if (g.buffT > 0) hl('激勵中', 110, '#ffd84a');
  // right side: synergy, formations, relics, deck
  ctx.textAlign = 'right'; ctx.font = 'bold 13px sans-serif'; let ry = 30;
  const hr = (t, col = '#fff') => { ctx.fillStyle = '#000'; ctx.fillText(t, W - 11, ry + 1); ctx.fillStyle = col; ctx.fillText(t, W - 12, ry); ry += 18; };
  if (g.form) hr(`陣型 ${FORMS[g.form.i].n} Lv${g.form.lv}`, '#7ad0ff');
  if (g.spirit != null) hr(`精靈 ${SPIRITS[g.spirit].zh}`, '#ffb060');
  for (const c of activeCombos()) hr(`合擊技 ${c.n}`, '#ffd84a');
  if (g.deck.length) hr(`未招募：${g.deck.length} 名`, '#a0e0a0');
  ctx.textAlign = 'left';
  if (g.boss && !g.boss.dead) { const bw = Math.min(500, W - 40), bx = (W - bw) / 2; ctx.fillStyle = '#300'; ctx.fillRect(bx, 52, bw, 12); ctx.fillStyle = '#e03030'; ctx.fillRect(bx, 52, bw * g.boss.hp / g.boss.maxHp, 12); label(g.boss.mon.zh, W / 2, 80, '#fff', 13); }
  if (bannerT > 0) { ctx.globalAlpha = clamp(bannerT, 0, 1); label(bannerText, W / 2, H * 0.3, '#ffd84a', 26); ctx.globalAlpha = 1; }
}
let attractT = 0;
const ATTRACT = ['guC00', 'guC01', 'guU02', 'guU30', 'guU95', 'guU102', 'guT2', 'guT29', 'guM30', 'guE34', 'guT80'];
function drawAttract() {
  attractT += 1 / 60;
  drawGround(ctx, Math.round(attractT * 20), 0, W, H, zoneTheme('朝鮮地圖'));
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
  ATTRACT.forEach((id, i) => { const m = M(id); if (!m) return; const x = W / 2 + (i - (ATTRACT.length - 1) / 2) * 76; if (!drawLocal(m.rot, m.idl, false, 0, -1, x, H - 40, 0.7)) blit(mercSprite(id, m, Math.floor(attractT * 3 + i) % 2), x, H - 40, 1); });
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game && game.mode === 'play') update(dt);
  else if (!game && town.on && overlay.style.display !== 'flex') {
    let mx = 0, my = 0;
    if (keys.has('w') || keys.has('arrowup')) my -= 1; if (keys.has('s') || keys.has('arrowdown')) my += 1;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1; if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (stick.active) { mx = stick.dx; my = stick.dy; }
    updateTown(dt, mx, my);
  }
  tui.style.display = !game && town.on && overlay.style.display !== 'flex' ? 'flex' : 'none';
  const tb = document.getElementById('tuTalk'); if (tb) { tb.disabled = !town.near; tb.textContent = town.near ? `對話：${town.near.name}` : '行近 NPC 對話'; }
  if (bannerT > 0) bannerT -= dt;
  draw(); requestAnimationFrame(frame);
}
window.__gs = { get game() { return game; }, startRun, update, pickChoice, endRun, get save() { return save; } };
loadLocalPack().then(n => { if (n) console.log(`本機素材包已載入：${n} 個 sprite`); });
detectLocalArt().then(on => { if (on) console.log('本機原作素材模式：開'); });
if (hasSave()) enterTownView(); else openNewGame();
requestAnimationFrame(frame);
