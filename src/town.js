// 主地圖：漢陽城（可以行動，搵 NPC 對話開啟各種功能）
import { npcSprite, mercSprite, drawGround, zoneTheme } from './render.js';
import { M, mercName, CITIES } from './rules.js';

export const NPCS = [
  { key: 'go', name: '驛站仲介人', bld: '驛站', x: 700, y: 300, look: { robe: '#5a3a2a', hat: 'gat', weapon: 'none', beard: true }, line: '要去邊度行商？路上山賊妖獸多，記得帶齊傭兵。' },
  { key: 'mercs', name: '傭兵營房', bld: '營房', x: 380, y: 300, look: { robe: '#3a4a6a', hat: 'helmet', weapon: 'spear', armor: '#4a5a6a' }, line: '傭兵嘅裝備、技能、轉職都喺度安排。' },
  { key: 'hire', name: '訓練所教官', bld: '訓練所', x: 1020, y: 300, look: { robe: '#6a3a1a', hat: 'headband', weapon: 'sword', armor: '#7a4a2a' }, line: '朝鮮訓練所，想招募邊位傭兵？' },
  { key: 'fuse', name: '合成術士', bld: '合成所', x: 380, y: 640, look: { robe: '#4a2a6a', hat: 'taoist', weapon: 'fan', cape: '#2a1a4a' }, line: '收服咗嘅怪物傭兵，可以喺度合成更強嘅傭兵。' },
  { key: 'market', name: '市場商人', bld: '市場', x: 700, y: 640, look: { robe: '#8a6a2a', hat: 'gat', weapon: 'abacus', cape: '#c0a060' }, line: '本地特產、兵器、材料，買賣都喺度。' },
  { key: 'store', name: '倉庫管理人', bld: '倉庫', x: 1020, y: 640, look: { robe: '#5a5a4a', hat: 'jeongjagwan', weapon: 'none' }, line: '你嘅戰利品都存喺度，要賣就搵我。' },
];
const BOUNDS = { x0: 120, y0: 120, x1: 1280, y1: 860 };
const SMALL = ['go', 'market', 'mercs'];
export const activeNpcs = () => (CITIES[town.city]?.big ? NPCS : NPCS.filter(n => SMALL.includes(n.key)));
export const town = { on: false, city: '漢陽', x: 700, y: 470, face: 1, moving: false, anim: 0, near: null, followers: [], t: 0 };

export function enterTown(party) {
  Object.assign(town, { on: true, x: 700, y: 470, near: null, t: 0 });
  town.followers = party.slice(0, 4).map((id, i) => ({ id, x: 700 - 30 * (i + 1), y: 470 + 10 * i, face: 1, anim: 0 }));
}

export function updateTown(dt, mx, my) {
  town.t += dt;
  const l = Math.hypot(mx, my); town.moving = l > 0.1;
  if (town.moving) {
    const s = 170 * Math.min(1, l) / l;
    town.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, town.x + mx * s * dt));
    town.y = Math.max(BOUNDS.y0, Math.min(BOUNDS.y1, town.y + my * s * dt));
    town.anim += dt * 2.5; if (Math.abs(mx) > 0.1) town.face = mx < 0 ? -1 : 1;
  }
  let lead = town;
  for (const f of town.followers) {
    const dx = lead.x - f.x, dy = lead.y - f.y, d = Math.hypot(dx, dy);
    if (d > 36) { f.x += dx / d * (d - 36) * Math.min(1, dt * 6); f.y += dy / d * (d - 36) * Math.min(1, dt * 6); f.anim += dt * 2; f.face = dx < 0 ? -1 : 1; }
    lead = f;
  }
  town.near = activeNpcs().find(n => (n.x - town.x) ** 2 + (n.y + 30 - town.y) ** 2 < 75 * 75) || null;
}

// tap/click on an NPC from anywhere: walk target
export function npcAt(wx, wy) { return activeNpcs().find(n => Math.abs(n.x - wx) < 40 && wy > n.y - 90 && wy < n.y + 20) || null; }

