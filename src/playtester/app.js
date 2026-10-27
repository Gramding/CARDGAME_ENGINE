"use strict";
/* Commander goldfish playtester: a light table that records every action.
   Rules help covers each deck's engines (Krark flips and copies, Kefka's discards, flicker, tutors and
   the like), cast triggers and common spell effects; everything else is done by hand.
   Games save to the artifact's db. */

const CARDS = /*CARDS*/[];
const DECKS = /*DECKS*/[];   // built-in decks: {id, name, commanders, cards}
const C = Object.fromEntries(CARDS.map(c => [c.n, c]));
/* decks sent over from the importer; cards the engine doesn't model come with plain data and play by hand */
function importedDecks() { try { return JSON.parse(localStorage.getItem("cge-decks") || "[]"); } catch (e) { return []; } }
if (C["Mindbreak Trap"]) C["Mindbreak Trap"].free_if = "three spells";
if (C["Frantic Search"]) C["Frantic Search"].discard = 2;   // draw two, then discard two, then untap up to three lands
if (C["Snap"]) C["Snap"].bounce = "creature";               // return target creature, untap up to two lands
if (C["Strike It Rich"]) C["Strike It Rich"].fb = "2R";      // its own flashback cost
const HARNFEL = "Harnfel, Horn of Bounty";                   // Birgi's back face: {4}{R} legendary artifact
const BIRD = "Bird Token";
C[BIRD] = { n: BIRD, s: "Bird", k: "creature", c: "", pt: [2, 2], ty: ["Bird"], flying: 1, token: 1 };
const IMG = /*IMGS*/{};   // card name -> {f: front image, b: back face, a: artist}, images from Scryfall
for (const d of importedDecks()) for (const [n, c] of Object.entries(d.extra || {})) { if (!C[n]) C[n] = c; if (c.img && !IMG[n]) IMG[n] = { f: c.img, b: c.img2 }; }
let showImg = true;
try { showImg = localStorage.getItem("krark-playtest-images") !== "off"; } catch (e) { /* default on */ }
let pendingArt = null;     // card whose image the next sheet shows
const KRARK = "Krark, the Thumbless", SAKA = "Sakashima of a Thousand Faces";
const BIRGI = "Birgi, God of Storytelling // Harnfel, Horn of Bounty", VIVI = "Vivi Ornitier";
const VEYRAN = "Veyran, Voice of Duality", PRODIGY = "Harmonic Prodigy", KILN = "Storm-Kiln Artist";
const SCOUNDREL = "Tavern Scoundrel", ELECTRO = "Electro, Assaulting Battery", ASHLING = "Ashling, Flame Dancer";
const ARCHMAGE = "Archmage Emeritus", BREACH = "Underworld Breach", OGRE = "Treasonous Ogre", RELIC = "Relic of Legends";
const STAFF = "Wizard's Staff";
const KEFKA = "Kefka, Court Mage // Kefka, Ruler of Ruin", KITTEN = "Displacer Kitten", GOGO = "Gogo, Mysterious Mime", IRMA = "Irma, Part-Time Mutant";
const ORACLE = "Thassa's Oracle", SNAPCASTER = "Snapcaster Mage", DRAKE = "Gilded Drake", SUBTLETY = "Subtlety", CAVERN = "Cavern of Souls";
const INK = "Ink-Treader Nephilim", EPOCHAL = "Nephilim Epochal", KINNAN = "Kinnan, Bonder Prodigy", CRADLE = "Gaea's Cradle", VITALITY = "Enduring Vitality";
const RHYSTIC = "Rhystic Study", REMORA = "Mystic Remora", WISHCLAW = "Wishclaw Talisman", LED = "Lion's Eye Diamond", TOTEM = "Cursed Totem";
const COLORS = "WUBRG", POOL_KEYS = ["W", "U", "B", "R", "G", "C", "A"];
const COLOR_NAME = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colourless" };
function emptyPool() { return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, A: 0 }; }
/* the deck in play: its commanders and their colour identity */
let DECK = null, COMMANDERS = [], IDENT = "";
function allDecks() { return [...DECKS, ...importedDecks()]; }
function useDeck(id) {
  DECK = allDecks().find(d => d.id === id) || DECKS[0];
  if (DECK.imported) DECK = { ...DECK, cards: DECK.cards.filter(n => C[n]) };   // never play a card the page has no data for
  COMMANDERS = DECK.commanders;
  IDENT = [...COLORS].filter(ch => COMMANDERS.some(n => cardColors(n).includes(ch))).join("");
  try { localStorage.setItem("cge-deck", DECK.id); } catch (e) { /* per-browser only */ }
}
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
    life: 40, opp: [{ life: 40, lib: 92, hand: 7 }, { life: 40, lib: 92, hand: 7 }, { life: 40, lib: 92, hand: 7 }], target: 0,
    pool: emptyPool(), treasures: 0, kDelta: 0, deck: DECK.id,
    lib: [], hand: [], bf: [], gy: [], ex: [], cmd: Object.fromEntries(COMMANDERS.map(n => [n, 0])), cmdZone: [...COMMANDERS],
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
/* Yawgmoth's Will: cards that would go to the graveyard this turn are exiled instead */
function toGy(...names) { for (const n of names) { if (S.ywill === S.turn) S.ex.push({ n }); else S.gy[S.gy.length] = n; } }
function onBf(name) { return S.bf.some(p => (p.copyOf || p.name) === name); }
function countBf(name) { return S.bf.filter(p => (p.copyOf || p.name) === name).length; }
function ident(p) { return p.copyOf || p.name; }
function pumpOf(p) { return p.pump && p.pump.turn === S.turn ? p.pump.n : 0; }
function pump(p, n) { p.pump = { turn: S.turn, n: pumpOf(p) + n }; }
function ppumpOf(p) { return p.ppump && p.ppump.turn === S.turn ? p.ppump.n : 0; }   // power only, like Gogo's +2/+0
/* the back face of a transformed card, or a copy of one */
function backUp(p) { return !!(p.flipped || p.copyBack); }
function basePT(p) {
  if (p.frog) return [1, 1];
  if (p.setPT) return p.setPT;
  const c = C[ident(p)] || {};
  return backUp(p) && c.back ? c.back.pt : c.pt;
}
/* static bonuses: Faeburrow Elder's colours, Nephilim Epochal's Nephilim */
function bonusOf(p) {
  if (p.frog || p.setPT) return 0;
  let b = 0;
  if (ident(p) === "Faeburrow Elder") b += vividColors().length;
  if (typesOf(p).includes("Nephilim") && S.bf.some(q => ident(q) === EPOCHAL && !q.frog)) b += S.bf.filter(q => q !== p && isCreatureP(q) && typesOf(q).includes("Nephilim")).length;
  return b;
}
function toughness(p) { const b = basePT(p); return b ? b[1] + (p.counters || 0) + pumpOf(p) + bonusOf(p) : 1; }
function power(p) {
  const b = basePT(p); if (!b) return 0;
  const kiln = ident(p) === KILN && !p.frog ? S.bf.filter(isArtifactP).length + S.treasures : 0;   // Storm-Kiln Artist: +1/+0 per artifact
  return b[0] + (p.counters || 0) + pumpOf(p) + ppumpOf(p) + bonusOf(p) + kiln;
}
function dmgOf(p) { return p.dmg && p.dmg.turn === S.turn ? p.dmg.n : 0; }
/* a permanent leaves the battlefield: commanders that die or get exiled go to the command zone */
function leaveBf(p, to, why) {
  if (!S.bf.includes(p)) return;
  S.bf = S.bf.filter(x => x !== p);
  if (to === "die" && !p.token && p.name === VITALITY && isCreatureP(p)) {   // it comes back as a plain enchantment
    S.bf.push({ uid: S.nextId++, name: p.name, tapped: false, etbTurn: S.turn, notCreature: true });
    log("dies", { c: short(p.name), why, note: "returned as an enchantment" }); bounceCleanup(p); return;
  }
  if (!p.token) {
    if (COMMANDERS.includes(p.name) && to !== "hand") S.cmdZone.push(p.name);
    else if (to === "hand") S.hand.push(p.name); else if (to === "exile") S.ex.push({ n: p.name }); else toGy(p.name);
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
  if (t.kind === "opp") { const o = S.opp[t.i]; oppLoses(t.i, n, src); log("damage", { from: short(src), amount: n, target: `opponent ${t.i + 1}`, life: o.life }); return true; }
  if (t.kind === "perm") { const p = S.bf.find(x => x.uid === t.uid); if (!p) { log("fizzle", { c: short(src), note: `${t.label} is gone` }); return false; } damagePerm(p, n, src); return true; }
  log("damage", { from: short(src), amount: n, target: "an opponent's permanent" }); return true;
}
function isRalPW(p) { return !!p.flipped && p.name === "Ral, Monsoon Mage // Ral, Leyline Prodigy"; }
function isCreatureP(p) {
  const c = C[ident(p)] || {};
  if (c.k !== "creature" || p.asLand || p.notCreature) return false;
  return backUp(p) ? !!(c.back && c.back.k === "creature") : true;
}
function typesOf(p) { const c = C[ident(p)] || {}; return (backUp(p) && c.back ? c.back.ty : c.ty) || []; }
function cardTypes(n) { const c = C[n] || {}; return c.kt || (c.k ? [c.k] : []); }
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
/* every point of life an opponent loses goes through here, so Kefka, Ruler of Ruin can draw for it */
function oppLoses(i, n, src) {
  if (n <= 0) return;
  S.opp[i].life -= n; S.turnStats.damage += n;
  for (const p of S.bf) if (ident(p) === KEFKA && backUp(p) && !p.frog) for (let k = 0, m = mult(p, false); k < m; k++) S.stack.push(trig("ruler", { src: p.uid, n, opp: i }));
}
function damageEach(n) { for (const i of aliveOpps()) oppLoses(i, n); }
function damageTarget(n) { oppLoses(S.target, n); }

/* parse a cost like "1RU", "R{R/P}", "{U/R}{R/G}" or "XGGG" into {g, W, U, B, R, G, phy, hyb, x} */
function parseCost(s) {
  const out = { g: 0, W: 0, U: 0, B: 0, R: 0, G: 0, phy: null, hyb: [], x: 0 };
  if (!s) return out;
  const m = s.match(/\{([WUBRG])\/P\}/); if (m) { out.phy = m[1]; s = s.replace(m[0], ""); }
  s = s.replace(/\{([WUBRG])\/([WUBRG])\}/g, (_, a, b) => { out.hyb.push(a + b); return ""; });   // hybrid: either colour
  const g = s.match(/^\d+/); if (g) { out.g = +g[0]; s = s.slice(g[0].length); }
  for (const ch of s) if (COLORS.includes(ch)) out[ch]++; else if (ch === "X") out.x++;
  return out;
}
function costTotal(c) { return c.g + (c.hyb || []).length + [...COLORS].reduce((a, ch) => a + (c[ch] || 0), 0); }

/* ------------------------------------------------------------------ mana payment */
const PAIN = { "Mana Confluence": 1, "City of Brass": 1, "Fiery Islet": 1, "Ancient Tomb": 2 };   // pc: hurts for coloured mana only
/* basic land types each fetch can find (I, M, S, P, F for Island, Mountain, Swamp, Plains, Forest), from the card data */
const FETCH = Object.fromEntries(Object.values(C).filter(c => c.fetch).map(c => [c.n, c.fetch]));
const BASIC_TYPE = { Island: "I", Mountain: "M", Swamp: "S", Plains: "P", Forest: "F" };
/* a creature card's printed power, as it is in the library (bonuses only count on the battlefield) */
function printedPower(n) { return ((C[n] || {}).pt || [0])[0]; }
function landTypes(n) { return (C[n] || {}).lt || BASIC_TYPE[n] || ""; }
function fetchTargets(f) {
  const t = FETCH[f] || "";
  return [...new Set(S.lib.filter(n => [...landTypes(n)].some(x => t.includes(x))))];
}
function cardColors(n) { const c = (C[n] || {}).c || ""; return [...COLORS].filter(ch => c.includes(ch)).join(""); }
function amberColors() {   // colours among legendary creatures and planeswalkers you control
  let out = "";
  for (const q of S.bf) { const c = C[ident(q)] || {}; if (c.leg && (isCreatureP(q) || isRalPW(q))) for (const ch of cardColors(ident(q))) if (!out.includes(ch)) out += ch; }
  return out;
}
function drumCreature() {
  return S.bf.filter(q => !q.tapped && isCreatureP(q))
    .sort((a, b) => !!(C[ident(a)] || {}).leg - !!(C[ident(b)] || {}).leg)[0];   // keep legends free for Relic of Legends
}
function isArtifactP(p) { const c = C[ident(p)] || {}; return p.artifact || (!p.flipped && (c.k === "artifact" || (c.kt || []).includes("artifact"))); }
/* ctx is the spell being paid for, when there is one (Cavern of Souls only helps creature spells of its type) */
function sourceColors(p, ctx) {
  const id = ident(p), c = C[id] || {};
  if (p.landColor) return p.landColor;
  if (FETCH[id]) return "";
  if (id === "Chrome Mox") return p.imprint ? cardColors(p.imprint) : "";
  if (id === "Mox Amber") return amberColors();
  if (id === "Mox Opal") return S.bf.filter(isArtifactP).length >= 3 ? COLORS : "";
  if (id === "Gemstone Caverns") return p.luck ? COLORS : "C";
  if (id === "Spire of Industry") return "C" + (S.bf.some(isArtifactP) ? COLORS : "");
  if (id === CAVERN) { const k = ctx && C[ctx.name]; return "C" + (k && k.k === "creature" && (k.ty || []).includes(p.ctype) ? COLORS : ""); }
  if (id === "Delighted Halfling") return "C" + (ctx && (C[ctx.name] || {}).leg ? COLORS : "");   // any colour only for legendary spells
  if (id === CRADLE) return S.bf.some(isCreatureP) ? "G" : "";
  let m = (c.k === "land" || p.asLand) ? ((p.asLand ? C[p.name].mdfc : c.mana) || "C") : (c.mana || "");
  if (m === "vivid") m = vividColors();
  m = m.replace("*", COLORS).replace("ID", IDENT);
  if (isCreatureP(p) && onBf(VITALITY)) m = [...new Set(m + COLORS)].join("");   // Enduring Vitality: creatures tap for any colour
  return m;
}
/* restricted mana: Cavern of Souls' colours only pay for creature spells of its type, Delighted Halfling's only
   for legendary spells. Tapped by hand it waits in S.rpool and is spent first on a spell that qualifies. */
function restriction(p) {
  const id = ident(p);
  if (id === CAVERN) return { kind: "type", type: p.ctype || "Wizard", label: `${p.ctype || "Wizard"} creature spells` };
  if (id === "Delighted Halfling") return { kind: "legendary", label: "legendary spells" };
  return null;
}
function restrictedOk(r, ctx) {
  const k = ctx && C[ctx.name]; if (!k) return false;
  return r.kind === "type" ? k.k === "creature" && (k.ty || []).includes(r.type) : !!k.leg;
}
/* creatures can't use {T} abilities the turn they arrive, unless something gave them haste */
function sick(p) { return isCreatureP(p) && p.etbTurn === S.turn && p.hasteTurn !== S.turn; }
function isManaSource(p, ctx) {
  if (p.tapped || !sourceColors(p, ctx)) return false;
  if (ident(p) === "Springleaf Drum" && !drumCreature()) return false;
  if (sick(p)) return false;
  return true;
}
/* Vivid (Bloom Tender, Faeburrow Elder): the colours among permanents you control */
function vividColors() { return [...COLORS].filter(ch => S.bf.some(q => !q.asLand && cardColors(ident(q)).includes(ch))).join(""); }
function vivid(p) { return (C[ident(p)] || {}).mana === "vivid"; }
/* how much one tap of this source makes, before Kinnan and Utopia Sprawl */
function srcAmt(p) {
  if (ident(p) === CRADLE) return S.bf.filter(isCreatureP).length;
  if (vivid(p)) return vividColors().length || 1;
  return (p.asLand ? 1 : (C[ident(p)] || {}).amt) || 1;
}
function kinnans() { return S.bf.filter(q => ident(q) === KINNAN && !q.frog).length; }
function painFor(p, make) { const id = ident(p), c = C[id] || {}; return c.pc || id === "Spire of Industry" ? (make === "C" ? 0 : (c.pc || 1)) : (PAIN[id] || 0); }
/* color "X" asks for generic mana: any colour will do */
function tapFor(p, color, ctx) {
  const id = ident(p), c = C[id] || {};
  const amt = srcAmt(p);
  const cols = sourceColors(p, ctx);
  let make;
  if (color !== "X" && cols.includes(color)) make = color;
  else if (cols.includes("C")) make = "C";
  else make = cols.includes("R") ? "R" : (cols[0] || "C");
  p.tapped = true;
  const out = { make, pain: painFor(p, make) };
  if (id === "Springleaf Drum") { const cr = drumCreature(); if (cr) { cr.tapped = true; out.drum = short(cr.name); } }
  if (out.pain) S.life -= out.pain;
  const vc = vivid(p) ? vividColors() : "";
  if (vc && (color === "X" || vc.includes(color))) { for (const ch of vc) addMana(ch, 1); out.make = vc; }   // one of each colour
  else addMana(make, amt);
  if (c.k !== "land" && !p.asLand && kinnans()) { addMana(make, kinnans()); out.kinnan = kinnans(); }   // Kinnan: one more of a type it made
  if (p.sprawl) addMana(p.sprawl, 1);   // Utopia Sprawl on this Forest
  if (c.sac) { S.bf = S.bf.filter(q => q !== p); if (!p.token) toGy(p.name); }
  return out;
}
/* lower is better: free single-colour sources first, then painlands, Drum, Vault, and one-shot Petal last */
function srcScore(p, color, ctx) {
  const id = ident(p), cols = sourceColors(p, ctx);
  let sc = cols.length;
  if (color === "X" && cols === "C") sc -= 2;
  if (painFor(p, color === "X" ? (cols.includes("C") ? "C" : "R") : color)) sc += 3;
  if (id === "Springleaf Drum") sc += 4;
  if (id === "Mana Vault" || id === "Grim Monolith") sc += 2;
  if ((C[id] || {}).sac) sc += 6;
  return sc;
}
/* fetch a land that taps for the colour right away: true duals first, then shocks, then basics; tapped lands never help here */
function bestFetchTarget(f, color) {
  const score = n => { const c = C[n] || {}; return (c.shock ? 5 : 0) - 10 * (c.mana || "").length - ((c.mana || "").includes("R") ? 1 : 0); };
  return fetchTargets(f).filter(n => !(C[n] || {}).etb_tapped && (color === "X" || ((C[n] || {}).mana || "").includes(color))).sort((a, b) => score(a) - score(b))[0];
}
function enterLand(name, opts = {}) {
  const c = C[name] || {}, p = { uid: S.nextId++, name, tapped: !!c.etb_tapped || (!!c.town && S.turn > 3), etbTurn: S.turn };   // Starting Town: untapped on turns 1 to 3
  if (c.shock) { if (opts.shock === false) p.tapped = true; else { S.life -= 2; p.paidLife = 2; } }
  S.bf.push(p);
  return p;
}
function crackFetch(f, target, opts = {}) {
  S.bf = S.bf.filter(q => q !== f); toGy(f.name); S.life -= 1;
  S.lib.splice(S.lib.indexOf(target), 1); shuffle(S.lib);
  const land = enterLand(target, opts);
  log("fetch", { c: short(f.name), got: short(target), life: -1 - (land.paidLife || 0), tapped: land.tapped || undefined, auto: opts.auto || undefined });
  return land;
}
function anyInf(inf) { return POOL_KEYS.some(k => inf[k]) || inf.T; }
/* pay from the pool first, then untapped lands / rocks (single-colour first), then treasures */
function autoPay(cost, dry, ctx) {
  /* hybrid pips: try each way of splitting them into colours and pay with the first that works */
  if (cost.hyb && cost.hyb.length) {
    const k = Math.min(cost.hyb.length, 6);
    for (let m = 0; m < (1 << k); m++) {
      const c2 = { ...cost, hyb: [] };
      cost.hyb.forEach((h, i) => { const ch = h[i < k ? (m >> i) & 1 : 0]; c2[ch] = (c2[ch] || 0) + 1; });
      if (autoPay(c2, true, ctx).ok) return autoPay(c2, dry, ctx);
    }
    return { ok: false, tapped: [], lifePaid: 0 };
  }
  const saved = JSON.stringify(S);
  const tapped = [];
  let pain = 0;
  const use = (p, color) => { const r = tapFor(p, color, ctx); pain += r.pain; tapped.push(short(p.name) + (r.drum ? ` (Drum: ${r.drum})` : "")); };
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
    leg.tapped = true; addMana(color === "X" ? "R" : color, 1); tapped.push(`Relic: ${short(ident(leg))}${leg.token ? " token" : ""}`); return true;
  };
  const rp = S.rpool || [];
  const takeRestricted = color => {   // restricted mana goes first: it can't pay for anything else
    const i = rp.findIndex(r => (color === "X" || r.c === color) && restrictedOk(r, ctx)); if (i < 0) return false;
    tapped.push(`${COLOR_NAME[rp[i].c]} for ${rp[i].label}`); rp.splice(i, 1); return true;
  };
  const take = color => {
    if (inf[color] || inf.A || inf.T) return true;
    if (takeRestricted(color)) return true;
    if (S.pool[color] > 0) { S.pool[color]--; return true; }
    if (S.pool.A > 0) { S.pool.A--; return true; }
    const srcs = S.bf.filter(p => isManaSource(p, ctx) && sourceColors(p, ctx).includes(color)).sort((a, b) => srcScore(a, color, ctx) - srcScore(b, color, ctx));
    if (srcs.length) { use(srcs[0], color); return take(color); }
    if (crack(color)) return take(color);
    if (relic(color)) return take(color);
    if (S.treasures > 0) { S.treasures--; tapped.push("Treasure"); addMana(color, 1); return take(color); }
    return false;
  };
  const takeAny = () => {
    if (anyInf(inf)) return true;
    if (takeRestricted("X")) return true;
    for (const k of ["C", "A", ...COLORS]) if (S.pool[k] > 0) { S.pool[k]--; return true; }
    const srcs = S.bf.filter(p => isManaSource(p, ctx)).sort((a, b) => srcScore(a, "X", ctx) - srcScore(b, "X", ctx));
    if (srcs.length) { use(srcs[0], "X"); return takeAny(); }
    if (crack("X")) return takeAny();
    if (relic("X")) return takeAny();
    if (S.treasures > 0) { S.treasures--; tapped.push("Treasure"); addMana("R", 1); return takeAny(); }
    return false;
  };
  let ok = true, lifePaid = 0;
  if (cost.phy) {
    if (cost.phyLife) { S.life -= 2; lifePaid = 2; }
    else cost = { ...cost, [cost.phy]: (cost[cost.phy] || 0) + 1 };
  }
  for (const col of COLORS) for (let i = 0; i < (cost[col] || 0) && ok; i++) ok = take(col);
  for (let i = 0; i < (cost.g || 0) && ok; i++) ok = takeAny();
  if (dry || !ok) S = JSON.parse(saved);
  return { ok, tapped, lifePaid: lifePaid + pain };
}
function availableMana() {
  const relicLegends = onBf(RELIC) ? S.bf.filter(q => !q.tapped && isCreatureP(q) && (C[ident(q)] || {}).leg).length : 0;
  return Object.values(S.pool).reduce((a, b) => a + b, 0) + S.treasures + relicLegends + S.bf.filter(p => FETCH[p.name] && !p.tapped && fetchTargets(p.name).length).length +
    S.bf.filter(p => isManaSource(p)).reduce((s, p) => s + srcAmt(p) + (p.sprawl ? 1 : 0) + ((C[ident(p)] || {}).k !== "land" && !p.asLand ? kinnans() : 0), 0);
}

