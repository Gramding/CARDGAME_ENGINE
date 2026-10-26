"use strict";
/* Krarkashima playtester: a light goldfish table that records every action.
   Rules help covers the Krark engine (flips, copies, bounce), cast triggers and the deck's
   common spell effects; everything else is done by hand. Games save to the artifact's db. */

const CARDS = /*CARDS*/[];
const C = Object.fromEntries(CARDS.map(c => [c.n, c]));
if (C["Mindbreak Trap"]) C["Mindbreak Trap"].free_if = "three spells";
if (C["Frantic Search"]) C["Frantic Search"].discard = 2;   // draw two, then discard two, then untap up to three lands
if (C["Snap"]) C["Snap"].bounce = "creature";               // return target creature, untap up to two lands
const HARNFEL = "Harnfel, Horn of Bounty";                   // Birgi's back face: {4}{R} legendary artifact
const IMG = /*IMGS*/{};   // card name -> {f: front image, b: back face, a: artist}, images from Scryfall
let showImg = true;
try { showImg = localStorage.getItem("krark-playtest-images") !== "off"; } catch (e) { /* default on */ }
let pendingArt = null;     // card whose image the next sheet shows
const KRARK = "Krark, the Thumbless", SAKA = "Sakashima of a Thousand Faces";
const BIRGI = "Birgi, God of Storytelling // Harnfel, Horn of Bounty", VIVI = "Vivi Ornitier";
const VEYRAN = "Veyran, Voice of Duality", PRODIGY = "Harmonic Prodigy", KILN = "Storm-Kiln Artist";
const SCOUNDREL = "Tavern Scoundrel", ELECTRO = "Electro, Assaulting Battery", ASHLING = "Ashling, Flame Dancer";
const ARCHMAGE = "Archmage Emeritus", BREACH = "Underworld Breach", OGRE = "Treasonous Ogre", RELIC = "Relic of Legends";
const STAFF = "Wizard's Staff";
const COMMANDERS = [KRARK, SAKA];
const isSpell = n => C[n] && (C[n].k === "instant" || C[n].k === "sorcery");
const short = n => { const c = C[n]; let s = n.split(" // ")[0]; if (c && c.leg && s.includes(",")) s = s.split(",")[0]; return s; };
const $ = id => document.getElementById(id);
/* the game's random numbers come from a seed kept in the game state, so Undo replays the same
   flips and draws instead of rolling new ones */
const rnd = () => {
  if (!S || S.rng == null) return Math.random();
  let t = (S.rng = (S.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let S = null;              // the game state
let bfGroups = {};         // first uid of a tile -> uids of the identical tokens it stands for
let undoStack = [], redoStack = [], parkedRedo = null;
let db = null, downloads = null;
const writeChains = {};    // one write at a time per document

function blankState() {
  return {
    id: "g" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    started: new Date().toISOString(), rng: Math.floor(Math.random() * 4294967296), phase: "mull", turn: 0, storm: 0, landDrop: false,
    life: 40, opp: [{ life: 40, lib: 92 }, { life: 40, lib: 92 }, { life: 40, lib: 92 }], target: 0, oppHand: 6,
    pool: { R: 0, U: 0, C: 0, A: 0 }, treasures: 0, kDelta: 0,
    lib: [], hand: [], bf: [], gy: [], ex: [], cmd: { [KRARK]: 0, [SAKA]: 0 }, cmdZone: [KRARK, SAKA],
    stack: [], mulls: 0, opening: [], kept: null, bottomSel: [], turnLog: [], allTurns: [], result: null, nextId: 1,
    turnStats: newTurnStats(0),
  };
}
function newTurnStats(t) { return { turn: t, casts: 0, instsorc: 0, krarkTriggers: 0, flipsWon: 0, copies: 0, draws: 0, manaMade: 0, treasuresMade: 0, damage: 0 }; }

/* ------------------------------------------------------------------ helpers */
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function snapshotUndo() {
  undoStack.push(JSON.stringify(S));
  let total = undoStack.reduce((a, x) => a + x.length, 0);
  while (undoStack.length > 1 && (undoStack.length > 250 || total > 30e6)) total -= undoStack.shift().length;   // about 60 MB of history at most
  parkedRedo = redoStack; redoStack = []; updateUndoButtons(); }
// a step that turned out to be illegal (not enough mana) leaves no trace, and redo stays available
function dropSnapshot() { undoStack.pop(); if (parkedRedo) redoStack = parkedRedo; parkedRedo = null; updateUndoButtons(); }
function poolStr() { return Object.entries(S.pool).filter(([, v]) => v).map(([k, v]) => k + v).join(" ") || "0"; }
function log(a, extra = {}) {
  const e = { t: S.turn, a, storm: S.storm, pool: poolStr(), tr: S.treasures, hand: S.hand.length, ...extra };
  S.turnLog.push(e);
  renderLog();
  scheduleTurnSave();
}
let turnSaveTimer = null;
function scheduleTurnSave() {
  if (!db || S.phase !== "play") return;
  clearTimeout(turnSaveTimer);
  const turn = S.turn;
  // the delayed save only writes a turn that is still open; ending a turn or the game saves it for good
  turnSaveTimer = setTimeout(() => { if (S.phase === "play" && S.turn === turn) saveTurn(turn, S.turnLog, { ...S.turnStats, open: true }); }, 4000);
}
let toastTimer = null;
function toast(msg, kind = "") {
  const b = $("banner"); b.textContent = msg; b.className = "banner " + kind; b.hidden = false;
  clearTimeout(toastTimer); if (kind !== "bad") toastTimer = setTimeout(() => { b.hidden = true; }, 6000);
}
function onBf(name) { return S.bf.some(p => (p.copyOf || p.name) === name); }
function countBf(name) { return S.bf.filter(p => (p.copyOf || p.name) === name).length; }
function ident(p) { return p.copyOf || p.name; }
const PT = { [KRARK]: [2, 2], [SAKA]: [3, 1], [VIVI]: [0, 3], [VEYRAN]: [2, 2], [PRODIGY]: [1, 3], [KILN]: [2, 2], [ARCHMAGE]: [2, 2], [BIRGI]: [3, 3],
  [SCOUNDREL]: [1, 3], "Ral, Monsoon Mage // Ral, Leyline Prodigy": [1, 3], "Pinnacle Monk // Mystic Peak": [2, 2], "Dualcaster Mage": [2, 2], "Imperial Recruiter": [1, 1],
  [OGRE]: [2, 3], "Samut, Tyrant of Naktamun": [2, 1], [ELECTRO]: [2, 3], [ASHLING]: [4, 4], "Simian Spirit Guide": [2, 2], "Phyrexian Metamorph": [0, 0] };
const PROWESS = [PRODIGY, "Pinnacle Monk // Mystic Peak"];
function pumpOf(p) { return p.pump && p.pump.turn === S.turn ? p.pump.n : 0; }
function pump(p, n) { p.pump = { turn: S.turn, n: pumpOf(p) + n }; }
function toughness(p) { const b = PT[ident(p)]; return b ? b[1] + (p.counters || 0) + pumpOf(p) : 1; }
function power(p) { const b = PT[ident(p)]; return b ? b[0] + (p.counters || 0) + pumpOf(p) : 0; }
function dmgOf(p) { return p.dmg && p.dmg.turn === S.turn ? p.dmg.n : 0; }
/* a permanent leaves the battlefield: commanders that die or get exiled go to the command zone */
function leaveBf(p, to, why) {
  if (!S.bf.includes(p)) return;
  S.bf = S.bf.filter(x => x !== p);
  if (!p.token) {
    if (COMMANDERS.includes(p.name) && to !== "hand") S.cmdZone.push(p.name);
    else if (to === "hand") S.hand.push(p.name); else if (to === "exile") S.ex.push({ n: p.name }); else S.gy.push(p.name);
  }
  log(to === "die" ? "dies" : to, { c: short(p.name), why });
  bounceCleanup(p);
}
function damagePerm(p, n, src) {
  if (isRalPW(p)) { p.loyalty = Math.max(0, (p.loyalty || 0) - n); log("damage", { c: "Ral", from: short(src), amount: n, loyalty: p.loyalty }); if (!p.loyalty) leaveBf(p, "die", "no loyalty"); return; }
  p.dmg = { turn: S.turn, n: dmgOf(p) + n };
  const t = toughness(p), dead = dmgOf(p) >= t;
  log("damage", { c: short(p.name) + (p.copyOf && p.copyOf !== p.name ? " as " + short(p.copyOf) : ""), from: short(src), amount: n, marked: dmgOf(p), toughness: t, dies: dead || undefined });
  if (dead) { leaveBf(p, "die", "lethal damage"); toast(`${short(p.name)} took lethal damage and died.`, "warn"); }
}
/* targets: an opponent, one of your creatures or Ral, or something of an opponent's the page does not track */
function targetLabel(t) {
  if (!t) return "";
  if (t.kind === "opp") return `opponent ${t.i + 1}`;
  if (t.kind === "perm") { const p = S.bf.find(x => x.uid === t.uid); return p ? short(p.name) + (p.copyOf && p.copyOf !== p.name ? " as " + short(p.copyOf) : "") : t.label + " (gone)"; }
  return "an opponent's permanent";
}
async function chooseTarget(title, dmg, pre) {
  const opts = [];
  S.opp.forEach((o, i) => { if (o.life > 0 && o.lib > 0) opts.push({ t: { kind: "opp", i }, label: `Opponent ${i + 1} · ${o.life} life` }); });
  for (const p of S.bf) {
    if (isCreatureP(p)) opts.push({ t: { kind: "perm", uid: p.uid, label: short(p.name) }, label: `${short(p.name)}${p.copyOf && p.copyOf !== p.name ? " as " + short(p.copyOf) : ""}${p.token ? " token" : ""} · ${power(p)}/${toughness(p)}${dmgOf(p) ? ", " + dmgOf(p) + " damage" : ""}${dmgOf(p) + dmg >= toughness(p) ? " · dies" : ""}` });
    else if (isRalPW(p)) opts.push({ t: { kind: "perm", uid: p.uid, label: "Ral" }, label: `Ral, Leyline Prodigy · loyalty ${p.loyalty || 0}` });
  }
  opts.push({ t: { kind: "other" }, label: "An opponent's creature or planeswalker" });
  let picked = (pre && opts.find(o => JSON.stringify(o.t) === JSON.stringify(pre))) || opts.find(o => o.t.kind === "opp" && o.t.i === S.target) || opts[0];
  const wrap = document.createElement("div"); wrap.className = "picklist";
  opts.forEach(o => { const b = document.createElement("button"); b.className = "pick" + (o === picked ? " sel" : "") + (o.t.kind === "perm" ? " mine" : ""); b.textContent = o.label; b.onclick = () => { picked = o; [...wrap.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); }; wrap.append(b); });
  const v = await openSheet(title, wrap, [["Target it", "go", "primary"]]);
  return v === "go" || v === null ? picked.t : picked.t;
}
function dealDamage(t, n, src) {
  t = t || { kind: "opp", i: S.target };
  if (t.kind === "opp") { const o = S.opp[t.i]; o.life -= n; S.turnStats.damage += n; log("damage", { from: short(src), amount: n, target: `opponent ${t.i + 1}`, life: o.life }); return true; }
  if (t.kind === "perm") { const p = S.bf.find(x => x.uid === t.uid); if (!p) { log("fizzle", { c: short(src), note: `${t.label} is gone` }); return false; } damagePerm(p, n, src); return true; }
  log("damage", { from: short(src), amount: n, target: "an opponent's permanent" }); return true;
}
function isRalPW(p) { return !!p.flipped && p.name === "Ral, Monsoon Mage // Ral, Leyline Prodigy"; }
function isCreatureP(p) { return (C[ident(p)] || {}).k === "creature" && !p.flipped; }
function typesOf(p) { return (C[ident(p)] && C[ident(p)].ty) || []; }
function sakaOut() { return S.bf.some(p => p.name === SAKA); }
function commanderOut() { return S.bf.some(p => COMMANDERS.includes(p.name)); }
function mult(p, castCaused) {
  let m = 1;
  if (castCaused) m += countBf(VEYRAN);
  const ty = typesOf(p);
  if (ty.includes("Wizard") || ty.includes("Shaman")) m += countBf(PRODIGY) - (ident(p) === PRODIGY ? 1 : 0);
  if (p.staff) m += 1;
  return m;
}
function krarkPerms() { let ks = S.bf.filter(p => ident(p) === KRARK); if (ks.length > 1 && !sakaOut()) ks = ks.slice(0, 1); return ks; }
function krarkAuto() { return krarkPerms().reduce((s, p) => s + mult(p, true), 0); }
/* 100 Krark triggers on one spell can't realistically fail, so the count stops there and the game calls it a won position */
const KRARK_CAP = 100;
function krarkRaw() { return Math.max(0, krarkAuto() + S.kDelta); }
function krarkTriggers() { return Math.min(KRARK_CAP, krarkRaw()); }
function sumMult(name, castCaused = true) { return S.bf.filter(p => ident(p) === name && !p.flipped).reduce((s, p) => s + mult(p, castCaused), 0); }
function addMana(color, n = 1, why = "") { S.pool[color] += n; S.turnStats.manaMade += n; }
function addTreasure(n) { S.treasures += n; S.turnStats.treasuresMade += n; }
function aliveOpps() { return S.opp.map((o, i) => i).filter(i => S.opp[i].life > 0 && S.opp[i].lib > 0); }
function damageEach(n) { for (const i of aliveOpps()) { S.opp[i].life -= n; S.turnStats.damage += n; } }
function damageTarget(n) { const i = S.target; S.opp[i].life -= n; S.turnStats.damage += n; }

/* parse a cost like "1RU", "R{R/P}" into {g, R, U, phy} */
function parseCost(s) {
  const out = { g: 0, R: 0, U: 0, phy: null };
  if (!s) return out;
  const m = s.match(/\{(R|U)\/P\}/); if (m) { out.phy = m[1]; s = s.replace(m[0], ""); }
  const g = s.match(/^\d+/); if (g) { out.g = +g[0]; s = s.slice(g[0].length); }
  for (const ch of s) if (ch === "R" || ch === "U") out[ch]++;
  return out;
}

/* ------------------------------------------------------------------ mana payment */
const PAIN = { "Mana Confluence": 1, "City of Brass": 1, "Fiery Islet": 1, "Ancient Tomb": 2 };   // Shivan Reef hurts for coloured mana only
const FETCH = { "Arid Mesa": "M", "Bloodstained Mire": "M", "Wooded Foothills": "M", "Flooded Strand": "I", "Misty Rainforest": "I", "Polluted Delta": "I", "Scalding Tarn": "IM" };
const TYPED_DUALS = ["Volcanic Island", "Steam Vents", "Thundering Falls"];   // Island Mountain
const HIGH_POWER = [SAKA, VEYRAN, BIRGI, ASHLING];                          // power 3+, out of Imperial Recruiter's reach
function fetchTargets(f) {
  const t = FETCH[f] || "";
  return [...new Set(S.lib.filter(n => TYPED_DUALS.includes(n) || (n === "Island" && t.includes("I")) || (n === "Mountain" && t.includes("M"))))];
}
function cardColors(n) { const c = (C[n] || {}).c || ""; return (c.includes("R") ? "R" : "") + (c.includes("U") ? "U" : ""); }
function amberColors() {
  let out = "";
  for (const q of S.bf) { const c = C[ident(q)] || {}; if (c.leg && c.k === "creature" && !q.flipped) for (const ch of cardColors(ident(q))) if (!out.includes(ch)) out += ch; }
  return out;
}
function drumCreature() {
  return S.bf.filter(q => !q.tapped && isCreatureP(q))
    .sort((a, b) => !!(C[ident(a)] || {}).leg - !!(C[ident(b)] || {}).leg)[0];   // keep legends free for Relic of Legends
}
function sourceColors(p) {
  const id = ident(p), c = C[id] || {};
  if (p.landColor) return p.landColor;
  if (FETCH[id]) return "";
  if (id === "Chrome Mox") return p.imprint ? cardColors(p.imprint) : "";
  if (id === "Mox Amber") return amberColors();
  if (id === "Gemstone Caverns") return p.luck ? "UR" : "C";
  if (c.k === "land" || p.asLand) return (p.asLand ? C[p.name].mdfc : c.mana) || "C";
  return c.mana || "";
}
function isManaSource(p) {
  if (p.tapped || !sourceColors(p)) return false;
  if (ident(p) === "Springleaf Drum" && !drumCreature()) return false;
  return true;
}
function painFor(p, make) { const id = ident(p); return id === "Shivan Reef" ? (make === "C" ? 0 : 1) : (PAIN[id] || 0); }
function tapFor(p, color) {
  const id = ident(p), c = C[id] || {};
  const amt = (p.asLand ? 1 : c.amt) || 1;
  const cols = sourceColors(p);
  let make;
  if (color !== "G" && cols.includes(color)) make = color;
  else if (cols.includes("C")) make = "C";
  else make = cols.includes("R") ? "R" : (cols[0] || "C");
  p.tapped = true;
  const out = { make, pain: painFor(p, make) };
  if (id === "Springleaf Drum") { const cr = drumCreature(); if (cr) { cr.tapped = true; out.drum = short(cr.name); } }
  if (out.pain) S.life -= out.pain;
  addMana(make, amt);
  if (c.sac) { S.bf = S.bf.filter(q => q !== p); if (!p.token) S.gy.push(p.name); }
  return out;
}
/* lower is better: free single-colour sources first, then painlands, Drum, Vault, and one-shot Petal last */
function srcScore(p, color) {
  const id = ident(p);
  let sc = sourceColors(p).length;
  if (color === "G" && sourceColors(p) === "C") sc -= 2;
  if (painFor(p, color === "G" ? (sourceColors(p).includes("C") ? "C" : "R") : color)) sc += 3;
  if (id === "Springleaf Drum") sc += 4;
  if (id === "Mana Vault") sc += 2;
  if ((C[id] || {}).sac) sc += 6;
  return sc;
}
/* fetch a land that taps for the colour right away; Falls enters tapped so it never helps here */
function bestFetchTarget(f, color) {
  const order = ["Volcanic Island", "Steam Vents", color === "U" ? "Island" : "Mountain", color === "U" ? "Mountain" : "Island", "Thundering Falls"];
  const t = fetchTargets(f);
  return order.find(n => t.includes(n) && n !== "Thundering Falls" && (color === "G" || n === "Volcanic Island" || n === "Steam Vents" || (C[n].mana || "").includes(color)));
}
function enterLand(name, opts = {}) {
  const c = C[name] || {}, p = { uid: S.nextId++, name, tapped: !!c.etb_tapped };
  if (name === "Steam Vents") { if (opts.shock === false) p.tapped = true; else { S.life -= 2; p.paidLife = 2; } }
  S.bf.push(p);
  return p;
}
function crackFetch(f, target, opts = {}) {
  S.bf = S.bf.filter(q => q !== f); S.gy.push(f.name); S.life -= 1;
  S.lib.splice(S.lib.indexOf(target), 1); shuffle(S.lib);
  const land = enterLand(target, opts);
  log("fetch", { c: short(f.name), got: short(target), life: -1 - (land.paidLife || 0), tapped: land.tapped || undefined, auto: opts.auto || undefined });
  return land;
}
/* pay from the pool first, then untapped lands / rocks (single-colour first), then treasures */
function autoPay(cost, dry) {
  const saved = JSON.stringify(S);
  const tapped = [];
  let pain = 0;
  const use = (p, color) => { const r = tapFor(p, color); pain += r.pain; tapped.push(short(p.name) + (r.drum ? ` (Drum: ${r.drum})` : "")); };
  const crack = color => {
    for (const f of S.bf.filter(q => FETCH[q.name] && !q.tapped)) {
      const t = bestFetchTarget(f.name, color);
      if (t) { const land = crackFetch(f, t, { auto: true }); pain += 1 + (land.paidLife || 0); return true; }
    }
    return false;
  };
  const inf = S.inf || {};
  /* Relic of Legends: tap an untapped legendary creature for any colour (temporary tokens first) */
  const relic = color => {
    if (!onBf(RELIC)) return false;
    const leg = S.bf.filter(q => !q.tapped && isCreatureP(q) && (C[ident(q)] || {}).leg).sort((a, b) => !!b.temp - !!a.temp || !!b.token - !!a.token)[0];
    if (!leg) return false;
    leg.tapped = true; addMana(color === "G" ? "R" : color, 1); tapped.push(`Relic: ${short(ident(leg))}${leg.token ? " token" : ""}`); return true;
  };
  const take = color => {
    if (inf[color] || inf.A || inf.T) return true;
    if (S.pool[color] > 0) { S.pool[color]--; return true; }
    if (S.pool.A > 0) { S.pool.A--; return true; }
    const srcs = S.bf.filter(p => isManaSource(p) && sourceColors(p).includes(color)).sort((a, b) => srcScore(a, color) - srcScore(b, color));
    if (srcs.length) { use(srcs[0], color); return take(color); }
    if (crack(color)) return take(color);
    if (relic(color)) return take(color);
    if (S.treasures > 0) { S.treasures--; tapped.push("Treasure"); addMana(color, 1); return take(color); }
    return false;
  };
  const takeAny = () => {
    if (inf.R || inf.U || inf.C || inf.A || inf.T) return true;
    for (const k of ["C", "A", "R", "U"]) if (S.pool[k] > 0) { S.pool[k]--; return true; }
    const srcs = S.bf.filter(isManaSource).sort((a, b) => srcScore(a, "G") - srcScore(b, "G"));
    if (srcs.length) { use(srcs[0], "G"); return takeAny(); }
    if (crack("G")) return takeAny();
    if (relic("G")) return takeAny();
    if (S.treasures > 0) { S.treasures--; tapped.push("Treasure"); addMana("R", 1); return takeAny(); }
    return false;
  };
  let ok = true, lifePaid = 0;
  if (cost.phy) {
    if (cost.phyLife) { S.life -= 2; lifePaid = 2; }
    else cost = { ...cost, [cost.phy]: cost[cost.phy] + 1 };
  }
  for (const col of ["R", "U"]) for (let i = 0; i < cost[col] && ok; i++) ok = take(col);
  for (let i = 0; i < cost.g && ok; i++) ok = takeAny();
  if (dry || !ok) S = JSON.parse(saved);
  return { ok, tapped, lifePaid: lifePaid + pain };
}
function availableMana() {
  const relicLegends = onBf(RELIC) ? S.bf.filter(q => !q.tapped && isCreatureP(q) && (C[ident(q)] || {}).leg).length : 0;
  return Object.values(S.pool).reduce((a, b) => a + b, 0) + S.treasures + relicLegends + S.bf.filter(p => FETCH[p.name] && !p.tapped && fetchTargets(p.name).length).length +
    S.bf.filter(isManaSource).reduce((s, p) => s + ((p.asLand ? 1 : (C[ident(p)] || {}).amt) || 1), 0);
}

/* ------------------------------------------------------------------ game flow */
function newGame() {
  S = blankState(); undoStack = []; redoStack = []; updateUndoButtons();
  S.lib = shuffle(CARDS.map(c => c.n).filter(n => !COMMANDERS.includes(n)));
  dealSeven();
  saveLocal(); render();
  toast("New game. Keep or mulligan; the first mulligan is free.");
}
function dealSeven() {
  S.lib.push(...S.hand); S.hand = []; shuffle(S.lib);
  S.hand = S.lib.splice(0, 7);
  S.opening.push([...S.hand]);
}
function mulligan() {
  snapshotUndo();
  S.mulls++;
  S.bottomSel = [];   // a fresh hand starts with nothing picked for the bottom
  dealSeven();
  S.turnLog.push({ t: 0, a: "mulligan", n: S.mulls, hand: [...S.hand] });
  render();
}
function bottomCount() { return Math.max(0, S.mulls - 1); }
async function keep() {
  const need = bottomCount();
  S.bottomSel = S.bottomSel.filter(n => S.hand.includes(n));
  if (S.bottomSel.length !== need) { toast(`Pick ${need} card${need === 1 ? "" : "s"} to put on the bottom (tap them in your hand).`, "warn"); return; }
  snapshotUndo();
  for (const n of S.bottomSel) { S.hand.splice(S.hand.indexOf(n), 1); S.lib.push(n); }
  S.kept = [...S.hand]; S.bottomSel = [];
  S.turnLog.push({ t: 0, a: "keep", mulligans: S.mulls, kept: [...S.kept] });
  const GC = "Gemstone Caverns";
  if (S.hand.includes(GC) && S.hand.length > 1) {
    const others = S.hand.filter(n => n !== GC);
    let picked = null;
    const list = cardList(others, (n, i, b) => { picked = n; [...list.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); });
    pendingArt = GC;
    const v = await openSheet("On the draw? Start with Gemstone Caverns in play with a luck counter and exile a card from your hand.", list, [["Start with it", "go", "primary"], ["No, I'm on the play", null]]);
    if (v === "go" && picked) {
      S.hand.splice(S.hand.indexOf(GC), 1); S.hand.splice(S.hand.indexOf(picked), 1);
      S.ex.push({ n: picked }); S.bf.push({ uid: S.nextId++, name: GC, tapped: false, luck: true });
      S.turnLog.push({ t: 0, a: "Gemstone Caverns", luck: true, exiled: short(picked) });
    }
  }
  S.phase = "play";
  startTurn();
  saveGameMeta();
}
function startTurn() {
  S.turn++;
  S.storm = 0; S.landDrop = false;
  S.turnStats = newTurnStats(S.turn);
  S.ashlingRes = 0;
  for (const p of S.bf) if (ident(p) !== "Mana Vault") p.tapped = false;   // Mana Vault stays tapped unless you pay {4}
  const vaults = S.bf.filter(p => ident(p) === "Mana Vault" && p.tapped);
  if (vaults.length) { S.life -= vaults.length; log("Mana Vault", { life: -vaults.length, note: "tapped at draw step" }); }
  draw(1, "draw step");
  render();
}
function endTurn() {
  // end step: Breach is sacrificed, Twinflame / Molten tokens go away, red mana stays with Electro / Ashling
  const breach = S.bf.filter(p => p.name === BREACH);
  if (breach.length) { S.bf = S.bf.filter(p => p.name !== BREACH); S.gy.push(BREACH); }
  S.bf = S.bf.filter(p => !p.temp);
  const keepRed = onBf(ELECTRO) || onBf(ASHLING);
  S.pool = { R: keepRed ? S.pool.R : 0, U: 0, C: 0, A: 0 };
  if (S.inf) { S.inf = { T: S.inf.T, life: S.inf.life, R: keepRed && S.inf.R }; }   // mana empties, Treasures stay
  S.loop = null; S.ralPlus = null;
  for (const e of S.ex) if (e.play && e.until <= S.turn) e.play = false;
  log("end turn", { stats: { ...S.turnStats } });
  clearTimeout(turnSaveTimer);
  saveTurn(S.turn, S.turnLog, { ...S.turnStats });
  S.allTurns.push({ turn: S.turn, events: S.turnLog, stats: { ...S.turnStats } });
  S.turnLog = [];
}
function nextTurn() { if (S.stack.length) { toast("Resolve or clear the stack before passing the turn.", "warn"); return; } snapshotUndo(); endTurn(); for (const o of S.opp) if (o.lib > 0) o.lib--; startTurn(); saveGameMeta(); saveLocal(); }
function draw(n, why = "draw") {
  const got = [];
  for (let i = 0; i < n; i++) {
    if (!S.lib.length) { toast("Your library is empty. Drawing now would lose the game.", "bad"); break; }
    const c = S.lib.shift(); S.hand.push(c); got.push(c); S.turnStats.draws++;
  }
  if (got.length) log(why, { cards: got.map(short) });
  return got;
}

/* ------------------------------------------------------------------ casting */
const RAL = "Ral, Monsoon Mage // Ral, Leyline Prodigy";
/* ------------------------------------------------------------------ the stack
   S.stack holds spells, copies and triggered abilities; the last item is the top and resolves first.
   Triggers that trigger at the same time are ordered by the player before they go on the stack. */
const MONK = "Pinnacle Monk // Mystic Peak", DUAL = "Dualcaster Mage", RECRUITER = "Imperial Recruiter";
const TRIG = {
  birgi:      { nm: "Birgi", src: BIRGI, rank: 0, label: () => "Birgi: add R" },
  electro:    { nm: "Electro", src: ELECTRO, rank: 0, label: () => "Electro: add R" },
  scoundrel:  { nm: "Scoundrel", src: SCOUNDREL, rank: 1, label: () => "Tavern Scoundrel: 2 Treasures" },
  kiln:       { nm: "Kiln", src: KILN, rank: 1, label: () => "Storm-Kiln Artist: Treasure" },
  archmage:   { nm: "Archmage", src: ARCHMAGE, rank: 2, label: () => "Archmage Emeritus: draw a card" },
  vivi:       { nm: "Vivi", src: VIVI, rank: 3, label: () => "Vivi: +1 counter, 1 damage to each opponent" },
  ral:        { nm: "Ral", src: RAL, rank: 4, label: () => "Ral: flip a coin" },
  ralp1:      { nm: "Ral +1", src: RAL, rank: 6, label: () => "Ral +1: instants and sorceries cost {1} less until your next turn" },
  ralm2:      { nm: "Ral −2", src: RAL, rank: 6, label: () => "Ral −2: 2 damage, draw if you control another blue permanent" },
  electroX:   { nm: "Electro", src: ELECTRO, rank: 5, label: () => "Electro left: pay X, X damage to target player" },
  ralm8:      { nm: "Ral −8", src: RAL, rank: 6, label: () => "Ral −8: exile the top eight, cast instants and sorceries free" },
  ashling:    { nm: "Ashling", src: ASHLING, rank: 5, label: () => "Ashling: discard, then draw" },
  monk:       { nm: "Monk", src: MONK, rank: 6, label: () => "Pinnacle Monk: return an instant or sorcery" },
  dualcaster: { nm: "Dualcaster", src: DUAL, rank: 6, label: () => "Dualcaster Mage: copy a spell" },
  recruiter:  { nm: "Recruiter", src: RECRUITER, rank: 6, label: () => "Imperial Recruiter: find a creature" },
  storm:      { nm: "Storm", rank: 8, label: it => `Storm: ${it.count} cop${it.count === 1 ? "y" : "ies"} of ${short(it.name)}` },
  krark:      { nm: "Krark", src: KRARK, rank: 9, label: it => `Krark: flip for ${short(it.name)}` },
};
const ETB_TRIG = { [MONK]: "monk", [DUAL]: "dualcaster", [RECRUITER]: "recruiter" };
let holdPriority = false, askOrder = true, quiet = false;
try { holdPriority = localStorage.getItem("krark-playtest-hold") === "on"; askOrder = localStorage.getItem("krark-playtest-ask-order") !== "off"; } catch (e) { /* defaults */ }
function setPref(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* per-browser only */ } }
function orderPref() { try { return JSON.parse(localStorage.getItem("krark-playtest-order") || "[]"); } catch (e) { return []; } }

function trig(eff, extra = {}) { return { id: S.nextId++, kind: "trigger", eff, ...extra }; }
function stackLabel(it) {
  if (it.kind === "trigger") return TRIG[it.eff].label(it) + (it.copied ? " (copy)" : "");
  const tg = it.target ? " → " + targetLabel(it.target) : "";
  if (it.kind === "copy") return `Copy of ${short(it.name)}${tg}`;
  return short(it.name) + tg;
}
function stackArt(it) { return it.kind === "trigger" ? (TRIG[it.eff].src || it.name) : it.name; }
function summarize(items) {
  const out = [];
  for (const t of items) { const nm = t.kind === "trigger" ? TRIG[t.eff].nm : stackLabel(t); const last = out[out.length - 1]; if (last && last[0] === nm) last[1]++; else out.push([nm, 1]); }
  return out.map(([n, k]) => k > 1 ? `${n} ×${k}` : n).join(", ");
}

function castTriggerItems(name, item) {
  const c = C[name], isIS = isSpell(name), out = [], noncreature = c.k !== "creature" || item.back;
  for (const p of S.bf) {
    const id = ident(p), m = mult(p, isIS);
    const add = eff => { for (let i = 0; i < m; i++) out.push(trig(eff, { src: p.uid })); };
    if (id === BIRGI && !p.flipped) add("birgi");
    else if (id === ELECTRO && isIS) add("electro");
    else if (id === VIVI && noncreature) add("vivi");
    else if (id === RAL && isIS && !p.flipped) add("ral");
    if (noncreature && isCreatureP(p)) { const pw = (PROWESS.includes(id) ? 1 : 0) + (p.staff ? 1 : 0); if (pw) pump(p, pw * m); }
  }
  if (isIS) {
    const k = krarkTriggers();
    if (krarkRaw() >= KRARK_CAP && !S.unfailable) { S.unfailable = true; log("Krark cap", { triggers: krarkRaw(), note: "100+ Krark triggers: unfailable" }); }
    for (let i = 0; i < k; i++) out.push(trig("krark", { name, spellId: item.id, mode: item.mode, target: item.target }));
    S.turnStats.krarkTriggers += k;
    out.push(...magecraftItems());
    if (c.storm && S.storm > 1) out.push(trig("storm", { name, count: S.storm - 1, mode: item.mode }));
  }
  return out;
}
/* Magecraft: whenever you cast or copy an instant or sorcery */
function magecraftItems() {
  const out = [];
  for (const p of S.bf) {
    const id = ident(p), eff = id === KILN ? "kiln" : id === ARCHMAGE ? "archmage" : id === ASHLING ? "ashling" : null;
    if (id === VEYRAN && isCreatureP(p)) pump(p, mult(p, true));
    if (eff) for (let i = 0, m = mult(p, true); i < m; i++) out.push(trig(eff, { src: p.uid }));
  }
  return out;
}
function flipWonItems() { const out = []; for (const p of S.bf) if (ident(p) === SCOUNDREL) for (let i = 0, m = mult(p, false); i < m; i++) out.push(trig("scoundrel", { src: p.uid })); return out; }

function rankOf(eff, pref) { const i = pref.indexOf(eff); return i >= 0 ? i : 100 + TRIG[eff].rank; }
async function putTriggers(items, why) {
  if (!items.length) return;
  const pref = orderPref();
  let order = [...items].sort((a, b) => rankOf(a.eff, pref) - rankOf(b.eff, pref));   // first in the list resolves first
  const asked = askOrder && !quiet && new Set(order.map(t => t.eff)).size > 1;
  if (asked) order = await orderSheet(order, why);
  for (let i = order.length - 1; i >= 0; i--) S.stack.push(order[i]);
  if (order.length > 1) log("triggers", { why, order: summarize(order), chosen: asked || undefined });
}
async function orderSheet(order, why) {
  const list = [];   // groups of the same kind of trigger, moved as blocks
  for (const t of order) { const g = list.find(x => x.eff === t.eff); if (g) g.items.push(t); else list.push({ eff: t.eff, items: [t] }); }
  const wrap = document.createElement("div"); wrap.className = "orderlist";
  const mk = (label, disabled, fn, aria) => { const b = document.createElement("button"); b.className = "mini"; b.textContent = label; b.disabled = disabled; b.setAttribute("aria-label", aria); b.onclick = fn; return b; };
  const paint = () => {
    wrap.innerHTML = `<p class="info">The top row resolves first. Triggers of the same kind stay together.</p>`;
    list.forEach((g, i) => {
      const t = g.items[0], row = document.createElement("div"); row.className = "orow";
      const art = stackArt(t);
      row.innerHTML = `<span class="onum">${i + 1}</span>${hasArt(art) ? `<img class="othumb" src="${IMG[art].f}" alt="">` : ""}<span class="olab">${esc(stackLabel(t))}${g.items.length > 1 ? ` <b>×${g.items.length}</b>` : ""}</span>`;
      row.append(
        mk("↑", i === 0, () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; paint(); }, "Move up"),
        mk("↓", i === list.length - 1, () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; paint(); }, "Move down"),
        mk("First", i === 0, () => { list.unshift(list.splice(i, 1)[0]); paint(); }, "Resolve first"));
      wrap.append(row);
    });
  };
  paint();
  const v = await openSheet(`Order triggers${why ? ": " + why : ""}`, wrap, [["Put them on the stack", "go", "primary"], ["Always use this order", "always"]]);
  const seen = list.map(g => g.eff);
  setPref("krark-playtest-order", JSON.stringify([...seen, ...orderPref().filter(e => !seen.includes(e))]));
  if (v === "always") { askOrder = false; setPref("krark-playtest-ask-order", "off"); toast("Triggers now go on in this order without asking. Turn asking back on under the turn buttons.", "win"); }
  return list.flatMap(g => g.items);
}