function hanok(ctx, x, y, w, sign) {
  // 韓屋：石基、木柱、白牆、瓦頂（曲線屋簷）、招牌
  ctx.fillStyle = '#8a8478'; ctx.fillRect(x - w / 2 - 6, y - 10, w + 12, 14);
  ctx.fillStyle = '#ece4d0'; ctx.fillRect(x - w / 2, y - 80, w, 70);
  ctx.fillStyle = '#6a4024'; for (let i = 0; i <= 4; i++) ctx.fillRect(x - w / 2 + i * (w / 4) - 3, y - 80, 6, 70);
  ctx.fillRect(x - w / 2, y - 82, w, 6);
  ctx.fillStyle = '#9a6a3a'; ctx.fillRect(x - 18, y - 56, 36, 46); ctx.fillStyle = '#c8a878'; for (let i = 0; i < 3; i++) ctx.fillRect(x - 14 + i * 10, y - 52, 6, 38);
  ctx.fillStyle = '#3a3a44';
  ctx.beginPath(); ctx.moveTo(x - w / 2 - 34, y - 76); ctx.quadraticCurveTo(x - w / 2, y - 96, x - w / 2 + 10, y - 112);
  ctx.lineTo(x + w / 2 - 10, y - 112); ctx.quadraticCurveTo(x + w / 2, y - 96, x + w / 2 + 34, y - 76); ctx.quadraticCurveTo(x, y - 88, x - w / 2 - 34, y - 76); ctx.fill();
  ctx.fillStyle = '#4a4a56'; for (let i = 0; i < 9; i++) ctx.fillRect(x - w / 2 + 4 + i * (w - 8) / 8, y - 110, 3, 26);
  ctx.fillStyle = '#2a2a32'; ctx.fillRect(x - w / 2 + 6, y - 116, w - 12, 6);
  ctx.fillStyle = '#5a2a14'; ctx.fillRect(x - 34, y - 104, 68, 22); ctx.strokeStyle = '#d0a040'; ctx.lineWidth = 2; ctx.strokeRect(x - 34, y - 104, 68, 22);
  ctx.fillStyle = '#ffe08a'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(sign, x, y - 88);
}

export function drawTown(ctx, W, H, blit, label, shadow) {
  const camX = Math.round(town.x - W / 2), camY = Math.round(town.y - H / 2);
  drawGround(ctx, camX, camY, W, H, zoneTheme('漢陽'));
  const sx = x => Math.round(x - camX), sy = y => Math.round(y - camY);
  // 石板路
  ctx.fillStyle = '#b8a888'; ctx.fillRect(sx(140), sy(420), 1120, 100); ctx.fillRect(sx(650), sy(130), 100, 720);
  ctx.fillStyle = '#a89878'; for (let i = 0; i < 28; i++) ctx.fillRect(sx(150 + i * 40), sy(430 + (i % 2) * 40), 30, 3);
  // 城牆
  ctx.fillStyle = '#7a7468'; ctx.fillRect(sx(80), sy(90), 1240, 18); ctx.fillRect(sx(80), sy(880), 1240, 18); ctx.fillRect(sx(80), sy(90), 18, 808); ctx.fillRect(sx(1302), sy(90), 18, 808);
  ctx.fillStyle = '#5a5448'; for (let x = 80; x < 1320; x += 24) { ctx.fillRect(sx(x), sy(80), 14, 10); ctx.fillRect(sx(x), sy(870), 14, 10); }
  // 城門（南大門）
  ctx.fillStyle = '#3a3a44'; ctx.fillRect(sx(640), sy(860), 120, 40); ctx.fillStyle = '#6a4024'; ctx.fillRect(sx(670), sy(870), 60, 30);
  label(town.city === '漢陽' ? '崇禮門' : '城門', sx(700), sy(856), '#ffe08a', 13);
  const ents = [];
  for (const n of activeNpcs()) {
    ents.push([n.y - 120, () => hanok(ctx, sx(n.x), sy(n.y - 50), 150, n.bld)]);
    ents.push([n.y, () => {
      const img = npcSprite(n.key, n.look, Math.floor(town.t * 1.5 + n.x) % 2);
      shadow(sx(n.x), sy(n.y), 11); blit(img, sx(n.x), sy(n.y), 1);
      label(n.name, sx(n.x), sy(n.y) + 22, town.near === n ? '#ffe08a' : '#f0e8d0', 12);
      if (town.near === n) { ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.moveTo(sx(n.x) - 7, sy(n.y) - 78); ctx.lineTo(sx(n.x) + 7, sy(n.y) - 78); ctx.lineTo(sx(n.x), sy(n.y) - 68); ctx.fill(); }
    }]);
  }
  for (const f of town.followers) { const m = M(f.id); if (m) ents.push([f.y, () => { shadow(sx(f.x), sy(f.y), 10); blit(mercSprite(f.id, m, Math.floor(f.anim * 2) % 2), sx(f.x), sy(f.y), f.face); }]); }
  ents.push([town.y, () => { const hero = town.heroId; if (!hero) return; shadow(sx(town.x), sy(town.y), 11); blit(mercSprite(hero, M(hero), town.moving ? Math.floor(town.anim * 2) % 2 : 0), sx(town.x), sy(town.y), town.face); label(mercName(hero), sx(town.x), sy(town.y) + 22, '#a0e0ff', 12); }]);
  ents.sort((a, b) => a[0] - b[0]).forEach(e => e[1]());
  label(town.city, 60, 34, '#ffd84a', 20);
  return { camX, camY };
}