/* ------------------------------------------------------------------ game flow */
function newGame(deckId) {
  if (typeof deckId === "string") useDeck(deckId);
  S = blankState(); undoStack = []; redoStack = []; updateUndoButtons();
  S.lib = shuffle(DECK.cards.filter(n => !COMMANDERS.includes(n)));
  dealSeven();
  saveLocal(); render();
  toast(`New game with ${DECK.name}. Keep or mulligan; the first mulligan is free.`);
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
function startTurn(opponents) {
  S.turn++;
  S.storm = 0; S.landDrop = false;
  S.turnStats = newTurnStats(S.turn);
  S.ashlingRes = 0;
  S.oppSim = opponents && simOpps ? simulateOpponents() : null;   // their turns happen before your untap step
  for (const p of S.bf) if (ident(p) !== "Mana Vault" && !(C[ident(p)] || {}).nountap) p.tapped = false;   // Mana Vault and Grim Monolith stay tapped unless you pay {4}
  const vaults = S.bf.filter(p => ident(p) === "Mana Vault" && p.tapped);
  if (vaults.length) { S.life -= vaults.length; log("Mana Vault", { life: -vaults.length, note: "tapped at draw step" }); }
  for (const p of S.bf) if (ident(p) === REMORA) S.stack.push(trig("remora", { src: p.uid }));   // cumulative upkeep
  if (S.tTreasures) { S.treasures += S.tTreasures; S.tTreasures = 0; }   // tapped Treasures untap
  draw(1, "draw step");
  render();
}
function endTurn() {
  // end step: Breach is sacrificed, Twinflame / Molten tokens go away, red mana stays with Electro / Ashling
  const breach = S.bf.filter(p => p.name === BREACH);
  if (breach.length) { S.bf = S.bf.filter(p => p.name !== BREACH); toGy(BREACH); }
  S.bf = S.bf.filter(p => !p.temp);
  const keepRed = onBf(ELECTRO) || onBf(ASHLING);
  S.pool = { ...emptyPool(), R: keepRed ? S.pool.R : 0 };
  if (S.inf) { S.inf = { T: S.inf.T, life: S.inf.life, R: keepRed && S.inf.R }; }   // mana empties, Treasures stay
  S.loop = null; S.ralPlus = null; S.combat = null; S.rpool = [];
  for (const p of S.bf) if (p.gogoTurn === S.turn) { delete p.copyOf; delete p.copyBack; delete p.gogoTurn; }   // Gogo is Gogo again
  for (const e of S.ex) if (e.play && e.until <= S.turn) e.play = false;
  log("end turn", { stats: { ...S.turnStats } });
  clearTimeout(turnSaveTimer);
  saveTurn(S.turn, S.turnLog, { ...S.turnStats });
  S.allTurns.push({ turn: S.turn, events: S.turnLog, stats: { ...S.turnStats } });
  S.turnLog = [];
}
/* cleanup step: discard down to the maximum hand size of seven */
const MAX_HAND = 7;
async function cleanupDiscard() {
  const k = S.hand.length - MAX_HAND;
  if (k <= 0) return true;
  const idx = await multiPick(`End of turn: discard ${k} down to ${MAX_HAND} cards`, S.hand, k, [], true, null, "Discard them");
  if (!idx) { toast("The turn goes on. Pass again when you're ready to discard.", "warn"); return false; }
  const names = idx.map(i => S.hand[i]);
  for (const n of names) { S.hand.splice(S.hand.indexOf(n), 1); toGy(n); }
  log("cleanup discard", { cards: names.map(short), hand: S.hand.length });
  return true;
}
async function nextTurn() {
  if (S.stack.length) { toast("Resolve or clear the stack before passing the turn.", "warn"); return; }
  if (S.loseAt === S.turn) {   // Final Fortune's delayed trigger at this turn's end step
    pendingArt = "Final Fortune";
    const v = await openSheet("Final Fortune: you lose the game at this turn's end step.", null, [["Lose the game", "lose", "primary"], ["Not yet", null]]);
    if (v === "lose") await endGame({ result: "loss", method: "Other", note: `Final Fortune's extra turn ended on turn ${S.turn}.` });
    return;
  }
  snapshotUndo();
  if (!(await cleanupDiscard())) { dropSnapshot(); return; }   // closing the discard sheet keeps the turn going
  endTurn();
  const extra = (S.extra || []).shift();
  if (!extra) for (const o of S.opp) if (o.lib > 0) { o.lib--; o.hand++; }   // opponents only draw when they get a turn
  startTurn(!extra);
  await afterOpponents();
  if (extra) { log("extra turn", { from: extra.from }); if (extra.lose) S.loseAt = S.turn; toast(`Extra turn from ${extra.from}.${extra.lose ? " You lose at its end step." : ""}`, "warn"); render(); }
  saveGameMeta(); saveLocal();
}
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
/* ------------------------------------------------------------------ opponents' turns
   Passing the turn plays each opponent's turn at random: spells cast (creature or not), cards drawn
   on their turn and off it. Your cards that watch opponents trigger from that, and opponents pay the
   taxes now and then. The odds live in OPP_SIM. */
const OPP_SIM = {
  spells: [[0, 15], [1, 30], [2, 30], [3, 15], [4, 10]],   // spells an opponent casts on their turn
  noncreature: 0.75,     // chance a spell is noncreature
  cantrip: 0.35,         // chance a spell draws its caster a card
  offTurnDraw: 0.2,      // chance each other opponent draws a card during someone's turn
  landDrop: 0.75,        // chance an opponent with cards in hand plays a land
  maxHand: 7,            // they discard down to this at their end step
  pay: { "Rhystic Study": 0.3, "Mystic Remora": 0.05, "Esper Sentinel": 0.1, "Smothering Tithe": 0.25 },
};
let simOpps = true;
try { simOpps = localStorage.getItem("cge-sim-opps") !== "off"; } catch (e) { /* default on */ }
function rollFrom(table) { let r = rnd() * table.reduce((a, [, w]) => a + w, 0); for (const [k, w] of table) { if (r < w) return k; r -= w; } return table[0][0]; }
function simulateOpponents() {
  const has = n => S.bf.filter(p => ident(p) === n && !p.frog);
  const watch = ["Rhystic Study", REMORA, "Esper Sentinel", "Smothering Tithe", "Tataru Taru", "Gleaming Splendor", "The Queen of Dale", "The Cabbage Merchant", LOTHO];
  const out = { opps: [], got: {}, paid: {}, recruits: 0, watched: watch.some(n => has(n).length) };
  const gain = (src, what, n = 1) => { out.got[src] = out.got[src] || {}; out.got[src][what] = (out.got[src][what] || 0) + n; };
  const taxed = src => { if (rnd() < (OPP_SIM.pay[src] || 0)) { out.paid[src] = (out.paid[src] || 0) + 1; return false; } return true; };
  const alive = aliveOpps();
  for (const i of alive) {
    // their hand: a land drop, then spells while they have cards (cantrips refill it), then cleanup
    const o = S.opp[i], want = rollFrom(OPP_SIM.spells), spells = [];
    if (o.hand > 0 && rnd() < OPP_SIM.landDrop) o.hand--;
    let draws = 1;
    while (spells.length < want && o.hand > 0) {
      o.hand--; spells.push(rnd() < OPP_SIM.noncreature ? "noncreature" : "creature");
      if (rnd() < OPP_SIM.cantrip && o.lib > 0) { draws++; o.hand++; o.lib--; }
    }
    o.hand = Math.min(o.hand, OPP_SIM.maxHand);
    const offTurn = alive.filter(j => j !== i && rnd() < OPP_SIM.offTurnDraw);
    for (const j of offTurn) if (S.opp[j].lib > 0) { S.opp[j].lib--; S.opp[j].hand++; }
    out.opps.push({ i, spells, draws, offTurn });
    const nonc = spells.filter(k => k === "noncreature").length;
    for (const p of has("Rhystic Study")) spells.forEach(() => { if (taxed("Rhystic Study")) gain("Rhystic Study", "draw"); });
    for (const p of has(REMORA)) for (let k = 0; k < nonc; k++) if (taxed(REMORA)) gain(REMORA, "draw");
    if (nonc) {
      for (const p of has("Esper Sentinel")) if (taxed("Esper Sentinel")) gain("Esper Sentinel", "draw");
      for (const p of has("The Queen of Dale")) { gain("The Queen of Dale", "recruit"); out.recruits++; }
    }
    for (const p of has("The Cabbage Merchant")) if (nonc) gain("The Cabbage Merchant", "food", nonc);
    if (spells.length >= 2) for (const p of has(LOTHO)) { gain(LOTHO, "treasure"); gain(LOTHO, "life", -1); }
    for (const p of has("Smothering Tithe")) for (let k = 0; k < draws + offTurn.length; k++) if (taxed("Smothering Tithe")) gain("Smothering Tithe", "treasure");
    if (draws >= 2) for (const p of has("Gleaming Splendor")) gain("Gleaming Splendor", "treasure");
    if (offTurn.length && has("Tataru Taru").length) gain("Tataru Taru", "tapped treasure");   // once each turn
  }
  // apply it: draws, Treasures (Tataru's come in tapped and untap in your untap step), Foods, life
  for (const [src, g] of Object.entries(out.got)) {
    if (g.draw) draw(g.draw, short(src));
    if (g.recruit) draw(g.recruit, short(src));   // the discards are asked for once your turn starts
    if (g.treasure) addTreasure(g.treasure);
    if (g["tapped treasure"]) S.tTreasures = (S.tTreasures || 0) + g["tapped treasure"];
    if (g.food) for (let k = 0; k < g.food; k++) S.bf.push({ uid: S.nextId++, name: FOOD, token: true, tapped: false, etbTurn: S.turn });
    if (g.life) S.life += g.life;
  }
  log("opponents' turns", { opponents: out.opps.map(o => `${o.i + 1}: ${o.spells.length} spells (${o.spells.filter(k => k === "noncreature").length} noncreature), drew ${o.draws}, ${S.opp[o.i].hand} in hand${o.offTurn.length ? ", off-turn draws by " + o.offTurn.map(j => j + 1).join(" and ") : ""}`), you: Object.entries(out.got).map(([src, g]) => `${short(src)}: ${Object.entries(g).map(([w, n]) => `${w} ${n}`).join(", ")}`), paid: Object.keys(out.paid).length ? out.paid : undefined });
  return out;
}
function oppSimLines(sim) {
  const word = { draw: n => `you drew ${n}`, recruit: n => `${n} recruit${n === 1 ? "" : "s"}`, treasure: n => `${n} Treasure${n === 1 ? "" : "s"}`, "tapped treasure": n => `${n} tapped Treasure${n === 1 ? "" : "s"}`, food: n => `${n} Food`, life: n => `${n} life` };
  return [...new Set([...Object.keys(sim.got), ...Object.keys(sim.paid)])].map(src => {
    const g = sim.got[src] || {}, paid = sim.paid[src];
    return `${short(src)}: ${Object.entries(g).map(([w, n]) => word[w](n)).join(", ") || "nothing"}${paid ? ` (they paid ${paid} time${paid === 1 ? "" : "s"})` : ""}`;
  });
}
/* after the opponents' turns: recruit discards, then a summary when your cards cared */
async function afterOpponents() {
  const sim = S.oppSim; if (!sim) return;
  for (let k = 0; k < sim.recruits; k++) {
    if (!S.hand.length) break;
    const n = await pickName("The Queen of Dale: recruit. Discard a card", S.hand, S.hand[S.hand.length - 1], "Discard it", "The Queen of Dale") || S.hand[S.hand.length - 1];
    S.hand.splice(S.hand.indexOf(n), 1); toGy(n);
    const land = (C[n] || {}).k === "land";
    if (!land) S.bf.push({ uid: S.nextId++, name: SOLDIER, token: true, tapped: false, etbTurn: S.turn });
    log("recruit", { c: "The Queen of Dale", discarded: short(n), soldier: !land || undefined });
  }
  if (!sim.watched) return;
  const box = document.createElement("div"); box.className = "form";
  const opps = sim.opps.map(o => `Opponent ${o.i + 1}: ${o.spells.length} spell${o.spells.length === 1 ? "" : "s"} (${o.spells.filter(k => k === "noncreature").length} noncreature), drew ${o.draws}, ${S.opp[o.i].hand} in hand now`);
  const mine = oppSimLines(sim);
  box.innerHTML = `<p class="info" style="margin:0">${opps.map(esc).join("<br>")}</p><p style="margin:8px 0 0"><b>${mine.length ? mine.map(esc).join("<br>") : "Nothing for you this time."}</b></p>`;
  render();
  await openSheet("While your opponents played", box, [["OK", null, "primary"]]);
  render(); saveLocal();
}

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
  kitten:     { nm: "Kitten", src: "Displacer Kitten", rank: 3, label: () => "Displacer Kitten: flicker a nonland permanent" },
  ruler:      { nm: "Ruler", src: "Kefka, Court Mage // Kefka, Ruler of Ruin", rank: 2, label: it => `Kefka, Ruler of Ruin: draw ${it.n}` },
  kefka:      { nm: "Kefka", src: "Kefka, Court Mage // Kefka, Ruler of Ruin", rank: 6, label: it => `Kefka ${it.attack ? "attacks" : "enters"}: each player discards, you draw` },
  oracle:     { nm: "Oracle", src: "Thassa's Oracle", rank: 6, wait: true, label: () => "Thassa's Oracle: look at the top X, win if X ≥ library" },   // wait: never resolves by itself, you respond to it
  snap:       { nm: "Snapcaster", src: "Snapcaster Mage", rank: 6, label: () => "Snapcaster Mage: give an instant or sorcery flashback" },
  drake:      { nm: "Drake", src: "Gilded Drake", rank: 6, label: () => "Gilded Drake: exchange control, or sacrifice it" },
  subtlety:   { nm: "Subtlety", src: "Subtlety", rank: 6, label: () => "Subtlety: put a creature or planeswalker spell on top or bottom" },
  evoke:      { nm: "Evoke", rank: 7, label: it => `Evoke: sacrifice ${short(it.name || "Subtlety")}` },
  remora:     { nm: "Remora", src: "Mystic Remora", rank: 1, label: () => "Mystic Remora: cumulative upkeep {1}" },
  gogo:       { nm: "Gogo", src: "Gogo, Mysterious Mime", rank: 5, label: () => "Gogo: become a copy of another creature" },
  irma:       { nm: "Irma", src: "Irma, Part-Time Mutant", rank: 5, label: () => "Irma: become a copy of another creature, +1/+1 counter" },
  // activated abilities: the cost is paid on activation, the effect waits on the stack
  abWish:     { nm: "Wishclaw", src: "Wishclaw Talisman", rank: 6, label: () => "Wishclaw Talisman: search for a card, then an opponent gains control of it" },
  abKinnan:   { nm: "Kinnan", src: "Kinnan, Bonder Prodigy", rank: 6, label: () => "Kinnan: look at the top five, put a non-Human creature onto the battlefield" },
  abDrsB:     { nm: "Deathrite", src: "Deathrite Shaman", rank: 6, label: it => `Deathrite Shaman: exile ${it.card ? short(it.card) : "an opponent's card"}, each opponent loses 2` },
  abDrsG:     { nm: "Deathrite", src: "Deathrite Shaman", rank: 6, label: it => `Deathrite Shaman: exile ${it.card ? short(it.card) : "an opponent's card"}, you gain 2` },
  abKefka8:   { nm: "Kefka {8}", src: "Kefka, Court Mage // Kefka, Ruler of Ruin", rank: 6, label: () => "Kefka {8}: each opponent sacrifices a permanent, transform Kefka" },
  abIslet:    { nm: "Islet", src: "Fiery Islet", rank: 6, label: () => "Fiery Islet: draw a card" },
  abZone:     { nm: "Emergence Zone", src: "Emergence Zone", rank: 6, label: () => "Emergence Zone: cast spells as though they had flash this turn" },
  abMinamo:   { nm: "Minamo", src: "Minamo, School at Water's Edge", rank: 6, label: it => `Minamo: untap ${it.label || "a legendary permanent"}` },
  abFlip:     { nm: "Scoundrel", src: "Tavern Scoundrel", rank: 6, label: () => "Tavern Scoundrel: flip a coin" },
  abUntap:    { nm: "Untap", rank: 6, label: it => `Untap ${short(it.name)}` },
  abFood:     { nm: "Food", rank: 6, label: () => "Food: you gain 3 life" },
  abGleam:    { nm: "Gleaming", src: "Gleaming Splendor", rank: 6, label: it => `Gleaming Splendor: ${it.targets.map(t => t === "me" ? "you" : `opponent ${t + 1}`).join(" and ")} draw` },
  abOtawara:  { nm: "Otawara", src: "Otawara, Soaring City", rank: 6, label: () => "Otawara channel: return a permanent to its owner's hand" },
  abBoseiju:  { nm: "Boseiju", src: "Boseiju, Who Endures", rank: 6, label: () => "Boseiju channel: destroy an opponent's artifact, enchantment or nonbasic land" },
  abCycle:    { nm: "Wizardcycling", src: "Step Through", rank: 6, label: () => "Wizardcycling: search for a Wizard" },
  abHarnfel:  { nm: "Harnfel", src: "Birgi, God of Storytelling // Harnfel, Horn of Bounty", rank: 6, label: () => "Harnfel: exile the top two, play them this turn" },
  lotho:      { nm: "Lotho", src: "Lotho, Corrupt Shirriff", rank: 1, label: () => "Lotho: you lose 1 life and create a Treasure" },
  ink:        { nm: "Ink-Treader", src: "Ink-Treader Nephilim", rank: 7, label: it => `Ink-Treader Nephilim: copy ${short(it.name)} for each other creature` },
  seeker:     { nm: "Spellseeker", src: "Spellseeker", rank: 6, label: () => "Spellseeker: find an instant or sorcery (MV 2 or less)" },
  epochal:    { nm: "Epochal", src: "Nephilim Epochal", rank: 6, label: () => "Nephilim Epochal: find a Nephilim card" },
  tataru:     { nm: "Tataru", src: "Tataru Taru", rank: 6, label: () => "Tataru Taru: you draw, an opponent may draw" },
  storm:      { nm: "Storm", rank: 8, label: it => `Storm: ${it.count} cop${it.count === 1 ? "y" : "ies"} of ${short(it.name)}` },
  krark:      { nm: "Krark", src: KRARK, rank: 9, label: it => `Krark: flip for ${short(it.name)}` },
};
const ETB_TRIG = { [MONK]: "monk", [DUAL]: "dualcaster", [RECRUITER]: "recruiter", [KEFKA]: "kefka", [ORACLE]: "oracle", [SNAPCASTER]: "snap", [DRAKE]: "drake", [SUBTLETY]: "subtlety",
  "Spellseeker": "seeker", "Nephilim Epochal": "epochal", "Tataru Taru": "tataru" };
