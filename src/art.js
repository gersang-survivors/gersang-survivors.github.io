// 高解像原創像素美術（32×44）：按角色身份設計（歷史服飾、兵種、兵器、屬性），唔係原作素材
// 畫法：向量形狀 → 去鋸齒門檻 → 立體光影 → 描邊

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
export function tone(hex, amt) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v + amt)));
  return '#' + ((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
}

// ---------- post-processing ----------
function crisp(c) { // hard alpha edges for a clean pixel look
  const g = c.getContext('2d'), im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
  g.putImageData(im, 0, 0); return c;
}
function volume(c) { // pseudo-3D: light from top-left, shadow bottom-right, measured by distance to edge
  const w = c.width, h = c.height, g = c.getContext('2d'), im = g.getImageData(0, 0, w, h), d = im.data;
  const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!A(x, y)) continue;
    let l = 0, r = 0, t = 0, b = 0;
    while (l < 3 && A(x - l - 1, y)) l++; while (r < 3 && A(x + r + 1, y)) r++;
    while (t < 3 && A(x, y - t - 1)) t++; while (b < 3 && A(x, y + b + 1)) b++;
    const k = ((l - r) * 0.5 + (t - b) * 0.6) * 9 + (r === 0 || b === 0 ? -18 : 0) + (l === 0 || t === 0 ? 14 : 0);
    const i = (y * w + x) * 4; out[i] = d[i] + k; out[i + 1] = d[i + 1] + k; out[i + 2] = d[i + 2] + k * 0.9;
  }
  g.putImageData(new ImageData(out, w, h), 0, 0); return c;
}
function outline(src) {
  const w = src.width, h = src.height, [c, g] = cv(w + 2, h + 2);
  const d = src.getContext('2d').getImageData(0, 0, w, h).data, o = g.createImageData(w + 2, h + 2), od = o.data;
  const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    const i = ((y + 1) * (w + 2) + x + 1) * 4;
    if (A(x, y)) { const j = (y * w + x) * 4; od[i] = d[j]; od[i + 1] = d[j + 1]; od[i + 2] = d[j + 2]; od[i + 3] = 255; }
    else if (A(x - 1, y) || A(x + 1, y) || A(x, y - 1) || A(x, y + 1)) { od[i] = 20; od[i + 1] = 15; od[i + 2] = 14; od[i + 3] = 255; }
  }
  g.putImageData(o, 0, 0); c.pxScale = 0.5; return c;
}
const finish = c => outline(volume(crisp(c)));

// ---------- drawing primitives ----------
function P(g) {
  return {
    rect: (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); },
    ell: (x, y, rx, ry, col, rot = 0) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); g.fill(); },
    poly: (pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); },
    line: (x1, y1, x2, y2, col, w = 1) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); },
    arc: (x, y, r, a0, a1, col, w = 1) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); },
  };
}

