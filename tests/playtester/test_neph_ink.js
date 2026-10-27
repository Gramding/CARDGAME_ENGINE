// Ink-Treader Nephilim and the creature-targeting spells: copies for every other creature (and for
// opponents' creatures), untapping dorks, Treasures, fizzles, Kari Zev's Expertise, Heat Shimmer,
// Flash Photography and Croaking Counterpart.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b, d = 'nephilim') => T.setup(h, b, d);
  const resolve = async () => { await go(() => { resolveTop(); }); };
  const runStack = async () => {   // resolve everything, answering Ink-Treader's sheet with the given count
    for (let i = 0; i < 40; i++) {
      const sh = await T.sheet();
      if (sh.open) { await press(sh.btns[0]); continue; }
      if (!(await state(() => S.stack.length))) break;
      await resolve();
    }
  };

  // Cerulean Wisps on Ink-Treader: a copy for each other creature, each untapping it and drawing
  await setup(['Cerulean Wisps'], ['Ink-Treader Nephilim', 'Llanowar Elves', 'Birds of Paradise', 'Noble Hierarch', 'Tropical Island']);
  await ev(() => { S.bf.slice(0, 4).forEach(p => { p.tapped = true; }); S.oppBoard = { turn: S.turn, n: [0, 0, 0] }; });
  const hand0 = await state(() => S.hand.length);
  await go(() => cast('Cerulean Wisps', 'hand'));
  check('Ink-Treader is the preselected target', (await T.title()).includes('target which creature') && await state(() => document.querySelector('#sheetBody .pick.sel').textContent.startsWith('Ink-Treader')));
  await press('Target it');
  check("Ink-Treader's trigger is on the stack above the spell", await state(() => S.stack[S.stack.length - 1].eff === 'ink'));
  await resolve();
  check('Three copies, one per other creature (opponents have none this time)', await state(() => S.stack.filter(x => x.kind === 'copy' && x.name === 'Cerulean Wisps').length === 3));
  await runStack();
  check('Every creature untapped and four cards drawn', await state(h => S.bf.filter(p => isCreatureP(p)).every(p => !p.tapped) && S.hand.length === h - 1 + 4, hand0), await state(() => S.hand.length));

  // opponents' creatures are rolled once a turn, and their copies draw too
  await setup(['Leap', 'Shadow Rift'], ['Ink-Treader Nephilim', 'Llanowar Elves', 'Tropical Island', 'Tundra']);
  const h1 = await state(() => S.hand.length);
  await go(() => cast('Leap', 'hand')); await press('Target it'); await resolve();
  const board = await state(() => S.oppBoard && S.oppBoard.turn === S.turn && S.oppBoard.n.reduce((a, b) => a + b, 0));
  check('Opponents\' creatures were rolled without asking', board !== false && !(await T.sheet()).open, String(board));
  await runStack();
  check(`Leap: 1 + 1 + ${board} opposing = ${2 + board} draws`, await state(([h, b]) => S.hand.length === h - 1 + 2 + b, [h1, board]));
  await go(() => cast('Shadow Rift', 'hand')); await press('Target it'); await resolve();
  check('The same boards for a second spell that turn', await state(b => S.stack.filter(x => x.kind === 'copy' && x.target.kind === 'other').length === b, board));
  await runStack();
  const avg = await state(() => { let t = 0; for (let i = 0; i < 400; i++) { S.oppBoard = null; S.turn = 100 + i; t += oppBoard().n.reduce((a, b) => a + b, 0); } return t / 400; });
  check('Three opponents average about five creatures', avg > 4.3 && avg < 5.6, avg.toFixed(2));

  // Treasure makers
  await setup(['Sudden Breakthrough'], ['Ink-Treader Nephilim', 'Llanowar Elves', 'Birds of Paradise', 'Taiga']);
  await ev(() => { S.oppBoard = { turn: S.turn, n: [0, 0, 0] }; });
  await go(() => cast('Sudden Breakthrough', 'hand')); await press('Target it'); await runStack();
  check('Sudden Breakthrough through Ink: three Treasures, Elves +2/+0', await state(() => S.treasures === 3 && power(S.bf.find(p => p.name === 'Llanowar Elves')) === 3));

  // a copy whose creature left does nothing
  await setup(['Charge Through'], ['Ink-Treader Nephilim', 'Llanowar Elves', 'Taiga']);
  const h2 = await state(() => S.hand.length);
  await ev(() => { S.oppBoard = { turn: S.turn, n: [0, 0, 0] }; });
  await go(() => cast('Charge Through', 'hand')); await press('Target it'); await resolve();
  await ev(() => { S.bf = S.bf.filter(p => p.name !== 'Llanowar Elves'); });
  await runStack();
  check('The copy aimed at the departed Elves fizzled: one draw', await state(h => S.hand.length === h - 1 + 1 && S.turnLog.some(e => e.a === 'fizzle'), h2));

  // Kari Zev's Expertise: untap and haste, then a free spell
  await setup(["Kari Zev's Expertise", 'Llanowar Elves'], ['Birds of Paradise', 'Volcanic Island', 'Taiga', 'Badlands']);
  await ev(() => { S.bf[0].tapped = true; S.bf[0].etbTurn = 1; });
  await go(() => cast("Kari Zev's Expertise", 'hand')); await pick('Birds'); await press('Target it'); await resolve();
  await press('Cast it free'); await T.p.waitForTimeout(150);
  check('Birds untapped with haste, and Llanowar Elves cast for free', await state(() => { const b = S.bf.find(p => p.name === 'Birds of Paradise'); return !b.tapped && b.hasteTurn === S.turn && isManaSource(b) && S.bf.some(p => p.name === 'Llanowar Elves'); }));

  // Heat Shimmer: a hasty token copy, gone at the end step; it gets the ETB trigger
  await setup(['Heat Shimmer'], ['Spellseeker', 'Volcanic Island', 'Taiga', 'Badlands']);
  await go(() => cast('Heat Shimmer', 'hand')); await pick('Spellseeker'); await press('Target it'); await resolve(); await T.p.waitForTimeout(150);
  check('Heat Shimmer made a temporary Spellseeker with its trigger', await state(() => S.bf.some(p => p.token && p.temp && ident(p) === 'Spellseeker') && (S.stack.some(x => x.eff === 'seeker') || document.getElementById('sheetTitle').textContent.startsWith('Spellseeker'))));
  for (let i = 0; i < 3 && (await T.sheet()).open; i++) await press((await T.sheet()).btns[0]);
  await ev(() => { S.stack = []; nextTurn(); }); await T.p.waitForTimeout(150);
  check('The Heat Shimmer token is gone next turn', await state(() => !S.bf.some(p => p.token)));

  // Flash Photography copies any permanent and has flashback
  await setup(['Flash Photography'], ['Sol Ring', 'Tropical Island', 'Tundra', 'Volcanic Island', 'Underground Sea']);
  await go(() => cast('Flash Photography', 'hand'));
  check('Flash Photography can target a noncreature permanent', (await T.title()).includes('target which permanent'));
  await pick('Sol Ring'); await press('Target it'); await resolve();
  check('A Sol Ring token', await state(() => S.bf.some(p => p.token && ident(p) === 'Sol Ring')));
  check('Flash Photography offers flashback {4UU}', await state(() => hasFlashback('Flash Photography') && C['Flash Photography'].fb === '4UU'));

  // Croaking Counterpart: a 1/1 copy
  await setup(['Croaking Counterpart'], ['Faeburrow Elder', 'Tropical Island', 'Taiga', 'Bayou']);
  await go(() => cast('Croaking Counterpart', 'hand')); await pick('Faeburrow'); await press('Target it'); await resolve();
  check('Croaking Counterpart made a 1/1 Faeburrow token', await state(() => { const t = S.bf.find(p => p.token); return t && ident(t) === 'Faeburrow Elder' && power(t) === 1 && toughness(t) === 1; }));

  // Krark's Expedite targets now too
  await setup(['Expedite'], ['Krark, the Thumbless', 'Mountain'], 'krark');
  await go(() => cast('Expedite', 'hand'));
  check('In the Krark deck Expedite asks for a creature', (await T.title()).startsWith('Expedite: target which creature'));
  await press('Target it');
  check('Krark triggers still go on the stack', await state(() => S.stack.some(x => x.eff === 'krark')));
  await T.done();
})();