/* the ETB trigger a permanent has: Kefka's back face has none, and a Frog from Amphibian Downpour has no abilities */
function etbEff(p) { if (p.frog || (ident(p) === KEFKA && backUp(p))) return null; return ETB_TRIG[ident(p)] || null; }
let holdPriority = true, askOrder = true, quiet = false;   // hold priority: nothing resolves until you say so
try { holdPriority = localStorage.getItem("krark-playtest-hold") !== "off"; askOrder = localStorage.getItem("krark-playtest-ask-order") !== "off"; } catch (e) { /* defaults */ }
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
    if (p.frog) continue;
    const id = ident(p), m = mult(p, isIS);
    const add = eff => { for (let i = 0; i < m; i++) out.push(trig(eff, { src: p.uid })); };
    if (id === KITTEN && noncreature) add("kitten");
    if (id === "Lotho, Corrupt Shirriff" && S.turnStats.casts === 2) add("lotho");   // your second spell this turn
    if (id === INK && isIS && item.target && item.target.kind === "perm" && item.target.uid === p.uid) out.push(trig("ink", { src: p.uid, name, spellId: item.id }));
    if (id === BIRGI && !p.flipped) add("birgi");
    else if (id === ELECTRO && isIS) add("electro");
    else if (id === VIVI && noncreature) add("vivi");
    else if (id === RAL && isIS && !p.flipped) add("ral");
    if (noncreature && isCreatureP(p)) { const pw = ((C[id] || {}).prowess ? 1 : 0) + (p.staff ? 1 : 0); if (pw) pump(p, pw * m); }
  }
  if (isIS) {
    const k = krarkTriggers();
    if (krarkRaw() >= KRARK_CAP && !S.unfailable) { S.unfailable = true; log("Krark cap", { triggers: krarkRaw(), note: "100+ Krark triggers: unfailable" }); }
    for (let i = 0; i < k; i++) out.push(trig("krark", { name, spellId: item.id, mode: item.mode, target: item.target }));
    S.turnStats.krarkTriggers += k;
    out.push(...magecraftItems());
    if (c.storm && S.storm > 1) out.push(trig("storm", { name, count: S.storm - 1, mode: item.mode }));
  } else if (c.storm && S.storm > 1) out.push(trig("storm", { name, count: S.storm - 1 }));   // Amphibian Downpour: copies become tokens
  return out;
}
/* Magecraft: whenever you cast or copy an instant or sorcery */
function magecraftItems() {
  const out = [];
  for (const p of S.bf) {
    if (p.frog) continue;
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
const METRIC_NAMES = { W: "W", U: "U", B: "B", R: "R", G: "G", C: "C", A: "any", treasures: "Treasures", storm: "storm", life: "life", hand: "hand", lib: "library", gy: "graveyard", draws: "draws", copies: "copies", flipsWon: "flips won", krarkTriggers: "Krark triggers", casts: "casts", damage: "damage dealt" };
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
  for (const k of [...POOL_KEYS, "treasures", "life", "lib"]) if ((d[k] || 0) < 0 && !(S.inf && S.inf[k === "treasures" ? "T" : k])) times = Math.min(times, Math.floor((cur[k] - (k === "life" ? 1 : 0)) / -d[k]));
  times = Math.max(0, times);
  for (const k of POOL_KEYS) if (d[k]) S.pool[k] = Math.max(0, S.pool[k] + d[k] * times);
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
  for (const k of POOL_KEYS) if (d[k] > 0) { S.inf[k] = true; out.push(k + " mana"); }
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
function instantSpeed(name) { const c = C[name]; return c.k === "instant" || c.flash || S.flashTurn === S.turn; }
async function cast(name, zone, opts = {}) {
  const c = C[name]; if (!c) return;
  const free = !!opts.free;
  let cost = parseCost(c.c);
  if (zone === "cmd") cost.g += 2 * S.cmd[name];
  if (zone === "flashback") cost = parseCost(c.fb || c.c);
  if (zone === "harmonize") cost = parseCost("XGGGG");
  if (opts.cost) cost = parseCost(opts.cost);
  if (opts.phyLife) cost.phyLife = true;
  const rals = S.bf.filter(p => ident(p) === RAL && !p.flipped).length + (S.ralPlus && S.ralPlus.turn === S.turn ? S.ralPlus.n : 0);
  if (isSpell(name) && rals) cost.g = Math.max(0, cost.g - rals);
  if (!opts.noSnap) snapshotUndo();
  let fuel = null;
  if (zone === "escape") { fuel = await chooseFuel(name); if (!fuel) { if (!opts.noSnap) dropSnapshot(); return false; } }
  const add = await additionalCost(name, cost, opts, zone);   // bargain, X, convoke, X life, sacrifices, kicker
  if (!add) { if (!opts.noSnap) dropSnapshot(); return false; }
  let paid = { ok: true, tapped: [], lifePaid: 0 };
  if (!free) {
    paid = autoPay(cost, false, { name });
    if (!paid.ok) { if (!opts.noSnap) dropSnapshot(); if (opts.quietFail) return false; toast(`Not enough mana for ${short(name)} (${c.c || "0"}${zone === "cmd" && S.cmd[name] ? " + tax " + 2 * S.cmd[name] : ""}). Tap lands or add mana first.`, "bad"); render(); return false; }
  }
  const below = S.stack.length;
  // leave the zone
  if (zone === "hand") S.hand.splice(S.hand.indexOf(name), 1);
  else if (zone === "exile") S.ex = S.ex.filter(e => e.n !== name);
  else if (zone === "escape" || zone === "flashback" || zone === "gycast" || zone === "harmonize") { S.gy.splice(S.gy.indexOf(name), 1); if (zone === "escape") exileFuel(fuel, name); }
  else if (zone === "cmd") { S.cmdZone = S.cmdZone.filter(x => x !== name); S.cmd[name]++; }
  S.storm++; S.turnStats.casts++;
  if (isSpell(name)) S.turnStats.instsorc++;
  const item = { id: S.nextId++, kind: "spell", name, from: zone, ...add.item };
  if (opts.back) item.back = true;
  if (opts.evoke) item.evoke = true;
  if (add.life) { S.life -= add.life; paid.lifePaid += add.life; }
  if (add.sac) { leaveBf(add.sac, "die", "additional cost"); }
  if (c.burn) { item.target = quiet && S.repeatTarget ? S.repeatTarget : await chooseTarget(`${short(name)}: ${c.burn} damage to what?`, c.burn); if (quiet) S.repeatTarget = item.target; }
  if (c.tgt) { item.target = quiet && S.repeatTarget ? S.repeatTarget : await chooseCreature(name, c.tgt); if (quiet) S.repeatTarget = item.target; }
  if (c.jeska) item.mode = commanderOut() ? "both" : ((await openSheet("Jeska's Will without a commander out: choose one mode", null, [[`Add R for each card in the opponent's hand (${S.opp[S.target].hand})`, "mana", "primary"], ["Exile the top three, play them this turn", "exile"]])) || "mana");
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
  const top = S.stack[S.stack.length - 1];
  if (S.stack.length && !quiet) toast(k ? `${short(name)} is on the stack with ${k} Krark trigger${k === 1 ? "" : "s"} above it. Resolve them one at a time, or respond.`
    : top.kind === "trigger" && TRIG[top.eff].wait ? `${stackLabel(top)}: the trigger is waiting. Respond now (Demonic Consultation, Tainted Pact) or resolve it.` : `${stackLabel(top)} is on the stack. Resolve it or respond.`);
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
  if (it.kind === "spell") {
    if (it.from === "flashback" || it.from === "harmonize" || it.name === "Eldritch Evolution") S.ex.push({ n: it.name });
    else if (it.name === "Green Sun's Zenith") { S.lib.push(it.name); shuffle(S.lib); log("shuffle", { c: "Green Sun's Zenith", note: "shuffled into the library" }); }
    else toGy(it.name);
  }
}
async function resolvePermanent(it) {
  const extra = {};
  if (it.back) extra.flipped = true;
  if (it.kind === "copy") extra.token = true;   // a copy of a permanent spell becomes a token
  if (it.evoke) extra.evoked = true;
  log("resolve", { c: short(it.name) + (it.kind === "copy" ? " (token copy)" : "") });
  await enterBf(it.name, extra);
}
/* a permanent enters: as-it-enters choices, then its ETB trigger (copies and clones get it too) */
async function enterBf(name, extra = {}) {
  const p = { uid: S.nextId++, name, tapped: false, etbTurn: S.turn, ...extra };
  S.bf.push(p);
  render();
  await etb(p);
  const eff = etbEff(p);
  if (eff === "dualcaster") noteDualcasterLoop();
  const items = eff && S.bf.includes(p) ? Array.from({ length: mult(p, false) }, () => trig(eff, { src: p.uid })) : [];
  if (p.evoked && S.bf.includes(p)) items.push(trig("evoke", { src: p.uid, name }));
  if (items.length) {
    const empty = !S.stack.length;
    await putTriggers(items, `${short(name)} entered`);
    if (empty && items.length === 1 && !TRIG[eff || "evoke"].wait) items[0].auto = true;
    if (items.some(t => TRIG[t.eff].wait)) toast(`${short(name)}'s trigger is waiting on the stack. Respond now (Demonic Consultation, Tainted Pact) or resolve it.`, "win");
  }
  return p;
}
/* an activated ability that uses the stack: its cost is paid already, the effect waits for you to resolve it */
async function pushAbility(eff, extra = {}) {
  const empty = !S.stack.length;
  const it = { id: S.nextId++, kind: "trigger", eff, ability: true, ...extra };
  S.stack.push(it);
  if (empty && !holdPriority) it.auto = true;
  log("activate", { c: TRIG[eff].label(it) });
  render(); await settle();
  if (S.stack.includes(it)) toast(`${TRIG[eff].label(it)}: on the stack. Respond or resolve it.`);
}
async function resolveAbility(it) {
  const e = it.eff, src = S.bf.find(q => q.uid === it.src);
  if (e === "abWish") { await tutor(WISHCLAW); if (src) { giveAway(src, "Wishclaw Talisman"); toast("An opponent controls Wishclaw Talisman now. It waits in your exile pile; take it back from there if it returns."); } }
  else if (e === "abKinnan") {
    const top = S.lib.splice(0, 5);
    const ok = top.filter(n => (C[n] || {}).k === "creature" && !(C[n].ty || []).includes("Human"));
    const n = ok.length ? await pickName(`Kinnan: top five are ${top.map(short).join(", ")}. Put a non-Human creature onto the battlefield?`, ok, ok[0], "Put it in", KINNAN) : null;
    S.lib.push(...shuffle(top.filter(x => x !== n)));
    log("Kinnan", { saw: top.map(short), put: n ? short(n) : "nothing" });
    if (n) await enterBf(n);
  } else if (e === "abDrsB" || e === "abDrsG") {
    if (it.card && !S.gy.includes(it.card)) { log("fizzle", { c: "Deathrite Shaman", note: `${short(it.card)} left the graveyard` }); return; }
    if (it.card) { S.gy.splice(S.gy.lastIndexOf(it.card), 1); S.ex.push({ n: it.card }); }
    if (e === "abDrsB") { damageEach(2); log("Deathrite Shaman", { exiled: it.card ? short(it.card) : "an opponent's card", note: "each opponent loses 2" }); }
    else { S.life += 2; log("Deathrite Shaman", { exiled: it.card ? short(it.card) : "an opponent's card", life: 2 }); }
  } else if (e === "abKefka8") {
    if (src && !src.flipped) { src.flipped = true; toast("Kefka, Ruler of Ruin: whenever an opponent loses life during your turn, you draw that many.", "win"); }
    log("Kefka", { ability: "{8}", note: src ? "each opponent sacrificed a permanent; Kefka transformed" : "each opponent sacrificed a permanent; Kefka was gone, so no transform" });
  } else if (e === "abIslet") draw(1, "Fiery Islet");
  else if (e === "abZone") { S.flashTurn = S.turn; log("Emergence Zone", { note: "spells have flash this turn" }); toast("You can cast spells as though they had flash this turn.", "win"); }
  else if (e === "abMinamo") { const t = S.bf.find(q => q.uid === it.target); if (t) { t.tapped = false; log("Minamo", { untapped: permLabel(t) }); } else log("fizzle", { c: "Minamo", note: "the target left" }); }
  else if (e === "abFlip") {
    const win = rnd() < 0.5;
    log("Tavern Scoundrel", { flip: win ? "W" : "L" });
    if (win) { S.turnStats.flipsWon++; await putTriggers(flipWonItems(), "Tavern Scoundrel won a flip"); toast("Won the flip: Tavern Scoundrel's trigger is on the stack.", "win"); }
    else toast("Lost the flip.", "warn");
  } else if (e === "abUntap") { if (src) src.tapped = false; log("untap " + short(it.name), {}); }
  else if (e === "abFood") { S.life += 3; log("Food", { life: 3 }); }
  else if (e === "abGleam") { for (const t of it.targets) { if (t === "me") draw(1, "Gleaming Splendor"); else await oppDrew(t, "Gleaming Splendor"); } }
  else if (e === "abOtawara") {
    const t = await pickPerm("Otawara: return which nonland permanent?", S.bf.filter(q => (C[ident(q)] || {}).k !== "land" && !q.asLand), "Return mine", "An opponent's", "Otawara, Soaring City");
    if (t && t !== "opp") leaveBf(t, "hand", "Otawara"); else log("channel Otawara", { note: "an opponent's permanent" });
  } else if (e === "abBoseiju") log("channel Boseiju", { note: "destroyed an opponent's artifact, enchantment or nonbasic land; they may fetch a basic-typed land" });
  else if (e === "abCycle") {
    const wiz = [...new Set(S.lib.filter(n => (C[n].ty || []).includes("Wizard")))];
    const n = wiz.length ? await pickName("Wizardcycling: find a Wizard", wiz, wiz[0], "Take it", "Step Through") : null;
    if (n) { S.lib.splice(S.lib.indexOf(n), 1); S.hand.push(n); } shuffle(S.lib);
    log("wizardcycle", { found: n ? short(n) : "nothing" });
  } else if (e === "abHarnfel") {
    const ex = S.lib.splice(0, 2);
    for (const n of ex) S.ex.push({ n, play: true, until: S.turn });
    log("Harnfel", { exiled: ex.map(short) });
    toast(`Harnfel exiled ${ex.map(short).join(" and ")}. Play them from exile this turn.`, "win");
  }
}
async function resolveTrigger(it) {
  if (it.ability) return resolveAbility(it);
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
      if (orig) { S.stack = S.stack.filter(x => x !== orig); if (orig.from === "flashback" || orig.from === "harmonize") S.ex.push({ n: orig.name }); else S.hand.push(orig.name); }
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
    const inf = S.inf && anyInf(S.inf);
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
  else await resolveKefkaTrigger(it);
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
    const n = pf.get(); if (S.hand.includes(n)) { S.hand.splice(S.hand.indexOf(n), 1); toGy(n); }
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
  const pool = [...new Set(S.lib.filter(n => C[n] && C[n].k === "creature" && printedPower(n) <= 2))].sort((a, b) => short(a).localeCompare(short(b)));
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
  if (!cands.length) { log("effect", { c: short(source), note: "used on an opponent's spell or ability" + (C[source].bird ? "; they get a 2/2 Bird" : "") }); return; }
  const pick = await stackPicker(`${short(source)}: what does it hit?`, cands, [["Counter it", "go", "primary"], ["An opponent's spell or ability", "opp"]]);
  if (!pick || typeof pick !== "object") { log("effect", { c: short(source), note: "used on an opponent's spell or ability" }); return; }
  removeFromStack(pick, source === "Force of Negation" ? "ex" : "gy");
  log("counter", { c: short(source), hit: stackLabel(pick) });
  if (C[source].bird && pick.kind !== "trigger") { const b = { uid: S.nextId++, name: BIRD, token: true, tapped: false, etbTurn: S.turn }; S.bf.push(b); log("token", { of: "Bird", note: `${short(source)} countered your own spell` }); }
}
function removeFromStack(it, to) {
  S.stack = S.stack.filter(x => x !== it);
  if (it.kind !== "spell") return;
  if (to === "hand") S.hand.push(it.name);
  else if (to === "ex" || it.from === "flashback" || it.from === "harmonize") S.ex.push({ n: it.name });
  else toGy(it.name);
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
    const opts = S.hand.filter(n => C[n] && !cardTypes(n).some(t => t === "land" || t === "artifact"));
    if (!opts.length) { log("imprint", { c: "Chrome Mox", card: "none" }); toast("Chrome Mox: nothing to imprint, so it makes no mana.", "warn"); return; }
    const pf = pickFrom(opts, opts.find(n => !isSpell(n) || n === "Simian Spirit Guide") || opts[0]);
    pendingArt = id;
    const v = await openSheet("Chrome Mox: imprint a nonartifact, nonland card", pf.list, [["Imprint", "go", "primary"], ["No imprint", null]]);
    if (v === "go" && pf.get()) { const n = pf.get(); S.hand.splice(S.hand.indexOf(n), 1); S.ex.push({ n }); p.imprint = n; log("imprint", { c: "Chrome Mox", card: short(n), colors: cardColors(n) || "none" }); }
  } else if (id === "Mox Diamond") {
    const lands = S.hand.filter(n => C[n] && C[n].k === "land");
    let v = null, pf = null;
    if (lands.length) { pf = pickFrom(lands); pendingArt = id; v = await openSheet("Mox Diamond: discard a land, or it goes to the graveyard", pf.list, [["Discard it", "go", "primary"], ["Don't", null]]); }
    if (v === "go" && pf.get()) { const n = pf.get(); S.hand.splice(S.hand.indexOf(n), 1); toGy(n); log("Mox Diamond", { discarded: short(n) }); }
    else { S.bf = S.bf.filter(q => q !== p); toGy(id); log("Mox Diamond", { note: "no land discarded, to graveyard" }); toast("Mox Diamond went to the graveyard.", "warn"); }
  } else if (id === "Phyrexian Metamorph" || id === SAKA) await chooseCopyOf(p);
  else if (id === CAVERN) {
    const types = [...new Set(DECK.cards.concat(COMMANDERS).flatMap(n => (C[n] || {}).k === "creature" ? (C[n].ty || []) : []))].sort();
    const pre = types.includes("Wizard") ? "Wizard" : types[0];
    const wrap = document.createElement("div"); wrap.className = "form";
    wrap.innerHTML = `<label for="cavT">Creature type</label><select id="cavT">${types.map(t => `<option ${t === pre ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
    pendingArt = id;
    await openSheet("Cavern of Souls: choose a creature type", wrap, [["Choose it", "go", "primary"]]);
    p.ctype = ($("cavT") && $("cavT").value) || pre;
    log("Cavern of Souls", { type: p.ctype });
  } else if (id === WISHCLAW) p.wish = 3;
  else if (id === "Utopia Sprawl") {
    const forests = S.bf.filter(q => landTypes(ident(q)).includes("F"));
    const land = forests.length ? await pickPerm("Utopia Sprawl: enchant which Forest?", forests, "Enchant it", null, id) : null;
    if (!land || land === "opp") { S.bf = S.bf.filter(q => q !== p); toGy(id); log("Utopia Sprawl", { note: "no Forest to enchant, to graveyard" }); toast("Utopia Sprawl needs a Forest (Bayou, Savannah, Taiga or Tropical Island).", "warn"); return; }
    pendingArt = id;
    const col = await openSheet("Utopia Sprawl: choose a colour", null, [...(IDENT || COLORS)].map((x, i) => [COLOR_NAME[x], x, i === 0 ? "primary" : ""])) || (IDENT || "G")[0];
    land.sprawl = col; p.on = land.uid;
    log("Utopia Sprawl", { on: short(land.name), colour: col });
  }
  else if (id === "Amphibian Downpour") {
    const t = await pickPerm("Amphibian Downpour: enchant which creature?", S.bf.filter(q => q !== p && isCreatureP(q)), "Enchant mine", "An opponent's creature", id);
    if (t && t !== "opp") { t.frog = true; p.on = t.uid; log("enchant", { c: "Amphibian Downpour", on: permLabel(t), note: "it's a 1/1 Frog with no abilities" }); }
    else { p.on = "opp"; log("enchant", { c: "Amphibian Downpour", on: "an opponent's creature" }); }
  }
}
/* Sakashima copies another creature you control and keeps its own "no legend rule" ability;
   Phyrexian Metamorph copies any artifact or creature. Both pick as they enter. */
async function chooseCopyOf(p) {   // only as it enters; the choice can't change later (use Undo to fix a misclick)
  const saka = p.name === SAKA;
  const names = [...new Set(S.bf.filter(q => q !== p && C[ident(q)] && (saka ? isCreatureP(q) : isCreatureP(q) || isArtifactP(q))).map(ident))];
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
  for (const n of names) { S.hand.splice(S.hand.indexOf(n), 1); toGy(n); }
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
  const eff = tokens.length && etbEff(tokens[0]);
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
  if (c.ritual) {
    const base = name === "Cabal Ritual" && S.gy.length >= 7 ? 5 : name === "Rite of Flame" ? 2 + S.gy.filter(x => x === name).length : c.ritual;   // threshold; Rite counts Rites in graveyards
    const col = c.rc || "R", k = base * n;
    addMana(col, k); log("effect", { c: short(name), mana: col + k, threshold: k > c.ritual * n || undefined });
  }
  if (c.jeska) {
    const mode = opts.mode || (commanderOut() ? "both" : "mana"), both = mode === "both";
    const mana = both || mode === "mana" ? S.opp[S.target].hand * n : 0; if (mana) addMana("R", mana);
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
  if (c.tutor && name !== "Beseech the Mirror") for (let i = 0; i < n; i++) await tutor(name);
  if (c.clone) {
    const target = await chooseCloneTarget(name, n);
    if (target) {
      const have = S.bf.filter(p => ident(p) === target).length, make = Math.max(0, Math.min(n, KRARK_CAP - have));
      const made = [];
      for (let i = 0; i < make; i++) { const tok = { uid: S.nextId++, name: target, copyOf: target, token: true, temp: true, tapped: false, hasteTurn: S.turn, artifact: name === "Molten Duplication" || undefined }; S.bf.push(tok); made.push(tok); }
      log("effect", { c: short(name), tokens: make, of: short(target), capped: make < n || undefined });
      await tokenEtb(made, target, name);
    }
  }
  if (c.copier) await copyFromStack(name, name === "Return the Favor");
  if (c.k === "instant" && c.protect && name !== "Commandeer") await counterFromStack(name);
  if (KEFKA_SPELLS.includes(name)) for (let i = 0; i < n; i++) await kefkaSpell(name, opts || {});
  if (TFX[name]) for (let i = 0; i < n; i++) await targetFx(name, opts || {});
  if (NEPH_SPELLS.includes(name)) for (let i = 0; i < n; i++) await nephSpell(name, opts || {});
}
const KEFKA_SPELLS = ["Beseech the Mirror", "Chain of Vapor", "Commandeer", "Demonic Consultation", "Essence Flux", "Final Fortune", "Fire Covenant", "Flashback",
  "Reanimate", "Redirect Lightning", "Saw in Half", "Snuff Out", "Tainted Pact", "Toxic Deluge", "Unsubstantiate", "Yawgmoth's Will"];

/* ------------------------------------------------------------------ Kefka deck: blue-black-red cards
   Flicker, Thassa's Oracle, tutors, Kefka's discards and the rest. Choices an opponent would make
   (what they discard, whether they pay for Rhystic Study) are asked of you. */
const KIND_WORD = { land: "Land", creature: "Creature", instant: "Instant", sorcery: "Sorcery", artifact: "Artifact", enchantment: "Enchantment", planeswalker: "Planeswalker", battle: "Battle" };
function permLabel(p) { return short(p.name) + (p.copyOf && p.copyOf !== p.name ? " as " + short(p.copyOf) : "") + (p.token ? " (token)" : ""); }
/* one of your permanents, or something an opponent controls that the page doesn't track */
async function pickPerm(title, perms, okLabel, oppLabel, art) {
  const wrap = document.createElement("div"); wrap.className = "picklist";
  let tgt = perms[0] || null;
  perms.forEach(p => { const b = document.createElement("button"); b.className = "pick mine" + (p === tgt ? " sel" : ""); b.textContent = permLabel(p); b.onclick = () => { tgt = p; [...wrap.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); }; wrap.append(b); });
  if (!perms.length) wrap.innerHTML = `<p class="info">You control nothing that fits.</p>`;
  pendingArt = art;
  const btns = [];
  if (perms.length) btns.push([okLabel, "go", "primary"]);
  if (oppLabel) btns.push([oppLabel, "opp", perms.length ? "" : "primary"]);
  btns.push(["Nothing", null]);
  const v = await openSheet(title, wrap, btns);
  return v === "go" ? tgt : v === "opp" ? "opp" : null;
}
async function pickName(title, names, pre, okLabel, art) {
  pendingArt = art;
  if (names.length > 12) {   // long lists (tutors, Consultation, Chord) get grouping and a search box
    let picked = pre === undefined ? null : pre;
    const box = groupedPicker(names, n => { picked = n; });
    if (picked) box.querySelectorAll(".pick").forEach(b => { if (b.dataset.q === picked.toLowerCase()) b.classList.add("sel"); });
    const v = await openSheet(title, box, [[okLabel || "Take it", "go", "primary"], ["Cancel", null]]);
    return v === "go" ? picked : null;
  }
  const pf = pickFrom(names, pre);
  const v = await openSheet(title, pf.list, [[okLabel || "Take it", "go", "primary"], ["Cancel", null]]);
  return v === "go" ? pf.get() : null;
}
/* exile a permanent you control and return it: a new object, untapped, with its ETB trigger again */
async function flicker(p, source) {
  if (!S.bf.includes(p)) return null;
  S.bf = S.bf.filter(q => q !== p);
  bounceCleanup(p);
  log("flicker", { c: permLabel(p), by: short(source) });
  if (p.token) { toast(`${permLabel(p)} was a token, so it stays in exile and stops existing.`, "warn"); return null; }
  return enterBf(p.name);
}
function hasSwamp() { return S.bf.some(p => landTypes(ident(p)).includes("S")); }
function delirium() { return new Set(S.gy.flatMap(cardTypes)).size >= 4; }
function devotion(col) {
  return S.bf.reduce((s, p) => s + (backUp(p) || p.asLand ? 0 : [...((C[ident(p)] || {}).c || "")].filter(ch => ch === col).length), 0);
}
function giveAway(p, why) {   // an opponent gains control; the card waits in exile until you take it back
  S.bf = S.bf.filter(q => q !== p); bounceCleanup(p);
  if (!p.token) S.ex.push({ n: p.name, given: true, wish: p.wish });
  log("control", { c: permLabel(p), to: "an opponent", why });
}
async function legendRule() {   // Sakashima turns it off; otherwise keep one of each legendary name
  if (sakaOut()) return;
  const byName = {};
  for (const p of S.bf) { const k = p.token ? ident(p) : p.name; if ((C[ident(p)] || {}).leg && !p.asLand) (byName[k] = byName[k] || []).push(p); }
  for (const [n, ps] of Object.entries(byName)) {
    if (ps.length < 2) continue;
    const keep = await pickPerm(`Legend rule: keep which ${short(n)}?`, ps, "Keep it", null, n) || ps[0];
    for (const q of ps) if (q !== keep && keep !== "opp") leaveBf(q, "die", "legend rule");
  }
}
/* additional costs paid as the spell is cast */
async function additionalCost(name, cost, opts = {}, zone) {
  const out = { item: {} };
  const c = C[name] || {};
  if (cost.x && !opts.free) {   // X, then convoke or harmonize to pay for it
    const box = document.createElement("div"); box.className = "form";
    box.innerHTML = `<label for="xVal">X (mana you can make now: ${availableMana()})</label><input id="xVal" type="number" min="0" value="${Math.max(0, Math.min(4, availableMana() - costTotal(cost)))}" inputmode="numeric">`;
    pendingArt = name;
    const v = await openSheet(`${short(name)}: choose X`, box, [["Cast it", "go", "primary"], ["Cancel", null]]);
    if (v !== "go") return null;
    out.item.x = Math.max(0, Math.floor(+$("xVal").value || 0)); cost.g += out.item.x * cost.x;
  }
  if (c.convoke && !opts.free) {
    const crs = S.bf.filter(q => isCreatureP(q) && !q.tapped);
    if (crs.length) {
      const idx = await multiPick(`${short(name)}: convoke? Tap creatures to pay {1} or {G} each`, crs.map(ident), crs.length, [], false, name, "Tap them and cast");
      if (idx === null) return null;
      const used = idx.map(i => crs[i]);
      for (const q of used) { q.tapped = true; if (cost.G && cardColors(ident(q)).includes("G")) cost.G--; else if (cost.g) cost.g--; }
      if (used.length) out.item.convoke = used.map(permLabel);
    }
  }
  if (zone === "harmonize") {   // tap a creature to take its power off the generic part
    const crs = S.bf.filter(q => isCreatureP(q) && !q.tapped && power(q) > 0);
    const q = crs.length ? await pickPerm("Harmonize: tap a creature to reduce the cost by its power?", crs, "Tap it", null, name) : null;
    if (q && q !== "opp") { q.tapped = true; cost.g = Math.max(0, cost.g - power(q)); out.item.harmonized = permLabel(q); }
  }
  if (name === "Eldritch Evolution") {
    const crs = S.bf.filter(isCreatureP);
    const q = crs.length ? await pickPerm("Eldritch Evolution: sacrifice which creature?", crs, "Sacrifice it", null, name) : null;
    if (!q || q === "opp") { toast("Eldritch Evolution needs a creature to sacrifice.", "bad"); return null; }
    out.sac = q; out.item.maxMv = 2 + ((C[ident(q)] || {}).mv || 0);
  }
  if (name === "Orim's Chant" && !opts.free) {
    const v = await openSheet("Orim's Chant: pay kicker {W}?", null, [["Kick it", "kick", "primary"], ["No kicker", "no"]]);
    if (v === "kick") { cost.W++; out.item.kicked = true; }
  }
  if (name === "Beseech the Mirror") {
    const fodder = S.bf.filter(p => p.token || ["artifact", "enchantment"].some(k => cardTypes(ident(p)).includes(k)));
    if (fodder.length) {
      const p = await pickPerm("Beseech the Mirror: bargain? Sacrifice an artifact, enchantment or token", fodder, "Sacrifice it", null, name);
      if (p && p !== "opp") { out.sac = p; out.item.bargain = true; }
    }
  } else if (name === "Fire Covenant" || name === "Toxic Deluge") {
    const box = document.createElement("div"); box.className = "form";
    box.innerHTML = `<label for="xLife">X: life to pay (you have ${S.life})</label><input id="xLife" type="number" min="0" value="${name === "Toxic Deluge" ? 3 : 4}" inputmode="numeric">`;
    pendingArt = name;
    const v = await openSheet(`${short(name)}: pay X life`, box, [["Pay it", "go", "primary"], ["Cancel", null]]);
    if (v !== "go") return null;
    out.item.x = Math.max(0, Math.floor(+$("xLife").value || 0)); out.life = out.item.x;
  } else if (name === "Redirect Lightning") {
    pendingArt = name;
    const v = await openSheet("Redirect Lightning: additional cost", null, [["Pay 5 life", "life", "primary"], ["Pay {2}", "mana"], ["Cancel", null]]);
    if (!v) return null;
    if (v === "life") out.life = 5; else cost.g += 2;
  }
  return out;
}
/* every spell effect of the Kefka list that isn't a plain flag */
async function kefkaSpell(name, it) {
  if (name === "Beseech the Mirror") {
    const pool = [...S.lib].sort((a, b) => short(a).localeCompare(short(b)));
    const x = await pickName(`Beseech the Mirror${it.bargain ? " (bargained)" : ""}: search your library`, pool, pool[0], "Exile it face down", name);
    if (!x) return;
    S.lib.splice(S.lib.indexOf(x), 1); shuffle(S.lib);
    const c = C[x] || {};
    if (it.bargain && c.k !== "land" && (c.mv || 0) <= 4) {
      pendingArt = x;
      const v = await openSheet(`Cast ${short(x)} without paying its mana cost?`, null, [["Cast it free", "go", "primary"], ["Put it into your hand", null]]);
      if (v === "go") { S.ex.push({ n: x }); log("Beseech the Mirror", { found: short(x), cast: true }); await cast(x, "exile", { free: true, alt: "Beseech the Mirror", noSnap: true }); return; }
    }
    S.hand.push(x); log("Beseech the Mirror", { found: short(x), to: "hand" });
  } else if (name === "Chain of Vapor") {
    const p = await pickPerm("Chain of Vapor: return which nonland permanent?", S.bf.filter(q => (C[ident(q)] || {}).k !== "land" && !q.asLand), "Return mine", "An opponent's", name);
    if (p === "opp" || !p) { log("effect", { c: "Chain of Vapor", note: p ? "returned an opponent's permanent" : "no target" }); return; }
    leaveBf(p, "hand", "Chain of Vapor");
    const lands = S.bf.filter(q => (C[ident(q)] || {}).k === "land" || q.asLand);
    if (!lands.length) return;
    const l = await pickPerm("Chain of Vapor: sacrifice a land to copy it?", lands, "Sacrifice and copy", null, name);
    if (!l || l === "opp") return;
    leaveBf(l, "die", "Chain of Vapor copy");
    S.stack.push({ id: S.nextId++, kind: "copy", name }); S.turnStats.copies++;
    log("copy", { c: "Chain of Vapor", note: "sacrificed " + short(l.name) });
    await putTriggers(magecraftItems(), "copy of Chain of Vapor");
  } else if (name === "Commandeer") {
    log("effect", { c: "Commandeer", note: "gained control of an opponent's noncreature spell" });
    toast("Commandeer: you control that opponent's spell now. Play it out by hand.");
  } else if (name === "Demonic Consultation") {
    const names = [...new Set(S.lib)].sort((a, b) => short(a).localeCompare(short(b)));
    const NONE = "A card that isn't in your library";
    const oracle = S.hand.includes(ORACLE) || S.stack.some(x => x.name === ORACLE || x.eff === "oracle") || onBf(ORACLE);
    const n = await pickName("Demonic Consultation: name a card", [NONE, ...names], oracle ? NONE : names[0], "Name it", name);
    if (!n) return;
    const ex = S.lib.splice(0, 6);
    let found = null;
    while (S.lib.length) { const x = S.lib.shift(); if (x === n) { found = x; break; } ex.push(x); }
    for (const x of ex) S.ex.push({ n: x });
    if (found) S.hand.push(found);
    log("Demonic Consultation", { named: n === NONE ? "a card not in the library" : short(n), exiled: ex.length, found: found ? short(found) : "nothing", library: S.lib.length });
    toast(found ? `Demonic Consultation found ${short(found)} and exiled ${ex.length} cards.` : `Demonic Consultation exiled your library (${ex.length} cards).`, found ? "" : "warn");
  } else if (name === "Essence Flux") {
    const p = await pickPerm("Essence Flux: exile and return which creature?", S.bf.filter(isCreatureP), "Flicker it", null, name);
    if (!p || p === "opp") return;
    const spirit = typesOf(p).includes("Spirit");
    const np = await flicker(p, name);
    if (np && spirit) { np.counters = (np.counters || 0) + 1; log("counter", { c: short(np.name), counters: np.counters }); }
  } else if (name === "Final Fortune") {
    (S.extra = S.extra || []).push({ from: "Final Fortune", lose: true });
    log("effect", { c: "Final Fortune", note: "extra turn after this one; you lose at its end step" });
  } else if (name === "Fire Covenant") {
    const mine = S.bf.filter(isCreatureP);
    const box = document.createElement("div"); box.className = "form";
    box.innerHTML = `<p class="info" style="margin:0">${it.x || 0} damage to divide. Whatever you don't give your own creatures goes to opponents' creatures.</p>` +
      mine.map(p => `<label for="fc${p.uid}">${esc(permLabel(p))} · ${power(p)}/${toughness(p)}</label><input id="fc${p.uid}" type="number" min="0" value="0" inputmode="numeric">`).join("");
    pendingArt = name;
    await openSheet(`Fire Covenant: ${it.x || 0} damage`, box, [["Deal it", "go", "primary"]]);
    let left = it.x || 0;
    for (const p of mine) { const d = Math.min(left, Math.max(0, Math.floor(+(($("fc" + p.uid) || {}).value) || 0))); if (d) { left -= d; damagePerm(p, d, name); } }
    log("effect", { c: "Fire Covenant", x: it.x || 0, toOpponents: left });
  } else if (name === "Flashback") await grantFlashback(name);
  else if (name === "Reanimate") {
    const gy = [...new Set(S.gy.filter(n => (C[n] || {}).k === "creature"))];
    const n = gy.length ? await pickName("Reanimate: return which creature card?", gy, gy[0], "Return it", name) : null;
    if (!n) { log("effect", { c: "Reanimate", note: "a creature from an opponent's graveyard (by hand)" }); return; }
    S.gy.splice(S.gy.lastIndexOf(n), 1);
    const mv = (C[n] || {}).mv || 0; S.life -= mv;
    log("Reanimate", { c: short(n), life: -mv });
    await enterBf(n);
  } else if (name === "Redirect Lightning") {
    const cands = S.stack.filter(x => x.target).reverse();
    if (!cands.length) { log("effect", { c: "Redirect Lightning", note: "changed the target of an opponent's spell or ability" }); return; }
    const pick = await stackPicker("Redirect Lightning: change the target of what?", cands, [["Change its target", "go", "primary"], ["An opponent's spell or ability", "opp"]]);
    if (!pick || typeof pick !== "object") { log("effect", { c: "Redirect Lightning", note: "changed the target of an opponent's spell or ability" }); return; }
    const before = targetLabel(pick.target);
    pick.target = await chooseTarget(`${stackLabel(pick)}: new target`, (C[pick.name] || {}).burn || 0, pick.target);
    log("retarget", { c: short(pick.name), from: before, to: targetLabel(pick.target), by: "Redirect Lightning" });
  } else if (name === "Saw in Half") {
    const p = await pickPerm("Saw in Half: destroy which creature?", S.bf.filter(isCreatureP), "Destroy mine", "An opponent's creature", name);
    if (!p || p === "opp") { log("effect", { c: "Saw in Half", note: p ? "an opponent's creature: they get two half-size copies" : "no target" }); return; }
    const id = ident(p), back = backUp(p), pt = [Math.ceil(power(p) / 2), Math.ceil(toughness(p) / 2)];
    leaveBf(p, "die", "Saw in Half");
    const toks = [0, 1].map(() => { const t = { uid: S.nextId++, name: id, copyOf: id, token: true, tapped: false, etbTurn: S.turn, setPT: pt }; if (back) t.copyBack = true; S.bf.push(t); return t; });
    log("effect", { c: "Saw in Half", tokens: 2, of: short(id), pt: pt.join("/") });
    render();
    await tokenEtb(toks, id, name);
    await legendRule();
  } else if (name === "Snuff Out") {
    const p = await pickPerm("Snuff Out: destroy which nonblack creature?", S.bf.filter(q => isCreatureP(q) && !cardColors(ident(q)).includes("B")), "Destroy mine", "An opponent's creature", name);
    if (p && p !== "opp") leaveBf(p, "die", "Snuff Out"); else log("effect", { c: "Snuff Out", note: p ? "destroyed an opponent's creature" : "no target" });
  } else if (name === "Tainted Pact") {
    const seen = [];
    for (;;) {
      const x = S.lib[0];
      if (!x) { log("Tainted Pact", { note: "library empty", exiled: seen.length }); toast(`Tainted Pact exiled your whole library (${seen.length} cards).`, "warn"); return; }
      S.lib.shift();
      if (seen.includes(x)) { S.ex.push({ n: x }); log("Tainted Pact", { note: "two with the same name", exiled: seen.length + 1 }); return; }
      pendingArt = x;
      const v = await openSheet(`Tainted Pact: exiled ${short(x)} (${seen.length + 1} so far, ${S.lib.length} left)`, null, [["Put it into your hand", "take", "primary"], ["Keep going", "next"], ["Exile the whole library", "all"]]);
      if (v === "take") { S.hand.push(x); log("Tainted Pact", { took: short(x), exiled: seen.length }); return; }
      S.ex.push({ n: x }); seen.push(x);
      if (v === "all") { while (S.lib.length) { const y = S.lib.shift(); S.ex.push({ n: y }); seen.push(y); } }
    }
  } else if (name === "Toxic Deluge") {
    const x = it.x || 0;
    for (const p of S.bf.filter(isCreatureP)) pump(p, -x);
    log("effect", { c: "Toxic Deluge", x, note: "all creatures get -X/-X" });
    for (const p of S.bf.filter(q => isCreatureP(q) && toughness(q) <= 0)) leaveBf(p, "die", "Toxic Deluge");
  } else if (name === "Unsubstantiate") {
    const spells = S.stack.filter(x => x.kind === "spell").reverse();
    const box = document.createElement("div");
    let pick = null;
    const mine = S.bf.filter(isCreatureP);
    const list = document.createElement("div"); list.className = "picklist";
    [...spells.map(x => ({ x, label: stackLabel(x) + " (spell)" })), ...mine.map(p => ({ p, label: permLabel(p) }))].forEach((o, i) => {
      const b = document.createElement("button"); b.className = "pick" + (i === 0 ? " sel" : ""); b.textContent = o.label; if (i === 0) pick = o;
      b.onclick = () => { pick = o; [...list.children].forEach(y => y.classList.remove("sel")); b.classList.add("sel"); }; list.append(b);
    });
    box.append(list);
    pendingArt = name;
    const v = await openSheet("Unsubstantiate: return which spell or creature to its owner's hand?", box, [["Return it", "go", "primary"], ["An opponent's", "opp"]]);
    if (v === "go" && pick && pick.x) { removeFromStack(pick.x, "hand"); log("effect", { c: "Unsubstantiate", returned: stackLabel(pick.x) }); }
    else if (v === "go" && pick && pick.p) leaveBf(pick.p, "hand", "Unsubstantiate");
    else log("effect", { c: "Unsubstantiate", note: "returned an opponent's spell or creature" });
  } else if (name === "Yawgmoth's Will") {
    S.ywill = S.turn;
    log("effect", { c: "Yawgmoth's Will", note: "play lands and cast spells from your graveyard this turn; cards headed there are exiled" });
    toast("Yawgmoth's Will: tap a graveyard card to cast it. Cards that would go to your graveyard are exiled this turn.", "win");
  }
}
async function grantFlashback(source) {
  const gy = [...new Set(S.gy.filter(isSpell))];
  const n = gy.length ? await pickName(`${short(source)}: give which instant or sorcery flashback?`, gy, gy[0], "Give it flashback", source) : null;
  if (!n) { log("effect", { c: short(source), note: "no instant or sorcery in the graveyard" }); return; }
  S.fb = { ...(S.fb || {}), [n]: S.turn };
  log("flashback", { c: short(n), by: short(source), cost: C[n].c || "0" });
  toast(`${short(n)} has flashback this turn. Open your graveyard to cast it.`, "win");
}
function hasFlashback(n) { return !!((C[n] || {}).fb || (S.fb && S.fb[n] === S.turn)); }
/* what a cEDH opponent's random discard is, by card type: roughly the make-up of a cEDH hand */
const OPP_HAND = [["instant", 30], ["land", 26], ["creature", 14], ["artifact", 13], ["sorcery", 11], ["enchantment", 5], ["planeswalker", 1]];
function randomOppDiscard(i) {
  if (S.opp[i].hand <= 0) return "";   // that opponent's tracked hand is empty
  let r = rnd() * OPP_HAND.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of OPP_HAND) { if (r < w) return k; r -= w; }
  return "land";
}
/* Kefka enters or attacks: each player discards a card, then you draw one for each card type among them */
async function kefkaDiscards(it) {
  // opponents discard at random (a type rolled from a typical cEDH hand); you choose your own card
  const alive = aliveOpps();
  S.kefkaOpp = [];
  for (const i of alive) S.kefkaOpp[i] = randomOppDiscard(i);
  const box = document.createElement("div"); box.className = "form";
  const said = alive.map(i => `Opponent ${i + 1} discards ${S.kefkaOpp[i] ? "a" + (/^[aeiou]/i.test(KIND_WORD[S.kefkaOpp[i]]) ? "n " : " ") + KIND_WORD[S.kefkaOpp[i]].toLowerCase() : "nothing (empty hand)"}${S.opp[i].hand > 0 ? ` (${S.opp[i].hand - 1} left in hand)` : ""}.`);
  box.innerHTML = `<p class="info" style="margin:0">${said.join("<br>")}</p>`;
  let mine = null;
  if (S.hand.length) {
    const lab = document.createElement("p"); lab.className = "info"; lab.style.margin = "8px 0 0"; lab.textContent = "You discard:";
    const pf = pickFrom(S.hand, S.hand[S.hand.length - 1]); box.append(lab, pf.list); mine = pf;
  }
  pendingArt = KEFKA;
  await openSheet(`Kefka ${it.attack ? "attacks" : "enters"}: each player discards a card`, box, [["Discard and draw", "go", "primary"]]);
  const types = new Set();
  const ev = {};
  if (mine) { const n = mine.get(); S.hand.splice(S.hand.indexOf(n), 1); toGy(n); cardTypes(n).forEach(t => types.add(t)); ev.discarded = short(n); }
  for (const i of alive) { const k = S.kefkaOpp[i]; if (k) { types.add(k); S.opp[i].hand = Math.max(0, S.opp[i].hand - 1); } }
  ev.opponents = alive.map(i => S.kefkaOpp[i] || "nothing").join(", ");
  ev.types = types.size;
  log("Kefka", ev);
  draw(types.size, "Kefka");
}
async function oracleResolve() {
  const x = devotion("U"), n = S.lib.length;
  if (x >= n) {
    log("Thassa's Oracle", { devotion: x, library: n, win: true });
    pendingArt = ORACLE;
    const v = await openSheet(`Thassa's Oracle: devotion to blue ${x}, library ${n}. You win the game.`, null, [["End as a win", "win", "primary"], ["Keep playing", null]]);
    if (v === "win") await endGame({ result: "win", method: "Thassa's Oracle", note: `Thassa's Oracle with devotion ${x} and ${n} cards left on turn ${S.turn}.` });
    return;
  }
  const top = S.lib.splice(0, x);
  let keep = top[0];
  if (top.length > 1) keep = await pickName(`Thassa's Oracle: devotion ${x}, library ${n + 0}. Keep one on top, the rest go to the bottom`, top, top[0], "Keep it on top", ORACLE);
  const rest = shuffle(top.filter(c => c !== keep));
  if (keep) S.lib.unshift(keep);
  S.lib.push(...rest);
  log("Thassa's Oracle", { devotion: x, library: n, top: keep ? short(keep) : "none", bottom: rest.length });
}
async function drakeExchange(it) {
  const p = S.bf.find(q => q.uid === it.src);
  pendingArt = DRAKE;
  const v = await openSheet("Gilded Drake: exchange control with an opponent's creature?", null, [["Exchange", "go", "primary"], ["Don't (sacrifice the Drake)", null]]);
  if (!p) { log("Gilded Drake", { note: "the Drake already left" }); return; }
  if (v === "go") { giveAway(p, "Gilded Drake exchange"); toast("You took an opponent's creature. Track it by hand; the Drake waits in exile as theirs."); }
  else leaveBf(p, "die", "Gilded Drake: no exchange");
}
async function subtletyResolve() {
  const cands = S.stack.filter(x => x.kind !== "trigger" && ["creature", "planeswalker"].includes((C[x.name] || {}).k)).reverse();
  const pick = cands.length ? await stackPicker("Subtlety: put which creature or planeswalker spell on its owner's library?", cands, [["Choose", "go", "primary"], ["An opponent's spell", "opp"], ["Nothing", null]]) : "opp";
  if (!pick || typeof pick !== "object") { log("Subtlety", { note: pick === "opp" ? "an opponent's spell goes on top or bottom of their library" : "no target" }); return; }
  const v = await openSheet(`Subtlety: ${short(pick.name)} goes on top or bottom?`, null, [["Top", "top", "primary"], ["Bottom", "bottom"]]);
  S.stack = S.stack.filter(x => x !== pick);
  if (pick.kind === "spell") { if (v === "bottom") S.lib.push(pick.name); else S.lib.unshift(pick.name); }
  log("Subtlety", { c: short(pick.name), to: v === "bottom" ? "bottom" : "top" });
}
async function remoraUpkeep(it) {
  const p = S.bf.find(q => q.uid === it.src); if (!p) return;
  p.age = (p.age || 0) + 1;
  pendingArt = REMORA;
  const v = await openSheet(`Mystic Remora: cumulative upkeep. Pay {${p.age}} or sacrifice it.`, null, [[`Pay {${p.age}}`, "pay", "primary"], ["Sacrifice it", "sac"]]);
  if (v === "pay") { const pay = autoPay({ g: p.age }, false); if (pay.ok) { log("Mystic Remora", { paid: p.age, tapped: pay.tapped }); return; } toast(`Couldn't pay {${p.age}}, so Mystic Remora is sacrificed.`, "warn"); }
  leaveBf(p, "die", "cumulative upkeep");
}
/* Gogo copies another creature until end of turn; Irma for good, keeping her own ability */
async function copyCreature(it, who) {
  const p = S.bf.find(q => q.uid === it.src); if (!p) return;
  const t = await pickPerm(`${short(p.name)}: become a copy of which creature?`, S.bf.filter(q => q !== p && isCreatureP(q)), "Copy it", null, p.name);
  if (who === "irma") p.counters = (p.counters || 0) + 1;
  if (!t || t === "opp") { log(short(p.name), { note: "copied nothing" }); return; }
  p.copyOf = ident(t); if (backUp(t)) p.copyBack = true; else delete p.copyBack;
  if (who === "gogo") {
    p.gogoTurn = S.turn;
    for (const q of [p, t]) { q.ppump = { turn: S.turn, n: ppumpOf(q) + 2 }; q.hasteTurn = S.turn; }
  }
  log("copy", { c: short(p.name), as: short(ident(t)), until: who === "gogo" ? "end of turn" : undefined });
}
async function resolveKefkaTrigger(it) {
  const e = it.eff;
  if (e === "kitten") {
    const p = await pickPerm("Displacer Kitten: exile and return which nonland permanent?", S.bf.filter(q => (C[ident(q)] || {}).k !== "land" && !q.asLand), "Flicker it", null, KITTEN);
    if (p && p !== "opp") await flicker(p, KITTEN); else log("Displacer Kitten", { note: "no target" });
  } else if (e === "ruler") draw(it.n, "Kefka, Ruler of Ruin");
  else if (e === "kefka") await kefkaDiscards(it);
  else if (e === "oracle") await oracleResolve();
  else if (e === "snap") await grantFlashback(SNAPCASTER);
  else if (e === "drake") await drakeExchange(it);
  else if (e === "subtlety") await subtletyResolve();
  else if (e === "evoke") { const p = S.bf.find(q => q.uid === it.src); if (p) leaveBf(p, "die", "evoke"); else log("evoke", { note: `${short(it.name || SUBTLETY)} already left, so it stays` }); }
  else if (e === "remora") await remoraUpkeep(it);
  else if (e === "gogo" || e === "irma") await copyCreature(it, e);
  else await resolveNephTrigger(it);
}
/* ------------------------------------------------------------------ combat
   Beginning of combat (Gogo, Irma), declare attackers (Kefka's attack trigger), then combat damage
   to the targeted opponent. Blocks are up to you: remove blocked attackers' damage by hand. */
function combatLabel() { const st = S.combat && S.combat.turn === S.turn ? S.combat.step : null; return st === "declare" ? "⚔ Attack" : st === "damage" ? "⚔ Damage" : st === "done" ? "⚔ Combat done" : "⚔ Combat"; }
async function combat() {
  if (S.phase !== "play") return;
  if (S.stack.length) { toast("Resolve the stack first.", "warn"); return; }
  const cb = S.combat && S.combat.turn === S.turn ? S.combat : null;
  if (cb && cb.step === "done") { toast("You already had combat this turn.", "warn"); return; }
  snapshotUndo();
  if (!cb) {
    S.combat = { turn: S.turn, step: "declare" };
    const items = [];
    for (const p of S.bf) {
      if (p.frog) continue;
      const m = mult(p, false);
      if (ident(p) === GOGO) for (let i = 0; i < m; i++) items.push(trig("gogo", { src: p.uid }));
      if (p.name === IRMA || ident(p) === IRMA) for (let i = 0; i < m; i++) items.push(trig("irma", { src: p.uid }));
    }
    log("combat", { step: "beginning of combat", triggers: items.length || undefined });
    if (items.length) { await putTriggers(items, "beginning of combat"); render(); toast("Beginning of combat: resolve the triggers, then press Attack."); saveLocal(); return; }
  }
  if (S.combat.step === "declare") {
    const cands = S.bf.filter(p => isCreatureP(p) && !p.tapped);
    if (!cands.length) { S.combat.step = "done"; log("combat", { note: "no untapped creatures" }); toast("No untapped creature can attack."); render(); return; }
    const sick = p => p.etbTurn === S.turn && p.hasteTurn !== S.turn;
    const names = cands.map(p => `${permLabel(p)} · ${power(p)}/${toughness(p)}${sick(p) ? " (entered this turn)" : ""}`);
    const pre = cands.map((p, i) => i).filter(i => !sick(cands[i]) || cands[i].hasteTurn === S.turn);
    const idx = await multiPick(`Attack opponent ${S.target + 1}: choose attackers (tap an opponent to change the target)`, cands.map(p => ident(p)), cands.length, pre, false, null, "Attack");
    if (!idx || !idx.length) { dropSnapshot(); return; }
    const att = idx.map(i => cands[i]);
    att.forEach(p => { if (!(C[ident(p)] || {}).vig) p.tapped = true; });   // vigilance keeps it untapped
    const exalted = S.bf.filter(q => (C[ident(q)] || {}).exalted && !q.frog).length;
    if (att.length === 1 && exalted) { pump(att[0], exalted); log("exalted", { c: permLabel(att[0]), bonus: `+${exalted}/+${exalted}` }); }
    S.combat = { turn: S.turn, step: "damage", attackers: att.map(p => p.uid), opp: S.target };
    log("attack", { attackers: att.map(permLabel), target: `opponent ${S.target + 1}` });
    const items = [];
    for (const p of att) if (ident(p) === KEFKA && !backUp(p) && !p.frog) for (let i = 0, m = mult(p, false); i < m; i++) items.push(trig("kefka", { src: p.uid, attack: true }));
    if (items.length) await putTriggers(items, "Kefka attacks");
    render(); saveLocal(); return;
  }
  if (S.combat.step === "damage") {
    const att = S.combat.attackers.map(u => S.bf.find(p => p.uid === u)).filter(p => p && isCreatureP(p));
    const dmg = att.reduce((a, p) => a + Math.max(0, power(p)), 0);
    S.combat.step = "done";
    if (dmg) dealDamage({ kind: "opp", i: S.combat.opp }, dmg, "combat");
    log("combat damage", { amount: dmg, target: `opponent ${S.combat.opp + 1}` });
    render(); saveLocal();
  }
}

/* ------------------------------------------------------------------ Nephilim deck: five colours, mana creatures
   Ink-Treader Nephilim copies a spell that targets only it for each other creature, so the cheap
   creature cantrips below each resolve once per creature. Opponents' draws and spells, which the page
   can't see, are buttons on the cards that care about them. */
const LOTHO = "Lotho, Corrupt Shirriff", FOOD = "Food Token", SOLDIER = "Human Soldier Token";
C[FOOD] = { n: FOOD, s: "Food", k: "artifact", c: "", token: 1 };
const OPP_CREATURE = "Opponent's creature";   // a copy of one of the rolled creatures opponents control
C[OPP_CREATURE] = { n: OPP_CREATURE, s: "Opponent's creature", k: "creature", c: "", pt: [2, 2], token: 1 };
C[SOLDIER] = { n: SOLDIER, s: "Human Soldier", k: "creature", c: "W", pt: [1, 1], ty: ["Human", "Soldier"], token: 1 };
/* what each creature-targeting spell does to its target, then the cantrip part */
const TFX = {
  "Aphotic Wisps": { draw: 1, note: "black, fear" }, "Cerulean Wisps": { untap: 1, draw: 1, note: "blue" }, "Charge Through": { draw: 1, note: "trample" },
  "Crimson Wisps": { haste: 1, draw: 1, note: "red" }, "Defiant Strike": { pp: 1, draw: 1 }, "Expedite": { haste: 1, draw: 1 }, "Leap": { draw: 1, note: "flying" },
  "Niveous Wisps": { tap: 1, draw: 1, note: "white" }, "Shadow Rift": { draw: 1, note: "shadow" }, "Viridescent Wisps": { pp: 1, draw: 1, note: "green" },
  "Might of the Meek": { draw: 1, mountainPP: 1, note: "trample" },
  "Ancestors' Aid": { pp: 2, treasure: 1, note: "first strike" }, "Sudden Breakthrough": { pp: 2, treasure: 1, note: "first strike" },
  "Reckless Ransacking": { pp: 1, pump: 2, treasure: 1 },
  "Kari Zev's Expertise": { untap: 1, haste: 1, kari: 1 }, "Heat Shimmer": { copy: "shimmer" }, "Flash Photography": { copy: "photo" }, "Croaking Counterpart": { copy: "frog" },
};
async function chooseCreature(name, kind) {
  const mine = S.bf.filter(p => kind === "permanent" ? true : isCreatureP(p));
  const opts = mine.map(p => ({ t: { kind: "perm", uid: p.uid, label: short(ident(p)) }, label: `${permLabel(p)}${isCreatureP(p) ? ` · ${power(p)}/${toughness(p)}` : ""}${p.tapped ? " (tapped)" : ""}` }));
  opts.push({ t: { kind: "other" }, label: `An opponent's ${kind}` });
  let picked = opts.find(o => o.t.kind === "perm" && ident(S.bf.find(q => q.uid === o.t.uid)) === INK) || opts[0];
  const wrap = document.createElement("div"); wrap.className = "picklist";
  opts.forEach(o => { const b = document.createElement("button"); b.className = "pick" + (o === picked ? " sel" : "") + (o.t.kind === "perm" ? " mine" : ""); b.textContent = o.label; b.onclick = () => { picked = o; [...wrap.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); }; wrap.append(b); });
  pendingArt = name;
  await openSheet(`${short(name)}: target which ${kind}?`, wrap, [["Target it", "go", "primary"]]);
  return picked.t;
}
/* name an opponent's permanent for a copy effect: any card the page knows, or a new one with its type */
async function nameOppPermanent(source, kind) {
  const known = Object.values(C).filter(c => !c.token && (kind !== "creature" || c.k === "creature")).map(c => c.n).sort();
  const box = document.createElement("div"); box.className = "form";
  const kinds = kind === "creature" ? ["creature"] : ["creature", "artifact", "enchantment", "land", "planeswalker"];
  box.innerHTML = `<label for="ocName">Which card? Start typing</label><input id="ocName" list="ocList" autocomplete="off" placeholder="e.g. ${kind === "creature" ? "Dockside Extortionist" : "Sol Ring"}">
    <datalist id="ocList">${known.map(n => `<option value="${esc(n)}">`).join("")}</datalist>
    <p class="info" style="margin:0">For a card the playtester doesn't know, set its type${kind === "creature" ? "" : " (and power and toughness for a creature)"}:</p>
    <label for="ocKind">Type</label><select id="ocKind">${kinds.map(k => `<option>${k}</option>`).join("")}</select>
    <label for="ocPT">Power/toughness</label><input id="ocPT" value="2/2" inputmode="numeric">`;
  pendingArt = source;
  const v = await openSheet(`${short(source)}: copy which of your opponent's ${kind === "creature" ? "creatures" : "permanents"}?`, box, [["Make the token", "go", "primary"], ["Skip", null]]);
  const n = v === "go" && $("ocName").value.trim();
  if (!n) return null;
  const hit = known.find(x => x.toLowerCase() === n.toLowerCase());
  if (hit) return hit;
  const k = $("ocKind").value, pt = ($("ocPT").value.match(/(\d+)\s*\/\s*(\d+)/) || [0, 2, 2]).slice(1).map(Number);
  const card = { n, s: n, k, c: "", manual: 1, ...(k === "creature" ? { pt } : {}) };
  C[n] = card; S.extraCards = { ...(S.extraCards || {}), [n]: card };   // kept with the game so undo and reloads know it
  return n;
}
function tokenCopy(p, extra = {}) {
  const t = { uid: S.nextId++, name: ident(p), copyOf: ident(p), token: true, tapped: false, etbTurn: S.turn, ...extra };
  if (backUp(p)) t.copyBack = true;
  S.bf.push(t); return t;
}
/* one resolution of a creature-targeting spell; a target that left means the spell does nothing */
async function targetFx(name, it) {
  const fx = TFX[name], t = it.target || { kind: "other" };
  const p = t.kind === "perm" ? S.bf.find(q => q.uid === t.uid) : null;
  if (t.kind === "perm" && !p) { log("fizzle", { c: short(name), note: `${t.label} is gone` }); return; }
  const ev = { c: short(name), target: p ? permLabel(p) : "an opponent's creature" };
  if (p) {
    if (fx.untap) p.tapped = false;
    if (fx.tap) p.tapped = true;
    if (fx.haste) p.hasteTurn = S.turn;
    const pp = (fx.pp || 0) + (fx.mountainPP && S.bf.some(q => landTypes(ident(q)).includes("M")) ? 1 : 0);
    if (pp) p.ppump = { turn: S.turn, n: ppumpOf(p) + pp };
    if (fx.pump) pump(p, fx.pump);
    if (fx.copy) {
      const tok = tokenCopy(p, fx.copy === "shimmer" ? { temp: true, hasteTurn: S.turn } : fx.copy === "frog" ? { setPT: [1, 1] } : {});
      ev.token = short(ident(p)) + (fx.copy === "frog" ? " (1/1 Frog)" : fx.copy === "shimmer" ? " (haste, exiled at end step)" : "");
      render(); await tokenEtb([tok], ident(p), name);
    }
  } else if (fx.copy) {   // the page doesn't know the opponent's board: Ink-Treader's copies make a plain token, a spell you aim yourself asks
    const n = t.ink ? OPP_CREATURE : await nameOppPermanent(name, C[name].tgt);
    if (n) {
      const extra = fx.copy === "shimmer" ? { temp: true, hasteTurn: S.turn } : fx.copy === "frog" ? { setPT: [1, 1] } : {};
      const tok = { uid: S.nextId++, name: n, copyOf: n, token: true, tapped: false, etbTurn: S.turn, ...extra };
      S.bf.push(tok);
      ev.token = short(n) + " (an opponent's)";
      render(); await tokenEtb([tok], n, name);
    } else ev.note = "copied an opponent's permanent by hand";
  }
  if (fx.note) ev.gains = fx.note;
  log("effect", ev);
  if (fx.treasure) addTreasure(fx.treasure);
  if (fx.draw) draw(fx.draw, short(name));
  if (fx.kari) {   // may cast a spell with mana value 2 or less from hand for free
    const ok = S.hand.filter(n => C[n] && C[n].k !== "land" && (C[n].mv || 0) <= 2);
    if (ok.length) {
      const n = await pickName("Kari Zev's Expertise: cast a spell with mana value 2 or less for free?", ok, ok[0], "Cast it free", name);
      if (n) await cast(n, "hand", { free: true, alt: "Kari Zev's Expertise", noSnap: true });
    }
  }
}
/* Ink-Treader Nephilim: copy the spell for each other creature it could target */
async function inkCopies(it) {
  const ink = S.bf.find(q => q.uid === it.src);
  const mine = S.bf.filter(q => q.uid !== it.src && (C[it.name].tgt === "permanent" ? isCreatureP(q) : isCreatureP(q)));
  const board = oppBoard(), alive = aliveOpps();
  const opp = alive.reduce((a, i) => a + board.n[i], 0);
  for (const q of mine) S.stack.push({ id: S.nextId++, kind: "copy", name: it.name, target: { kind: "perm", uid: q.uid, label: short(ident(q)) } });
  for (let i = 0; i < opp; i++) S.stack.push({ id: S.nextId++, kind: "copy", name: it.name, target: { kind: "other", ink: true } });
  S.turnStats.copies += mine.length + opp;
  log("Ink-Treader Nephilim", { c: short(it.name), copies: mine.length + opp, yours: mine.length, opponents: alive.map(i => board.n[i]).join("+"), inkGone: ink ? undefined : true });
  toast(`Ink-Treader: ${mine.length + opp} cop${mine.length + opp === 1 ? "y" : "ies"} of ${short(it.name)}, ${mine.length} for your creatures and ${opp} for opponents' (${alive.map(i => board.n[i]).join(" + ")}).`, "win");
}
/* opponents' creatures, which the page doesn't track: rolled once a turn (0 to 4 each, 1.65 on average)
   so every spell that turn sees the same boards */
const OPP_CREATURES = [[0, 20], [1, 30], [2, 25], [3, 15], [4, 10]];
function oppBoard() {
  if (S.oppBoard && S.oppBoard.turn === S.turn) return S.oppBoard;
  const roll = () => { let r = rnd() * 100; for (const [k, w] of OPP_CREATURES) { if (r < w) return k; r -= w; } return 0; };
  S.oppBoard = { turn: S.turn, n: S.opp.map(() => roll()) };
  log("opponents' creatures", { rolled: S.oppBoard.n.join(", ") });
  return S.oppBoard;
}
/* put a creature from the library onto the battlefield (Chord, Green Sun's Zenith, Nature's Rhythm, Eldritch Evolution) */
async function creatureToBf(source, maxMv, ok = () => true) {
  const pool = [...new Set(S.lib.filter(n => (C[n] || {}).k === "creature" && (C[n].mv || 0) <= maxMv && ok(n)))].sort((a, b) => short(a).localeCompare(short(b)));
  const n = pool.length ? await pickName(`${short(source)}: put a creature with mana value ${maxMv} or less onto the battlefield`, pool, pool[0], "Put it in", source) : null;
  shuffle(S.lib);
  if (!n) { log("tutor", { c: short(source), found: "nothing", max: maxMv }); return; }
  S.lib.splice(S.lib.indexOf(n), 1); shuffle(S.lib);
  log("tutor", { c: short(source), found: short(n), to: "battlefield", max: maxMv });
  await enterBf(n);
}
async function nephSpell(name, it) {
  if (name === "Chord of Calling" || name === "Nature's Rhythm") await creatureToBf(name, it.x || 0);
  else if (name === "Green Sun's Zenith") await creatureToBf(name, it.x || 0, n => cardColors(n).includes("G"));
  else if (name === "Eldritch Evolution") await creatureToBf(name, it.maxMv || 2);
  else if (name === "Silence" || name === "Orim's Chant") {
    const note = name === "Silence" ? "your opponents can't cast spells this turn" : `target player can't cast spells this turn${it.kicked ? "; creatures can't attack" : ""}`;
    log("effect", { c: short(name), note }); toast(`${short(name)}: ${note}.`, "win");
  }
}
const NEPH_SPELLS = ["Chord of Calling", "Nature's Rhythm", "Green Sun's Zenith", "Eldritch Evolution", "Silence", "Orim's Chant"];
/* Gleaming Splendor's {2}{W}: two target players each draw. Aimed at two opponents with Smothering Tithe out it makes
   Treasures and decks them, so it can repeat until it can't be paid or nobody is left to draw */
async function gleamingSplendor() {
  const alive = aliveOpps();
  const players = [{ id: "me", label: "You" }, ...alive.map(i => ({ id: i, label: `Opponent ${i + 1} · library ${S.opp[i].lib}` }))];
  const pre = alive.length >= 2 ? [S.target, ...alive.filter(i => i !== S.target)].filter(i => alive.includes(i)).slice(0, 2) : ["me", ...alive.slice(0, 1)];
  const box = document.createElement("div"); box.className = "form";
  box.innerHTML = `<p class="info" style="margin:0">Pick two players to draw a card each.</p>` +
    players.map(pl => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" class="gsT" value="${pl.id}" ${pre.includes(pl.id) ? "checked" : ""}> ${esc(pl.label)}</label>`).join("") +
    `<label for="gsN">Activate how many times? (it stops when you can't pay or a target runs out of cards)</label><input id="gsN" type="number" min="1" value="1" inputmode="numeric">
    <label for="gsPay">Do opponents pay {2} for Smothering Tithe?</label><select id="gsPay"><option value="ask">Ask me each time</option><option value="never">Never</option><option value="sometimes">Sometimes (${Math.round(OPP_SIM.pay["Smothering Tithe"] * 100)}%)</option></select>`;
  pendingArt = "Gleaming Splendor";
  const open = openSheet("Gleaming Splendor: {2}{W}, two target players each draw a card", box, [["Activate", "go", "primary"], ["Cancel", null]]);
  $("gsPay").value = S.tithePay || "ask";
  if ((await open) !== "go") return false;
  const targets = [...document.querySelectorAll(".gsT:checked")].map(x => x.value === "me" ? "me" : +x.value);
  if (targets.length !== 2) { toast("Gleaming Splendor needs exactly two target players.", "bad"); return false; }
  S.tithePay = $("gsPay").value;
  const n = Math.max(1, Math.floor(+$("gsN").value || 1));
  const t0 = S.treasures;
  let done = 0, stop = `activated ${n} time${n === 1 ? "" : "s"}`;
  for (; done < n; done++) {
    if (targets.some(t => t !== "me" && S.opp[t].lib <= 0)) { stop = "a target has no cards left"; break; }
    const pay = autoPay({ g: 2, W: 1 }, false);
    if (!pay.ok) { stop = "out of mana"; break; }
    if (n === 1) { log("Gleaming Splendor", { tapped: pay.tapped }); await pushAbility("abGleam", { targets }); return true; }   // one activation waits on the stack
    for (const t of targets) { if (t === "me") draw(1, "Gleaming Splendor"); else await oppDrew(t, "Gleaming Splendor"); }   // the repeat is a shortcut
  }
  log("Gleaming Splendor", { activations: done, targets: targets.map(t => t === "me" ? "you" : `opponent ${t + 1}`), stop, treasures: S.treasures - t0 });
  if (!done) { toast(`Gleaming Splendor: ${stop === "out of mana" ? "its ability costs {2}{W}" : stop}.`, "bad"); return false; }
  toast(`Gleaming Splendor: ${done} activation${done === 1 ? "" : "s"} (${stop}). Treasures ${S.treasures - t0 >= 0 ? "+" : ""}${S.treasures - t0}.`, "win");
  render(); saveLocal();
  return true;
}
/* an opponent draws: Smothering Tithe, Tataru Taru's Secretary and Gleaming Splendor care */
async function oppDrew(i, why) {
  S.oppDraws = S.oppDraws && S.oppDraws.turn === S.turn ? S.oppDraws : { turn: S.turn, n: [0, 0, 0] };
  S.oppDraws.n[i]++;
  const o = S.opp[i]; if (o.lib > 0) o.hand++; o.lib = Math.max(0, o.lib - 1);
  log("opponent draws", { opp: i + 1, why, nth: S.oppDraws.n[i], library: o.lib });
  if (!o.lib) toast(`Opponent ${i + 1} has no cards left in their library.`, "win");
  for (const p of S.bf.filter(q => ident(q) === "Smothering Tithe")) {
    let paid;   // S.tithePay: "ask" (default), "never" or "sometimes" (the opponents'-turn odds)
    if ((S.tithePay || "ask") === "ask") {
      pendingArt = "Smothering Tithe";
      paid = (await openSheet(`Smothering Tithe: does opponent ${i + 1} pay {2}?`, null, [["They don't: Treasure", "no", "primary"], ["They pay", "pay"]])) === "pay";
    } else paid = S.tithePay === "sometimes" && rnd() < OPP_SIM.pay["Smothering Tithe"];
    if (!paid) { addTreasure(1); log("Smothering Tithe", { treasures: 1 }); } else log("Smothering Tithe", { note: `opponent ${i + 1} paid {2}` });
  }
  if (S.bf.some(q => ident(q) === "Tataru Taru" && !q.frog) && S.tataruTurn !== S.turn) {   // it's never their turn while you goldfish
    S.tataruTurn = S.turn; S.tTreasures = (S.tTreasures || 0) + 1; log("Tataru Taru", { treasure: "tapped" });
  }
  if (S.oppDraws.n[i] === 2) for (const p of S.bf.filter(q => ident(q) === "Gleaming Splendor")) { addTreasure(1); log("Gleaming Splendor", { treasures: 1, opp: i + 1 }); }
}
async function recruit(source) {   // draw, discard; a nonland discard makes a 1/1 Human Soldier
  draw(1, short(source));
  if (!S.hand.length) return;
  const n = await pickName(`${short(source)}: recruit. Discard a card`, S.hand, S.hand[S.hand.length - 1], "Discard it", source) || S.hand[S.hand.length - 1];
  S.hand.splice(S.hand.indexOf(n), 1); toGy(n);
  const land = (C[n] || {}).k === "land";
  if (!land) S.bf.push({ uid: S.nextId++, name: SOLDIER, token: true, tapped: false, etbTurn: S.turn });
  log("recruit", { c: short(source), discarded: short(n), soldier: !land || undefined });
}
async function resolveNephTrigger(it) {
  const e = it.eff;
  if (e === "ink") await inkCopies(it);
  else if (e === "lotho") { S.life -= 1; addTreasure(1); log("Lotho", { note: "second spell this turn", life: -1, treasures: 1 }); toast("Lotho: you lost 1 life and made a Treasure.", "win"); }
  else if (e === "seeker") {
    const pool = [...new Set(S.lib.filter(n => isSpell(n) && (C[n].mv || 0) <= 2))].sort((a, b) => short(a).localeCompare(short(b)));
    const n = pool.length ? await pickName("Spellseeker: find an instant or sorcery with mana value 2 or less", pool, pool[0], "Take it", "Spellseeker") : null;
    if (n) { S.lib.splice(S.lib.indexOf(n), 1); S.hand.push(n); }
    shuffle(S.lib); log("tutor", { c: "Spellseeker", found: n ? short(n) : "nothing" });
  } else if (e === "epochal") {
    const pool = [...new Set(S.lib.filter(n => (C[n].ty || []).includes("Nephilim")))];
    const n = pool.length ? await pickName("Nephilim Epochal: find a Nephilim card", pool, pool[0], "Take it", EPOCHAL) : null;
    if (n) { S.lib.splice(S.lib.indexOf(n), 1); S.hand.push(n); }
    shuffle(S.lib); log("tutor", { c: "Nephilim Epochal", found: n ? short(n) : "nothing" });
  } else if (e === "tataru") {
    draw(1, "Tataru Taru");
    pendingArt = "Tataru Taru";
    const v = await openSheet(`Tataru Taru: does opponent ${S.target + 1} draw a card?`, null, [["They draw", "yes", "primary"], ["They don't", null]]);
    if (v === "yes") await oppDrew(S.target, "Tataru Taru");
  }
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
  const c = C[source] || {}, toTop = source === "Mystical Tutor" || c.to === "top";
  let ok = n => true, what = "";
  if (source === "Mystical Tutor") ok = isSpell;
  if (source === "Demonic Counsel" && !delirium()) { ok = n => ((C[n] || {}).ty || []).includes("Demon"); what = " for a Demon (no delirium)"; }
  if (c.life) S.life -= c.life;
  const pool = S.lib.filter(ok).sort((a, b) => short(a).localeCompare(short(b)));
  if (!pool.length) { log("tutor", { c: short(source), found: "nothing", note: what.trim() || undefined, life: c.life ? -c.life : undefined }); shuffle(S.lib); toast(`${short(source)} found nothing${what}.`, "warn"); return; }
  let picked = null;
  const list = groupedPicker(pool, n => { picked = n; });
  pendingArt = source;
  const v = await openSheet(`${short(source)}: search your library${what}${toTop ? " (goes on top)" : ""}`, list, [["Take it", "take", "primary"], ["Cancel", null]]);
  if (v !== "take" || !picked) { if (c.life) log("tutor", { c: short(source), found: "nothing", life: -c.life }); return; }
  S.lib.splice(S.lib.indexOf(picked), 1); shuffle(S.lib);
  if (toTop) S.lib.unshift(picked); else S.hand.push(picked);
  const ev = { c: short(source), found: short(picked), to: toTop ? "top" : undefined, life: c.life ? -c.life : undefined };
  if (source === "Gamble" && S.hand.length) { const lost = S.hand[Math.floor(rnd() * S.hand.length)]; S.hand.splice(S.hand.indexOf(lost), 1); toGy(lost); ev.discarded = short(lost); toast(`Gamble found ${short(picked)} and discarded ${short(lost)} at random.`, lost === picked ? "bad" : ""); }
  log("tutor", ev);
}
async function chooseCloneTarget(source, n) {
  const ok = S.bf.filter(p => C[ident(p)] && (isCreatureP(p) || (source === "Molten Duplication" && isArtifactP(p))));
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
  else btns.push(...payButtons(name));
  if (c.mdfc) btns.push(["Play as land", "mdfcland"]);
  if (name === BIRGI) btns.push([`Cast ${HARNFEL} {4}{R}`, "harnfel"]);
  if (isSpell(name)) btns.push(["Cast repeatedly…", "repeat"]);
  if (name === "Step Through") btns.push(["Wizardcycle {2}", "cycle"]);
  if (name === "Otawara, Soaring City") btns.push(["Channel (bounce)", "channel"]);
  if (name === "Simian Spirit Guide") btns.push(["Exile for R", "ssg"]);
  if (name === "Elvish Spirit Guide") btns.push(["Exile for G", "esg"]);
  if (name === "Boseiju, Who Endures") btns.push(["Channel (destroy an opponent's artifact, enchantment or nonbasic land)", "boseiju"]);
  btns.push(["Discard", "discard"], ["Exile", "exile"], ["To library top", "top"], ["Cancel", null]);
  const v = await openSheet(`${name}  ${c.c ? "· " + c.c : ""}`, null, btns);
  if (!v) return;
  if (v.startsWith("pay:")) return castWith(name, "hand", v.slice(4));
  if (v === "harnfel") return cast(name, "hand", { cost: "4R", alt: "back face", back: true });
  if (v === "repeat") return castRepeatMenu(name);
  snapshotUndo();
  if (v === "land" || v === "mdfcland") {
    await playLand(name, "hand", v === "mdfcland");
  } else if (v === "channel") {
    const legends = S.bf.filter(p => (C[ident(p)] || {}).leg && isCreatureP(p)).length;
    const g = Math.max(0, 3 - legends);
    const pay = autoPay({ g, R: 0, U: 1 }, false);
    if (!pay.ok) { dropSnapshot(); toast(`Channel costs ${g ? g : ""}U right now.`, "bad"); return; }
    S.hand.splice(S.hand.indexOf(name), 1); toGy(name);
    log("channel Otawara", { cost: (g || "") + "U", tapped: pay.tapped });
    await pushAbility("abOtawara");
  } else if (v === "cycle") {
    const pay = autoPay({ g: 2, R: 0, U: 0 }, false); if (!pay.ok) { dropSnapshot(); toast("Need 2 mana to wizardcycle.", "bad"); return; }
    S.hand.splice(S.hand.indexOf(name), 1); toGy(name);
    await pushAbility("abCycle");
  } else if (v === "esg") {
    S.hand.splice(S.hand.indexOf(name), 1); S.ex.push({ n: name }); addMana("G", 1); log("Elvish Spirit Guide", { mana: "G" });
  } else if (v === "boseiju") {
    const legends = S.bf.filter(p => (C[ident(p)] || {}).leg && isCreatureP(p)).length;
    const g = Math.max(0, 1 - legends);
    const pay = autoPay({ g, G: 1 }, false);
    if (!pay.ok) { dropSnapshot(); toast(`Channel costs ${g ? g : ""}G right now.`, "bad"); return; }
    S.hand.splice(S.hand.indexOf(name), 1); toGy(name);
    log("channel Boseiju", { cost: (g || "") + "G", tapped: pay.tapped });
    await pushAbility("abBoseiju");
  } else if (v === "ssg") {
    S.hand.splice(S.hand.indexOf(name), 1); S.ex.push({ n: name }); addMana("R", 1); log("Simian Spirit Guide", { mana: "R" });
  } else {
    S.hand.splice(S.hand.indexOf(name), 1);
    if (v === "discard") toGy(name); else if (v === "exile") S.ex.push({ n: name }); else S.lib.unshift(name);
    log(v, { c: short(name) });
  }
  render(); saveLocal();
}
/* every way to pay for a spell, the same from your hand, exile, the graveyard or the command zone:
   mana, Phyrexian life, free alternative costs, spectacle, pitching blue cards, Snuff Out's life */
function payButtons(name, tail = "") {
  const c = C[name], verb = S.stack.length ? "Respond" : "Cast", out = [];
  const ph = parseCost(c.c);
  if (ph.phy) {
    const rest = c.c.replace(/\{[WUBRG]\/P\}/, "");
    out.push([`${verb}${tail}: ${rest ? rest + " + " : ""}2 life`, "pay:castlife", "primary"], [`${verb} paying ${rest}${ph.phy}`, "pay:cast"]);
  } else out.push([(S.stack.length ? "Cast in response" : "Cast") + tail, "pay:cast", "primary"]);
  if (c.free_if || (c.free_cmdr && commanderOut())) out.push(["Cast free (alt cost)", "pay:free"]);
  if (name === "Light Up the Stage" && S.turnStats.damage > 0) out.push(["Spectacle {R}", "pay:spectacle"]);
  const pi = pitchInfo(name);
  if (pi && S.hand.filter(n => n !== name && cardColors(n).includes("U")).length >= pi.n) out.push([pi.label, "pay:pitch"]);
  if (name === "Snuff Out" && hasSwamp()) out.push(["Pay 4 life (you control a Swamp)", "pay:snuff"]);
  return out;
}
async function castWith(name, zone, mode) {
  if (mode === "cast") return cast(name, zone);
  if (mode === "castlife") return cast(name, zone, { phyLife: true });
  if (mode === "free") return cast(name, zone, { free: true, alt: "alt cost" });
  if (mode === "spectacle") return cast(name, zone, { cost: "R", alt: "spectacle" });
  snapshotUndo();   // the life or the pitched cards and the cast undo as one step
  if (mode === "pitch") {
    const pi = pitchInfo(name), blues = S.hand.filter(n => n !== name && cardColors(n).includes("U"));
    const idx = await multiPick(`${short(name)}: ${pi.label.toLowerCase()}`, blues, pi.n, blues.length === pi.n ? blues.map((b, i) => i) : [0], true, name, "Exile and cast");
    if (!idx) { dropSnapshot(); return; }
    const gone = idx.map(i => blues[i]);
    for (const x of gone) { S.hand.splice(S.hand.indexOf(x), 1); S.ex.push({ n: x }); }
    if (pi.life) S.life -= pi.life;
    log("pitch", { c: short(name), exiled: gone.map(short), life: pi.life ? -pi.life : undefined, evoke: pi.evoke || undefined });
    return cast(name, zone, { free: true, alt: (pi.evoke ? "evoked, " : "") + "pitched " + gone.map(short).join(" and "), noSnap: true, evoke: pi.evoke });
  }
  if (mode === "snuff") { S.life -= 4; log("alt cost", { c: "Snuff Out", life: -4 }); return cast(name, zone, { free: true, alt: "4 life", noSnap: true }); }
  dropSnapshot();
}
/* free-to-cast costs that exile blue cards from your hand */
function pitchInfo(name) {
  return { "Force of Will": { n: 1, life: 1, label: "Pitch a blue card (1 life)" }, "Force of Negation": { n: 1, label: "Exile a blue card (on an opponent's turn)" },
    "Commandeer": { n: 2, label: "Exile two blue cards" }, [SUBTLETY]: { n: 1, evoke: true, label: "Evoke: exile a blue card" } }[name] || null;
}
async function playLand(name, from, asLand) {
  if (S.stack.length) { dropSnapshot(); toast("Lands can only be played while the stack is empty.", "warn"); return; }
  if (S.landDrop) toast("You already played a land this turn (logged anyway).", "warn");
  if (from === "hand") S.hand.splice(S.hand.indexOf(name), 1); else if (from === "gy") S.gy.splice(S.gy.lastIndexOf(name), 1); else S.ex = S.ex.filter(x => x.n !== name);
  S.landDrop = true;
  const cot = S.bf.filter(p => p.name === "City of Traitors");
  if (cot.length && name !== "City of Traitors") { S.bf = S.bf.filter(p => !cot.includes(p)); cot.forEach(() => toGy("City of Traitors")); log("sacrifice", { c: "City of Traitors", note: "another land was played" }); }
  const ev = { c: short(name) };
  if (from !== "hand") ev.from = from;
  if (FETCH[name]) { const p = enterLand(name); log("land", ev); render(); await crackMenu(p); return; }
  let shock;
  if ((C[name] || {}).shock) shock = (await openSheet(`${short(name)}: pay 2 life to have it enter untapped?`, null, [["Pay 2 life", "pay", "primary"], ["Enter tapped", "tap"]])) !== "tap";
  const p = enterLand(name, { shock });
  await etb(p);
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
  if ((C[t] || {}).shock) shock = (await openSheet(`${short(t)}: pay 2 life to have it enter untapped?`, null, [["Pay 2 life", "pay", "primary"], ["Enter tapped", "tap"]])) !== "tap";
  crackFetch(f, t, { shock });
  if (t === "Thundering Falls") await surveil(t);
}
async function surveil(source) {
  const top = S.lib[0]; if (!top) return;
  pendingArt = top;
  const v = await openSheet(`${short(source)}: surveil 1. Top card is ${short(top)}.`, null, [["Keep on top", "top", "primary"], ["Put in graveyard", "gy"]]);
  if (v === "gy") { S.lib.shift(); toGy(top); }
  log("surveil", { c: short(source), card: short(top), to: v === "gy" ? "graveyard" : "top" });
}
function bounceCleanup(p) {
  if (ident(p) === ELECTRO) { S.stack.push(trig("electroX", { src: p.uid })); toast("Electro left the battlefield: his trigger is on the stack. Resolve it to pay X.", "win"); }
  if (p.name === SAKA) { const ks = S.bf.filter(q => ident(q) === KRARK); ks.slice(1).forEach(q => { S.bf = S.bf.filter(z => z !== q); }); }
  if (p.staff) p.staff = false;
  if (p.name === "Utopia Sprawl") for (const q of S.bf) if (q.uid === p.on) delete q.sprawl;
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
  if (ident(p) === VIVI && p.viviTurn !== S.turn) btns.push([`Add ${Math.max(0, power(p))} mana (Vivi)`, "vivi", "primary"]);
  const untapCost = ident(p) === "Mana Vault" ? 4 : c.untapCost;
  if (untapCost && p.tapped) btns.push([`Pay {${untapCost}}: untap`, "vault"]);
  if (p.name === KEFKA && !p.flipped) btns.push(["{8}: each opponent sacrifices a permanent, transform", "kefka8"]);
  if (ident(p) === LED) btns.unshift(["Discard your hand, sacrifice: add three mana of one colour", "led", "primary"]);
  if (ident(p) === WISHCLAW && !p.tapped && (p.wish || 0) > 0) btns.unshift([`{1}, tap, remove a wish counter (${p.wish} left): search for a card`, "wish", "primary"]);
  if (ident(p) === RHYSTIC) btns.unshift(["An opponent cast a spell and didn't pay {1}: draw", "rhystic", "primary"]);
  if (ident(p) === REMORA) btns.unshift(["An opponent cast a noncreature spell and didn't pay {4}: draw", "remora", "primary"]);
  if (ident(p) === "Deathrite Shaman" && !p.tapped && !sick(p)) btns.unshift(["Exile a land card from a graveyard: add one mana of any colour", "drsMana", "primary"], ["{B}, exile an instant or sorcery from a graveyard: each opponent loses 2", "drsB"], ["{G}, exile a creature card from a graveyard: gain 2 life", "drsG"]);
  if (ident(p) === KINNAN) btns.push(["{5}{G}{U}: look at the top five, put a non-Human creature onto the battlefield", "kinnan"]);
  if (ident(p) === "Esper Sentinel") btns.unshift([`An opponent's first noncreature spell this turn, they didn't pay {${Math.max(0, power(p))}}: draw`, "sentinel", "primary"]);
  if (["Smothering Tithe", "Gleaming Splendor", "Tataru Taru"].includes(ident(p))) btns.unshift([`Opponent ${S.target + 1} drew a card`, "oppdrew", "primary"]);
  if (ident(p) === "Gleaming Splendor") btns.push(["{2}{W}: you and an opponent each draw", "gleam"]);
  if (ident(p) === "The Cabbage Merchant") {
    btns.unshift(["An opponent cast a noncreature spell: create a Food", "food", "primary"]);
    if (S.bf.filter(q => ident(q) === FOOD && !q.tapped).length >= 2) btns.push(["Tap two Foods: add one mana of any colour", "foodmana"]);
  }
  if (ident(p) === FOOD && !p.tapped) btns.unshift(["{2}, tap, sacrifice: gain 3 life", "eat", "primary"]);
  if (ident(p) === "The Queen of Dale") btns.unshift(["An opponent cast their first noncreature spell this turn: recruit", "recruit", "primary"]);
  if (ident(p) === LOTHO) btns.unshift(["An opponent cast their second spell this turn: lose 1, Treasure", "lotho", "primary"]);
  if (p.name === "Fiery Islet" && !p.tapped) btns.push(["{1}, sacrifice: draw", "islet"]);
  if (p.name === "Emergence Zone" && !p.tapped) btns.push(["{1}, sacrifice: cast spells as though they had flash this turn", "ezone"]);
  if (p.name === "Minamo, School at Water's Edge" && !p.tapped) btns.push(["{U}, tap: untap target legendary permanent", "minamo"]);
  if (ident(p) === SCOUNDREL && !p.tapped) btns.push(["{1}, tap, sacrifice another permanent: flip a coin", "scoundrel"]);
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
    const d = pf.get(); S.hand.splice(S.hand.indexOf(d), 1); toGy(d);
    log("Harnfel", { discarded: short(d) });
    await pushAbility("abHarnfel", { src: p.uid });
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
    if (p.loyalty <= 0) { S.bf = S.bf.filter(q => q !== p); toGy(p.name); log("Ral", { note: "no loyalty left, to graveyard" }); }
    render(); await settle(); render(); saveLocal(); return;
  }
  if (v === "crack") { await crackMenu(p); }
  else if (v === "vivi") { const x = Math.max(0, power(p)); p.viviTurn = S.turn; addMana("A", x); log("Vivi mana", { mana: x + " U/R" }); }
  else if (v === "vault") { p.tapped = true; const pay = autoPay({ g: untapCost }, false); if (!pay.ok) { dropSnapshot(); toast(`Untapping ${short(p.name)} costs ${untapCost}.`, "bad"); return; } log("activate " + short(p.name), { cost: untapCost, tapped: pay.tapped }); await pushAbility("abUntap", { src: uid, name: p.name }); }
  else if (v === "kefka8") {
    if (S.stack.length) { dropSnapshot(); toast("Kefka's ability is sorcery speed: resolve the stack first.", "warn"); return; }
    if (onBf(TOTEM)) { dropSnapshot(); toast("Cursed Totem: activated abilities of creatures can't be activated.", "bad"); return; }
    const pay = autoPay({ g: 8 }, false);
    if (!pay.ok) { dropSnapshot(); toast("Kefka's ability costs {8}.", "bad"); return; }
    log("Kefka", { ability: "{8} paid", tapped: pay.tapped });
    await pushAbility("abKefka8", { src: uid });
  } else if (v === "led") {
    const cols = IDENT || COLORS;
    pendingArt = LED;
    const col = await openSheet("Lion's Eye Diamond: three mana of which colour?", null, [...cols].map((x, i) => [COLOR_NAME[x], x, i === 0 ? "primary" : ""]));
    if (!col) { dropSnapshot(); return; }
    const hand = [...S.hand]; S.hand = []; toGy(...hand);
    S.bf = S.bf.filter(q => q !== p); if (!p.token) toGy(p.name);
    addMana(col, 3); log("Lion's Eye Diamond", { discarded: hand.map(short), mana: col + "3" });
  } else if (v === "wish") {
    const pay = autoPay({ g: 1 }, false);
    if (!pay.ok) { dropSnapshot(); toast("Wishclaw Talisman needs {1}.", "bad"); return; }
    p.tapped = true; p.wish--;
    log("Wishclaw Talisman", { wish: p.wish, tapped: pay.tapped });
    await pushAbility("abWish", { src: uid });
  } else if (v === "rhystic" || v === "remora" || v === "sentinel") draw(1, short(p.name));
  else if (v === "drsMana" || v === "drsB" || v === "drsG") {
    const kind = v === "drsMana" ? "land" : v === "drsB" ? "instsorc" : "creature";
    const fits = n => kind === "instsorc" ? isSpell(n) : (C[n] || {}).k === kind;
    if (v !== "drsMana") { p.tapped = true; const pay = autoPay(v === "drsB" ? { B: 1 } : { G: 1 }, false); if (!pay.ok) { dropSnapshot(); const q = S.bf.find(x => x.uid === uid); if (q) q.tapped = false; toast(`That costs {${v === "drsB" ? "B" : "G"}}.`, "bad"); return; } }
    const mine = [...new Set(S.gy.filter(fits))];
    const what = { land: "land", instsorc: "instant or sorcery", creature: "creature" }[kind];
    const n = mine.length ? await pickName(`Deathrite Shaman: exile which ${what} card from your graveyard?`, mine, mine[0], "Exile it", "Deathrite Shaman") : null;
    if (!n) { const ok = await openSheet(`No ${what} card in your graveyard. Exile one from an opponent's graveyard?`, null, [["Yes", "yes", "primary"], ["Cancel", null]]); if (ok !== "yes") { dropSnapshot(); return; } }
    const q = S.bf.find(x => x.uid === uid); if (q) q.tapped = true;
    if (v === "drsMana") {   // a mana ability: no stack
      if (n) { S.gy.splice(S.gy.lastIndexOf(n), 1); S.ex.push({ n }); }
      pendingArt = "Deathrite Shaman";
      const col = await openSheet("Deathrite Shaman: which colour?", null, [...(IDENT || COLORS)].map((x, i) => [COLOR_NAME[x], x, i === 0 ? "primary" : ""])) || (IDENT || "G")[0];
      addMana(col, 1); log("Deathrite Shaman", { exiled: n ? short(n) : "an opponent's land", mana: col });
    } else await pushAbility(v === "drsB" ? "abDrsB" : "abDrsG", { src: uid, card: n || null });   // the card is exiled on resolution
  } else if (v === "kinnan") {
    const pay = autoPay({ g: 5, G: 1, U: 1 }, false);
    if (!pay.ok) { dropSnapshot(); toast("Kinnan's ability costs {5}{G}{U}.", "bad"); return; }
    log("Kinnan", { ability: "{5}{G}{U} paid", tapped: pay.tapped });
    await pushAbility("abKinnan", { src: uid });
  } else if (v === "oppdrew") await oppDrew(S.target, short(p.name));
  else if (v === "gleam") { if (!(await gleamingSplendor())) { dropSnapshot(); return; } } else if (v === "food") { S.bf.push({ uid: S.nextId++, name: FOOD, token: true, tapped: false, etbTurn: S.turn }); log("token", { of: "Food", by: "The Cabbage Merchant" }); }
  else if (v === "foodmana") {
    pendingArt = "The Cabbage Merchant";
    const col = await openSheet("Tap two Foods: which colour?", null, [...(IDENT || COLORS)].map((x, i) => [COLOR_NAME[x], x, i === 0 ? "primary" : ""]));
    if (!col) { dropSnapshot(); return; }
    S.bf.filter(q => ident(q) === FOOD && !q.tapped).slice(0, 2).forEach(q => { q.tapped = true; });
    addMana(col, 1); log("The Cabbage Merchant", { tapped: "two Foods", mana: col });
  } else if (v === "eat") {
    p.tapped = true; const pay = autoPay({ g: 2 }, false);
    if (!pay.ok) { dropSnapshot(); const q = S.bf.find(x => x.uid === uid); if (q) q.tapped = false; toast("A Food costs {2} to eat.", "bad"); return; }
    S.bf = S.bf.filter(q => q.uid !== uid); log("Food", { sacrificed: true, tapped: pay.tapped });
    await pushAbility("abFood");
  } else if (v === "recruit") await recruit(p.name);
  else if (v === "lotho") { S.life -= 1; addTreasure(1); log("Lotho", { note: "an opponent's second spell", life: -1, treasures: 1 }); }
  else if (v === "islet") { p.tapped = true; const pay = autoPay({ g: 1, R: 0, U: 0 }, false); if (!pay.ok) { dropSnapshot(); const q = S.bf.find(x => x.uid === uid); if (q) q.tapped = false; toast("Needs 1 more mana.", "bad"); return; } S.bf = S.bf.filter(q => q.uid !== uid); toGy(p.name); log("Fiery Islet", { sacrificed: true, tapped: pay.tapped }); await pushAbility("abIslet"); }
  else if (v === "ezone") {
    p.tapped = true; const pay = autoPay({ g: 1 }, false);
    if (!pay.ok) { dropSnapshot(); const q = S.bf.find(x => x.uid === uid); if (q) q.tapped = false; toast("Emergence Zone needs {1}.", "bad"); return; }
    S.bf = S.bf.filter(q => q.uid !== uid); toGy(p.name);
    log("Emergence Zone", { sacrificed: true, tapped: pay.tapped });
    await pushAbility("abZone");
  } else if (v === "minamo") {
    const legs = S.bf.filter(q => q.uid !== uid && q.tapped && (C[ident(q)] || {}).leg);
    if (!legs.length) { dropSnapshot(); toast("No tapped legendary permanent to untap.", "warn"); return; }
    p.tapped = true; const pay = autoPay({ U: 1 }, false);
    if (!pay.ok) { dropSnapshot(); const q = S.bf.find(x => x.uid === uid); if (q) q.tapped = false; toast("Minamo needs {U}.", "bad"); return; }
    const t = await pickPerm("Minamo: untap which legendary permanent?", legs, "Untap it", null, p.name);
    if (t && t !== "opp") await pushAbility("abMinamo", { src: uid, target: t.uid, label: permLabel(t) });
  } else if (v === "scoundrel") {
    const fodder = S.bf.filter(q => q.uid !== uid);
    if (!fodder.length) { dropSnapshot(); toast("Tavern Scoundrel needs another permanent to sacrifice.", "warn"); return; }
    p.tapped = true; const pay = autoPay({ g: 1 }, false);
    if (!pay.ok) { dropSnapshot(); const q = S.bf.find(x => x.uid === uid); if (q) q.tapped = false; toast("Tavern Scoundrel needs {1}.", "bad"); return; }
    const t = await pickPerm("Tavern Scoundrel: sacrifice which permanent?", S.bf.filter(q => q.uid !== uid), "Sacrifice it", null, SCOUNDREL);
    if (!t || t === "opp") { dropSnapshot(); return; }
    leaveBf(t, "die", "Tavern Scoundrel");
    log("Tavern Scoundrel", { sacrificed: permLabel(t), tapped: pay.tapped });
    await pushAbility("abFlip", { src: uid });
  }
  else if (v === "ral") transformRal(p);
  else if (v === "loy+" || v === "loy-") { p.loyalty = Math.max(0, (p.loyalty || 0) + (v === "loy+" ? 1 : -1)); log("loyalty", { c: "Ral", loyalty: p.loyalty }); }
  else if (v === "mana" && restriction(p)) {
    const r = restriction(p), cols = IDENT || COLORS;
    pendingArt = ident(p);
    const col = await openSheet(`${short(p.name)}: colourless, or a colour only for ${r.label}?`, null, [["Colourless", "C", "primary"], ...[...cols].map(x => [`${COLOR_NAME[x]} (only for ${r.label})`, x])]);
    if (!col) { dropSnapshot(); return; }
    if (col === "C") { const made = tapFor(p, "C"); log("tap", { c: short(p.name), mana: made.make }); }
    else {
      p.tapped = true; S.rpool = [...(S.rpool || []), { c: col, ...r }];
      if ((C[ident(p)] || {}).k !== "land" && kinnans()) addMana(col, kinnans());   // Kinnan's extra mana isn't restricted
      log("tap", { c: short(p.name), mana: col, only: r.label });
      toast(`${COLOR_NAME[col]} mana for ${r.label} only. It pays for the next one you cast.`, "win");
    }
  } else if (v === "mana") {
    let cols = sourceColors(p).replace("C", "") || "C";
    if (cols === COLORS && IDENT) cols = IDENT;   // any colour: offer the deck's colours
    const first = cols.includes("R") ? "R" : cols[0];
    let col = cols.length > 1 ? await openSheet("Which colour?", null, [...cols].map(x => [COLOR_NAME[x], x, x === first ? "primary" : ""])) : cols;
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
    if (hasFlashback(name)) btns.push([`Flashback {${c.fb || c.c || "0"}}`, "flashback", "primary"]);
    if (name === "Nature's Rhythm") btns.push(["Harmonize {X}{G}{G}{G}{G}", "harmonize", "primary"]);
    if (S.ywill === S.turn) btns.unshift(...(c.k === "land" ? [["Play land (Yawgmoth's Will)", "ywland", "primary"]] : payButtons(name, " (Yawgmoth's Will)").map(b => [b[0], "yw" + b[1], b[2]])));
    btns.push(["Return to hand", "hand"], ["Exile", "exile"], ["Cancel", null]);
  } else if (zone === "ex") {
    const e = S.ex.find(x => x.n === name);
    if (e && e.given) btns.push(["Take control of it again", "takeback", "primary"]);
    if (e && e.play) { if (c.k === "land" || e.free) btns.push([c.k === "land" ? "Play land" : "Cast free (Ral −8)", "play", "primary"]); else btns.push(...payButtons(name)); }
    btns.push(["To hand", "hand"], ["Cancel", null]);
  } else if (zone === "cmd") {
    btns.push([`Cast (tax ${2 * S.cmd[name]})`, "cast", "primary"], ["Cancel", null]);
  }
  const v = await openSheet(`${name} · ${zone === "gy" ? "graveyard" : zone === "ex" ? "exile" : "command zone"}`, null, btns);
  if (!v) return;
  return zoneAct(zone, name, v);
}
/* what a zone action does; the zone menus and the exile and graveyard viewers share it */
async function zoneAct(zone, name, v) {
  const c = C[name];
  if (v.startsWith("ywpay:")) return castWith(name, "gycast", v.slice(6));
  if (v.startsWith("pay:")) return castWith(name, zone === "gy" ? "gycast" : "exile", v.slice(4));
  if (v === "escape" || v === "escapelife") { if (S.gy.length - 1 < 3) { toast("Escape needs three other cards in the graveyard.", "bad"); return; } return cast(name, "escape", v === "escapelife" ? { phyLife: true } : {}); }
  if (v === "flashback") return cast(name, "flashback");
  if (v === "harmonize") return cast(name, "harmonize");
  if (v === "ywland") { snapshotUndo(); await playLand(name, "gy"); render(); saveLocal(); return; }
  if (v === "takeback") {
    snapshotUndo();
    const e = S.ex.find(x => x.n === name && x.given); S.ex = S.ex.filter(x => x !== e);
    S.bf.push({ uid: S.nextId++, name, tapped: false, wish: e.wish, etbTurn: S.turn });
    log("control", { c: short(name), to: "you again" }); render(); saveLocal(); return;
  }
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

/* group card names by their main type, for long lists */
const TYPE_ORDER = [["creature", "Creatures"], ["instant", "Instants"], ["sorcery", "Sorceries"], ["artifact", "Artifacts"], ["enchantment", "Enchantments"], ["planeswalker", "Planeswalkers"], ["land", "Lands"]];
function groupedPicker(names, onPick) {
  const wrap = document.createElement("div"); wrap.className = "zview";
  const search = document.createElement("input"); search.className = "zsearch"; search.placeholder = `Search ${names.length} card${names.length === 1 ? "" : "s"}`; search.setAttribute("aria-label", "Search these cards");
  wrap.append(search);
  const uniq = [...new Set(names)].sort((a, b) => short(a).localeCompare(short(b)));
  const kindOf = n => { const k = (C[n] || {}).k; return TYPE_ORDER.some(t => t[0] === k) ? k : "other"; };
  for (const [k, title] of [...TYPE_ORDER, ["other", "Other"]]) {
    const list = uniq.filter(n => kindOf(n) === k); if (!list.length) continue;
    const sec = document.createElement("section"); sec.className = "zsec";
    sec.innerHTML = `<h4>${title} <small>${list.reduce((a, n) => a + names.filter(x => x === n).length, 0)}</small></h4>`;
    const pl = cardList(list, (n, i, b) => { wrap.querySelectorAll(".pick").forEach(x => x.classList.remove("sel")); b.classList.add("sel"); onPick(n); });
    [...pl.children].forEach((b, i) => { b.dataset.q = list[i].toLowerCase(); });
    sec.append(pl); wrap.append(sec);
  }
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    wrap.querySelectorAll(".pick").forEach(b => { b.hidden = !!q && !b.dataset.q.includes(q); });
    wrap.querySelectorAll(".zsec").forEach(sc => { sc.hidden = ![...sc.querySelectorAll(".pick")].some(b => !b.hidden); });
    const vis = [...wrap.querySelectorAll(".pick:not([hidden])")], exact = vis.find(b => b.dataset.q === q);
    if (q && (exact || vis.length === 1)) (exact || vis[0]).click();   // an exact name or a single match is picked
  };
  search.onkeydown = ev => { if (ev.key === "Enter") { const b = wrap.querySelector(".pick:not([hidden])"); if (b) b.click(); } };
  setTimeout(() => search.focus(), 0);
  return wrap;
}
async function librarySearch() {
  let picked = null;
  const box = groupedPicker(S.lib, n => { picked = n; });
  const v = await openSheet(`Search your library (${S.lib.length} cards)`, box, [["To hand", "hand", "primary"], ["To top", "top"], ["To bottom", "bottom"], ["Onto the battlefield", "bf"], ["To graveyard", "gy"], ["To exile", "ex"], ["Cancel", null]]);
  if (!v) return;
  if (!picked) { toast("Pick a card first.", "warn"); return; }
  snapshotUndo();
  S.lib.splice(S.lib.indexOf(picked), 1); shuffle(S.lib);
  if (v === "hand") S.hand.push(picked); else if (v === "top") S.lib.unshift(picked); else if (v === "bottom") S.lib.push(picked);
  else if (v === "gy") toGy(picked); else if (v === "ex") S.ex.push({ n: picked });
  log("search", { found: short(picked), to: v });
  if (v === "bf") { if ((C[picked] || {}).k === "land") enterLand(picked); else await enterBf(picked); }
  render(); saveLocal();
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
  if (S.opp.some(o => o.lib <= 0)) return onBf("Gleaming Splendor") ? "Deck-out (Gleaming Splendor)" : "Brain Freeze mill";
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
  const methods = DECK.id === "krark" ? ["Krark 100+ (unfailable)", "Vivi pings", "Brain Freeze mill", "Twinflame / Molten Krark army", "Dualcaster loop", "Pinnacle Monk loop", "Electro", "Burn copies", "Combat", "Other"]
    : DECK.id === "nephilim" ? ["Deck-out (Gleaming Splendor)", "Ink-Treader draws", "Combat", "Other"]
    : ["Thassa's Oracle", "Kefka, Ruler of Ruin draws", "Brain Freeze mill", "Combat", "Other"];
  const sel = document.createElement("div"); sel.className = "form";
  sel.innerHTML = `<label for="egRes">Result</label><select id="egRes"><option value="win">I won</option><option value="stopped">Stopped (no win)</option><option value="loss">I lost</option></select>
    <label for="egMethod">How</label><select id="egMethod">${methods.map(m => `<option>${m}</option>`).join("")}</select>
    <label for="egNote">What decided this game?</label><textarea id="egNote" rows="3" placeholder="e.g. kept a turn-1 Krark hand, held Jeska's Will for Sakashima"></textarea>`;
  const q = id => sel.querySelector("#" + id);
  q("egMethod").value = preset && methods.includes(preset.method) ? preset.method : methods[0];
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
  const words = { win: "a win", loss: "a loss", stopped: "stopped" };
  const next = await openSheet(`Game saved as ${words[S.result.result] || S.result.result} on turn ${S.turn}.`, null, [["Download the game log", "dl", "primary"], ["Close", null]]);
  if (next === "dl") await exportGame();
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
  const deck = DECK.cards.filter(n => !COMMANDERS.includes(n));
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
    started: S.started, updated: new Date().toISOString(), deck: DECK.name, deckId: DECK.id, phase: S.phase,
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
/* the whole game as a JSON file: through Claude's download prompt inside Claude, a plain browser
   download elsewhere, and the clipboard when neither works */
async function exportGame() {
  const json = JSON.stringify(fullExport(), null, 1);
  const filename = `${DECK.id}-playtest-${S.started.slice(0, 10)}-${S.id}.json`;
  if (downloads) {
    try { await downloads.save({ filename, data: json }); toast("Game log saved."); return; }
    catch (e) { if (e && e.code === "declined") return; }
  } else {
    try {
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`Game log downloaded as ${filename}.`); return;
    } catch (e) { /* fall back to the clipboard */ }
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
  for (const [n, c] of Object.entries(S.extraCards || {})) if (!C[n]) C[n] = c;
  $("turnNo").textContent = S.phase === "mull" ? "Opening hand" : `Turn ${S.turn}`;
  const inf = S.inf || {}, show = (k, v) => inf[k] ? "∞" : v;
  $("storm").textContent = show("storm", S.storm);
  // Ral counts instants and sorceries you cast this turn (his loyalty when he flips), which differs from storm
  const ralLive = S.hand.includes(RAL) || S.stack.some(x => x.name === RAL) || S.bf.some(p => p.name === RAL && !p.flipped);
  $("ralIS").hidden = !ralLive; $("ralN").textContent = S.turnStats.instsorc || 0;
  const auto = krarkAuto();
  $("krark").textContent = krarkRaw() >= KRARK_CAP ? KRARK_CAP + "+" : krarkTriggers();
  $("krarkHint").textContent = S.kDelta ? `auto ${auto} ${S.kDelta > 0 ? "+" : "−"} ${Math.abs(S.kDelta)}` : "auto";
  // pool pips: the deck's colours, any other colour that holds mana, colourless and any-colour
  // decks of four or five colours show only the colours that hold mana, with + to add any of them
  const many = IDENT.length > 3;
  const pips = [...[...COLORS].filter(k => (!many && IDENT.includes(k)) || S.pool[k] || inf[k]), "C", "A"];
  if ($("poolPips").dataset.keys !== pips.join("") + many) {
    $("poolPips").dataset.keys = pips.join("") + many;
    $("poolPips").innerHTML = pips.map(k => `<button class="pip" data-act="pool:${k},1" data-alt="pool:${k},-1" title="${k === "A" ? "Any colour" : COLOR_NAME[k]}: click +1, right-click −1"><span class="sym ${k}">${k === "A" ? "★" : k}</span><b id="p${k}">0</b></button>`).join("") +
      (many ? `<button class="mini" data-act="addmana" title="Add one mana of a colour" aria-label="Add mana of a colour">+</button>` : "");
  }
  for (const k of pips) $("p" + k).textContent = show(k, S.pool[k]);
  const rp = S.rpool || [];
  $("rpool").hidden = !rp.length;
  $("rpool").textContent = rp.length ? [...new Set(rp.map(r => r.label))].map(l => `${rp.filter(r => r.label === l).map(r => r.c).join("")} for ${l}`).join(", ") : "";
  document.querySelector(".sgrp.krark").hidden = !COMMANDERS.includes(KRARK) && !DECK.cards.includes(KRARK);
  $("treas").textContent = show("T", S.treasures) + (S.tTreasures ? ` +${S.tTreasures}⤵` : ""); $("life").textContent = S.life;
  $("libCount").textContent = S.lib.length;
  $("avail").textContent = anyInf(inf) ? "∞" : availableMana();
  document.querySelectorAll("[data-act=loop]").forEach(b => { b.textContent = S.loop ? "End loop" : "Start loop"; b.classList.toggle("rec", !!S.loop); });
  // the status bar shows Combat for decks with combat triggers; every deck has it in the Game menu
  const fights = [...COMMANDERS, ...DECK.cards].some(n => [KEFKA, GOGO, IRMA, INK, EPOCHAL].includes(n));
  document.querySelectorAll(".status [data-act=combat]").forEach(b => { b.textContent = combatLabel(); b.hidden = !fights; });
  $("opps").innerHTML = S.opp.map((o, i) => `<button class="opp ${S.target === i ? "tgt" : ""} ${o.life <= 0 || o.lib <= 0 ? "dead" : ""}" data-opp="${i}" aria-label="Opponent ${i + 1}"><b>${o.life}</b><small>lib ${o.lib} · h ${o.hand}</small></button>`).join("");
  $("ohand").textContent = S.opp[S.target].hand;
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
  $("cmdZone").innerHTML = S.cmdZone.map(n => chip(n, S.cmd[n] ? `<span class="tax">tax ${2 * S.cmd[n]}</span>` : "")).join("") || `<p class="empty">${COMMANDERS.length > 1 ? "Both out" : "Out"}</p>`;
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
    ? [["keep", "Keep this hand"], ["mull", "Mulligan"], ["newgame", "Reshuffle new game"], ["drill", "Mulligan drill"], ["imgs", showImg ? "Text view" : "Card images"], ["log", "Log and settings"], ["deck", "Switch deck"], ["importdeck", "Import a deck"]]
    : [["draw", "Draw a card"], ["search", "Search library"], ["combat", combatLabel()], ["mill", "Mill 1 (self)"], ["loop", S.loop ? "End loop" : "Start loop"], ["poolclear", "Empty mana pool"],
       ["notefocus", "Add a note"], ["end", "End game"], ["drill", "Mulligan drill"], ["imgs", showImg ? "Text view" : "Card images"], ["export", "Download the game log"], ["newgame", "New game"], ["log", "Log and settings"], ["deck", "Switch deck"], ["importdeck", "Import a deck"]];
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
      ["T", "Tap or untap"], ["O", "Open its options"], ["F", "Transform (Ral, Kefka)"], ["C", "Create a token copy"], ["+ / −", "Add or remove a +1/+1 counter"], ["Delete", "Remove from the game"]]);
  await openSheet("Keybinds", d, [["Close", null]]);
}
async function pileMenu(z) {
  if (z === "lib") {
    const v = await openSheet(`Library · ${S.lib.length} cards`, null, [["Draw", "draw", "primary"], ["Search", "search"], ["Mill 1", "mill"], ["Cancel", null]]);
    if (v) runAct(v);
    return;
  }
  return zoneViewer(z);
}
/* exile and graveyard: what you can play right now on top with its buttons, then the rest, and a search box */
async function zoneViewer(z) {
  const names = z === "gy" ? [...S.gy].reverse() : S.ex.map(e => e.n).reverse();
  if (!names.length) { toast(z === "gy" ? "Your graveyard is empty." : "Nothing in exile."); return; }
  const actions = n => {   // [label, action] buttons for a card you can play from here now
    const c = C[n] || {};
    if (z === "ex") {
      const e = S.ex.find(x => x.n === n) || {};
      if (e.given) return [["Take it back", "takeback"]];
      if (!e.play) return [];
      return c.k === "land" ? [["Play", "play"]] : e.free ? [["Cast free", "play"]] : payButtons(n).map(b => [b[0], b[1]]);
    }
    const out = [];
    if (S.ywill === S.turn) out.push(...(c.k === "land" ? [["Play (Yawgmoth's Will)", "ywland"]] : payButtons(n, " (Yawgmoth's Will)").map(b => [b[0], "yw" + b[1]])));
    if (onBf(BREACH) && c.k !== "land" && S.gy.length > 3) out.push(["Escape", "escape"]);
    if (hasFlashback(n)) out.push([`Flashback {${c.fb || c.c || "0"}}`, "flashback"]);
    if (n === "Nature's Rhythm") out.push(["Harmonize", "harmonize"]);
    return out;
  };
  const rows = [...new Set(names)].map(n => ({ n, acts: actions(n), count: names.filter(x => x === n).length, given: z === "ex" && (S.ex.find(x => x.n === n) || {}).given }));
  const groups = z === "ex"
    ? [["You can play these now", rows.filter(r => r.acts.length && !r.given)], ["An opponent controls these", rows.filter(r => r.given)], ["Exiled", rows.filter(r => !r.acts.length)]]
    : [["You can cast these now", rows.filter(r => r.acts.length)], ["In the graveyard", rows.filter(r => !r.acts.length)]];
  const wrap = document.createElement("div"); wrap.className = "zview";
  const search = document.createElement("input"); search.placeholder = `Search ${names.length} card${names.length === 1 ? "" : "s"}`; search.setAttribute("aria-label", "Search these cards"); search.className = "zsearch";
  wrap.append(search);
  for (const [title, list] of groups) {
    if (!list.length) continue;
    const sec = document.createElement("section"); sec.className = "zsec";
    sec.innerHTML = `<h4>${esc(title)} <small>${list.length}</small></h4>`;
    for (const r of list) {
      const row = document.createElement("div"); row.className = "zrow"; row.dataset.n = r.n.toLowerCase();
      row.innerHTML = `<button class="pick ${kindClass(r.n)} ${hasArt(r.n) ? "pic" : ""}" data-zopen="${esc(r.n)}">${artTag(r.n)}<span>${esc(short(r.n))}${r.count > 1 ? ` ×${r.count}` : ""}</span><small>${esc((C[r.n] || {}).c || "")}</small></button>` +
        r.acts.map(([label, act]) => `<button class="mini zact" data-zn="${esc(r.n)}" data-zact="${esc(act)}">${esc(label)}</button>`).join("");
      sec.append(row);
    }
    wrap.append(sec);
  }
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    wrap.querySelectorAll(".zrow").forEach(r => { r.hidden = !!q && !r.dataset.n.includes(q); });
    wrap.querySelectorAll(".zsec").forEach(sc => { sc.hidden = ![...sc.querySelectorAll(".zrow")].some(r => !r.hidden); });
  };
  search.onkeydown = ev => { if (ev.key === "Enter") { const b = wrap.querySelector(".zrow:not([hidden]) [data-zopen]"); if (b) b.click(); } };
  let chosen = null;
  wrap.onclick = ev => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.zopen) chosen = { n: b.dataset.zopen, act: null };
    else if (b.dataset.zact) chosen = { n: b.dataset.zn, act: b.dataset.zact };
    else return;
    closeSheet("go");
  };
  setTimeout(() => search.focus(), 0);
  const v = await openSheet(`${z === "gy" ? "Graveyard" : "Exile"} · ${names.length} card${names.length === 1 ? "" : "s"}`, wrap, [["Close", null]]);
  if (v !== "go" || !chosen) return;
  pendingArt = chosen.n;
  if (chosen.act) return zoneAct(z, chosen.n, chosen.act);
  return zoneMenu(z, chosen.n);
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
  if (to === "cmd" && !COMMANDERS.includes(card.name)) { toast(`Only ${COMMANDERS.map(short).join(" and ")} go${COMMANDERS.length === 1 ? "es" : ""} to the command zone.`, "warn"); return true; }
  snapshotUndo();
  const real = takeFrom(card), n = card.name;
  if (real) {
    if (to === "hand") S.hand.push(n);
    else if (to === "gy") toGy(n);
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
    else if (p.name === KEFKA) { snapshotUndo(); p.flipped = !p.flipped; log("transform", { c: "Kefka", to: p.flipped ? "Ruler of Ruin" : "Court Mage" }); }
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
async function deckMenu() {
  const decks = allDecks();
  let picked = DECK.id;
  const wrap = document.createElement("div"); wrap.className = "picklist";
  decks.forEach(d => {
    const b = document.createElement("button"); b.className = "pick" + (d.id === picked ? " sel" : "");
    b.innerHTML = `${esc(d.name)} <small>${esc(d.commanders.map(short).join(" + "))} · ${d.cards.length + d.commanders.length} cards${d.imported ? " · imported" : ""}</small>`;
    b.onclick = () => { picked = d.id; [...wrap.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); };
    wrap.append(b);
  });
  const v = await openSheet("Switch deck: a new game starts with it (the current one stays saved)", wrap, [["Play this deck", "go", "primary"], ["Cancel", null]]);
  if (v === "go") newGame(picked);
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
  if (act === "deck") return deckMenu();
  if (act === "addmana") {
    return openSheet("Add one mana of which colour?", null, [...COLORS, "C"].map(k => [COLOR_NAME[k], k])).then(k => { if (k) runAct(`pool:${k},1`); });
  }
  if (act === "log") return drawerToggle();
  if (act === "notefocus") { drawerToggle(true); $("note").focus(); return; }
  if (act === "poolclear") { snapshotUndo(); S.pool = emptyPool(); S.rpool = []; if (S.inf) for (const k of POOL_KEYS) S.inf[k] = false; log("pool emptied"); render(); return; }
  if (act === "handL" || act === "handR") { const h = $("hand"); h.scrollBy({ left: (act === "handL" ? -1 : 1) * h.clientWidth * 0.8 }); return; }
  if (kind === "pool") { snapshotUndo(); const [col, d] = arg.split(","); if (S.inf && S.inf[col] && +d < 0) { S.inf[col] = false; log("infinite " + col + " cleared"); render(); return; } S.pool[col] = Math.max(0, S.pool[col] + +d); if (+d > 0) S.turnStats.manaMade += +d; log("pool " + (+d > 0 ? "+" : "−") + col); render(); return; }
  if (kind === "treas") { snapshotUndo(); if (arg === "-" && S.inf && S.inf.T) { S.inf.T = false; log("infinite Treasures cleared"); render(); return; } if (arg === "+") addTreasure(1); else if (arg === "-") S.treasures = Math.max(0, S.treasures - 1); else if (S.treasures) { S.treasures--; addMana("A", 1); } log("treasure " + arg); render(); return; }
  if (kind === "life") { snapshotUndo(); S.life += +arg; render(); return; }
  if (kind === "opp") { snapshotUndo(); const [what, d] = arg.split(","); const o = S.opp[S.target]; if (what === "life" && +d < 0) { oppLoses(S.target, -d); o.life = Math.max(0, o.life); } else o[what] = Math.max(0, o[what] + +d); log(`opponent ${S.target + 1} ${what} ${d}`); render(); return; }
  if (kind === "k") { S.kDelta += +arg; render(); return; }
  if (kind === "ohand") { const o = S.opp[S.target]; o.hand = Math.max(0, o.hand + +arg); render(); saveLocal(); return; }
  if (act === "imgs") { showImg = !showImg; try { localStorage.setItem("krark-playtest-images", showImg ? "on" : "off"); } catch (e) { /* per-browser only */ } render(); return; }
  const fns = { drill: () => drillToggle(true), drillExit: () => drillToggle(false), drillKeep: () => drillAnswer("keep"), drillMull: () => drillAnswer("mull"),
    drillBack: () => { if (drill) { drill.phase = "decide"; drill.bottom = []; renderDrill(); } }, clearStack, newgame: newGame, combat, mull: mulligan, keep, next: nextTurn, redo, resolve: resolveTop, resolveAll, loop: loopToggle, draw: () => { snapshotUndo(); draw(1, "draw (extra)"); render(); }, undo, search: librarySearch, end: endGame, note: addNote, export: exportGame, mill: () => { snapshotUndo(); const x = S.lib.shift(); if (x) { toGy(x); log("mill self", { c: short(x) }); } render(); } };
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
$("optSim").checked = simOpps;
$("optSim").onchange = e => { simOpps = e.target.checked; setPref("cge-sim-opps", simOpps ? "on" : "off"); };
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
  let want = null;
  try { want = new URLSearchParams(location.search).get("deck"); } catch (e) { /* no query */ }
  let saved = null; try { saved = localStorage.getItem("cge-deck"); } catch (e) { /* per-browser only */ }
  if (want && want !== ((prev && prev.deck) || "krark")) { history.replaceState(null, "", location.pathname); newGame(want); }
  else if (prev && prev.phase !== "over" && prev.lib) {
    useDeck(prev.deck || "krark");
    S = prev; for (const o of S.opp) if (o.hand == null) o.hand = S.oppHand ?? 7; delete S.oppHand; S.pool = { ...emptyPool(), ...S.pool }; if (!S.stack) S.stack = []; if (S.rng == null) S.rng = Math.floor(Math.random() * 4294967296);
    const krarks = S.bf.filter(p => ident(p) === KRARK && p.token);
    if (krarks.length > KRARK_CAP) { const drop = new Set(krarks.slice(KRARK_CAP).map(p => p.uid)); S.bf = S.bf.filter(p => !drop.has(p.uid)); }
    if (S.turnLog.length > 3000) S.turnLog = S.turnLog.slice(-3000); render(); toast("Picked up your game in progress."); }
  else newGame(want || saved || "krark");
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
