// Nephilim deck mana: hybrid costs and the commander, mana creatures and summoning sickness, Gaea's Cradle,
// vivid, Kinnan, Utopia Sprawl, Enduring Vitality, Starting Town, Tarnished Citadel, X spells, convoke,
// harmonize, Eldritch Evolution and Elvish Spirit Guide.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'nephilim');
  const resolve = async () => { await go(() => { resolveTop(); }); };
  const EPOCHAL = 'Nephilim Epochal';

  // the commander's four hybrid pips, paid by four duals
  await setup([], ['Volcanic Island', 'Tundra', 'Bayou', 'Taiga']);
  check('Nephilim Epochal is the commander; five colours fold into a + button', await state(() => S.cmdZone[0] === 'Nephilim Epochal' && !document.getElementById('pW') && document.querySelector('[data-act=addmana]')));
  await go(() => runAct('addmana')); await press('Black');
  check('+ added a black mana and its pip appeared', await state(() => S.pool.B === 1 && document.getElementById('pB').textContent === '1'));
  await ev(() => { S.pool.B = 0; render(); });
  check('Hybrid cost parses into four either-or pips', await state(() => JSON.stringify(parseCost(C['Nephilim Epochal'].c).hyb) === '["UR","RG","GW","WB"]'));
  await go(k => zoneMenu('cmd', k), EPOCHAL); await press('Cast (tax 0)'); await T.p.waitForTimeout(200);
  check('Epochal paid with all four lands and resolved', await state(() => S.bf.filter(p => p.tapped).length === 4 && S.bf.some(p => p.name === 'Nephilim Epochal')));
  await pick('Ink-Treader'); await press('Take it');
  check('Epochal ETB found Ink-Treader Nephilim', await state(() => S.hand.includes('Ink-Treader Nephilim')));
  await setup(['Deathrite Shaman'], ['Taiga']);
  await go(() => cast('Deathrite Shaman', 'hand'));
  check('Deathrite Shaman {B/G} paid with green', await state(() => S.bf.some(p => p.name === 'Deathrite Shaman') && S.bf[0].tapped));

  // mana creatures can't tap the turn they arrive, unless they have haste
  await setup(['Llanowar Elves', 'Expedite'], ['Taiga', 'Volcanic Island']);
  await go(() => cast('Llanowar Elves', 'hand')); await T.p.waitForTimeout(150);
  check('A fresh Llanowar Elves is summoning sick', await state(() => { const e = S.bf.find(p => p.name === 'Llanowar Elves'); return e && sick(e) && !isManaSource(e); }));
  await go(() => cast('Expedite', 'hand')); await pick('Llanowar Elves'); await press('Target it'); await T.resolveAll();
  check('Expedite gave it haste, so it taps for G', await state(() => isManaSource(S.bf.find(p => p.name === 'Llanowar Elves'))));

  // dorks of every colour, and Elves of Deep Shadow hurting
  await setup([], ['Birds of Paradise', 'Noble Hierarch', 'Ignoble Hierarch', 'Avacyn\'s Pilgrim', 'Elves of Deep Shadow']);
  check('Birds any colour, Noble GWU, Ignoble BRG, Pilgrim W', await state(() => S.bf.slice(0, 4).map(p => sourceColors(p)).join(' ') === 'WUBRG GWU BRG W'));
  await go(() => bfMenu(S.bf[4].uid)); await press('Tap for mana');
  check('Elves of Deep Shadow: B for 1 life', await state(() => S.pool.B === 1 && S.life === 39));

  // Gaea's Cradle, vivid and Faeburrow Elder
  await setup([], ["Gaea's Cradle", 'Bloom Tender', 'Esper Sentinel', 'Faeburrow Elder', 'Tundra']);
  check('Faeburrow Elder is 2/2 with green and white around', await state(() => { const f = S.bf.find(p => p.name === 'Faeburrow Elder'); return power(f) === 2 && toughness(f) === 2; }));
  await go(() => bfMenu(S.bf[0].uid)); await press('Tap for mana');
  check("Gaea's Cradle made GGG for three creatures", await state(() => S.pool.G === 3));
  await ev(() => { S.pool.G = 0; });
  await go(() => bfMenu(S.bf[1].uid)); await press('Tap for mana'); await T.p.waitForTimeout(80);
  if ((await T.sheet()).open) await press((await T.sheet()).btns[0]);
  check('Bloom Tender made one G and one W', await state(() => S.pool.G === 1 && S.pool.W === 1), await state(() => JSON.stringify(S.pool)));

  // Kinnan doubles nonland mana only
  await setup([], ['Kinnan, Bonder Prodigy', 'Sol Ring', 'Llanowar Elves', 'Taiga']);
  await go(() => bfMenu(S.bf[1].uid)); await press('Tap for mana');
  await go(() => bfMenu(S.bf[2].uid)); await press('Tap for mana');
  await go(() => bfMenu(S.bf[3].uid)); await press('Tap for mana'); await press('Green');
  check('Kinnan: Sol Ring CCC, Elves GG, Taiga just G', await state(() => S.pool.C === 3 && S.pool.G === 3), await state(() => JSON.stringify(S.pool)));

  // Utopia Sprawl
  await setup(['Utopia Sprawl'], ['Taiga', 'Bayou', 'Llanowar Elves']);
  await go(() => cast('Utopia Sprawl', 'hand')); await T.p.waitForTimeout(150);
  await pick('Taiga'); await press('Enchant it'); await press('Blue');
  await go(() => bfMenu(S.bf.find(p => p.name === 'Taiga').uid)); await press('Tap for mana'); await press('Red');
  check('Sprawled Taiga made R plus U', await state(() => S.pool.R === 1 && S.pool.U === 1));

  // Enduring Vitality: creatures tap for any colour; it comes back as an enchantment when it dies
  await setup([], ['Enduring Vitality', 'Spellseeker']);
  check('With Vitality, Spellseeker taps for any colour', await state(() => sourceColors(S.bf[1]) === 'WUBRG'));
  await go(() => bfMenu(S.bf[0].uid)); await press('Sacrifice / dies');
  check('Vitality came back as a noncreature enchantment, still granting mana', await state(() => { const v = S.bf.find(p => p.name === 'Enduring Vitality'); return v && !isCreatureP(v) && sourceColors(S.bf.find(p => p.name === 'Spellseeker')) === 'WUBRG'; }));

  // Starting Town and Tarnished Citadel
  await setup(['Starting Town'], ['Tarnished Citadel']);
  await go(() => playLand('Starting Town', 'hand'));
  check('Starting Town enters untapped on turn 1', await state(() => !S.bf.find(p => p.name === 'Starting Town').tapped));
  await ev(() => { S.turn = 4; enterLand('Starting Town'); });
  check('Starting Town enters tapped on turn 4', await state(() => S.bf.filter(p => p.name === 'Starting Town')[1].tapped));
  await go(() => bfMenu(S.bf[0].uid)); await press('Tap for mana'); await press('Black');
  check('Tarnished Citadel: coloured mana for 3 life', await state(() => S.pool.B === 1 && S.life === 37));

  // Chord of Calling with X = 1 and convoke
  await setup(['Chord of Calling'], ['Llanowar Elves', 'Elvish Mystic', 'Fyndhorn Elves', 'Taiga']);
  await go(() => cast('Chord of Calling', 'hand'));
  await ev(() => { document.getElementById('xVal').value = 1; }); await press('Cast it');
  await ev(() => { [...document.querySelectorAll('#sheetBody .pick')].forEach(b => b.click()); }); await press('Tap them and cast');
  check('Chord paid GGG by convoke and X by Taiga', await state(() => S.bf.every(p => p.tapped) && S.stack.some(x => x.name === 'Chord of Calling' && x.x === 1)));
  await resolve(); await pick('Birds of Paradise'); await press('Put it in');
  check('Chord put Birds of Paradise onto the battlefield', await state(() => S.bf.some(p => p.name === 'Birds of Paradise')));

  // Green Sun's Zenith shuffles itself back
  await setup(["Green Sun's Zenith"], ['Taiga', 'Bayou']);
  await go(() => cast("Green Sun's Zenith", 'hand')); await ev(() => { document.getElementById('xVal').value = 1; }); await press('Cast it');
  await resolve(); await pick('Noble Hierarch'); await press('Put it in');
  check("GSZ found Noble Hierarch and went back into the library", await state(() => S.bf.some(p => p.name === 'Noble Hierarch') && S.lib.includes("Green Sun's Zenith") && !S.gy.includes("Green Sun's Zenith")));

  // Nature's Rhythm harmonized from the graveyard, Faeburrow's power paying generic
  await setup([], ['Faeburrow Elder', 'Noble Hierarch', 'Taiga', 'Bayou', 'Savannah', 'Tropical Island']);
  await ev(() => { S.gy = ["Nature's Rhythm"]; });
  await go(() => zoneMenu('gy', "Nature's Rhythm")); await press('Harmonize');
  await ev(() => { document.getElementById('xVal').value = 2; }); await press('Cast it');
  await pick('Faeburrow'); await press('Tap it');
  check('Harmonize: X=2 paid by tapping Faeburrow (power 3: G, W, U)', await state(() => S.stack.some(x => x.from === 'harmonize') && S.bf.find(p => p.name === 'Faeburrow Elder').tapped), await state(() => JSON.stringify(S.turnLog.slice(-2))));
  await resolve(); await pick('Bloom Tender'); await press('Put it in');
  await T.p.waitForTimeout(150);
  check("Nature's Rhythm was exiled", await state(() => S.ex.some(e => e.n === "Nature's Rhythm")));

  // Eldritch Evolution sacrificing a one-drop finds a three-drop
  await setup(['Eldritch Evolution'], ['Llanowar Elves', 'Taiga', 'Bayou', 'Savannah']);
  await go(() => cast('Eldritch Evolution', 'hand')); await pick('Llanowar'); await press('Sacrifice it');
  await resolve(); await pick('Spellseeker'); await press('Put it in'); await T.p.waitForTimeout(150);
  check('Eldritch Evolution: Elves sacrificed, Spellseeker in, spell exiled', await state(() => S.gy.includes('Llanowar Elves') && S.bf.some(p => p.name === 'Spellseeker') && S.ex.some(e => e.n === 'Eldritch Evolution')));

  // Elvish Spirit Guide
  await setup(['Elvish Spirit Guide'], []);
  await go(() => handMenu('Elvish Spirit Guide')); await press('Exile for G');
  check('Elvish Spirit Guide exiled for G', await state(() => S.pool.G === 1 && S.ex.some(e => e.n === 'Elvish Spirit Guide')));
  await T.done();
})();