// ---------- humanoid (32×44) ----------
// L: {robe, top, skin, hair, hat, helm, plume, weapon, armor, cape, female, horse, sash}
export function hiHumanoid(L, frame) {
  const [c, g] = cv(32, 46), p = P(g);
  const skin = L.skin || '#f2c9a0', hair = L.hair || '#22180f', robe = L.robe, dark = tone(robe, -40);
  const step = frame ? 1 : -1, ox = 0, top = 6;
  // cape behind
  if (L.cape) p.poly([9, top + 13, 23, top + 13, 26, top + 36, 6, top + 36], L.cape);
  // legs & shoes
  p.rect(12, top + 30, 3, 6 + step, '#3a2e24'); p.rect(17, top + 30, 3, 6 - step, '#3a2e24');
  p.rect(11, top + 35 + step, 5, 2, '#1e1712'); p.rect(16, top + 35 - step, 5, 2, '#1e1712');
  // body / robe
  if (L.female) {
    p.poly([9, top + 21, 23, top + 21, 26, top + 35, 6, top + 35], robe);            // 裙
    p.rect(6, top + 34, 20, 2, dark);
    p.poly([11, top + 13, 21, top + 13, 22, top + 21, 10, top + 21], L.top || tone(robe, 50)); // 短衣
    p.poly([15, top + 16, 17, top + 16, 19, top + 24, 13, top + 24], L.sash || '#c0283c');     // 衣帶
  } else {
    p.poly([10, top + 13, 22, top + 13, 24, top + 31, 8, top + 31], robe);
    p.poly([15, top + 13, 17, top + 13, 18, top + 31, 14, top + 31], tone(robe, 18)); // 衣襟
    p.line(11, top + 14, 16, top + 21, tone(robe, -30)); p.line(21, top + 14, 16, top + 21, tone(robe, -30));
    p.rect(9, top + 22, 14, 2, L.sash || dark);
  }
  if (L.armor) {
    p.poly([10, top + 13, 22, top + 13, 23, top + 24, 9, top + 24], L.armor);
    for (let y = top + 15; y < top + 24; y += 2) for (let x = 10 + (y % 4 ? 1 : 0); x < 22; x += 3) p.rect(x, y, 2, 1, tone(L.armor, -35)); // 鱗甲
    p.ell(9, top + 15, 3, 2.2, tone(L.armor, 15)); p.ell(23, top + 15, 3, 2.2, tone(L.armor, 15));               // 護肩
    p.rect(9, top + 23, 14, 2, '#c89a2a');
  }
  // arms (swing)
  const sleeve = L.armor || robe;
  p.poly([8, top + 14, 11, top + 14, 10, top + 24 + step, 7, top + 24 + step], sleeve);
  p.poly([21, top + 14, 24, top + 14, 25, top + 24 - step, 22, top + 24 - step], sleeve);
  p.ell(8.5, top + 25 + step, 1.6, 1.6, skin); p.ell(23.5, top + 25 - step, 1.6, 1.6, skin);
  // neck + head
  p.rect(14, top + 10, 4, 4, tone(skin, -15));
  p.ell(16, top + 6, 5.2, 5.6, skin);
  if (L.hat !== 'bald' && L.hat !== 'monk') p.poly([10.5, top + 5, 12, top + 0.5, 20, top + 0.5, 21.5, top + 5, 20, top + 3, 12, top + 3], hair);
  if (L.female && L.hat !== 'crown') { p.rect(10, top + 3, 2, 9, hair); p.rect(20, top + 3, 2, 9, hair); }
  // face
  p.rect(13, top + 6, 2, 2, '#1a1410'); p.rect(18, top + 6, 2, 2, '#1a1410');
  p.rect(13, top + 6, 1, 1, '#ffffff'); p.rect(18, top + 6, 1, 1, '#ffffff');
  p.line(12.5, top + 4.5, 15, top + 4.5, tone(hair, 20)); p.line(17.5, top + 4.5, 20, top + 4.5, tone(hair, 20));
  p.rect(15, top + 10, 3, 1, L.female ? '#c84050' : tone(skin, -45));
  if (L.beard) p.poly([13, top + 10, 19, top + 10, 17, top + 14, 15, top + 14], hair);
  // hats
  switch (L.hat) {
    case 'gat': p.ell(16, top + 1, 11, 2, '#141414'); p.poly([12, top + 1, 20, top + 1, 19, top - 5, 13, top - 5], '#141414'); p.line(11, top + 2, 11, top + 11, '#141414'); p.line(21, top + 2, 21, top + 11, '#141414'); break;
    case 'jeongjagwan': p.poly([11, top + 1, 21, top + 1, 20, top - 4, 12, top - 4], '#181818'); p.poly([13, top - 4, 19, top - 4, 18, top - 7, 14, top - 7], '#181818'); break;
    case 'headband': p.rect(10, top + 2, 12, 2, '#c02828'); p.poly([21, top + 2, 26, top + 4, 25, top + 6, 21, top + 4], '#c02828'); break;
    case 'topknot': p.ell(16, top - 1, 2.5, 2.5, hair); p.rect(15, top + 1, 2, 1, '#c0a040'); break;
    case 'helmet': p.ell(16, top + 2, 6.5, 4.5, L.helm || '#5e6670'); p.rect(9, top + 4, 14, 2, tone(L.helm || '#5e6670', -25)); p.poly([15, top - 2, 17, top - 2, 18, top - 7, 14, top - 7], L.plume || '#c82828'); break;
    case 'admiral': p.ell(16, top + 2, 7, 4.5, '#283048'); p.rect(8, top + 4, 16, 2, '#d0a028'); p.poly([14, top - 2, 18, top - 2, 20, top - 9, 12, top - 9], '#c82020'); p.rect(15, top - 2, 2, 3, '#d0a028'); break;
    case 'monk': p.ell(16, top + 4, 5.2, 4.6, tone(skin, -18)); p.ell(16, top + 23, 7, 2, '#8a2020'); for (let i = 0; i < 6; i++) p.ell(11 + i * 2, top + 13 + (i % 2), 1, 1, '#5a3a20'); break;
    case 'bun': p.ell(16, top - 1, 3.5, 3, hair); p.line(12, top - 1, 21, top - 2, '#e0c040', 1.2); p.ell(21, top - 2, 1.2, 1.2, '#e05070'); break;
    case 'crown': p.poly([10, top + 1, 22, top + 1, 22, top - 3, 20, top - 1, 18, top - 5, 16, top - 1, 14, top - 5, 12, top - 1, 10, top - 3], '#d8a828'); p.ell(16, top - 1, 1.2, 1.2, '#e03050'); p.rect(10, top + 3, 2, 10, hair); p.rect(20, top + 3, 2, 10, hair); break;
    case 'taoist': p.poly([11, top + 1, 21, top + 1, 19, top - 5, 13, top - 5], '#1e1e1e'); p.rect(13, top - 2, 6, 1, '#c0a040'); break;
    case 'bandana': p.rect(10, top + 2, 12, 2, '#a82020'); break;
  }
  // weapons (held at right hand)
  const hx = 24, hy = top + 25 - step;
  switch (L.weapon) {
    case 'bow': p.arc(hx - 3, hy - 6, 11, -1.2, 1.2, '#7a4a1e', 2); p.line(hx + 1, hy - 16, hx + 1, hy + 4, '#e8e8e0'); break;
    case 'sword': p.line(hx, hy, hx + 1, hy - 16, '#dfe6ee', 2); p.rect(hx - 2, hy - 1, 5, 2, '#b08020'); p.rect(hx - 0.5, hy + 1, 2, 3, '#4a2a1a'); break;
    case 'spear': p.line(hx, hy + 8, hx, hy - 24, '#7a5a30', 1.6); p.poly([hx - 2, hy - 23, hx + 2, hy - 23, hx, hy - 30], '#dfe6ee'); p.ell(hx, hy - 22, 2, 1.4, '#c82828'); break;
    case 'needle': for (let i = 0; i < 3; i++) p.line(hx - 1 + i * 2, hy - 2, hx + 2 + i * 2, hy - 7, '#e8eeff'); break;
    case 'moktak': p.ell(hx, hy, 3.5, 3, '#9a6020'); p.rect(hx - 2, hy - 1, 4, 1, '#4a2a10'); p.line(hx + 3, hy - 3, hx + 6, hy - 7, '#7a5030', 1.4); break;
    case 'fan': g.save(); g.translate(hx, hy); for (let i = -3; i <= 3; i++) { g.rotate(0); p.line(0, 0, Math.sin(i * 0.3) * 8, -Math.cos(i * 0.3) * 8, '#5a3a20'); } p.ell(0, -6, 7, 3.5, '#f2ead0'); p.ell(0, -8, 6, 1.5, '#c03030'); g.restore(); break;
    case 'cannon': p.rect(hx - 6, hy - 3, 11, 4, '#3a3a3a'); p.rect(hx + 4, hy - 4, 2, 6, '#222'); p.ell(hx - 5, hy + 2, 2, 2, '#5a3a20'); break;
    case 'coin': p.ell(hx, hy - 1, 2.5, 2.5, '#e8c040'); p.rect(hx - 0.5, hy - 1.5, 1, 1, '#7a5a10'); break;
    case 'abacus': p.rect(hx - 3, hy - 4, 6, 7, '#6a4020'); for (let i = 0; i < 3; i++) p.rect(hx - 2 + i * 2, hy - 3, 1, 5, '#e0d0a0'); break;
  }
  if (L.horse) return mounted(c, L.horse === true ? '#6a4626' : L.horse, frame, L.cape);
  return finish(c);
}