/* ------------------------------------------------------------------ loops and repeated casts */
const METRIC_NAMES = { R: "R", U: "U", C: "C", A: "any", treasures: "Treasures", storm: "storm", life: "life", hand: "hand", lib: "library", gy: "graveyard", draws: "draws", copies: "copies", flipsWon: "flips won", krarkTriggers: "Krark triggers", casts: "casts", damage: "damage dealt" };
function metrics() {
  const m = { ...S.pool, treasures: S.treasures, storm: S.storm, life: S.life, hand: S.hand.length, lib: S.lib.length, gy: S.gy.length };
  for (const k of ["draws", "copies", "flipsWon", "krarkTriggers", "casts", "damage"]) m[k] = S.turnStats[k] || 0;
  S.opp.forEach((o, i) => { m["o" + i + "life"] = o.life; m["o" + i + "lib"] = o.lib; });
  return m;
}
function deltaOf(a, b) { const d = {}; for (const k in b) if (b[k] !== a[k]) d[k] = b[k] - a[k]; return d; }
function fmtDelta(d) {
  return Object.entries(d).map(([k, v]) => {
    const o = k.match(/^o(\d)(life|lib)$/);
    const nm = o ? `opponent ${+o[1] + 1} ${o[2] === "life" ? "life" : "library"}` : METRIC_NAMES[k] || k;
    return `${nm} ${v > 0 ? "+" : ""}${v}`;
  }).join(", ") || "no change";
}
function boardSig() { return S.bf.map(p => `${short(ident(p))}${p.token ? " token" : ""}${p.tapped ? " (tapped)" : ""}`).sort(); }
function sigDiff(a, b) {
  const rest = [...b], gone = [];
  for (const x of a) { const i = rest.indexOf(x); if (i >= 0) rest.splice(i, 1); else gone.push(x); }
  return { gone, added: rest };
}
function loopToggle() {
  if (!S.loop) {
    snapshotUndo();
    S.loop = { m: metrics(), sig: boardSig(), stack: S.stack.length, logLen: S.turnLog.length, turn: S.turn };
    log("loop start", {});
    toast("Recording a loop. Play one full iteration, then press End loop.", "win");
    render(); saveLocal(); return;
  }
  endLoop();
}
async function endLoop() {
  const L = S.loop;
  if (L.turn !== S.turn) { S.loop = null; toast("The loop started on another turn, so it was dropped.", "warn"); render(); return; }
  const d = deltaOf(L.m, metrics()), diff = sigDiff(L.sig, boardSig());
  const steps = S.turnLog.slice(L.logLen + 1).filter(e => ["cast", "Krark flip", "resolve", "tap", "copy", "equip Staff", "triggers"].includes(e.a) || e.a.startsWith("Ral")).map(e => e.a + (e.c ? " " + e.c : "") + (e.flip ? " " + e.flip : ""));
  const same = !diff.gone.length && !diff.added.length && S.stack.length === L.stack;
  const box = document.createElement("div"); box.className = "form";
  box.innerHTML = `<p class="info" style="margin:0">Net change per iteration: <b>${esc(fmtDelta(d))}</b></p>
    <p class="info" style="margin:0">${same ? "The board is back where it started, so this repeats." : esc(`Board changed: ${diff.gone.length ? "gone " + diff.gone.join(", ") : ""}${diff.gone.length && diff.added.length ? "; " : ""}${diff.added.length ? "new " + diff.added.join(", ") : ""}${S.stack.length !== L.stack ? "; stack size differs" : ""}. Check that it really repeats.`)}</p>
    <label for="loopName">Name (optional)</label><input id="loopName" placeholder="e.g. Twinflame + Relic Krark army">
    <label for="loopN">Repeat how many more times?</label><input id="loopN" type="number" min="1" value="10" inputmode="numeric">`;
  const v = await openSheet("End loop", box, [["Mark as infinite", "inf", "primary"], ["Repeat the number above", "rep"], ["Just mark it", "mark"], ["Keep recording", "keep"], ["Drop the loop", "drop"]]);
  if (!v || v === "keep") return;
  const name = ($("loopName") && $("loopName").value.trim()) || undefined;
  const n = Math.max(1, Math.floor(+($("loopN") && $("loopN").value) || 1));
  snapshotUndo();
  S.loop = null;
  if (v === "drop") { log("loop dropped", {}); render(); saveLocal(); return; }
  const entry = { name, perIteration: fmtDelta(d), board: same ? "repeats" : "changed", steps: steps.slice(0, 60) };
  if (v === "rep") entry.iterations = 1 + applyRepeats(d, n);
  else if (v === "inf") { entry.iterations = "∞"; entry.infinite = applyInfinite(d); }
  else entry.iterations = 1;
  log("loop", entry);
  toast(v === "inf" ? `Loop marked infinite: ${entry.infinite.join(", ") || "nothing grows, so nothing changed"}.` : v === "rep" ? `Loop ran ${entry.iterations} times in total.` : "Loop marked in the log.", "win");
  render(); saveLocal();
}
/* apply the per-iteration change n more times, stopping early when a resource would run out */
function applyRepeats(d, n) {
  const cur = metrics(); let times = n;
  for (const k of ["R", "U", "C", "A", "treasures", "life", "lib"]) if ((d[k] || 0) < 0 && !(S.inf && S.inf[k === "treasures" ? "T" : k])) times = Math.min(times, Math.floor((cur[k] - (k === "life" ? 1 : 0)) / -d[k]));
  times = Math.max(0, times);
  for (const k of ["R", "U", "C", "A"]) if (d[k]) S.pool[k] = Math.max(0, S.pool[k] + d[k] * times);
  if (d.treasures) { if (d.treasures > 0) addTreasure(d.treasures * times); else S.treasures += d.treasures * times; }
  if (d.storm) S.storm += d.storm * times;
  if (d.life) S.life += d.life * times;
  for (const k of ["copies", "flipsWon", "krarkTriggers", "casts", "damage"]) if (d[k]) S.turnStats[k] += d[k] * times;
  S.opp.forEach((o, i) => { if (d["o" + i + "life"]) o.life += d["o" + i + "life"] * times; if (d["o" + i + "lib"]) o.lib = Math.max(0, o.lib + d["o" + i + "lib"] * times); });
  if (d.draws > 0) draw(d.draws * times, "loop draws");
  if (times < n) toast(`Only ${times} more iterations fit before something ran out.`, "warn");
  return times;
}
/* everything that grows each iteration becomes unbounded */
function applyInfinite(d) {
  S.inf = S.inf || {};
  const out = [];
  for (const k of ["R", "U", "C", "A"]) if (d[k] > 0) { S.inf[k] = true; out.push(k + " mana"); }
  if (d.treasures > 0) { S.inf.T = true; out.push("Treasures"); }
  if (d.storm > 0) {
    S.inf.storm = true; out.push("storm");
    const bf = S.hand.includes("Brain Freeze") || (onBf(BREACH) && S.gy.includes("Brain Freeze"));
    if (bf) { S.opp.forEach(o => { o.lib = 0; }); out.push("Brain Freeze with infinite storm mills every opponent"); }
  }
  if (d.life > 0) { S.inf.life = true; out.push("life"); }
  if (d.draws > 0) { S.inf.draw = true; out.push("draws (take what you need with Search library)"); }
  if (d.copies > 0 || d.flipsWon > 0) { S.inf.copies = true; out.push("copies"); }
  S.opp.forEach((o, i) => {
    if (d["o" + i + "life"] < 0 && o.life > 0) { o.life = 0; out.push(`opponent ${i + 1} dies to damage`); }
    if (d["o" + i + "lib"] < 0 && o.lib > 0) { o.lib = 0; out.push(`opponent ${i + 1} milled out`); }
  });
  return out;
}
/* every way a card can be paid for, for the repeat menu */
function payModes(name) {
  const c = C[name], ph = parseCost(c.c).phy, rest = (c.c || "").replace(/\{[RU]\/P\}/, "");
  const modes = [["mana", `Mana cost (${ph ? rest + ph : c.c || "0"})`]];
  if (ph) modes.unshift(["life", `${rest ? rest + " + " : ""}2 life for {${ph}/P}`]);
  if (c.free_if || (c.free_cmdr && commanderOut())) modes.unshift(["free", c.free_cmdr ? "Free (you control a commander)" :
    c.free_if === "island" ? "Free (an opponent controls an Island, you control a Mountain)" : c.free_if === "forest" ? "Free (an opponent controls a Forest, you control an Island)" : "Free (trap condition met)"]);
  if (name === "Light Up the Stage") modes.push(["spectacle", "Spectacle {R} (an opponent lost life this turn)"]);
  if (name === "Force of Will") modes.push(["pitch", "Exile a blue card and pay 1 life each time"]);
  return modes;
}
async function castRepeatMenu(name) {
  const box = document.createElement("div"); box.className = "form";
  const modes = payModes(name);
  box.innerHTML = `<p class="info" style="margin:0">Casts ${esc(short(name))} again every time Krark returns it, resolving each stack in your saved trigger order. Stops when it stays in the graveyard or you can't pay.</p>
    <label for="repN">At most how many casts?</label><input id="repN" type="number" min="1" value="10" inputmode="numeric">
    ${modes.length > 1 ? `<label for="repPay">How to pay each time</label><select id="repPay">${modes.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select>` : ""}`;
  pendingArt = name;
  const v = await openSheet(`Cast ${short(name)} repeatedly`, box, [["Go", "go", "primary"], ["Cancel", null]]);
  if (v !== "go") return;
  await castRepeat(name, Math.max(1, Math.floor(+$("repN").value || 1)), ($("repPay") && $("repPay").value) || "mana");
}
async function castRepeat(name, n, mode = "mana") {
  if (mode === true) mode = "life";   // older callers passed "pay life" as a flag
  snapshotUndo();
  const before = metrics(), base = S.stack.length;
  let casts = 0, stop = `reached ${n} casts`;
  quiet = true;
  try {
    for (let i = 0; i < n; i++) {
      if (!S.hand.includes(name)) { stop = "it stayed in the graveyard"; break; }
      let opts = { noSnap: true, quietFail: true };
      if (mode === "life") { if (S.life <= 2) { stop = "life too low"; break; } opts.phyLife = true; }
      else if (mode === "free") { opts.free = true; opts.alt = "alt cost"; }
      else if (mode === "spectacle") { if (!(S.turnStats.damage > 0)) { stop = "no opponent has lost life this turn"; break; } opts.cost = "R"; opts.alt = "spectacle"; }
      else if (mode === "pitch") {
        const blues = S.hand.filter(x => x !== name && cardColors(x).includes("U"));
        if (!blues.length) { stop = "no blue card left to pitch"; break; }
        if (S.life <= 1) { stop = "life too low"; break; }
        const pf = pickFrom(blues);
        const r = await openSheet(`Force of Will (cast ${casts + 1}): exile which blue card?`, pf.list, [["Exile it and cast", "go", "primary"], ["Stop here", null]]);
        if (r !== "go") { stop = "you stopped"; break; }
        const x = pf.get(); S.hand.splice(S.hand.indexOf(x), 1); S.ex.push({ n: x }); S.life -= 1;
        log("pitch", { c: "Force of Will", exiled: short(x), life: -1 });
        opts.free = true; opts.alt = "pitched " + short(x);
      }
      if (!(await cast(name, "hand", opts))) { stop = "not enough mana"; break; }
      if (S.unfailable === true) { stop = `${KRARK_CAP}+ Krark triggers reached`; let g = 0; while (S.stack.length > base && g++ < 800) await resolveItem(S.stack.pop()); casts++; break; }
      casts++;
      let g = 0; while (S.stack.length > base && g++ < 800) await resolveItem(S.stack.pop());
    }
  } finally { quiet = false; S.repeatTarget = null; S.cloneAuto = null; S.copyAuto = null; }
  const d = deltaOf(before, metrics());
  log("repeat", { c: short(name), casts, stop, net: fmtDelta(d) });
  toast(`${short(name)} cast ${casts} time${casts === 1 ? "" : "s"} (${stop}). Net: ${fmtDelta(d)}.`, "win");
  render(); saveLocal();
  if (S.unfailable === true) { S.unfailable = "asked"; await unfailablePrompt(); }
}
function instantSpeed(name) { const c = C[name]; return c.k === "instant" || name === DUAL || S.flashTurn === S.turn; }
async function cast(name, zone, opts = {}) {
  const c = C[name]; if (!c) return;
  const free = !!opts.free;
  let cost = parseCost(c.c);
  if (zone === "cmd") cost.g += 2 * S.cmd[name];
  if (zone === "flashback") cost = { g: 2, R: 1, U: 0, phy: null };
  if (opts.cost) cost = parseCost(opts.cost);
  if (opts.phyLife) cost.phyLife = true;
  const rals = S.bf.filter(p => ident(p) === RAL && !p.flipped).length + (S.ralPlus && S.ralPlus.turn === S.turn ? S.ralPlus.n : 0);
  if (isSpell(name) && rals) cost.g = Math.max(0, cost.g - rals);
  if (!opts.noSnap) snapshotUndo();
  let fuel = null;
  if (zone === "escape") { fuel = await chooseFuel(name); if (!fuel) { if (!opts.noSnap) dropSnapshot(); return false; } }
  let paid = { ok: true, tapped: [], lifePaid: 0 };
  if (!free) {
    paid = autoPay(cost, false);
    if (!paid.ok) { if (!opts.noSnap) dropSnapshot(); if (opts.quietFail) return false; toast(`Not enough mana for ${short(name)} (${c.c || "0"}${zone === "cmd" && S.cmd[name] ? " + tax " + 2 * S.cmd[name] : ""}). Tap lands or add mana first.`, "bad"); render(); return false; }
  }
  const below = S.stack.length;
  // leave the zone
  if (zone === "hand") S.hand.splice(S.hand.indexOf(name), 1);
  else if (zone === "exile") S.ex = S.ex.filter(e => e.n !== name);
  else if (zone === "escape" || zone === "flashback") { S.gy.splice(S.gy.indexOf(name), 1); if (zone === "escape") exileFuel(fuel, name); }
  else if (zone === "cmd") { S.cmdZone = S.cmdZone.filter(x => x !== name); S.cmd[name]++; }
  S.storm++; S.turnStats.casts++;
  if (isSpell(name)) S.turnStats.instsorc++;
  const item = { id: S.nextId++, kind: "spell", name, from: zone };
  if (opts.back) item.back = true;
  if (c.burn) { item.target = quiet && S.repeatTarget ? S.repeatTarget : await chooseTarget(`${short(name)}: ${c.burn} damage to what?`, c.burn); if (quiet) S.repeatTarget = item.target; }
  if (c.jeska) item.mode = commanderOut() ? "both" : ((await openSheet("Jeska's Will without a commander out: choose one mode", null, [[`Add R for each card in the opponent's hand (${S.oppHand})`, "mana", "primary"], ["Exile the top three, play them this turn", "exile"]])) || "mana");
  S.stack.push(item);
  const ev = { c: opts.back ? HARNFEL : short(name), full: name, from: zone, cost: free ? (opts.alt || "free") : (opts.cost ? opts.cost + " (" + opts.alt + ")" : c.c || "0"), tapped: paid.tapped };
  if (paid.lifePaid) ev.life = -paid.lifePaid;
  if (below) ev.respondingTo = stackLabel(S.stack[below - 1]);
  if (item.mode) ev.mode = item.mode;
  const trigs = castTriggerItems(name, item);
  const k = trigs.filter(t => t.eff === "krark").length;
  if (k) ev.krark = k;
  log("cast", ev);
  if (S.unfailable === true && !quiet) { S.unfailable = "asked"; await unfailablePrompt(); if (S.phase === "over") return true; }
  if (below && !instantSpeed(name)) toast(`${short(name)} is sorcery speed. Fine if you have flash from Borne Upon a Wind or Emergence Zone.`, "warn");
  render();
  await putTriggers(trigs, `${short(name)} was cast`);
  if (!below && !trigs.length && !isSpell(name)) item.auto = true;   // lone permanents resolve by themselves; spells wait so you can respond
  await settle();
  if (S.stack.length && !quiet) toast(k ? `${short(name)} is on the stack with ${k} Krark trigger${k === 1 ? "" : "s"} above it. Resolve them one at a time, or respond.` : `${short(name)} is on the stack. Resolve it or respond.`);
  render(); saveLocal();
  return true;
}
/* resolve without asking when the stack holds one plain item and you are not holding priority */
async function settle() {
  let guard = 0;
  while (!holdPriority && S.stack.length === 1 && S.stack[0].auto && guard++ < 20) await resolveItem(S.stack.pop());
}
async function resolveTop() {
  if (travelBlocked()) return;
  if (!S.stack.length) { toast("The stack is empty."); return; }
  snapshotUndo();
  await resolveItem(S.stack.pop());
  await settle();
  if (!S.stack.length) { S.cloneAuto = null; S.copyAuto = null; }
  render(); saveLocal();
}
async function resolveAll() {
  let guard = 0;
  while (S.stack.length && $("sheet").hidden && guard++ < 400) {
    const top = S.stack[S.stack.length - 1];
    // a marked stop halts Resolve all before that item; Resolve top still resolves it
    if (top.stop) { toast(`Stopped at ${stackLabel(top)}, your marked stop. Resolve top to go past it.`, "win"); return; }
    await resolveTop();
  }
  if (guard >= 400) toast("Stopped after 400 resolutions. Press again to keep going.", "warn");
}
async function resolveItem(it) {
  if (it.kind === "trigger") await resolveTrigger(it);
  else if (isSpell(it.name)) await resolveSpell(it);
  else await resolvePermanent(it);
  render();
}
async function resolveSpell(it) {
  log("resolve", { c: stackLabel(it) });
  await resolveEffects(it.name, 1, it);
  if (it.name === "Borne Upon a Wind") S.flashTurn = S.turn;
  if (it.kind === "spell") { if (it.from === "flashback") S.ex.push({ n: it.name }); else S.gy.push(it.name); }
}
async function resolvePermanent(it) {
  const p = { uid: S.nextId++, name: it.name, tapped: false };
  if (it.back) p.flipped = true;
  S.bf.push(p);
  log("resolve", { c: short(it.name) });
  render();
  await etb(p);
  const eff = ETB_TRIG[ident(p)];   // a clone of Monk, Dualcaster or Recruiter gets its ETB trigger too
  if (eff === "dualcaster") noteDualcasterLoop();
  if (eff && S.bf.includes(p)) {
    const empty = !S.stack.length, items = Array.from({ length: mult(p, false) }, () => trig(eff, { src: p.uid }));
    await putTriggers(items, `${short(it.name)} entered`);
    if (empty && items.length === 1) items[0].auto = true;
  }
}
async function resolveTrigger(it) {
  const e = it.eff;
  if (e === "krark") {
    const win = rnd() < 0.5;
    const orig = S.stack.find(x => x.id === it.spellId);
    if (win) {
      S.turnStats.flipsWon++; S.turnStats.copies++;
      S.stack.push({ id: S.nextId++, kind: "copy", name: it.name, mode: it.mode, target: (orig && orig.target) || it.target });
      log("Krark flip", { c: short(it.name), flip: "W", result: "copy on the stack" });
      toast(`Krark: won. A copy of ${short(it.name)} is on the stack.`, "win");
      await putTriggers([...magecraftItems(), ...flipWonItems()], `won flip, copy of ${short(it.name)}`);
    } else {
      if (orig) { S.stack = S.stack.filter(x => x !== orig); if (orig.from === "flashback") S.ex.push({ n: orig.name }); else S.hand.push(orig.name); }
      log("Krark flip", { c: short(it.name), flip: "L", result: orig ? "back to hand" : "already gone" });
      toast(orig ? `Krark: lost. ${short(it.name)} went back to your hand.` : `Krark: lost, but ${short(it.name)} already left the stack.`, orig ? "warn" : "");
    }
  } else if (e === "storm") {
    for (let i = 0; i < it.count; i++) S.stack.push({ id: S.nextId++, kind: "copy", name: it.name, mode: it.mode });
    S.turnStats.copies += it.count;
    log("storm", { c: short(it.name), copies: it.count });
    const mc = []; for (let i = 0; i < it.count; i++) mc.push(...magecraftItems());
    await putTriggers(mc, `${it.count} storm copies`);
  } else if (e === "birgi" || e === "electro") { addMana("R", 1); log("resolve", { c: TRIG[e].label(it), mana: "R" }); }
  else if (e === "kiln") { addTreasure(1); log("resolve", { c: TRIG[e].label(it) }); }
  else if (e === "scoundrel") { addTreasure(2); log("resolve", { c: TRIG[e].label(it) }); }
  else if (e === "archmage") draw(1, "Archmage");
  else if (e === "vivi") { const p = S.bf.find(q => q.uid === it.src); if (p) p.counters = (p.counters || 0) + 1; damageEach(1); log("resolve", { c: TRIG[e].label(it) }); }
  else if (e === "ral") {
    const win = rnd() < 0.5;
    if (win) {
      log("Ral flip", { flip: "W" });
      await putTriggers(flipWonItems(), "Ral won a flip");
      const ral = S.bf.find(q => q.uid === it.src && !q.flipped);
      if (ral) { pendingArt = RAL; const t = await openSheet("Ral won his flip. Exile him and return him transformed?", null, [["Transform", "go", "primary"], ["Keep the creature", null]]); if (t === "go") transformRal(ral); }
    } else { S.life -= 1; log("Ral flip", { flip: "L", life: -1 }); toast("Ral lost his flip: 1 damage to you.", "warn"); }
  } else if (e === "ashling") await ashlingLoot();
  else if (e === "electroX") {
    const inf = S.inf && (S.inf.R || S.inf.U || S.inf.C || S.inf.A || S.inf.T);
    const box = document.createElement("div"); box.className = "form";
    box.innerHTML = `<label for="elX">X (mana you can make now: ${inf ? "∞" : availableMana()})</label><input id="elX" type="number" min="0" value="${inf ? 999 : availableMana()}" inputmode="numeric">
      <label for="elT">Target player</label><select id="elT">${S.opp.map((o, i) => `<option value="${i}" ${i === S.target ? "selected" : ""}>Opponent ${i + 1} · ${o.life} life</option>`).join("")}</select>`;
    pendingArt = ELECTRO;
    const v = await openSheet("Electro left the battlefield: pay X?", box, [["Pay X", "go", "primary"], ["Don't pay", null]]);
    if (v === "go") {
      const x = Math.max(0, Math.floor(+$("elX").value || 0)), i = +$("elT").value;
      const pay = autoPay({ g: x, R: 0, U: 0 }, false);
      if (!pay.ok) { log("Electro", { note: `could not pay ${x}` }); toast(`Couldn't pay ${x}. Lower X and use the opponent buttons if needed.`, "bad"); }
      else { const dmg = inf ? S.opp[i].life : x; dealDamage({ kind: "opp", i }, dmg, ELECTRO); log("Electro", { x: inf ? "∞" : x, target: `opponent ${i + 1}`, tapped: pay.tapped }); }
    } else log("Electro", { note: "paid nothing" });
  }
  else if (e === "ralp1") { S.ralPlus = { turn: S.turn, n: (S.ralPlus && S.ralPlus.turn === S.turn ? S.ralPlus.n : 0) + 1 }; log("resolve", { c: "Ral +1", note: "instants and sorceries cost 1 less" }); }
  else if (e === "ralm2") {
    const ts = it.targets || [{ kind: "opp", i: S.target }];
    ts.forEach(t => dealDamage(t, ts.length === 1 ? 2 : 1, RAL));
    const blue = S.bf.some(q => q.name !== RAL && (C[ident(q)] || {}).k !== "land" && !q.asLand && cardColors(ident(q)).includes("U"));
    log("resolve", { c: "Ral −2", drew: blue || undefined });
    if (blue) draw(1, "Ral −2");
  } else if (e === "ralm8") {
    const ex = S.lib.splice(0, 8);
    for (const n of ex) S.ex.push({ n, play: isSpell(n), free: isSpell(n), until: S.turn });
    log("resolve", { c: "Ral −8", exiled: ex.map(short), castable: ex.filter(isSpell).map(short) });
  }
  else if (e === "monk") await monkReturn();
  else if (e === "recruiter") await recruiterFind();
  else if (e === "dualcaster") await copyFromStack(DUAL, false);
}
/* Ral exiles himself and returns transformed: a new object, loyalty 2 plus one per instant or sorcery cast this turn */
function transformRal(p) {
  const i = S.bf.indexOf(p); if (i < 0) return;
  if (p.staff) p.staff = false;
  const np = { uid: S.nextId++, name: RAL, tapped: false, flipped: true, loyalty: 2 + S.turnStats.instsorc };
  S.bf.splice(i, 1, np);
  log("transform", { c: "Ral", to: "Leyline Prodigy", loyalty: np.loyalty });
  toast(`Ral, Leyline Prodigy enters with ${np.loyalty} loyalty.`, "win");
}
async function ashlingLoot() {
  if (S.hand.length) {
    const pf = pickFrom(S.hand, S.hand[S.hand.length - 1]);
    pendingArt = ASHLING;
    await openSheet(`Ashling magecraft (${(S.ashlingRes || 0) + 1}${["st", "nd", "rd"][S.ashlingRes || 0] || "th"} this turn): discard a card, then draw`, pf.list, [["Discard and draw", "go", "primary"]]);
    const n = pf.get(); if (S.hand.includes(n)) { S.hand.splice(S.hand.indexOf(n), 1); S.gy.push(n); }
    log("Ashling", { discarded: short(n) });
  }
  draw(1, "Ashling");
  S.ashlingRes = (S.ashlingRes || 0) + 1;
  if (S.ashlingRes === 2) { damageEach(2); log("Ashling", { damage: 2, note: "each opponent and their creatures" }); }
  else if (S.ashlingRes === 3) { addMana("R", 4); log("Ashling", { mana: "RRRR" }); }
}
async function monkReturn() {
  const gy = [...new Set(S.gy.filter(isSpell))]; if (!gy.length) { log("Pinnacle Monk", { note: "no instant or sorcery in the graveyard" }); return; }
  const pf = pickFrom(gy, gy.includes("Twinflame") ? "Twinflame" : gy.includes("Molten Duplication") ? "Molten Duplication" : gy[0]);
  pendingArt = MONK;
  const v = await openSheet("Pinnacle Monk: return an instant or sorcery from your graveyard", pf.list, [["Return it", "go", "primary"], ["None", null]]);
  if (v !== "go") return;
  S.gy.splice(S.gy.indexOf(pf.get()), 1); S.hand.push(pf.get()); log("Pinnacle Monk", { returned: short(pf.get()) });
}
async function recruiterFind() {
  const pool = [...new Set(S.lib.filter(n => C[n] && C[n].k === "creature" && !HIGH_POWER.includes(n)))].sort((a, b) => short(a).localeCompare(short(b)));
  if (!pool.length) return;
  const pf = pickFrom(pool, pool.includes(KILN) ? KILN : pool[0]);
  const v = await openSheet("Imperial Recruiter: find a creature with power 2 or less", pf.list, [["Take it", "go", "primary"], ["Fail to find", null]]);
  if (v !== "go") return;
  S.lib.splice(S.lib.indexOf(pf.get()), 1); shuffle(S.lib); S.hand.push(pf.get()); log("Imperial Recruiter", { found: short(pf.get()) });
}
async function stackPicker(title, items, buttons, pre, extra) {
  let picked = pre || items[0];
  const wrap = document.createElement("div"); wrap.className = "picklist";
  items.forEach((it, i) => {
    const b = document.createElement("button"); b.className = "pick" + (it === picked ? " sel" : "");
    b.textContent = stackLabel(it) + (it === S.stack[S.stack.length - 1] ? " (top)" : "");
    b.onclick = () => { picked = it; [...wrap.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); };
    wrap.append(b);
  });
  if (extra) wrap.append(extra);
  const v = await openSheet(title, wrap, buttons);
  return v === "go" ? picked : v;
}
/* Fork, Reverberate, Return the Favor and Dualcaster copy something that is on the stack right now */
async function copyFromStack(source, abilities) {
  const cands = S.stack.filter(x => (x.kind !== "trigger" && isSpell(x.name)) || (abilities && x.kind === "trigger")).reverse();
  if (!cands.length) { log("effect", { c: short(source), note: "nothing on the stack to copy" }); toast(`${short(source)}: nothing on the stack to copy.`, "warn"); return; }
  // a choice made for an earlier copy in this chain is reused while that spell (or another copy of it) is on the stack
  const keep = S.copyAuto && S.copyAuto[source];
  let pick = keep && (cands.find(x => x.id === keep.id) || cands.find(x => x.kind === keep.kind && x.name === keep.name && x.eff === keep.eff));
  if (!pick) {
    const more = quiet || (source === DUAL ? S.stack.some(x => x.kind === "trigger" && x.eff === "dualcaster") : S.stack.some(x => x.name === source));   // the spell, its copies, or Krark / storm triggers that will make more
    let lab = null;
    if (more) { lab = document.createElement("label"); lab.className = "info"; lab.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:8px;width:100%"; lab.innerHTML = `<input type="checkbox" id="copySame" checked> Same choice for the other copies of ${esc(short(source))}${quiet ? " in this run" : " until the stack is empty"}`; }
    pick = await stackPicker(`${short(source)}: copy what?`, cands, [["Copy it", "go", "primary"], ["Nothing", null]], cands.find(x => x.kind === "trigger" ? x.eff === "krark" : !C[x.name].copier), lab);
    if (!pick || typeof pick !== "object") return;
    if (more && $("copySame") && $("copySame").checked) S.copyAuto = { ...(S.copyAuto || {}), [source]: { id: pick.id, kind: pick.kind, name: pick.name, eff: pick.eff } };
  }
  if (pick.kind === "trigger") S.stack.push({ ...pick, id: S.nextId++, copied: true });
  else { S.stack.push({ id: S.nextId++, kind: "copy", name: pick.name, mode: pick.mode, target: pick.target }); S.turnStats.copies++; }
  log("copy", { c: short(source), of: stackLabel(pick) });
  if (pick.kind !== "trigger") await putTriggers(magecraftItems(), `copy of ${short(pick.name)}`);
}
async function counterFromStack(source) {
  const cands = [...S.stack].reverse();
  if (!cands.length) { log("effect", { c: short(source), note: "used on an opponent's spell or ability" }); return; }
  const pick = await stackPicker(`${short(source)}: what does it hit?`, cands, [["Counter it", "go", "primary"], ["An opponent's spell or ability", "opp"]]);
  if (!pick || typeof pick !== "object") { log("effect", { c: short(source), note: "used on an opponent's spell or ability" }); return; }
  removeFromStack(pick, "gy");
  log("counter", { c: short(source), hit: stackLabel(pick) });
}
function removeFromStack(it, to) {
  S.stack = S.stack.filter(x => x !== it);
  if (it.kind !== "spell") return;
  if (to === "hand") S.hand.push(it.name);
  else if (to === "ex" || it.from === "flashback") S.ex.push({ n: it.name });
  else S.gy.push(it.name);
}
async function clearStack() {
  const v = await openSheet(`Clear all ${S.stack.length} items from the stack? Spells go to the graveyard.`, null, [["Clear the stack", "go", "primary"], ["Cancel", null]]);
  if (v !== "go") return;
  snapshotUndo();
  const n = S.stack.length;
  for (const it of [...S.stack]) removeFromStack(it, "gy");
  S.cloneAuto = null; S.copyAuto = null;
  log("stack cleared", { items: n }); render(); saveLocal();
}
async function stackMenu(id) {
  const it = S.stack.find(x => x.id === id); if (!it) return;
  const top = it === S.stack[S.stack.length - 1];
  const btns = [];
  if (top) btns.push(["Resolve", "resolve", "primary"]);
  btns.push([it.stop ? "Remove the stop" : "Stop Resolve all here", "stop"]);
  if (it.target) btns.push(["Change target", "retarget"]);
  if (it.kind === "spell") btns.push(["Countered (to graveyard)", "gy"], ["Return to hand", "hand"], ["Exile", "ex"]);
  else btns.push(["Countered (remove)", "gy"]);
  btns.push(["Cancel", null]);
  pendingArt = stackArt(it);
  const v = await openSheet(`${stackLabel(it)} · on the stack`, null, btns);
  if (!v) return;
  if (v === "resolve") return resolveTop();
  if (v === "stop") { it.stop = !it.stop; log(it.stop ? "stop set" : "stop removed", { c: stackLabel(it) }); render(); saveLocal(); return; }
  snapshotUndo();
  if (v === "retarget") {
    const before = targetLabel(it.target);
    it.target = await chooseTarget(`${stackLabel(it)}: new target`, C[it.name].burn || 0, it.target);
    log("retarget", { c: short(it.name), from: before, to: targetLabel(it.target) });
    render(); saveLocal(); return;
  }
  removeFromStack(it, v);
  log("stack", { c: stackLabel(it), to: v === "gy" ? "countered" : v });
  render(); saveLocal();
}
function pickFrom(names, preselect) {
  let picked = preselect === undefined ? names[0] : preselect;
  const list = cardList(names, (n, i, b) => { picked = n; [...list.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); });
  [...list.children].forEach((x, i) => { if (names[i] === picked) x.classList.add("sel"); });
  return { list, get: () => picked };
}
async function etb(p) {   // things that happen as it enters; ETB triggers go on the stack
  const id = p.name;
  if (id === "Chrome Mox") {
    const opts = S.hand.filter(n => C[n] && !["land", "artifact"].includes(C[n].k) && n !== "Phyrexian Metamorph");
    if (!opts.length) { log("imprint", { c: "Chrome Mox", card: "none" }); toast("Chrome Mox: nothing to imprint, so it makes no mana.", "warn"); return; }
    const pf = pickFrom(opts, opts.find(n => !isSpell(n) || n === "Simian Spirit Guide") || opts[0]);
    pendingArt = id;
    const v = await openSheet("Chrome Mox: imprint a nonartifact, nonland card", pf.list, [["Imprint", "go", "primary"], ["No imprint", null]]);
    if (v === "go" && pf.get()) { const n = pf.get(); S.hand.splice(S.hand.indexOf(n), 1); S.ex.push({ n }); p.imprint = n; log("imprint", { c: "Chrome Mox", card: short(n), colors: cardColors(n) || "none" }); }
  } else if (id === "Mox Diamond") {
    const lands = S.hand.filter(n => C[n] && C[n].k === "land");
    let v = null, pf = null;
    if (lands.length) { pf = pickFrom(lands); pendingArt = id; v = await openSheet("Mox Diamond: discard a land, or it goes to the graveyard", pf.list, [["Discard it", "go", "primary"], ["Don't", null]]); }
    if (v === "go" && pf.get()) { const n = pf.get(); S.hand.splice(S.hand.indexOf(n), 1); S.gy.push(n); log("Mox Diamond", { discarded: short(n) }); }
    else { S.bf = S.bf.filter(q => q !== p); S.gy.push(id); log("Mox Diamond", { note: "no land discarded, to graveyard" }); toast("Mox Diamond went to the graveyard.", "warn"); }
  } else if (id === "Phyrexian Metamorph" || id === SAKA) await chooseCopyOf(p);
}
/* Sakashima copies another creature you control and keeps its own "no legend rule" ability;
   Phyrexian Metamorph copies any artifact or creature. Both pick as they enter. */
async function chooseCopyOf(p) {   // only as it enters; the choice can't change later (use Undo to fix a misclick)
  const saka = p.name === SAKA;
  const names = [...new Set(S.bf.filter(q => q !== p && C[ident(q)] && (saka ? isCreatureP(q) : isCreatureP(q) || C[ident(q)].k === "artifact")).map(ident))];
  if (!names.length) return;
  const pf = pickFrom(names, p.copyOf && names.includes(p.copyOf) ? p.copyOf : names.includes(KRARK) ? KRARK : names[0]);
  const wrap = document.createElement("div"); wrap.append(pf.list);
  if (saka) { const note = document.createElement("p"); note.className = "info"; note.style.margin = "8px 0 0"; note.textContent = "Sakashima keeps its own ability, so the legend rule stays off for your permanents."; wrap.append(note); }
  pendingArt = p.name;
  const v = await openSheet(`${short(p.name)}: enter as a copy of`, wrap, [["Copy it", "go", "primary"], [saka ? "Enter as Sakashima" : "Nothing", "none"]]);
  if (v === "go") { p.copyOf = pf.get(); log("copy", { c: short(p.name), as: short(p.copyOf) }); }
  else log("copy", { c: short(p.name), as: "itself" });
}
/* pick several cards from a list; returns the chosen indices, or null if the sheet was closed */
async function multiPick(title, names, k, pre, exact, art, okLabel) {
  const sel = [...pre];
  const wrap = document.createElement("div");
  const info = document.createElement("p"); info.className = "info"; info.style.margin = "0 0 8px";
  const say = () => { info.textContent = `${exact ? "Pick" : "Pick up to"} ${k} (${sel.length}/${k} chosen).`; };
  const list = cardList(names, (n, i, b) => {
    const j = sel.indexOf(i);
    if (j >= 0) { sel.splice(j, 1); b.classList.remove("sel"); } else if (sel.length < k) { sel.push(i); b.classList.add("sel"); }
    say();
  });
  [...list.children].forEach((b, i) => { if (sel.includes(i)) b.classList.add("sel"); });
  say(); wrap.append(info, list);
  for (;;) {
    pendingArt = art;
    const v = await openSheet(title, wrap, [[okLabel || "Confirm", "go", "primary"], ["Cancel", null]]);
    if (v !== "go") return null;
    if (!exact || sel.length === k) return sel;
    toast(`Pick exactly ${k}.`, "warn");
  }
}
const FUEL_KEEPERS = ["Lotus Petal", "Brain Freeze", "Jeska's Will", "Desperate Ritual", "Pyretic Ritual", "Rite of Flame", "Gut Shot", "Submerge"];
/* Underworld Breach escape: exile three other cards from the graveyard, chosen by the player
   (preselected: cards you are least likely to want to escape later) */
async function chooseFuel(name) {
  const others = [...S.gy]; others.splice(others.indexOf(name), 1);
  const order = others.map((g, i) => i).sort((a, b) => (FUEL_KEEPERS.includes(others[a]) - FUEL_KEEPERS.includes(others[b])) || (isSpell(others[a]) - isSpell(others[b])));
  const pre = order.slice(0, 3);
  if (quiet) return pre.map(i => others[i]);
  const idx = await multiPick(`Escape ${short(name)}: exile three other cards from your graveyard`, others, 3, pre, true, BREACH, "Exile them and escape");
  return idx ? idx.map(i => others[i]) : null;
}
function exileFuel(chosen, keepName) {
  const gone = chosen;
  for (const g of gone) { S.gy.splice(S.gy.indexOf(g), 1); S.ex.push({ n: g }); }
  log("escape fuel", { exiled: gone.map(short) });
}

function landAmt(p) { return p.asLand ? 1 : ((C[ident(p)] || {}).amt || 1); }
/* discard exactly k cards (or the whole hand if it is smaller), picked by the player */
async function discardCards(k, source) {
  k = Math.min(k, S.hand.length); if (!k) return;
  const sel = [];
  const wrap = document.createElement("div");
  const list = cardList(S.hand, (n, i, b) => {
    const j = sel.indexOf(i);
    if (j >= 0) { sel.splice(j, 1); b.classList.remove("sel"); } else if (sel.length < k) { sel.push(i); b.classList.add("sel"); }
    $("discardN").textContent = `${sel.length}/${k}`;
  });
  const info = document.createElement("p"); info.className = "info"; info.style.margin = "0 0 8px"; info.innerHTML = `Pick ${k} card${k === 1 ? "" : "s"} to discard (<span id="discardN">0/${k}</span>).`;
  wrap.append(info, list);
  pendingArt = source;
  for (;;) {
    await openSheet(`${short(source)}: discard ${k}`, wrap, [["Discard them", "go", "primary"]]);
    if (sel.length === k) break;
    toast(`Pick exactly ${k} card${k === 1 ? "" : "s"} to discard.`, "warn");
  }
  const names = sel.map(i => S.hand[i]);
  for (const n of names) { S.hand.splice(S.hand.indexOf(n), 1); S.gy.push(n); }
  log("discard", { c: short(source), cards: names.map(short) });
}
/* Snap: return target creature to its owner's hand (yours, or one of an opponent's the page does not track) */
async function bounceCreature(source) {
  const mine = S.bf.filter(isCreatureP);
  const wrap = document.createElement("div"); wrap.className = "picklist";
  let tgt = null;
  mine.forEach(p => { const b = document.createElement("button"); b.className = "pick mine"; b.textContent = short(p.name) + (p.copyOf && p.copyOf !== p.name ? " as " + short(p.copyOf) : "") + (p.token ? " (token)" : ""); b.onclick = () => { tgt = p; [...wrap.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); }; wrap.append(b); });
  pendingArt = source;
  const v = await openSheet(`${short(source)}: return which creature?`, wrap, [["Return mine", "go", "primary"], ["An opponent's creature", "opp"]]);
  if (v === "go" && tgt) leaveBf(tgt, "hand", short(source));
  else log("effect", { c: short(source), note: "returned an opponent's creature" });
}
/* token copies enter the battlefield too, so Dualcaster, Pinnacle Monk and Imperial Recruiter tokens get their ETB trigger */
async function tokenEtb(tokens, target, source) {
  const eff = ETB_TRIG[target];
  if (!eff || !tokens.length) return;
  if (eff === "dualcaster") noteDualcasterLoop();
  if (eff === "monk" && CLONE_SPELLS.includes(source)) noteMonkLoop(source);
  const items = [];
  for (const tok of tokens) for (let i = 0, m = mult(tok, false); i < m; i++) items.push(trig(eff, { src: tok.uid }));
  await putTriggers(items, `${tokens.length > 1 ? tokens.length + " " : ""}${short(target)} token${tokens.length > 1 ? "s" : ""} entered`);
}
async function resolveEffects(name, n, opts) {
  if (!n) return;
  const c = C[name];
  if (c.ritual) { addMana("R", c.ritual * n); log("effect", { c: short(name), mana: "R" + c.ritual * n }); }
  if (c.jeska) {
    const mode = opts.mode || (commanderOut() ? "both" : "mana"), both = mode === "both";
    const mana = both || mode === "mana" ? S.oppHand * n : 0; if (mana) addMana("R", mana);
    const ex = [];
    if (both || mode === "exile") for (let i = 0; i < 3 * n && S.lib.length; i++) { const x = S.lib.shift(); S.ex.push({ n: x, play: true, until: S.turn }); ex.push(short(x)); }
    log("effect", { c: short(name), mana: "R" + mana, exiled: ex });
  }
  if (c.treasure) { addTreasure(c.treasure * n); log("effect", { c: short(name), treasures: c.treasure * n }); }
  if (c.draw) draw(c.draw * n, short(name));
  if (c.discard) await discardCards(c.discard * n, name);
  if (c.bounce) for (let i = 0; i < n; i++) await bounceCreature(name);
  if (c.burn) dealDamage(opts.target, c.burn * n, name);
  if (c.mill) { const i = S.target; S.opp[i].lib = Math.max(0, S.opp[i].lib - c.mill * n); log("effect", { c: short(name), mill: c.mill * n, target: i + 1 }); }
  if (c.untap) for (let r = 0; r < n; r++) {   // each resolution untaps lands of your choice (best ones preselected)
    const tapped = S.bf.filter(p => p.tapped && (C[ident(p)].k === "land" || p.asLand)).sort((a, b) => (landAmt(b) - landAmt(a)) || (sourceColors(b).length - sourceColors(a).length));
    if (!tapped.length) { log("effect", { c: short(name), untapped: [] }); break; }
    let idx = tapped.slice(0, c.untap).map((p, i) => i);
    if (!quiet && tapped.length > c.untap) idx = (await multiPick(`${short(name)}: untap up to ${c.untap} lands`, tapped.map(ident), c.untap, idx, false, name, "Untap them")) || idx;
    idx.forEach(i => { tapped[i].tapped = false; });
    log("effect", { c: short(name), untapped: idx.map(i => short(tapped[i].name)) });
  }
  if (c.exile_play) { const ex = []; for (let i = 0; i < c.exile_play * n && S.lib.length; i++) { const x = S.lib.shift(); S.ex.push({ n: x, play: true, until: S.turn + 1 }); ex.push(short(x)); } log("effect", { c: short(name), exiled: ex }); }
  if (c.look) for (let i = 0; i < n; i++) await lookAt(c.look, name);
  if (c.tutor) for (let i = 0; i < n; i++) await tutor(name);
  if (c.clone) {
    const target = await chooseCloneTarget(name, n);
    if (target) {
      const have = S.bf.filter(p => ident(p) === target).length, make = Math.max(0, Math.min(n, KRARK_CAP - have));
      const made = [];
      for (let i = 0; i < make; i++) { const tok = { uid: S.nextId++, name: target, copyOf: target, token: true, temp: true, tapped: false }; S.bf.push(tok); made.push(tok); }
      log("effect", { c: short(name), tokens: make, of: short(target), capped: make < n || undefined });
      await tokenEtb(made, target, name);
    }
  }
  if (c.copier) await copyFromStack(name, name === "Return the Favor");
  if (c.k === "instant" && c.protect) await counterFromStack(name);
}

/* ------------------------------------------------------------------ modal helpers */
let sheetResolve = null;
function openSheet(title, body, buttons) {
  return new Promise(res => {
    sheetResolve = res;
    $("sheetTitle").textContent = title;
    const b = $("sheetBody"); b.innerHTML = "";
    const art = pendingArt; pendingArt = null;
    if (hasArt(art)) b.append(bigArt(art));
    if (body) b.append(body);
    const row = $("sheetButtons"); row.innerHTML = "";
    for (const [label, value, cls] of buttons) {
      const btn = document.createElement("button"); btn.textContent = label; btn.className = cls || "";
      btn.onclick = () => closeSheet(value); row.append(btn);
    }
    $("sheet").hidden = false;
  });
}
function bigArt(n) {
  const e = IMG[n], fig = document.createElement("figure"); fig.className = "bigart";
  const img = document.createElement("img"); img.src = e.f; img.alt = short(n); fig.append(img);
  const cap = document.createElement("figcaption");
  cap.textContent = `Illustrated by ${e.a || "unknown"}. Image via Scryfall.${e.b ? " Tap the card to see the other face." : ""}`;
  if (e.b) { let back = false; img.style.cursor = "pointer"; img.onclick = () => { back = !back; img.src = back ? e.b : e.f; }; }
  fig.append(cap); return fig;
}
function closeSheet(v) { $("sheet").hidden = true; const r = sheetResolve; sheetResolve = null; if (r) r(v); }
function cardList(names, onPick, labelFn) {
  const wrap = document.createElement("div"); wrap.className = "picklist";
  names.forEach((n, i) => {
    const b = document.createElement("button"); b.className = "pick " + kindClass(n);
    if (hasArt(n)) b.classList.add("pic");
    b.innerHTML = `${artTag(n)}<span>${esc(labelFn ? labelFn(n, i) : short(n))}</span><small>${esc(C[n] ? C[n].c || "" : "")}</small>`;
    b.onclick = () => onPick(n, i, b); wrap.append(b);
  });
  return wrap;
}
async function lookAt(k, source) {
  const top = S.lib.slice(0, k);
  if (!top.length) return;
  let picked = null;
  const list = cardList(top, (n, i, b) => { picked = n; [...list.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); });
  const v = await openSheet(`${short(source)}: top ${top.length}. Pick the card to take.`, list,
    [["Take it", "take", "primary"], ...(source === "Ponder" ? [["Shuffle, draw 1", "shuffle"]] : []), ["Skip", null]]);
  if (v === "shuffle") { shuffle(S.lib); draw(1, "Ponder"); return; }
  if (v !== "take" || !picked) return;
  S.lib.splice(S.lib.indexOf(picked), 1); S.hand.push(picked); S.turnStats.draws++;
  if (source === "Impulse") { const rest = top.filter(x => x !== picked); S.lib = S.lib.filter(x => !rest.includes(x)).concat(rest); }
  log("look", { c: short(source), took: short(picked), saw: top.map(short) });
}
async function tutor(source) {
  const toTop = source === "Mystical Tutor";
  const pool = S.lib.filter(n => toTop ? isSpell(n) : true).sort((a, b) => short(a).localeCompare(short(b)));
  let picked = null;
  const list = cardList(pool, (n, i, b) => { picked = n; [...list.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); });
  const v = await openSheet(`${short(source)}: search your library`, list, [["Take it", "take", "primary"], ["Cancel", null]]);
  if (v !== "take" || !picked) return;
  S.lib.splice(S.lib.indexOf(picked), 1); shuffle(S.lib);
  if (toTop) S.lib.unshift(picked); else S.hand.push(picked);
  const ev = { c: short(source), found: short(picked) };
  if (source === "Gamble" && S.hand.length) { const lost = S.hand[Math.floor(rnd() * S.hand.length)]; S.hand.splice(S.hand.indexOf(lost), 1); S.gy.push(lost); ev.discarded = short(lost); toast(`Gamble found ${short(picked)} and discarded ${short(lost)} at random.`, lost === picked ? "bad" : ""); }
  log("tutor", ev);
}
async function chooseCloneTarget(source, n) {
  const ok = S.bf.filter(p => C[ident(p)] && (isCreatureP(p) || (source === "Molten Duplication" && C[ident(p)].k === "artifact")));
  const names = [...new Set(ok.map(ident))];
  if (!names.length) return null;
  // a choice made earlier in this chain (or this repeated-cast run) is reused while that card is still around
  const keep = S.cloneAuto && S.cloneAuto[source];
  if (keep && names.includes(keep)) return keep;
  let picked = sakaOut() && names.includes(KRARK) ? KRARK : names[0];
  const list = cardList(names, (nm, i, b) => { picked = nm; [...list.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); });
  [...list.children].forEach((x, i) => { if (names[i] === picked) x.classList.add("sel"); });
  const wrap = document.createElement("div"); wrap.append(list);
  const more = S.stack.some(x => x.name === source) || quiet;
  if (more) { const lab = document.createElement("label"); lab.className = "info"; lab.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:8px"; lab.innerHTML = `<input type="checkbox" id="cloneSame" checked> Same choice for the other copies of ${esc(short(source))}${quiet ? " in this run" : " until the stack is empty"}`; wrap.append(lab); }
  const v = await openSheet(`${short(source)} resolves ${n} time${n === 1 ? "" : "s"}: copy what?`, wrap, [["Make tokens", "go", "primary"], ["None", null]]);
  if (v === "go" && more && $("cloneSame") && $("cloneSame").checked) { S.cloneAuto = S.cloneAuto || {}; S.cloneAuto[source] = picked; }
  return v === "go" ? picked : null;
}
/* ------------------------------------------------------------------ card menus */
async function handMenu(name) {
  if (S.phase === "mull") {
    const need = bottomCount(); if (!need) return;
    const i = S.bottomSel.indexOf(name);
    if (i >= 0) S.bottomSel.splice(i, 1); else if (S.bottomSel.length < need) S.bottomSel.push(name);
    render(); return;
  }
  const c = C[name];
  const btns = [];
  if (c.k === "land") btns.push(["Play land", "land", "primary"]);
  else if (parseCost(c.c).phy) {
    const ph = parseCost(c.c), rest = c.c.replace(/\{[RU]\/P\}/, "");
    btns.push([`${S.stack.length ? "Respond" : "Cast"}: ${rest ? rest + " + " : ""}2 life`, "castlife", "primary"], [`${S.stack.length ? "Respond" : "Cast"} paying ${rest}${ph.phy}`, "cast"]);
  }
  else btns.push([S.stack.length ? "Cast in response" : "Cast", "cast", "primary"]);
  if (c.free_if || (c.free_cmdr && commanderOut())) btns.push(["Cast free (alt cost)", "free"]);
  if (name === "Light Up the Stage" && S.turnStats.damage > 0) btns.push(["Spectacle {R}", "spectacle"]);
  if (name === "Force of Will" && S.hand.some(n => n !== name && cardColors(n).includes("U"))) btns.push(["Pitch a blue card", "pitch"]);
  if (c.mdfc) btns.push(["Play as land", "mdfcland"]);
  if (name === BIRGI) btns.push([`Cast ${HARNFEL} {4}{R}`, "harnfel"]);
  if (isSpell(name)) btns.push(["Cast repeatedly…", "repeat"]);
  if (name === "Step Through") btns.push(["Wizardcycle {2}", "cycle"]);
  if (name === "Otawara, Soaring City") btns.push(["Channel (bounce)", "channel"]);
  if (name === "Simian Spirit Guide") btns.push(["Exile for R", "ssg"]);
  btns.push(["Discard", "discard"], ["Exile", "exile"], ["To library top", "top"], ["Cancel", null]);
  const v = await openSheet(`${name}  ${c.c ? "· " + c.c : ""}`, null, btns);
  if (!v) return;
  if (v === "cast") return cast(name, "hand");
  if (v === "harnfel") return cast(name, "hand", { cost: "4R", alt: "back face", back: true });
  if (v === "castlife") return cast(name, "hand", { phyLife: true });
  if (v === "repeat") return castRepeatMenu(name);
  if (v === "free") return cast(name, "hand", { free: true, alt: "alt cost" });
  snapshotUndo();
  if (v === "land" || v === "mdfcland") {
    await playLand(name, "hand", v === "mdfcland");
  } else if (v === "spectacle") {
    dropSnapshot(); return cast(name, "hand", { cost: "R", alt: "spectacle" });
  } else if (v === "pitch") {
    const blues = S.hand.filter(n => n !== name && cardColors(n).includes("U"));
    const pf = pickFrom(blues);
    const r = await openSheet("Force of Will: exile a blue card and pay 1 life", pf.list, [["Exile it and cast", "go", "primary"], ["Cancel", null]]);
    if (r !== "go") { dropSnapshot(); return; }
    S.hand.splice(S.hand.indexOf(pf.get()), 1); S.ex.push({ n: pf.get() }); S.life -= 1;
    log("pitch", { c: "Force of Will", exiled: short(pf.get()), life: -1 });
    return cast(name, "hand", { free: true, alt: "pitched " + short(pf.get()), noSnap: true });   // pitch and cast undo as one step
  } else if (v === "channel") {
    const legends = S.bf.filter(p => (C[ident(p)] || {}).leg && (C[ident(p)] || {}).k === "creature").length;
    const g = Math.max(0, 3 - legends);
    const pay = autoPay({ g, R: 0, U: 1 }, false);
    if (!pay.ok) { dropSnapshot(); toast(`Channel costs ${g ? g : ""}U right now.`, "bad"); return; }
    S.hand.splice(S.hand.indexOf(name), 1); S.gy.push(name);
    const perms = S.bf.filter(p => (C[ident(p)] || {}).k !== "land" && !p.asLand);
    const labels = perms.map(p => short(p.name) + (p.copyOf && p.copyOf !== p.name ? " as " + short(p.copyOf) : "") + (p.token ? " (token)" : ""));
    const wrap = document.createElement("div"); wrap.className = "picklist";
    let tgt = null;
    perms.forEach((p, i) => { const b = document.createElement("button"); b.className = "pick"; b.textContent = labels[i]; b.onclick = () => { tgt = p; [...wrap.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); }; wrap.append(b); });
    const r = await openSheet(`Otawara channel (paid ${g ? g : ""}U): return which permanent?`, wrap, [["Return mine", "go", "primary"], ["An opponent's", "opp"]]);
    if (r === "go" && tgt) { S.bf = S.bf.filter(q => q !== tgt); if (!tgt.token) S.hand.push(tgt.name); log("channel Otawara", { cost: (g || "") + "U", returned: short(tgt.name), tapped: pay.tapped }); bounceCleanup(tgt); }
    else log("channel Otawara", { cost: (g || "") + "U", note: "opponent's permanent", tapped: pay.tapped });
  } else if (v === "cycle") {
    const pay = autoPay({ g: 2, R: 0, U: 0 }, false); if (!pay.ok) { dropSnapshot(); toast("Need 2 mana to wizardcycle.", "bad"); return; }
    S.hand.splice(S.hand.indexOf(name), 1); S.gy.push(name);
    const wiz = S.lib.filter(n => (C[n].ty || []).includes("Wizard"));
    let picked = wiz[0];
    const list = cardList(wiz, (nm, i, b) => { picked = nm; [...list.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); });
    const r = await openSheet("Wizardcycling: find a Wizard", list, [["Take it", "take", "primary"]]);
    if (r && picked) { S.lib.splice(S.lib.indexOf(picked), 1); shuffle(S.lib); S.hand.push(picked); log("wizardcycle", { found: short(picked) }); }
  } else if (v === "ssg") {
    S.hand.splice(S.hand.indexOf(name), 1); S.ex.push({ n: name }); addMana("R", 1); log("Simian Spirit Guide", { mana: "R" });
  } else {
    S.hand.splice(S.hand.indexOf(name), 1);
    if (v === "discard") S.gy.push(name); else if (v === "exile") S.ex.push({ n: name }); else S.lib.unshift(name);
    log(v, { c: short(name) });
  }
  render(); saveLocal();
}
async function playLand(name, from, asLand) {
  if (S.stack.length) { dropSnapshot(); toast("Lands can only be played while the stack is empty.", "warn"); return; }
  if (S.landDrop) toast("You already played a land this turn (logged anyway).", "warn");
  if (from === "hand") S.hand.splice(S.hand.indexOf(name), 1); else S.ex = S.ex.filter(x => x.n !== name);
  S.landDrop = true;
  const cot = S.bf.filter(p => p.name === "City of Traitors");
  if (cot.length && name !== "City of Traitors") { S.bf = S.bf.filter(p => !cot.includes(p)); cot.forEach(() => S.gy.push("City of Traitors")); log("sacrifice", { c: "City of Traitors", note: "another land was played" }); }
  const ev = { c: short(name) };
  if (from !== "hand") ev.from = from;
  if (FETCH[name]) { const p = enterLand(name); log("land", ev); render(); await crackMenu(p); return; }
  let shock;
  if (name === "Steam Vents") shock = (await openSheet("Steam Vents: pay 2 life to have it enter untapped?", null, [["Pay 2 life", "pay", "primary"], ["Enter tapped", "tap"]])) !== "tap";
  const p = enterLand(name, { shock });
  if (asLand) {
    p.asLand = true; ev.asLand = true;
    const back = C[name].mdfc === "R" ? "Mystic Peak" : "Soporific Springs";
    const pay = await openSheet(`${back}: pay 3 life to have it enter untapped?`, null, [["Pay 3 life", "pay", "primary"], ["Enter tapped", "tap"]]);
    if (pay === "tap") p.tapped = true; else { S.life -= 3; p.paidLife = 3; }
  }
  if (name === "Riverglide Pathway // Lavaglide Pathway") p.landColor = (await openSheet("Which side?", null, [["Riverglide (U)", "U"], ["Lavaglide (R)", "R", "primary"]])) || "R";
  if (p.paidLife) ev.life = -p.paidLife;
  if (p.tapped) ev.tapped = true;
  log("land", ev);
  if (name === "Thundering Falls") await surveil(name);
}
async function crackMenu(f) {
  const targets = fetchTargets(f.name);
  if (!targets.length) { toast(`${short(f.name)} has nothing left to find.`, "warn"); return; }
  const pf = pickFrom(targets, bestFetchTarget(f.name, "R") || targets[0]);
  pendingArt = f.name;
  const v = await openSheet(`Crack ${short(f.name)} (1 life)?`, pf.list, [["Fetch it", "go", "primary"], ["Keep it uncracked", null]]);
  if (v !== "go") return;
  const t = pf.get();
  let shock;
  if (t === "Steam Vents") shock = (await openSheet("Steam Vents: pay 2 life to have it enter untapped?", null, [["Pay 2 life", "pay", "primary"], ["Enter tapped", "tap"]])) !== "tap";
  crackFetch(f, t, { shock });
  if (t === "Thundering Falls") await surveil(t);
}
async function surveil(source) {
  const top = S.lib[0]; if (!top) return;
  pendingArt = top;
  const v = await openSheet(`${short(source)}: surveil 1. Top card is ${short(top)}.`, null, [["Keep on top", "top", "primary"], ["Put in graveyard", "gy"]]);
  if (v === "gy") { S.lib.shift(); S.gy.push(top); }
  log("surveil", { c: short(source), card: short(top), to: v === "gy" ? "graveyard" : "top" });
}
function bounceCleanup(p) {
  if (ident(p) === ELECTRO) { S.stack.push(trig("electroX", { src: p.uid })); toast("Electro left the battlefield: his trigger is on the stack. Resolve it to pay X.", "win"); }
  if (p.name === SAKA) { const ks = S.bf.filter(q => ident(q) === KRARK); ks.slice(1).forEach(q => { S.bf = S.bf.filter(z => z !== q); }); }
  if (p.staff) p.staff = false;
}
async function bfMenu(uid) {
  const p = S.bf.find(x => x.uid === uid); if (!p) return;
  const c = C[ident(p)] || {};
  const btns = [];
  const group = (bfGroups[uid] || []).map(u => S.bf.find(x => x.uid === u)).filter(Boolean);
  if (group.length > 1) {
    if (!p.tapped && onBf(RELIC) && c.leg && isCreatureP(p)) btns.push([`Tap all ${group.length} for Relic (${group.length} mana)`, "gRelic", "primary"]);
    btns.push([p.tapped ? `Untap all ${group.length}` : `Tap all ${group.length}`, "gTap"], [`Remove all ${group.length}`, "gDie"]);
  }
  if (FETCH[p.name] && !p.tapped) btns.push(["Crack (1 life)", "crack", "primary"]);
  if (!p.tapped && isManaSource(p)) btns.push(["Tap for mana", "mana", "primary"]);
  if (ident(p) === VIVI && p.viviTurn !== S.turn) btns.push([`Add ${p.counters || 0} mana (Vivi)`, "vivi", "primary"]);
  if (ident(p) === "Mana Vault" && p.tapped) btns.push(["Pay {4}: untap", "vault"]);
  if (p.name === "Fiery Islet" && !p.tapped) btns.push(["{1}, sacrifice: draw", "islet"]);
  if (p.name === RAL && !p.flipped) btns.push(["Transform (won flip)", "ral"]);
  if (p.name === BIRGI && p.flipped && S.hand.length) btns.unshift(["Discard a card: exile the top two, play them this turn", "harnfel", "primary"]);
  btns.push([p.tapped ? "Untap" : "Tap", "tap"]);
  if (ident(p) === OGRE) btns.push(["Pay 3 life: add R", "ogre"]);
  if (isCreatureP(p) && onBf(RELIC) && c.leg && !p.tapped) btns.push(["Tap for Relic of Legends", "relic"]);
  if (onBf(STAFF) && isCreatureP(p)) btns.push([p.staff ? "Unequip Wizard's Staff" : `Equip Wizard's Staff {${typesOf(p).includes("Wizard") ? 1 : 3}}`, "staff", p.name === KRARK || ident(p) === KRARK ? "primary" : ""]);
  if (p.name === STAFF) { const on = S.bf.find(q => q.staff); btns.unshift([on ? `Move it (now on ${short(on.name)})` : "Equip a creature", "equipFrom", "primary"]); }
  if (p.name === RAL && p.flipped) {
    const used = p.pwTurn === S.turn;
    if (!used) btns.unshift(["+1: spells cost {1} less", "ral+1", "primary"], ["−2: 2 damage, maybe draw", "ral-2"], ["−8: exile top eight, cast them free", "ral-8"]);
    btns.push(["Loyalty +1", "loy+"], ["Loyalty −1", "loy-"]);
  }
  btns.push(["Make a token copy", "token"], ["Return to hand", "hand"], ["Sacrifice / dies", "die"], ["Exile", "exile"], ["Cancel", null]);
  const v = await openSheet(`${isRalPW(p) ? "Ral, Leyline Prodigy · loyalty " + (p.loyalty ?? 0) : p.flipped && p.name === BIRGI ? HARNFEL : short(p.name)}${p.copyOf && p.copyOf !== p.name ? " as " + short(p.copyOf) : ""}${p.token ? (group.length > 1 ? ` (${group.length} tokens; single actions use one)` : " (token)") : ""}`, null, btns);
  if (!v) return;
  if (v === "gRelic" || v === "gTap" || v === "gDie") {
    snapshotUndo();
    const n = group.length;
    if (v === "gRelic") { group.forEach(q => q.tapped = true); addMana("A", n); log("Relic of Legends", { tapped: `${n} × ${short(ident(p))}`, mana: n }); }
    else if (v === "gTap") { const t = !p.tapped; group.forEach(q => q.tapped = t); log(t ? "tap" : "untap", { c: `${n} × ${short(ident(p))}` }); }
    else { group.forEach(q => leaveBf(q, "die")); }
    render(); saveLocal(); return;
  }
  if (v.startsWith("ral") && v !== "ral" && S.stack.length) { toast("Loyalty abilities are sorcery speed: resolve the stack first.", "warn"); return; }
  snapshotUndo();
  if (v === "equipFrom") {
    const cands = S.bf.filter(isCreatureP);
    if (!cands.length) { dropSnapshot(); toast("No creature to equip.", "warn"); return; }
    const wrap = document.createElement("div"); wrap.className = "picklist";
    let tgt = cands.find(q => ident(q) === KRARK && !q.staff) || cands[0];
    cands.forEach(q => { const b = document.createElement("button"); b.className = "pick" + (q === tgt ? " sel" : ""); b.textContent = `${short(q.name)}${q.copyOf && q.copyOf !== q.name ? " as " + short(q.copyOf) : ""}${q.token ? " (token)" : ""} · {${typesOf(q).includes("Wizard") ? 1 : 3}}`; b.onclick = () => { tgt = q; [...wrap.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); }; wrap.append(b); });
    const r = await openSheet("Wizard's Staff: equip which creature? Equip Wizard {1}, others {3}", wrap, [["Equip", "go", "primary"], ["Cancel", null]]);
    if (r !== "go") { dropSnapshot(); return; }
    const g = typesOf(tgt).includes("Wizard") ? 1 : 3, tuid = tgt.uid;
    const pay = autoPay({ g, R: 0, U: 0 }, false);
    if (!pay.ok) { dropSnapshot(); toast(`Equipping that creature costs ${g}.`, "bad"); return; }
    S.bf.forEach(x => x.staff = false); const q = S.bf.find(x => x.uid === tuid); q.staff = true;
    log("equip Staff", { c: short(ident(q)), cost: g, tapped: pay.tapped });
    render(); saveLocal(); return;
  }
  if (v === "harnfel") {
    const pf = pickFrom(S.hand, S.hand[S.hand.length - 1]);
    pendingArt = BIRGI;
    const r = await openSheet(`${HARNFEL}: discard which card?`, pf.list, [["Discard and exile two", "go", "primary"], ["Cancel", null]]);
    if (r !== "go") { dropSnapshot(); return; }
    const d = pf.get(); S.hand.splice(S.hand.indexOf(d), 1); S.gy.push(d);
    const ex = S.lib.splice(0, 2);
    for (const n of ex) S.ex.push({ n, play: true, until: S.turn });
    log("Harnfel", { discarded: short(d), exiled: ex.map(short) });
    toast(`Harnfel exiled ${ex.map(short).join(" and ")}. Play them from exile this turn.`, "win");
    render(); saveLocal(); return;
  }
  if (v === "ral+1" || v === "ral-2" || v === "ral-8") {
    const cost = v === "ral+1" ? 1 : v === "ral-2" ? -2 : -8;
    if ((p.loyalty || 0) + cost < 0) { dropSnapshot(); toast(`Ral needs ${-cost} loyalty for that.`, "bad"); return; }
    p.loyalty = (p.loyalty || 0) + cost; p.pwTurn = S.turn;
    log("Ral ability", { ability: v.slice(3), loyalty: p.loyalty });
    const empty = !S.stack.length, item = trig(v.replace("+", "p").replace("-", "m"), { src: p.uid });
    if (v === "ral-2") {
      const t1 = await chooseTarget("Ral −2: first target (2 damage, or 1 if you add a second)", 2);
      const second = await openSheet("Split the damage with a second target?", null, [["No, 2 to the first", null, "primary"], ["Yes, 1 each", "yes"]]);
      item.targets = second === "yes" ? [t1, await chooseTarget("Ral −2: second target (1 damage)", 1)] : [t1];
    }
    S.stack.push(item); if (empty) item.auto = true;
    if (p.loyalty <= 0) { S.bf = S.bf.filter(q => q !== p); S.gy.push(p.name); log("Ral", { note: "no loyalty left, to graveyard" }); }
    render(); await settle(); render(); saveLocal(); return;
  }
  if (v === "crack") { await crackMenu(p); }
  else if (v === "vivi") { const x = p.counters || 0; p.viviTurn = S.turn; addMana("A", x); log("Vivi mana", { mana: x + " U/R" }); }
  else if (v === "vault") { p.tapped = true; const pay = autoPay({ g: 4, R: 0, U: 0 }, false); if (!pay.ok) { dropSnapshot(); toast("Untapping Mana Vault costs 4.", "bad"); return; } const v2 = S.bf.find(q => q.uid === uid); if (v2) v2.tapped = false; log("untap Mana Vault", { tapped: pay.tapped }); }
  else if (v === "islet") { p.tapped = true; const pay = autoPay({ g: 1, R: 0, U: 0 }, false); if (!pay.ok) { dropSnapshot(); const q = S.bf.find(x => x.uid === uid); if (q) q.tapped = false; toast("Needs 1 more mana.", "bad"); return; } S.bf = S.bf.filter(q => q.uid !== uid); S.gy.push(p.name); log("Fiery Islet", { tapped: pay.tapped }); draw(1, "Fiery Islet"); }
  else if (v === "ral") transformRal(p);
  else if (v === "loy+" || v === "loy-") { p.loyalty = Math.max(0, (p.loyalty || 0) + (v === "loy+" ? 1 : -1)); log("loyalty", { c: "Ral", loyalty: p.loyalty }); }
  else if (v === "mana") {
    const cols = sourceColors(p).replace("C", "") || "C";
    let col = cols.length > 1 ? await openSheet("Which colour?", null, [...cols].map(x => [x === "R" ? "Red" : x === "U" ? "Blue" : x, x, x === "R" ? "primary" : ""])) : cols;
    if (!col) col = cols[0];
    const made = tapFor(p, col);
    log("tap", { c: short(p.name), mana: made.make, life: made.pain ? -made.pain : undefined, drum: made.drum });
  } else if (v === "tap") { p.tapped = !p.tapped; log(p.tapped ? "tap" : "untap", { c: short(p.name) }); }
  else if (v === "ogre") { S.life -= 3; addMana("R", 1); log("Treasonous Ogre", { life: -3, mana: "R" }); }
  else if (v === "relic") { p.tapped = true; addMana("A", 1); log("Relic of Legends", { tapped: short(ident(p)) }); }
  else if (v === "staff") {
    if (p.staff) { p.staff = false; log("unequip Staff", { c: short(ident(p)) }); }
    else {
      const g = typesOf(p).includes("Wizard") ? 1 : 3;
      const pay = autoPay({ g, R: 0, U: 0 }, false);
      if (!pay.ok) { dropSnapshot(); toast(`Equipping costs ${g}.`, "bad"); return; }
      const q = S.bf.find(x => x.uid === uid); S.bf.forEach(x => x.staff = false); q.staff = true;
      log("equip Staff", { c: short(ident(q)), cost: g, tapped: pay.tapped });
    }
  }
  else if (v === "token") { const tok = { uid: S.nextId++, name: ident(p), copyOf: ident(p), token: true, temp: false, tapped: false }; S.bf.push(tok); log("token", { of: short(ident(p)) }); await tokenEtb([tok], ident(p)); }
  else {
    leaveBf(p, v);
  }
  render(); saveLocal();
}
async function zoneMenu(zone, name) {
  const c = C[name]; const btns = [];
  if (zone === "gy") {
    if (onBf(BREACH) && c.k !== "land") { if (parseCost(c.c).phy) btns.push(["Escape for 2 life", "escapelife", "primary"]); btns.push(["Escape (Breach)" + (parseCost(c.c).phy ? " paying mana" : ""), "escape", parseCost(c.c).phy ? "" : "primary"]); }
    if (name === "Strike It Rich") btns.push(["Flashback {2}{R}", "flashback"]);
    btns.push(["Return to hand", "hand"], ["Exile", "exile"], ["Cancel", null]);
  } else if (zone === "ex") {
    const e = S.ex.find(x => x.n === name);
    if (e && e.play) btns.push([c.k === "land" ? "Play land" : e.free ? "Cast free (Ral −8)" : "Cast", "play", "primary"]);
    btns.push(["To hand", "hand"], ["Cancel", null]);
  } else if (zone === "cmd") {
    btns.push([`Cast (tax ${2 * S.cmd[name]})`, "cast", "primary"], ["Cancel", null]);
  }
  const v = await openSheet(`${name} · ${zone === "gy" ? "graveyard" : zone === "ex" ? "exile" : "command zone"}`, null, btns);
  if (!v) return;
  if (v === "escape" || v === "escapelife") { if (S.gy.length - 1 < 3) { toast("Escape needs three other cards in the graveyard.", "bad"); return; } return cast(name, "escape", v === "escapelife" ? { phyLife: true } : {}); }
  if (v === "flashback") return cast(name, "flashback");
  if (v === "cast") return cast(name, "cmd");
  if (v === "play") {
    if (c.k === "land") { snapshotUndo(); await playLand(name, "exile"); render(); saveLocal(); return; }
    const e = S.ex.find(x => x.n === name);
    return cast(name, "exile", e && e.free ? { free: true, alt: "Ral −8" } : {});
  }
  snapshotUndo();
  if (zone === "gy") { S.gy.splice(S.gy.indexOf(name), 1); if (v === "hand") S.hand.push(name); else S.ex.push({ n: name }); }
  else { S.ex = S.ex.filter(x => x.n !== name); S.hand.push(name); }
  log("move", { c: short(name), from: zone, to: v }); render(); saveLocal();
}
function castPermanentFrom(name, zone) { return cast(name, zone); }

async function librarySearch() {
  const pool = [...S.lib].sort((a, b) => short(a).localeCompare(short(b)));
  let picked = null;
  const list = cardList(pool, (n, i, b) => { picked = n; [...list.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); });
  const v = await openSheet(`Library (${S.lib.length} cards)`, list, [["To hand", "hand", "primary"], ["To top", "top"], ["Cancel", null]]);
  if (!v || !picked) return;
  snapshotUndo();
  S.lib.splice(S.lib.indexOf(picked), 1); shuffle(S.lib);
  if (v === "hand") S.hand.push(picked); else S.lib.unshift(picked);
  log("search", { found: short(picked), to: v }); render(); saveLocal();
}
/* ------------------------------------------------------------------ automatic win checks
   Deterministic wins the page recognises by itself, next to the Krark 100+ cap. Each one asks once per game. */
const CLONE_SPELLS = ["Twinflame", "Molten Duplication"];
let winChecking = false;
function guaranteedCastMana() { return sumMult(BIRGI) + sumMult(ELECTRO) + sumMult(KILN); }   // mana every instant or sorcery cast returns, whatever the coins do
function noteDualcasterLoop() {
  const clone = S.stack.find(x => x.kind !== "trigger" && CLONE_SPELLS.includes(x.name));
  if (!clone) return;
  S.pendingWin = { key: "dualcaster", method: "Dualcaster loop",
    why: `Dualcaster Mage entered with ${short(clone.name)} on the stack: it copies the spell onto itself again and again, so you get infinite hasty Dualcasters`,
    note: `Dualcaster Mage + ${short(clone.name)} on turn ${S.turn}.` };
}
function noteMonkLoop(clone) {
  const c = parseCost(C[clone].c), cost = c.g + c.R + c.U, back = guaranteedCastMana();
  if (back < cost) return;
  S.pendingWin = { key: "monk", method: "Pinnacle Monk loop",
    why: `A Pinnacle Monk token returns ${short(clone)} every time, and Birgi, Electro and Storm-Kiln give back ${back} per cast against a cost of ${cost}: infinite hasty Monks, storm and mana`,
    note: `Pinnacle Monk + ${short(clone)} with ${back} mana back per cast on turn ${S.turn}.` };
}
function deadOppsMethod() {
  if (S.opp.some(o => o.lib <= 0)) return "Brain Freeze mill";
  const last = [...S.turnLog].reverse().find(e => e.a === "damage" && e.from);
  if (last && /Electro/.test(last.from)) return "Electro";
  if (onBf(VIVI)) return "Vivi pings";
  return last ? "Burn copies" : "Other";
}
async function checkWins() {
  if (winChecking || !S || S.phase !== "play" || quiet || drill || !$("sheet").hidden) return;
  S.winAsked = S.winAsked || {};
  let w = null;
  if (S.opp.every(o => o.life <= 0 || o.lib <= 0) && !S.winAsked.opps)
    w = { key: "opps", why: "Every opponent is out", method: deadOppsMethod(), note: `All opponents dead or milled on turn ${S.turn}.` };
  else if (S.pendingWin && !S.winAsked[S.pendingWin.key]) w = S.pendingWin;
  if (!w) { S.pendingWin = null; return; }
  S.winAsked[w.key] = true; S.pendingWin = null;
  log("win check", { found: w.key, method: w.method });
  winChecking = true;
  pendingArt = w.key === "dualcaster" ? "Dualcaster Mage" : w.key === "monk" ? "Pinnacle Monk // Mystic Peak" : null;
  const v = await openSheet(`${w.why}. End the game as a win?`, null, [["End as a win", "win", "primary"], ["Keep playing", null]]);
  winChecking = false;
  if (v === "win") await endGame({ result: "win", method: w.method, note: w.note });
  else log("win check", { declined: w.key });
}
async function unfailablePrompt() {
  pendingArt = KRARK;
  const v = await openSheet(`${KRARK_CAP}+ Krark triggers: this position can't fail. End the game as a win?`, null, [["End as a win", "win", "primary"], ["Keep playing", null]]);
  if (v === "win") await endGame({ result: "win", method: "Krark 100+ (unfailable)", note: `Reached ${krarkRaw()} Krark triggers on turn ${S.turn}.` });
}
async function endGame(preset) {
  const methods = ["Krark 100+ (unfailable)", "Vivi pings", "Brain Freeze mill", "Twinflame / Molten Krark army", "Dualcaster loop", "Pinnacle Monk loop", "Electro", "Burn copies", "Combat", "Other"];
  const sel = document.createElement("div"); sel.className = "form";
  sel.innerHTML = `<label for="egRes">Result</label><select id="egRes"><option value="win">I won</option><option value="stopped">Stopped (no win)</option><option value="loss">I lost</option></select>
    <label for="egMethod">How</label><select id="egMethod">${methods.map(m => `<option>${m}</option>`).join("")}</select>
    <label for="egNote">What decided this game?</label><textarea id="egNote" rows="3" placeholder="e.g. kept a turn-1 Krark hand, held Jeska's Will for Sakashima"></textarea>`;
  const q = id => sel.querySelector("#" + id);
  q("egMethod").value = preset ? preset.method : "Vivi pings";
  if (preset) { q("egRes").value = preset.result; q("egNote").value = preset.note || ""; }
  const v = await openSheet("End the game", sel, [["Save result", "save", "primary"], ["Cancel", null]]);
  if (v !== "save") return;
  S.stack = [];
  endTurn();
  S.result = { result: $("egRes").value, method: $("egMethod").value, note: $("egNote").value, turn: S.turn, at: new Date().toISOString() };
  S.phase = "over";
  await saveGameMeta();
  saveLocal(); render();
  toast(`Game saved: ${S.result.result} on turn ${S.turn}.`);
}
function addNote() {
  const t = $("note").value.trim(); if (!t) return;
  log("note", { text: t }); $("note").value = ""; saveLocal();
  toast("Note added to this turn's log.");
}
/* Undo and redo move whole game states. The log is part of the state, so an undone step leaves the log too;
   the game only keeps a count of undos so Claude can see how much was cleaned up. */
function stepLabel(a, b) { // what a has that b lacks
  if (a.phase !== b.phase && (a.phase === "mull" || b.phase === "mull")) return "the keep";
  if (a.phase === "over" && b.phase !== "over") return "ending the game";
  if (a.turn !== b.turn) return `moving to turn ${Math.max(a.turn, b.turn)}`;
  const ev = a.turnLog.slice(b.turnLog.length);
  if (!ev.length) return "a counter change";
  const names = ev.filter(e => e.a !== "effect" && e.a !== "draw step").map(e => e.a + (e.c ? " " + e.c : e.found ? " " + e.found : ""));
  return (names.length ? names : ev.map(e => e.a)).slice(0, 2).join(", ") + (ev.length > 2 ? " and its effects" : "");
}
function travelBlocked() { if ($("sheet").hidden) return false; toast("Finish or close the open choice first.", "warn"); return true; }
function undo() {
  if (travelBlocked()) return;
  if (!undoStack.length) { toast("Nothing to undo."); return; }
  const was = S; redoStack.push(JSON.stringify(S));
  S = JSON.parse(undoStack.pop()); S.undos = (was.undos || 0) + 1;
  const RANDOM = ["Krark flip", "Ral flip", "draw step", "look", "tutor", "surveil", "fetch"];
  const sawRandom = was.turn !== S.turn || was.turnLog.slice(S.turnLog.length).some(e => RANDOM.includes(e.a) || e.cards);
  S.peeks = (was.peeks || 0) + (sawRandom ? 1 : 0);   // undos that took back a random result you had already seen
  afterTravel(was); toast(`Undid ${stepLabel(was, S)}.`);
}
function redo() {
  if (travelBlocked()) return;
  if (!redoStack.length) { toast("Nothing to redo."); return; }
  const was = S; undoStack.push(JSON.stringify(S));
  S = JSON.parse(redoStack.pop()); S.undos = was.undos || 0; S.peeks = was.peeks || 0;
  afterTravel(was); toast(`Redid ${stepLabel(S, was)}.`);
}
function afterTravel(was) {
  render(); saveLocal();
  if (!db || S.phase === "mull") return;
  // turn documents that no longer exist are removed, the rest are rewritten from the restored state
  for (let t = S.turn + 1; t <= was.turn; t++) { const path = `games/${S.id}/turns/t${t}`; chainWrite(path, () => db.doc(path).delete().catch(() => {})); }
  for (const T of S.allTurns) if (T.turn >= Math.min(S.turn, was.turn)) saveTurn(T.turn, T.events, T.stats);
  if (S.phase === "play") saveTurn(S.turn, S.turnLog, { ...S.turnStats, open: true });
  saveGameMeta();
}
function updateUndoButtons() {
  document.querySelectorAll("[data-act=undo]").forEach(b => { b.disabled = !undoStack.length; });
  document.querySelectorAll("[data-act=redo]").forEach(b => { b.disabled = !redoStack.length; });
}

/* ------------------------------------------------------------------ mulligan drill
   Quick keep-or-ship decisions on random hands, saved one document each to drills/<id>.
   The simulator's opinion is not shown, so the answers stay your own. */
const DRILL_STEPS = [[0, 50], [1, 20], [2, 15], [3, 10], [4, 5]];   // mulligan step and how often it comes up
let drill = null, drillCount = 0, drillTotal = null;
function drillSize(step) { return 7 - Math.max(0, step - 1); }
function newDrillHand() {
  let r = Math.random() * 100, step = 0;
  for (const [st, w] of DRILL_STEPS) { if (r < w) { step = st; break; } r -= w; }
  const deck = CARDS.map(c => c.n).filter(n => !COMMANDERS.includes(n));
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }   // drill hands don't touch the game's seed
  drill = { hand: deck.slice(0, 7), step, size: drillSize(step), seat: Math.random() < 0.25 ? "play" : "draw", phase: "decide", bottom: [], shown: Date.now() };
  $("drillReason").value = "";
  renderDrill();
}
function renderDrill() {
  if (!drill) return;
  const need = 7 - drill.size;
  $("drillCtx").innerHTML = `<b>${drill.seat === "play" ? "On the play" : "On the draw"}</b> · ${drill.step === 0 ? "opening seven" : drill.step === 1 ? "after your free mulligan" : `mulligan ${drill.step}`} · you keep <b>${drill.size}</b>${need ? ` (bottom ${need})` : ""}`;
  $("drillHand").innerHTML = drill.hand.map(n => chip(n, "", drill.bottom.includes(n) ? "bottom" : "")).join("");
  const picking = drill.phase === "bottom";
  $("drillPrompt").textContent = picking ? `Tap ${need} card${need === 1 ? "" : "s"} to put on the bottom (${drill.bottom.length}/${need}), then Save keep.` : "Keep or mulligan? K and M work too.";
  $("drillKeep").textContent = picking ? "Save keep" : "Keep";
  $("drillKeep").disabled = picking && drill.bottom.length !== need;
  $("drillMull").hidden = picking;
  $("drillBack").hidden = !picking;
  $("drillStats").textContent = `${drillCount} this session${drillTotal != null ? ` · ${drillTotal} saved in total` : ""}`;
}
function drillPick(n) {
  if (!drill || drill.phase !== "bottom") return;
  const need = 7 - drill.size, i = drill.bottom.indexOf(n);
  if (i >= 0) drill.bottom.splice(i, 1); else if (drill.bottom.length < need) drill.bottom.push(n);
  renderDrill();
}
async function drillAnswer(decision) {
  if (!drill) return;
  if (decision === "keep" && drill.size < 7 && drill.phase === "decide") { drill.phase = "bottom"; renderDrill(); return; }
  const doc = { at: new Date().toISOString(), seat: drill.seat, step: drill.step, size: drill.size, hand: drill.hand.map(short),
    decision, bottom: decision === "keep" ? drill.bottom.map(short) : [], reason: $("drillReason").value.trim() || undefined, ms: Date.now() - drill.shown, version: 1 };
  if (!doc.reason) delete doc.reason;
  drillCount++;
  if (db) {
    const id = "d" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    chainWrite("drills/" + id, () => db.doc("drills/" + id).set(doc).then(() => setSaveState("Saved to Claude", "ok")));
  } else {
    try { const a = JSON.parse(localStorage.getItem("krark-drills") || "[]"); a.push(doc); localStorage.setItem("krark-drills", JSON.stringify(a)); } catch (e) { /* storage blocked */ }
  }
  newDrillHand();
}
function drillToggle(on) {
  document.body.classList.toggle("drilling", on);
  $("drillPanel").hidden = !on;
  if (on) {
    newDrillHand();
    if (db && drillTotal == null) { try { db.collection("drills").limit(1000).onSnapshot(sn => { drillTotal = sn.docs.length; renderDrill(); }, () => {}); } catch (e) { /* count is optional */ } }
  } else { drill = null; render(); }
}

/* ------------------------------------------------------------------ storage */
function saveLocal() { try { localStorage.setItem("krark-playtest-current", JSON.stringify(S)); } catch (e) { /* storage blocked: the db copy is the record */ } }
function loadLocal() { try { const s = localStorage.getItem("krark-playtest-current"); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function chainWrite(path, fn) {
  const prev = writeChains[path] || Promise.resolve();
  const next = prev.then(fn).catch(err => { setSaveState(`Not saved (${err && err.code || "error"}). Use Export to keep a copy.`, "bad"); });
  writeChains[path] = next; return next;
}
function metaDoc() {
  return {
    started: S.started, updated: new Date().toISOString(), deck: "Krark Sakashima Storm (100)", phase: S.phase,
    turns: S.turn, mulligans: S.mulls, openingHands: S.opening.map(h => h.map(short)), kept: S.kept ? S.kept.map(short) : null,
    result: S.result, lifeEnd: S.life, opponents: S.opp, undos: S.undos || 0, undosAfterRandom: S.peeks || 0, version: 3,
  };
}
function saveGameMeta() {
  if (!db) return Promise.resolve();
  const path = "games/" + S.id, body = metaDoc();
  setSaveState("Saving…");
  return chainWrite(path, () => db.doc(path).set(body).then(() => setSaveState("Saved to Claude", "ok")));
}
function saveTurn(turn, events, stats) {
  if (!db) return;
  const path = `games/${S.id}/turns/t${turn}`;
  // very long turns keep their start (where the decisions are) and their end
  const ev = events.length > 1500 ? [...events.slice(0, 1100), { a: "…", skipped: events.length - 1500 }, ...events.slice(-400)] : events;
  const body = { turn, stats, events: ev };
  chainWrite(path, () => db.doc(path).set(body).then(() => setSaveState("Saved to Claude", "ok")));
}
function setSaveState(t, kind = "") { const el = $("saveState"); el.textContent = t; el.className = "savestate " + kind; }
function fullExport() { return { meta: metaDoc(), id: S.id, turns: [...S.allTurns, ...(S.turnLog.length ? [{ turn: S.turn, events: S.turnLog, stats: S.turnStats, open: true }] : [])] }; }
async function exportGame() {
  const json = JSON.stringify(fullExport(), null, 1);
  if (downloads) {
    try { await downloads.save({ filename: `krark-playtest-${S.id}.json`, data: json }); toast("Export saved."); return; }
    catch (e) { if (e && e.code === "declined") return; }
  }
  try { await navigator.clipboard.writeText(json); toast("Game JSON copied to the clipboard."); }
  catch (e) { const ta = $("exportBox"); ta.hidden = false; ta.value = json; ta.select(); toast("Select-all and copy the JSON below.", "warn"); }
}

/* ------------------------------------------------------------------ rendering */
function esc(s) { return String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])); }
function kindClass(n) { const c = C[n]; if (!c) return ""; return "k-" + (c.k === "instant" || c.k === "sorcery" ? "spell" : c.k); }
const hasArt = n => showImg && IMG[n] && IMG[n].f;
const artTag = (n, back) => hasArt(n) ? `<img class="art" src="${back && IMG[n].b ? IMG[n].b : IMG[n].f}" alt="" loading="lazy" decoding="async">` : "";
function chip(n, extra = "", cls = "") {
  const pic = hasArt(n);
  return `<button class="card ${kindClass(n)} ${cls} ${pic ? "pic" : ""}" data-n="${esc(n)}" aria-label="${esc(short(n))}">${artTag(n)}<span class="cn">${esc(short(n))}</span><span class="cc">${pic ? "" : esc((C[n] && C[n].c) || "")}</span>${extra}</button>`;
}
function render() {
  if (!S) return;
  $("turnNo").textContent = S.phase === "mull" ? "Opening hand" : `Turn ${S.turn}`;
  const inf = S.inf || {}, show = (k, v) => inf[k] ? "∞" : v;
  $("storm").textContent = show("storm", S.storm);
  const auto = krarkAuto();
  $("krark").textContent = krarkRaw() >= KRARK_CAP ? KRARK_CAP + "+" : krarkTriggers();
  $("krarkHint").textContent = S.kDelta ? `auto ${auto} ${S.kDelta > 0 ? "+" : "−"} ${Math.abs(S.kDelta)}` : "auto";
  $("pR").textContent = show("R", S.pool.R); $("pU").textContent = show("U", S.pool.U); $("pC").textContent = show("C", S.pool.C); $("pA").textContent = show("A", S.pool.A);
  $("treas").textContent = show("T", S.treasures); $("life").textContent = S.life;
  $("libCount").textContent = S.lib.length;
  $("avail").textContent = inf.R || inf.U || inf.C || inf.A || inf.T ? "∞" : availableMana();
  document.querySelectorAll("[data-act=loop]").forEach(b => { b.textContent = S.loop ? "End loop" : "Start loop"; b.classList.toggle("rec", !!S.loop); });
  $("opps").innerHTML = S.opp.map((o, i) => `<button class="opp ${S.target === i ? "tgt" : ""} ${o.life <= 0 || o.lib <= 0 ? "dead" : ""}" data-opp="${i}" aria-label="Opponent ${i + 1}"><b>${o.life}</b><small>lib ${o.lib}</small></button>`).join("");
  // mulligan bar
  const mull = S.phase === "mull";
  $("mullBar").hidden = !mull;
  $("playBar").hidden = mull || S.phase === "over";
  if (mull) {
    const need = bottomCount();
    $("mullInfo").textContent = need ? `Mulligan ${S.mulls}: choose ${need} to bottom (${S.bottomSel.length}/${need})` : (S.mulls ? "Free mulligan used. Keep 7 or mulligan to 6." : "Seven cards. Keep or take the free mulligan.");
  }
  $("hand").innerHTML = S.hand.map(n => chip(n, "", S.bottomSel.includes(n) ? "bottom" : "")).join("") || `<p class="empty">No cards in hand.</p>`;
  $("handCount").textContent = S.hand.length;
  const lands = S.bf.filter(p => (C[ident(p)] || {}).k === "land" || p.asLand), others = S.bf.filter(p => !lands.includes(p));
  const bfChip = p => {
    const id = ident(p), pic = hasArt(id), copy = p.copyOf && p.copyOf !== p.name;
    const tags = [isRalPW(p) ? "loyalty " + (p.loyalty ?? 0) : "", dmgOf(p) ? `${dmgOf(p)} dmg` : "", pumpOf(p) && isCreatureP(p) ? `${power(p)}/${toughness(p)}` : "", p.token ? "token" : "", p.staff ? "✦staff" : "", p.counters ? "+" + p.counters : "", pic && copy ? (p.name === SAKA ? "Sakashima" : "copy") : ""].filter(Boolean).join(" ");
    return `<button class="card ${kindClass(id)} ${p.tapped ? "tapped" : ""} ${p.token ? "token" : ""} ${pic ? "pic" : ""}" data-uid="${p.uid}" aria-label="${esc(short(p.name) + (copy ? " as " + short(p.copyOf) : "") + (p.tapped ? ", tapped" : ""))}">${artTag(id, p.flipped)}<span class="cn">${esc(short(p.name))}${copy ? " → " + esc(short(p.copyOf)) : ""}</span><span class="cc">${esc(tags)}</span></button>`;
  };
  $("lands").innerHTML = lands.map(bfChip).join("") || `<p class="empty">No lands.</p>`;
  bfGroups = {};
  const tilesOf = list => {
    const tiles = [], byKey = {};
    for (const p of list) {
      if (!p.token) { tiles.push([p]); continue; }
      const key = [p.name, ident(p), p.tapped, p.temp, p.staff, p.counters || 0, dmgOf(p), pumpOf(p)].join("|");
      if (byKey[key]) byKey[key].push(p); else { byKey[key] = [p]; tiles.push(byKey[key]); }
    }
    for (const g of tiles) if (g.length > 1) bfGroups[g[0].uid] = g.map(q => q.uid);
    return tiles.map(g => g.length > 1 ? bfChip(g[0]).replace("</button>", `<span class="count">×${g.length}</span></button>`) : bfChip(g[0])).join("");
  };
  const creatures = others.filter(p => isCreatureP(p) || isRalPW(p));
  $("perms").innerHTML = tilesOf(creatures) || `<p class="empty">No creatures yet.</p>`;
  $("arts").innerHTML = tilesOf(others.filter(p => !creatures.includes(p))) || `<p class="empty">No artifacts or enchantments yet.</p>`;
  $("cmdZone").innerHTML = S.cmdZone.map(n => chip(n, S.cmd[n] ? `<span class="tax">tax ${2 * S.cmd[n]}</span>` : "")).join("") || `<p class="empty">Both out</p>`;
  const pileTop = (n, extra) => n ? (hasArt(n) ? `<img src="${IMG[n].f}" alt="${esc(short(n))}">` : `<span class="ptxt">${esc(short(n))}</span>`) + (extra || "") : `<span class="ptxt">No cards</span>`;
  $("gy").innerHTML = pileTop(S.gy[S.gy.length - 1]);
  $("gyCount").textContent = S.gy.length;
  const exTop = S.ex[S.ex.length - 1], playable = S.ex.filter(e => e.play).length;
  $("ex").innerHTML = pileTop(exTop && exTop.n, playable ? `<span class="count">${playable} ▶</span>` : "");
  $("exCount").textContent = S.ex.length;
  $("engines").textContent = engineSummary();
  $("stackPanel").hidden = !S.stack.length;
  const tr = document.querySelector(".tray"), st = document.querySelector(".status");
  if (tr && st) document.documentElement.style.setProperty("--trayH", (tr.offsetHeight + st.offsetHeight) + "px");
  $("stackCount").textContent = S.stack.length;
  // remembered copy / clone choices, each one removable so a loop can be ended by hand
  const autos = [];
  for (const [src, t] of Object.entries(S.copyAuto || {})) autos.push(["copy", src, `${short(src)} → ${t.kind === "trigger" ? (TRIG[t.eff] ? TRIG[t.eff].nm + " trigger" : "trigger") : short(t.name)}`]);
  for (const [src, t] of Object.entries(S.cloneAuto || {})) autos.push(["clone", src, `${short(src)} → ${short(t)}`]);
  $("autoBox").hidden = !autos.length;
  $("autoBox").innerHTML = autos.length ? `<span>Auto choices:</span>` + autos.map(([kind, src, label]) => `<button class="autochip" data-act="autoclear:${kind}|${esc(src)}" title="Forget this choice; the next copy asks again">${esc(label)} ✕</button>`).join("") : "";
  const shown = [...S.stack].reverse().slice(0, 40);
  $("stackMore").hidden = S.stack.length <= 40; $("stackMore").textContent = `and ${S.stack.length - 40} more below`;
  $("stack").innerHTML = shown.map((it, i) => { const art = stackArt(it); return `<li><button class="si si-${it.kind} ${i === 0 ? "top" : ""} ${it.stop ? "stop" : ""}" data-sid="${it.id}">${hasArt(art) ? `<img class="sthumb" src="${IMG[art].f}" alt="">` : `<span class="sthumb blank"></span>`}<span class="sl">${esc(stackLabel(it))}</span><span class="sk">${it.stop ? "⏸ stop" : i === 0 ? "next" : it.kind}</span></button></li>`; }).join("");
  document.querySelectorAll(".hist [data-act=resolve]").forEach(b => { b.hidden = !S.stack.length; b.textContent = `Resolve (${S.stack.length})`; });
  $("optAsk").checked = askOrder;
  document.querySelectorAll("[data-act=imgs]").forEach(b => { b.textContent = showImg ? "Text view" : "Card images"; });
  renderLog(); updateUndoButtons();
  if (S.phase === "play" && !winChecking) setTimeout(checkWins, 0);
}
function engineSummary() {
  const bits = [];
  const b = sumMult(BIRGI), e = sumMult(ELECTRO), k = sumMult(KILN), v = sumMult(VIVI), sc = countBf(SCOUNDREL);
  if (b) bits.push(`Birgi +${b}R/spell`); if (e) bits.push(`Electro +${e}R`); if (k) bits.push(`Kiln +${k} treasure/cast & copy`);
  if (sc) bits.push(`Scoundrel +${2 * sc} per won flip`); if (v) bits.push(`Vivi ${v} dmg/spell`);
  return bits.length ? bits.join(" · ") : "No cast triggers on the battlefield.";
}
function renderLog() {
  if (!S) return;
  const items = S.turnLog.slice(-60).reverse().map(e => {
    const bits = Object.entries(e).filter(([k]) => !["t", "a", "pool", "tr", "hand", "storm", "full", "stats"].includes(k)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ");
    return `<li><b>${esc(e.a)}</b> ${esc(bits)} <span class="meta">storm ${e.storm ?? ""} · pool ${esc(e.pool ?? "")}</span></li>`;
  });
  $("log").innerHTML = items.join("") || `<li class="empty">Actions this turn appear here.</li>`;
}
function renderGames(snap) {
  const rows = snap.docs.map(d => { const m = d.data(); const r = m.result; return `<li><b>${esc(new Date(m.started).toLocaleString())}</b> · ${r ? esc(r.result + " T" + r.turn + " · " + r.method) : esc(m.phase === "over" ? "ended" : "turn " + m.turns + " (in progress)")} · ${m.mulligans} mull</li>`; });
  $("games").innerHTML = rows.join("") || `<li class="empty">No saved games yet. Finished games land here and Claude can read them.</li>`;
}

/* ------------------------------------------------------------------ wiring */
/* ------------------------------------------------------------------ table chrome */
async function actionsMenu() {
  const g = document.createElement("div"); g.className = "menu-grid";
  const items = S.phase === "mull"
    ? [["keep", "Keep this hand"], ["mull", "Mulligan"], ["newgame", "Reshuffle new game"], ["drill", "Mulligan drill"], ["imgs", showImg ? "Text view" : "Card images"], ["log", "Log and settings"], ["importdeck", "Import a deck"]]
    : [["draw", "Draw a card"], ["search", "Search library"], ["mill", "Mill 1 (self)"], ["loop", S.loop ? "End loop" : "Start loop"], ["poolclear", "Empty mana pool"],
       ["notefocus", "Add a note"], ["end", "End game"], ["drill", "Mulligan drill"], ["imgs", showImg ? "Text view" : "Card images"], ["export", "Export this game"], ["newgame", "New game"], ["log", "Log and settings"], ["importdeck", "Import a deck"]];
  g.innerHTML = items.map(([a, l]) => `<button class="btn" data-act="${a}">${esc(l)}</button>`).join("");
  await openSheet(S.phase === "mull" ? "Opening hand" : `Turn ${S.turn} · playtester actions`, g, [["Close", null]]);
}
async function keysSheet() {
  const d = document.createElement("div"); d.className = "keycols";
  const sec = (title, rows) => `<section><h4>${title}</h4><dl class="keys">${rows.map(([k, v]) => `<dt><kbd>${k}</kbd></dt><dd>${v}</dd>`).join("")}</dl></section>`;
  d.innerHTML = sec("Page", [["?", "Show or hide keybinds"], ["N", "Next turn (stack empty)"], ["U", "Untap all"], ["D", "Draw a card"], ["R", "Resolve the top of the stack"], ["L", "Open or close the log"],
      ["Ctrl+G", "New game"], ["Ctrl+S", "Shuffle library"], ["Ctrl+F", "Search library"], ["Ctrl+Y", "Search graveyard"], ["Ctrl+H", "View full hand"], ["Ctrl+M", "Game metrics"],
      ["Ctrl+L", "Card images or text labels"], ["Ctrl+Z", "Undo"], ["Ctrl+Shift+Z", "Redo"]])
    + sec("Quick play", [["1 … 9", "Play card 1 … 9 from hand"], ["Alt+1 … 9", "Peek at the top 1 … 9 cards"], ["Right-click", "Remove one mana or Treasure"], ["K / M", "Keep or mulligan in the drill"]])
    + sec("Card under the mouse", [["B", "Move to battlefield"], ["H", "Move to hand"], ["G", "Move to graveyard"], ["E", "Move to exile"], ["Z", "Move to command zone"], ["Y", "Move to top of library"], ["L", "Move to bottom of library"],
      ["T", "Tap or untap"], ["O", "Open its options"], ["F", "Transform (Ral)"], ["C", "Create a token copy"], ["+ / −", "Add or remove a +1/+1 counter"], ["Delete", "Remove from the game"]]);
  await openSheet("Keybinds", d, [["Close", null]]);
}
async function pileMenu(z) {
  if (z === "lib") {
    const v = await openSheet(`Library · ${S.lib.length} cards`, null, [["Draw", "draw", "primary"], ["Search", "search"], ["Mill 1", "mill"], ["Cancel", null]]);
    if (v) runAct(v);
    return;
  }
  const names = z === "gy" ? [...S.gy].reverse() : S.ex.map(e => e.n).reverse();
  if (!names.length) { toast(z === "gy" ? "Your graveyard is empty." : "Nothing in exile."); return; }
  let picked = null;
  const list = cardList(names, n => { picked = n; closeSheet("go"); }, z === "ex" ? n => short(n) + ((S.ex.find(e => e.n === n) || {}).play ? " ▶" : "") : null);
  const v = await openSheet(`${z === "gy" ? "Graveyard" : "Exile"} · ${names.length} card${names.length === 1 ? "" : "s"} · tap one for options`, list, [["Close", null]]);
  if (v === "go" && picked) { pendingArt = picked; zoneMenu(z, picked); }
}
function drawerToggle(open) {
  const d = $("drawer"); d.hidden = open === undefined ? !d.hidden : !open;
  if (!d.hidden) renderLog();
}
$("hand").addEventListener("wheel", ev => {   // the mouse wheel scrolls the hand sideways
  const h = ev.currentTarget;
  if (h.scrollWidth <= h.clientWidth || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
  ev.preventDefault();
  h.scrollBy({ left: ev.deltaY * (ev.deltaMode === 1 ? 40 : 1), behavior: "auto" });
}, { passive: false });
document.addEventListener("contextmenu", ev => {   // right-click removes one mana or Treasure
  const t = ev.target.closest("[data-alt]"); if (!t) return;
  ev.preventDefault(); runAct(t.dataset.alt);
});
/* ------------------------------------------------------------------ keybinds
   Moxfield-style keys where they fit this playtester. Letter keys on a card act on the card under the mouse. */
let hovered = null, mouseX = -1, mouseY = -1;
document.addEventListener("mouseover", ev => { hovered = ev.target.closest(".card, #gy, #ex"); });
document.addEventListener("mousemove", ev => { mouseX = ev.clientX; mouseY = ev.clientY; }, { passive: true });
function hoveredCard() {
  // after a redraw the old element is gone, so look again at whatever is under the pointer
  if (hovered && !document.body.contains(hovered) && mouseX >= 0) { const el = document.elementFromPoint(mouseX, mouseY); hovered = el && el.closest(".card, #gy, #ex"); }
  const h = hovered;
  if (!S || !h || !document.body.contains(h) || h.closest("#sheet, #drillPanel")) return null;
  if (h.id === "gy") return S.gy.length ? { zone: "gy", name: S.gy[S.gy.length - 1] } : null;
  if (h.id === "ex") return S.ex.length ? { zone: "ex", name: S.ex[S.ex.length - 1].n } : null;
  if (h.dataset.uid) { const p = S.bf.find(x => x.uid === +h.dataset.uid); return p ? { zone: "bf", p, name: p.name } : null; }
  if (h.dataset.n) { const z = h.closest("[data-zone]"); return { zone: z ? z.dataset.zone : "hand", name: h.dataset.n }; }
  return null;
}
/* take the card out of its zone; a token just stops existing */
function takeFrom(card) {
  const n = card.name;
  if (card.zone === "hand") S.hand.splice(S.hand.indexOf(n), 1);
  else if (card.zone === "gy") S.gy.splice(S.gy.lastIndexOf(n), 1);
  else if (card.zone === "ex") S.ex.splice(S.ex.map(e => e.n).lastIndexOf(n), 1);
  else if (card.zone === "cmd") S.cmdZone = S.cmdZone.filter(x => x !== n);
  else if (card.zone === "bf") { S.bf = S.bf.filter(x => x !== card.p); bounceCleanup(card.p); if (card.p.token) return false; }
  return true;
}
const ZONE_WORD = { bf: "battlefield", hand: "hand", gy: "graveyard", ex: "exile", cmd: "command zone", top: "top of library", bottom: "bottom of library", gone: "removed from the game" };
function moveHovered(to) {
  const card = hoveredCard(); if (!card) return false;
  if (to === card.zone) return true;
  if (to === "cmd" && !COMMANDERS.includes(card.name)) { toast("Only Krark and Sakashima go to the command zone.", "warn"); return true; }
  snapshotUndo();
  const real = takeFrom(card), n = card.name;
  if (real) {
    if (to === "hand") S.hand.push(n);
    else if (to === "gy") S.gy.push(n);
    else if (to === "ex") S.ex.push({ n });
    else if (to === "cmd") S.cmdZone.push(n);
    else if (to === "top") S.lib.unshift(n);
    else if (to === "bottom") S.lib.push(n);
    else if (to === "bf") S.bf.push({ uid: S.nextId++, name: n, tapped: false });
  }
  log("move", { c: short(n), from: card.zone, to: ZONE_WORD[to] || to, token: (!real) || undefined });
  toast(`${short(n)} → ${ZONE_WORD[to] || to}${real ? "" : " (a token stops existing)"}.`);
  render(); saveLocal(); return true;
}
async function hoveredAction(k) {
  const card = hoveredCard(); if (!card) return false;
  const p = card.p;
  if (k === "o") {
    pendingArt = p ? ident(p) : card.name;
    if (card.zone === "bf") bfMenu(p.uid); else if (card.zone === "hand") handMenu(card.name); else zoneMenu(card.zone, card.name);
    return true;
  }
  if (card.zone !== "bf") return false;
  if (k === "t") { snapshotUndo(); p.tapped = !p.tapped; log(p.tapped ? "tap" : "untap", { c: short(p.name) }); }
  else if (k === "f") {
    if (p.name === RAL && !p.flipped) { snapshotUndo(); transformRal(p); }
    else { toast(`${short(p.name)} has nothing to transform into here.`, "warn"); return true; }
  } else if (k === "c") {
    snapshotUndo();
    const tok = { uid: S.nextId++, name: ident(p), copyOf: ident(p), token: true, temp: false, tapped: false };
    S.bf.push(tok); log("token", { of: short(ident(p)) }); render(); await tokenEtb([tok], ident(p));
  } else if (k === "+" || k === "-") {
    snapshotUndo(); p.counters = Math.max(0, (p.counters || 0) + (k === "+" ? 1 : -1)); log("counter", { c: short(ident(p)), counters: p.counters });
  } else return false;
  render(); saveLocal(); return true;
}
async function playFromHand(i) {
  const n = S.hand[i]; if (!n) { toast(`You have no card ${i + 1} in hand.`, "warn"); return; }
  const c = C[n];
  pendingArt = n;
  if (c.k === "land") { snapshotUndo(); await playLand(n, "hand", false); render(); saveLocal(); return; }
  return cast(n, "hand", parseCost(c.c).phy ? { phyLife: true } : {});
}
async function peekTop(k) {
  const top = S.lib.slice(0, k); if (!top.length) return;
  log("peek", { cards: top.length });
  const list = cardList(top, () => {}, (n, i) => `${i + 1}. ${short(n)}`);
  await openSheet(`Top ${top.length} of your library (top first)`, list, [["Close", null]]);
}
async function viewHand() {
  if (!S.hand.length) { toast("Your hand is empty."); return; }
  let picked = null;
  const list = cardList(S.hand, n => { picked = n; closeSheet("go"); }, (n, i) => `${i + 1}. ${short(n)}`);
  const v = await openSheet(`Hand · ${S.hand.length} cards · tap one for options`, list, [["Close", null]]);
  if (v === "go" && picked) { pendingArt = picked; handMenu(picked); }
}
async function metricsSheet() {
  const rows = [...S.allTurns.map(t => ({ ...t.stats, turn: t.turn })), { ...S.turnStats, turn: S.turn, now: true }];
  const cols = [["casts", "casts"], ["krarkTriggers", "Krark trig."], ["flipsWon", "flips won"], ["copies", "copies"], ["draws", "draws"], ["manaMade", "mana"], ["treasuresMade", "Treasures"], ["damage", "damage"]];
  const t = document.createElement("div"); t.style.overflowX = "auto";
  t.innerHTML = `<table class="metrics"><thead><tr><th>turn</th>${cols.map(c => `<th>${c[1]}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr${r.now ? ' class="now"' : ""}><td>${r.turn}${r.now ? " (now)" : ""}</td>${cols.map(c => `<td>${r[c[0]] || 0}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <p class="info">Life ${S.life} · storm ${S.storm} · library ${S.lib.length} · mulligans ${S.mulls} · undos ${S.undos || 0} · opponents ${S.opp.map(o => o.life + "/" + o.lib).join(", ")} (life/library)</p>`;
  await openSheet("Game metrics", t, [["Close", null]]);
}
async function confirmNewGame() {
  const v = await openSheet("Start a new game? The current one stays saved.", null, [["New game", "go", "primary"], ["Cancel", null]]);
  if (v === "go") newGame();
}
document.addEventListener("keydown", ev => {
  if (!S || ev.target.closest("input, textarea, select")) return;
  const k = ev.key.toLowerCase(), ctrl = ev.ctrlKey || ev.metaKey, open = !$("sheet").hidden;
  if (ev.key === "?" && !ctrl) { ev.preventDefault(); if (open && $("sheetTitle").textContent === "Keybinds") closeSheet(null); else if (!open) keysSheet(); return; }
  if (open || drill) return;
  // Ctrl shortcuts
  if (ctrl && !ev.altKey) {
    if (k === "z" && !ev.shiftKey) { ev.preventDefault(); undo(); }
    else if (k === "z" && ev.shiftKey) { ev.preventDefault(); redo(); }
    else if (k === "g") { ev.preventDefault(); confirmNewGame(); }
    else if (k === "s" && S.phase === "play") { ev.preventDefault(); snapshotUndo(); shuffle(S.lib); log("shuffle library"); toast("Library shuffled."); render(); }
    else if (k === "f" && S.phase === "play") { ev.preventDefault(); librarySearch(); }
    else if (k === "y") { ev.preventDefault(); pileMenu("gy"); }
    else if (k === "h") { ev.preventDefault(); viewHand(); }
    else if (k === "m") { ev.preventDefault(); metricsSheet(); }
    else if (k === "l") { ev.preventDefault(); runAct("imgs"); }
    return;
  }
  // Alt + number: peek at the top of the library
  if (ev.altKey && /^Digit[1-9]$/.test(ev.code) && S.phase === "play") { ev.preventDefault(); peekTop(+ev.code.slice(5)); return; }
  if (ev.altKey) return;
  if (S.phase !== "play") return;
  // number: play that card from hand
  if (/^Digit[1-9]$/.test(ev.code) || /^Numpad[1-9]$/.test(ev.code)) { ev.preventDefault(); playFromHand(+ev.code.slice(-1) - 1); return; }
  // card under the mouse
  const MOVE = { b: "bf", h: "hand", g: "gy", e: "ex", z: "cmd", y: "top", l: "bottom" };
  if (MOVE[k] && moveHovered(MOVE[k])) { ev.preventDefault(); return; }
  if (ev.key === "Delete" && hoveredCard()) { ev.preventDefault(); moveHovered("gone"); return; }
  if (["t", "o", "f", "c", "+", "-"].includes(k) || ev.key === "=") {
    const key = ev.key === "=" ? "+" : k;
    if (hoveredCard()) { ev.preventDefault(); hoveredAction(key); return; }
  }
  // page keys
  if (k === "l") { ev.preventDefault(); drawerToggle(); }
  else if (k === "d") { ev.preventDefault(); runAct("draw"); }
  else if (k === "n" && !S.stack.length) { ev.preventDefault(); runAct("next"); }
  else if (k === "u") { ev.preventDefault(); snapshotUndo(); S.bf.forEach(p => { p.tapped = false; }); log("untap all"); render(); saveLocal(); }
});
document.addEventListener("click", ev => {
  const t = ev.target.closest("button"); if (!t) return;
  if (t.closest("#sheet")) {   // menu buttons inside a sheet close it and run their action
    if (t.dataset.act && t.closest("#sheetBody")) { closeSheet(null); runAct(t.dataset.act); }
    return;
  }
  const n = t.dataset.n, uid = t.dataset.uid, opp = t.dataset.opp, act = t.dataset.act;
  if (t.dataset.sid) return stackMenu(+t.dataset.sid);
  if (uid) { const p = S.bf.find(x => x.uid === +uid); pendingArt = p ? ident(p) : null; return bfMenu(+uid); }
  if (opp !== undefined) { S.target = +opp; render(); return; }
  if (n && t.closest("#drillHand")) return drillPick(n);
  if (n) {
    const zone = t.closest("[data-zone]"); const z = zone ? zone.dataset.zone : "hand";
    pendingArt = n;
    if (z === "hand") return handMenu(n);
    return zoneMenu(z, n);
  }
  if (act) runAct(act);
});
function runAct(act) {
  const [kind, arg] = act.split(":");
  if (kind === "pile") return pileMenu(arg);
  if (kind === "autoclear") {
    const [which, src] = arg.split("|"), store = which === "copy" ? S.copyAuto : S.cloneAuto;
    if (store) delete store[src];
    log("auto choice cleared", { c: short(src) });
    toast(`${short(src)} will ask for its target again. Choose "Nothing" to end the loop.`);
    render(); saveLocal(); return;
  }
  if (act === "menu") return actionsMenu();
  if (act === "keys") return keysSheet();
  if (act === "importdeck") { location.href = "./import/"; return; }
  if (act === "log") return drawerToggle();
  if (act === "notefocus") { drawerToggle(true); $("note").focus(); return; }
  if (act === "poolclear") { snapshotUndo(); S.pool = { R: 0, U: 0, C: 0, A: 0 }; if (S.inf) { S.inf.R = S.inf.U = S.inf.C = S.inf.A = false; } log("pool emptied"); render(); return; }
  if (act === "handL" || act === "handR") { const h = $("hand"); h.scrollBy({ left: (act === "handL" ? -1 : 1) * h.clientWidth * 0.8 }); return; }
  if (kind === "pool") { snapshotUndo(); const [col, d] = arg.split(","); if (S.inf && S.inf[col] && +d < 0) { S.inf[col] = false; log("infinite " + col + " cleared"); render(); return; } S.pool[col] = Math.max(0, S.pool[col] + +d); if (+d > 0) S.turnStats.manaMade += +d; log("pool " + (+d > 0 ? "+" : "−") + col); render(); return; }
  if (kind === "treas") { snapshotUndo(); if (arg === "-" && S.inf && S.inf.T) { S.inf.T = false; log("infinite Treasures cleared"); render(); return; } if (arg === "+") addTreasure(1); else if (arg === "-") S.treasures = Math.max(0, S.treasures - 1); else if (S.treasures) { S.treasures--; addMana("A", 1); } log("treasure " + arg); render(); return; }
  if (kind === "life") { snapshotUndo(); S.life += +arg; render(); return; }
  if (kind === "opp") { snapshotUndo(); const [what, d] = arg.split(","); const o = S.opp[S.target]; o[what] = Math.max(0, o[what] + +d); if (what === "life" && +d < 0) S.turnStats.damage -= +d; log(`opponent ${S.target + 1} ${what} ${d}`); render(); return; }
  if (kind === "k") { S.kDelta += +arg; render(); return; }
  if (kind === "ohand") { S.oppHand = Math.max(0, S.oppHand + +arg); $("ohand").textContent = S.oppHand; return; }
  if (act === "imgs") { showImg = !showImg; try { localStorage.setItem("krark-playtest-images", showImg ? "on" : "off"); } catch (e) { /* per-browser only */ } render(); return; }
  const fns = { drill: () => drillToggle(true), drillExit: () => drillToggle(false), drillKeep: () => drillAnswer("keep"), drillMull: () => drillAnswer("mull"),
    drillBack: () => { if (drill) { drill.phase = "decide"; drill.bottom = []; renderDrill(); } }, clearStack, newgame: newGame, mull: mulligan, keep, next: nextTurn, redo, resolve: resolveTop, resolveAll, loop: loopToggle, draw: () => { snapshotUndo(); draw(1, "draw (extra)"); render(); }, undo, search: librarySearch, end: endGame, note: addNote, export: exportGame, mill: () => { snapshotUndo(); const x = S.lib.shift(); if (x) { S.gy.push(x); log("mill self", { c: short(x) }); } render(); } };
  if (fns[act]) fns[act]();
}
$("sheetClose").onclick = () => closeSheet(null);
document.addEventListener("keydown", ev => {   // K / M answer the drill
  if (!drill || ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest("input, textarea, select") || !$("sheet").hidden) return;
  const k = ev.key.toLowerCase();
  if (k === "k" || (k === "enter" && drill.phase === "bottom")) { ev.preventDefault(); if (!$("drillKeep").disabled) drillAnswer("keep"); }
  else if (k === "m" && drill.phase === "decide") { ev.preventDefault(); drillAnswer("mull"); }
});
document.addEventListener("keydown", ev => {   // R resolves the top of the stack
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.key.toLowerCase() !== "r" || ev.target.closest("input, textarea, select") || !$("sheet").hidden) return;
  if (S && S.stack.length && !drill) { ev.preventDefault(); resolveTop(); }
});
$("optHold").checked = holdPriority; $("optAsk").checked = askOrder;
$("optHold").onchange = e => { holdPriority = e.target.checked; setPref("krark-playtest-hold", holdPriority ? "on" : "off"); };
$("optAsk").onchange = e => { askOrder = e.target.checked; setPref("krark-playtest-ask-order", askOrder ? "on" : "off"); };
// a card image that fails to load falls back to the text tile
document.addEventListener("error", ev => {
  const t = ev.target; if (!(t instanceof HTMLImageElement) || !t.classList.contains("art")) return;
  const tile = t.closest(".pic"); t.remove(); if (tile) tile.classList.remove("pic");
}, true);
// hover preview on desktop
const peek = $("peek");
if (peek && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  document.addEventListener("mouseover", ev => {
    const t = ev.target.closest(".card.pic, .pick.pic"); if (!t || t.closest("#sheet")) { peek.hidden = true; return; }
    let n = t.dataset.n; if (t.dataset.uid) { const p = S.bf.find(x => x.uid === +t.dataset.uid); n = p && ident(p); }
    if (!hasArt(n)) { peek.hidden = true; return; }
    peek.src = IMG[n].f; peek.hidden = false;
    const r = t.getBoundingClientRect(), w = 260, h = Math.round(w * 680 / 488);
    let x = r.right + 12; if (x + w > innerWidth - 8) x = Math.max(8, r.left - w - 12);
    const y = Math.min(Math.max(8, r.top + r.height / 2 - h / 2), innerHeight - h - 8);
    peek.style.left = x + "px"; peek.style.top = y + "px";
  });
  document.addEventListener("scroll", () => { peek.hidden = true; }, { passive: true });
}
$("sheet").addEventListener("click", ev => { if (ev.target.id === "sheet") closeSheet(null); });

async function boot() {
  const prev = loadLocal();
  if (prev && prev.phase !== "over" && prev.lib) {
    S = prev; if (!S.stack) S.stack = []; if (S.rng == null) S.rng = Math.floor(Math.random() * 4294967296);
    const krarks = S.bf.filter(p => ident(p) === KRARK && p.token);
    if (krarks.length > KRARK_CAP) { const drop = new Set(krarks.slice(KRARK_CAP).map(p => p.uid)); S.bf = S.bf.filter(p => !drop.has(p.uid)); }
    if (S.turnLog.length > 3000) S.turnLog = S.turnLog.slice(-3000); render(); toast("Picked up your game in progress."); }
  else newGame();
  $("ohand").textContent = S.oppHand;
  if (window.claude && window.claude.use) {
    db = await window.claude.use("db");
    downloads = await window.claude.use("downloads");
  }
  if (db) {
    setSaveState("Connected: games save to Claude", "ok");
    try { db.collection("games").orderBy("started", "desc").limit(12).onSnapshot(renderGames, () => {}); } catch (e) { /* listing is optional */ }
    if (S.phase !== "mull") saveGameMeta();
  } else {
    setSaveState("Not connected: games stay in this browser. Use Export to share a game.", "warn");
    $("games").innerHTML = `<li class="empty">Saved games show here when the page runs inside Claude.</li>`;
  }
}
boot();
