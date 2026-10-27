// Opponents' turns played at random when you pass: Rhystic Study, Mystic Remora, Esper Sentinel,
// Smothering Tithe, Tataru Taru, Gleaming Splendor, The Queen of Dale, The Cabbage Merchant and Lotho.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  // a fixed table: every opponent plays a land, casts two noncreature spells, draws once, and both others draw off-turn; nobody pays
  const fixed = (extra = {}) => ev(x => {
    simOpps = true;
    Object.assign(OPP_SIM, { spells: [[2, 100]], noncreature: 1, cantrip: 0, offTurnDraw: 1, landDrop: 1, pay: { "Rhystic Study": 0, "Mystic Remora": 0, "Esper Sentinel": 0, "Smothering Tithe": 0 } }, x);
  }, extra);
  const pass = async () => { await go(() => { nextTurn(); }); await T.p.waitForTimeout(200); };

  await T.setup([], ['Rhystic Study', 'Mystic Remora', 'Esper Sentinel'], 'nephilim');
  await ev(() => { S.lib = S.lib.filter(n => n !== 'Island'); });
  await fixed();
  const h0 = await state(() => S.hand.length);
  await pass();
  check('A summary shows what the opponents did', (await T.title()) === 'While your opponents played' && /Rhystic Study: you drew 6/.test(await state(() => document.getElementById('sheetBody').textContent)), await state(() => document.getElementById('sheetBody').textContent));
  check('Rhystic 6 + Remora 6 + Sentinel 3 + your draw step = 16 cards', await state(h => S.hand.length === h + 16, h0), String(await state(() => S.hand.length)));
  check("Opponents' libraries: one draw each, plus two off-turn draws", await state(() => S.opp.every(o => o.lib === 92 - 1 - 2)));
  check('Hands: 7, +1 draw step, -1 land, -2 spells, +2 off-turn draws = 7', await state(() => S.opp.every(o => o.hand === 7)), await state(() => S.opp.map(o => o.hand).join()));
  await press('OK');
  check('Remora still asks for its upkeep', await state(() => S.stack.some(x => x.eff === 'remora')));

  // Smothering Tithe counts every opponent draw; Tataru's off-turn Treasure is tapped and untaps for you; Gleaming needs a second draw
  await T.setup([], ['Smothering Tithe', 'Tataru Taru', 'Gleaming Splendor'], 'nephilim');
  await fixed({ cantrip: 1 });
  await pass();
  check('Tithe: 3 opponents × (1 + 2 cantrips + 2 off-turn) = 15, Tataru 3, Gleaming 3 = 21 Treasures, all untapped now', await state(() => S.treasures === 21 && !S.tTreasures), await state(() => S.treasures + ' / ' + S.tTreasures));
  await press('OK');

  // paying sometimes: Rhystic with everyone always paying draws nothing
  await T.setup([], ['Rhystic Study'], 'nephilim');
  await fixed({ pay: { 'Rhystic Study': 1 } });
  const h1 = await state(() => S.hand.length);
  await pass();
  check('When everyone pays for Rhystic Study you only draw for your turn', await state(h => S.hand.length === h + 1 && /Rhystic Study: nothing \(they paid 6 times\)/.test(document.getElementById('sheetBody').textContent), h1));
  await press('OK');

  // Queen of Dale recruits, The Cabbage Merchant gets Food, Lotho gets Treasures and loses life
  await T.setup([], ['The Queen of Dale', 'The Cabbage Merchant', 'Lotho, Corrupt Shirriff'], 'nephilim');
  await fixed();
  await pass();
  for (let k = 0; k < 3; k++) { await T.p.waitForFunction(() => document.getElementById('sheetTitle').textContent.startsWith('The Queen of Dale'), null, { timeout: 4000 }); await press('Discard it'); }
  await press('OK');
  check('Three recruits, six Foods, three Lotho Treasures for 3 life', await state(() => S.turnLog.filter(e => e.a === 'recruit').length === 3 && S.bf.filter(p => p.name === 'Food Token').length === 6 && S.treasures === 3 && S.life === 37));

  // nothing watching: no sheet, and it can be switched off
  await T.setup([], ['Sol Ring'], 'nephilim');
  await fixed(); await pass();
  check('No summary when none of your cards care', !(await T.sheet()).open);

  // opponents can only cast what they hold, cantrips refill, and cleanup trims to seven
  await T.setup([], ['Rhystic Study'], 'nephilim');
  await fixed({ spells: [[4, 100]], offTurnDraw: 0, landDrop: 1 });
  await ev(() => { S.opp[0].hand = 0; S.opp[1].hand = 2; S.opp[2].hand = 12; });
  await pass();
  check('Empty hand: draw, land, nothing left to cast; two cards: land, two spells; twelve: four spells, trimmed to seven', await state(() => S.oppSim.opps.map(o => o.spells.length).join() === '0,2,4' && S.opp.map(o => o.hand).join() === '0,0,7'), await state(() => S.oppSim.opps.map(o => o.spells.length).join() + ' / ' + S.opp.map(o => o.hand).join()));
  await press('OK');
  await T.setup([], ['Rhystic Study'], 'nephilim');
  await fixed({ spells: [[3, 100]], offTurnDraw: 0, landDrop: 0, cantrip: 1 });
  await ev(() => { S.opp.forEach(o => { o.hand = 1; }); });
  await pass();
  check('With cantrips a two-card hand casts three spells and keeps one card', await state(() => S.oppSim.opps.every(o => o.spells.length === 3 && o.draws === 4) && S.opp.every(o => o.hand === 2 && o.lib === 92 - 4)), await state(() => S.opp.map(o => o.hand + '/' + o.lib).join()));
  await press('OK');
  await T.setup([], ['Rhystic Study'], 'nephilim');
  await fixed(); await ev(() => { simOpps = false; });
  const h2 = await state(() => S.hand.length);
  await pass();
  check('Switched off, passing the turn is just your draw', await state(h => S.hand.length === h + 1, h2) && !(await T.sheet()).open);
  check('The setting is in the log drawer', await state(() => !!document.getElementById('optSim')));

  await T.done();
})();