function mounted(rider, col, frame, saddle) {
  const [c, g] = cv(48, 48), p = P(g), d = tone(col, -45), f = frame ? 2 : -2;
  p.ell(22, 33, 14, 6, col);                                                // 馬身
  p.poly([33, 30, 40, 18, 44, 19, 41, 30], col); p.ell(42, 19, 4, 3, col);   // 頸、頭
  p.poly([36, 22, 39, 15, 41, 21], d);                                       // 鬃
  p.rect(44, 18, 1, 1, '#000'); p.poly([40, 16, 41, 13, 42, 16], d);
  p.poly([8, 31, 4, 38, 7, 39, 10, 33], d);                                  // 尾
  for (const [x, o] of [[12, f], [17, -f], [28, -f], [33, f]]) { p.rect(x, 37, 3, 9 + (o > 0 ? 1 : 0), d); p.rect(x, 45 + (o > 0 ? 1 : 0), 3, 1, '#1a1410'); }
  p.ell(22, 29, 8, 3, saddle || '#8a2020');
  g.drawImage(rider, 6, -8);
  return finish(c);
}

// ---------- war carts ----------
export function hiCart(kind, frame, elem) {
  const [c, g] = cv(48, 36), p = P(g), f = frame ? 1 : 0;
  if (kind === 'turtle') { // 龜船式戰車
    p.ell(24, 20, 20, 9, '#4e6a3a'); p.ell(24, 17, 17, 7, '#5e7c46');
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) p.poly([10 + i * 5 + j * 2, 13 + j * 4, 12 + i * 5 + j * 2, 9 + j * 4, 14 + i * 5 + j * 2, 13 + j * 4], '#d8d8c0');
    p.poly([42, 18, 48, 14, 47, 22, 42, 23], '#c8a030'); p.rect(46, 16, 1, 1, '#000'); p.poly([46, 19, 48, 18, 48, 21], '#e04020');
    for (let i = 0; i < 4; i++) p.rect(10 + i * 8, 24, 3, 2, '#2a2a2a'); // 砲口
  } else { // 雷戰車
    p.rect(6, 16, 34, 10, '#6a4626'); p.rect(6, 14, 34, 2, '#8a6236');
    for (let i = 0; i < 5; i++) p.ell(12 + i * 5, 12, 2.5, 4, '#3a3a40'); // 火箭筒
    p.rect(36, 10, 10, 5, '#303034'); p.rect(44, 9, 2, 7, '#1a1a1a');
  }
  if (elem) p.rect(6, 27, 36, 1.5, elem);
  for (const x of [12, 34]) { p.ell(x, 30, 5, 5, '#3a2616'); p.ell(x, 30, 2, 2, '#8a8a8a'); p.line(x - 4 + f * 2, 30 - 3 + f, x + 4 - f * 2, 30 + 3 - f, '#5a4030'); }
  return finish(c);
}

