// Fixes from the card audit: data that disagreed with the real cards, and abilities that were missing.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b, d = 'krark') => T.setup(h, b, d);

  check('Every creature has printed power/toughness and creature types in its data', await state(() => Object.values(C).filter(c => c.k === 'creature' && !c.token).every(c => Array.isArray(c.pt) && (c.ty || []).length)));
  check('Return the Favor has mana value 2', await state(() => C['Return the Favor'].mv === 2));
  check('Gemstone Caverns, Minamo, Otawara and Mox Amber are legendary', await state(() => ['Gemstone Caverns', "Minamo, School at Water's Edge", 'Otawara, Soaring City', 'Mox Amber'].every(n => C[n].leg)));
  check('Dualcaster Mage has flash from its data', await state(() => C['Dualcaster Mage'].flash && instantSpeed('Dualcaster Mage')));
  check('Prowess comes from the data', await state(() => C['Harmonic Prodigy'].prowess && C['Pinnacle Monk // Mystic Peak'].prowess));

  // Chrome Mox can't imprint an artifact creature
  await setup(['Chrome Mox', 'Esper Sentinel', 'Dispel'], [], 'nephilim');
  await go(() => cast('Chrome Mox', 'hand')); await T.p.waitForTimeout(150);
  const imprint = await state(() => [...document.querySelectorAll('#sheetBody .pick')].map(b => b.textContent));
  check('Chrome Mox offers Dispel but not Esper Sentinel (an artifact creature)', imprint.some(n => n.startsWith('Dispel')) && !imprint.some(n => n.startsWith('Esper')), imprint.join(' | '));

  // Vivi makes mana equal to its power
  await setup([], ['Vivi Ornitier']);
  await ev(() => { S.bf[0].counters = 2; pump(S.bf[0], 1); });
  await go(() => bfMenu(S.bf[0].uid)); await press('Add 3 mana');
  check('Vivi with 2 counters and +1/+1 adds 3', await state(() => S.pool.A === 3));

  // Rite of Flame counts the Rites already in the graveyard
  await setup(['Rite of Flame'], ['Mountain']);
  await ev(() => { S.gy = ['Rite of Flame']; });
  await go(() => cast('Rite of Flame', 'hand')); await T.resolveAll();
  check('Rite of Flame with one Rite in the graveyard makes RRR', await state(() => S.pool.R === 3), await state(() => JSON.stringify(S.pool)));

  // Storm-Kiln Artist gets +1/+0 per artifact, Treasures included
  await setup([], ['Storm-Kiln Artist', 'Sol Ring', 'Lotus Petal']);
  await ev(() => { S.treasures = 2; });
  check('Storm-Kiln Artist is 6/2 with two artifacts and two Treasures', await state(() => { const k = S.bf[0]; return power(k) === 6 && toughness(k) === 2; }));

  // Molten Duplication tokens are artifacts with haste
  await setup(['Molten Duplication'], ['Krark, the Thumbless', 'Mountain', 'Mountain']);
  await ev(() => { S.rng = null; Math.random = () => 0.1; });   // Krark wins his flip
  await go(() => cast('Molten Duplication', 'hand')); await T.resolveAll(); await T.p.waitForTimeout(100);
  for (let i = 0; i < 4 && (await T.sheet()).open; i++) await press((await T.sheet()).btns[0]);
  check('A Molten Duplication token is an artifact with haste', await state(() => S.bf.some(p => p.token && isArtifactP(p) && p.hasteTurn === S.turn)), await state(() => JSON.stringify(S.bf.filter(p => p.token))));

  // Emergence Zone gives flash
  await setup([], ['Emergence Zone', 'Mountain']);
  await go(() => bfMenu(S.bf[0].uid)); await press('{1}, sacrifice: cast spells');
  check('Emergence Zone: sacrificed, spells have flash this turn', await state(() => S.flashTurn === S.turn && S.gy.includes('Emergence Zone') && instantSpeed('Jeska\'s Will')));

  // Minamo untaps a legendary permanent
  await setup([], ["Minamo, School at Water's Edge", 'Island', 'Krark, the Thumbless']);
  await ev(() => { S.bf[2].tapped = true; });
  await go(() => bfMenu(S.bf[0].uid)); await press('{U}, tap'); await pick('Krark'); await press('Untap it');
  check('Minamo untapped Krark', await state(() => !S.bf.find(p => p.name === 'Krark, the Thumbless').tapped && S.bf[0].tapped && S.bf[1].tapped));

  // Tavern Scoundrel flips for itself
  await setup([], ['Tavern Scoundrel', 'Mountain', 'Lotus Petal']);
  await ev(() => { S.rng = null; Math.random = () => 0.1; });
  await go(() => bfMenu(S.bf[0].uid)); await press('{1}, tap, sacrifice another'); await pick('Lotus Petal'); await press('Sacrifice it');
  check('Tavern Scoundrel won its own flip: Petal gone, its two-Treasure trigger waiting', await state(() => !S.bf.some(p => p.name === 'Lotus Petal') && S.stack.some(x => x.eff === 'scoundrel')));
  await go(() => { resolveTop(); });
  check('Two Treasures', await state(() => S.treasures === 2));
  await T.done();
})();