// ---------- creatures ----------
function beast(o) {
  const big = o.big ? 1.25 : 1, W = Math.round(40 * big), H = Math.round(30 * big), [c, g] = cv(W, H), p = P(g), f = o.frame ? 2 : -2;
  g.save(); g.scale(big, big);
  const b = o.body, d = tone(b, -50), l = tone(b, 35);
  if (o.tails) for (let i = 0; i < o.tails; i++) p.ell(6, 12 + i * 3 - o.tails, 6, 2.2, l, -0.5 + i * 0.35); else p.ell(6, 14, 5, 1.6, b, -0.4);
  p.ell(19, 17, 12, 6, b);                                  // 身
  p.ell(18, 20, 9, 2.5, l);                                 // 腹
  p.ell(32, 11, 5, 4.5, b); p.poly([34, 12, 39, 13, 38, 16, 33, 15], b); // 頭、口
  p.rect(38, 13, 1, 1, '#1a1010'); p.rect(33, 9, 2, 2, o.eye || '#f0e040');
  p.poly([29, 7, 30, 3, 32, 7], d); p.poly([33, 7, 35, 3, 36, 8], d);   // 耳
  for (const [x, o2] of [[11, f], [15, -f], [24, -f], [28, f]]) p.rect(x, 21, 3, 7 + (o2 > 0 ? 1 : 0), d);
  if (o.stripes) for (let x = 12; x < 29; x += 4) p.poly([x, 11, x + 2, 11, x + 1, 20], '#1a1410');
  if (o.spots) for (const [x, y] of [[13, 14], [18, 13], [23, 15], [16, 17]]) p.ell(x, y, 1.2, 1.2, '#f4e8cc');
  if (o.horns) { p.line(31, 6, 29, -1, '#d8c8a0', 1.5); p.line(29, 2, 26, 0, '#d8c8a0', 1.2); p.line(34, 6, 36, -1, '#d8c8a0', 1.5); }
  if (o.tusk) p.poly([37, 15, 40, 13, 38, 16], '#f4f0e0');
  if (o.mane) p.ell(29, 12, 5, 7, '#7a6a3a');
  if (o.mark) p.poly([28, 16, 33, 16, 30.5, 18], '#f4f4f4');
  g.restore();
  return finish(c);
}
function simple(w, h, draw) { const [c, g] = cv(w, h); draw(P(g), g); return finish(c); }

export function hiCreature(name, frame, tint) {
  const has = re => re.test(name), f = frame ? 1 : -1;
  if (has(/四不像/)) return beast({ body: '#8c8a70', horns: true, frame });
  if (has(/鹿/)) return beast({ body: '#b8784a', horns: true, spots: true, frame });
  if (has(/狐/)) return beast({ body: tint || '#e8a040', tails: has(/九尾/) ? 5 : has(/三尾/) ? 3 : 1, frame });
  if (has(/虎|山貓/)) return beast({ body: has(/白/) ? '#ecece4' : '#d88a28', stripes: true, frame, big: has(/飛虎|王/) });
  if (has(/熊/)) return beast({ body: has(/白/) ? '#eceef4' : '#3a2a20', big: true, frame, mark: has(/半月/) });
  if (has(/豬/)) return beast({ body: '#5a4030', tusk: true, frame });
  if (has(/犬/)) return beast({ body: '#2e2e36', frame, eye: '#e04040' });
  if (has(/獅/)) return beast({ body: '#9a9a90', big: true, frame, mane: true });
  if (has(/馬/) && !has(/海馬/)) return beast({ body: has(/火/) ? '#c84020' : '#6a4626', frame, mane: true });
  if (has(/龜/)) return simple(40, 28, p => { p.ell(19, 15, 14, 8, '#4a7a4a'); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) p.ell(12 + i * 7, 12 + j * 5, 3, 2, '#5e9058'); p.ell(35, 15, 4.5, 3.5, '#8aa070'); p.rect(37, 14, 1, 1, '#000'); for (const x of [10, 26]) p.ell(x, 22 + (x > 20 ? f : -f), 3, 2.5, '#8aa070'); });
  if (has(/海馬/)) return simple(26, 40, p => { p.ell(13, 8, 5, 5, '#3a8ab0'); p.poly([17, 7, 25, 6, 24, 10, 17, 10], '#3a8ab0'); p.ell(12, 20, 5, 8, '#3a8ab0'); p.ell(11, 21, 2.5, 6, '#7ac0e0'); p.poly([12, 28, 15, 28, 12, 37, 8, 34], '#2a6a90'); p.rect(14, 7, 1, 1, '#000'); p.poly([7, 14, 3, 12 + f, 5, 20], '#7ac0e0'); });
  if (has(/龍/)) return simple(54, 34, p => { const b = has(/白/) ? '#e4ecf4' : has(/黃/) ? '#d4b030' : has(/雷/) ? '#4a5ad0' : tint || '#3a8a5a', d = tone(b, -45); for (let i = 0; i < 6; i++) p.ell(8 + i * 6, 20 + Math.sin(i + f) * 3, 5, 4, b); for (let i = 0; i < 6; i++) p.poly([6 + i * 6, 16 + Math.sin(i + f) * 3, 8 + i * 6, 12 + Math.sin(i + f) * 3, 10 + i * 6, 16 + Math.sin(i + f) * 3], d); p.ell(44, 14, 6, 5, b); p.poly([48, 13, 54, 14, 53, 17, 48, 17], b); p.rect(46, 12, 2, 2, '#f04040'); p.line(43, 9, 40, 2, '#d8a828', 1.5); p.line(46, 9, 46, 2, '#d8a828', 1.5); p.line(52, 16, 54, 22, d); });
  if (has(/蛇|蟒/)) return simple(48, 24, p => { const b = has(/紫/) ? '#7a3a8a' : '#4a6a2a'; for (let i = 0; i < 7; i++) p.ell(4 + i * 5.5, 14 + Math.sin(i * 1.2 + f) * 3, 4, 3.5, b); p.ell(42, 10, 5, 4, b); p.rect(44, 8, 2, 2, '#f0e040'); p.line(46, 12, 48, 14, '#c02020'); });
  if (has(/蛾/)) return simple(36, 28, p => { p.ell(9, 10 + f, 8, 6, '#b8a060', -0.4); p.ell(27, 10 + f, 8, 6, '#b8a060', 0.4); p.ell(10, 20, 6, 4, '#a08850'); p.ell(26, 20, 6, 4, '#a08850'); p.ell(18, 15, 2.5, 8, '#5a4a30'); p.ell(9, 10, 2.5, 2.5, '#5a3020'); p.ell(27, 10, 2.5, 2.5, '#5a3020'); });
  if (has(/鳥|雀|姑獲/)) return simple(40, 30, p => { const b = has(/紅雀|朱/) ? '#d03020' : has(/雷鳥|青銅/) ? '#6a8a8a' : '#5a5a6a'; p.ell(20, 17, 8, 6, b); p.ell(29, 12, 4.5, 4, has(/人面/) ? '#f2c9a0' : b); p.poly([33, 12, 38, 13, 33, 14], '#e0a020'); p.rect(30, 11, 1, 1, '#000'); p.poly([16, 14, 2, 6 + f * 4, 8, 18], tone(b, 30)); p.poly([12, 18, 2, 22, 12, 21], tone(b, -20)); p.line(18, 23, 17, 28, '#d0a030'); p.line(22, 23, 23, 28, '#d0a030'); });
  if (has(/樹/)) return simple(36, 46, p => { const leaf = has(/妖靈/) ? '#5a3a7a' : '#3a6a2a'; p.rect(15, 18, 7, 22, '#5a3a20'); p.ell(18, 12, 14, 10, leaf); p.ell(10, 16, 7, 6, tone(leaf, 15)); p.ell(26, 16, 7, 6, tone(leaf, -10)); p.ell(16, 24, 1.5, 1.5, '#f0e040'); p.ell(21, 24, 1.5, 1.5, '#f0e040'); p.rect(16, 29, 6, 1, '#2a1a10'); p.poly([15, 40, 10 + f, 45, 14, 45, 17, 40], '#5a3a20'); p.poly([22, 40, 27 - f, 45, 23, 45, 20, 40], '#5a3a20'); p.line(15, 22, 6, 18 + f, '#5a3a20', 2); p.line(22, 22, 31, 18 - f, '#5a3a20', 2); });
  if (has(/石爺爺/)) return simple(30, 46, p => { p.ell(15, 6, 8, 4, '#6e6e6c'); p.rect(9, 6, 12, 4, '#6e6e6c'); p.ell(15, 22, 10, 14, '#8a8a88'); p.ell(11, 15, 2.5, 3, '#3a3a3a'); p.ell(19, 15, 2.5, 3, '#3a3a3a'); p.ell(15, 21, 2.5, 4, '#76766f'); p.rect(12, 26, 6, 1.5, '#4a4a48'); p.ell(8, 30, 3, 5, '#7a7a78'); p.ell(22, 28, 3, 5, '#7a7a78'); p.rect(9, 36, 5, 8 + f, '#6a6a68'); p.rect(16, 36, 5, 8 - f, '#6a6a68'); });
  if (has(/石人|石鳥|巨山/)) return simple(40, 46, p => { const b = has(/巨山/) ? '#8a6a4a' : '#8a8a80'; p.rect(9, 12, 22, 22, b); p.rect(12, 3, 16, 10, tone(b, 12)); p.rect(15, 7, 3, 2, '#f04040'); p.rect(22, 7, 3, 2, '#f04040'); p.rect(2, 14, 7, 16, tone(b, -12)); p.rect(31, 14, 7, 16, tone(b, -12)); p.rect(11, 34, 7, 11 + f, tone(b, -20)); p.rect(22, 34, 7, 11 - f, tone(b, -20)); for (let i = 0; i < 4; i++) p.line(11 + i * 5, 15, 13 + i * 5, 30, tone(b, -30)); });
  if (has(/蜥|蝪/)) return simple(44, 22, p => { const b = has(/火/) ? '#d05020' : '#5a8a4a'; p.ell(20, 12, 12, 5, b); p.ell(35, 10, 6, 4, b); p.rect(37, 8, 1.5, 1.5, '#000'); p.poly([8, 12, 0, 10 + f * 2, 8, 15], b); for (const [x, o] of [[12, f], [26, -f]]) p.poly([x, 15, x - 3, 21 + o, x + 2, 21 + o, x + 3, 15], tone(b, -40)); if (has(/火/)) p.poly([18, 7, 21, 2, 24, 7], '#ffb020'); });
  if (has(/蟾/)) return simple(36, 28, p => { p.ell(18, 17, 13, 9, '#6a7a3a'); p.ell(12, 8, 4, 4, '#6a7a3a'); p.ell(24, 8, 4, 4, '#6a7a3a'); p.ell(12, 8, 2, 2, '#f0e040'); p.ell(24, 8, 2, 2, '#f0e040'); for (const [x, y] of [[14, 15], [20, 19], [24, 14]]) p.ell(x, y, 1.6, 1.6, '#4a5a2a'); p.ell(7, 24 + f, 5, 3, '#5a6a2a'); p.ell(29, 24 - f, 5, 3, '#5a6a2a'); });
  if (has(/燈籠/)) return simple(26, 46, p => { p.rect(12, 0, 2, 5, '#2a2a2a'); p.ell(13, 18, 10, 13, '#3a8a9a'); for (const y of [10, 18, 26]) p.rect(4, y, 18, 1, '#205060'); p.ell(13, 18, 5, 6, '#f0f0a0'); p.rect(9, 31, 8, 3, '#2a2a2a'); p.poly([12, 34, 14, 34, 13 + f, 44], '#c0f0f0'); });
  if (has(/魂|靈|鬼|叉|瘟神|魔|邪念|冰雪神|阿魯塔|杜魯珈|魔奧|執行者/)) {
    const ghost = has(/魂|靈|邪念/);
    const L = { robe: ghost ? '#8a96b8' : has(/冰雪/) ? '#a8d4f4' : has(/瘟/) ? '#4a7a3a' : '#5a2a3a', hat: has(/獨角|叉/) ? 'topknot' : 'helmet', helm: '#3a2a3a', plume: '#f04040', armor: has(/武官|騎馬|神劍/) ? '#4a4a5a' : null,
      weapon: has(/狼牙|刀斧|武官|槍/) ? 'spear' : 'sword', skin: ghost ? '#c8d2ea' : has(/叉|鬼/) ? '#c05040' : '#b4a4a4' };
    const c = hiHumanoid(L, frame);
    if (ghost) { const g = c.getContext('2d'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, c.width, c.height); }
    if (has(/獨角|叉|鬼/) && !ghost) { const g = c.getContext('2d'); g.fillStyle = '#f0e0a0'; g.fillRect(16, 2, 2, 5); }
    return c;
  }
  if (has(/巫|女/)) return hiHumanoid({ robe: has(/死靈|邪/) ? '#4a2a4a' : '#ececec', female: true, top: '#c03030', sash: '#2a4a8a', hat: 'bun', weapon: 'fan' }, frame);
  const robe = has(/黑色商團|黑暗|黑/) ? '#2a2a32' : has(/赤/) ? '#a03020' : has(/山賊|盜|扒手/) ? '#7a5a3a' : '#5a5a6a';
  const weapon = has(/弓/) ? 'bow' : has(/槍/) ? 'spear' : has(/術士|長老|操練/) ? 'fan' : 'sword';
  return hiHumanoid({ robe, hat: has(/長老|縣令/) ? 'gat' : 'bandana', weapon, beard: has(/山賊|長老|頭目/) }, frame);
}
