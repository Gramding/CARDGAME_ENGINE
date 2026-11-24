// The Kodama deck's landfall and land drops: Lotus Cobra, Nissa (an Elf on the second land), Tireless Provisioner,
// Aesi's draw and extra land drop, Ashaya turning creatures into Forest lands, and the lands with enter triggers.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'kodama');
  const play = async n => { await go(n => handMenu(n), n); await press('Play land'); await T.p.waitForTimeout(120); };

  // Lotus Cobra: one mana of any colour per land
  await setup(['Forest', 'Island'], ['Lotus Cobra']);
  await play('Forest');
  check('Lotus Cobra added one mana of any colour', await state(() => S.pool.A === 1 && S.turnLog.some(e => e.a === 'Lotus Cobra')));

  // Aesi: draw on landfall, two land drops a turn
  await setup(['Forest', 'Island', 'Hedge Maze'], ['Aesi, Tyrant of Gyre Strait']);
  await play('Forest');
  check('Aesi drew a card for the Forest', await state(() => S.hand.length === 3 && S.turnStats.draws === 1));
  await play('Island');
  check('A second land drop with Aesi needs no warning', await state(() => S.landsPlayed === 2 && !/already played/.test(document.getElementById('banner').textContent)));
  await ev(() => { S.lib.unshift('Forest'); });
  await play('Hedge Maze');
  check('A third one warns', await state(() => /already played 2 lands/.test(document.getElementById('banner').textContent)));

  // Hedge Maze: tapped, then surveil 1
  await setup(['Hedge Maze'], []);
  await ev(() => { S.lib.unshift('Lotus Bloom'); });
  await play('Hedge Maze');
  check('Hedge Maze entered tapped and surveils', (await T.title()).startsWith('Hedge Maze: surveil 1. Top card is Lotus Bloom') && await state(() => S.bf[0].tapped));
  await press('Put in graveyard');
  check('Lotus Bloom went to the graveyard', await state(() => S.gy.includes('Lotus Bloom') && S.lib[0] !== 'Lotus Bloom'));

  // Nissa: the second landfall this turn reveals until an Elf or Elemental
  await setup(['Forest', 'Island'], ['Nissa, Resurgent Animist', 'Aesi, Tyrant of Gyre Strait']);
  await ev(() => { askOrder = false; S.lib = ['Island', 'Sol Ring', 'Llanowar Elves', ...S.lib.filter(n => !['Island', 'Sol Ring', 'Llanowar Elves'].includes(n))]; });
  await play('Forest');
  await T.resolveAll(); await T.p.waitForTimeout(150);
  check('First Nissa landfall: one mana, no reveal (Aesi drew the Island)', await state(() => S.pool.A === 1 && S.hand.includes('Island') && S.lib[0] === 'Sol Ring'));
  await play('Island'); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Second landfall: Nissa revealed Sol Ring, found Llanowar Elves', await state(() => S.pool.A === 2 && S.hand.includes('Llanowar Elves') && S.lib[S.lib.length - 1] === 'Sol Ring'), await state(() => JSON.stringify(S.turnLog.filter(e => e.a === 'Nissa'))));

  // Tireless Provisioner: a Treasure or a Food
  await setup(['Forest', 'Island'], ['Tireless Provisioner']);
  await play('Forest'); await press('Treasure');
  await play('Island'); await press('Food');
  check('A Treasure and a Food', await state(() => S.treasures === 1 && S.bf.some(p => p.name === 'Food Token')));

  // Ashaya: nontoken creatures are Forest lands, so a creature entering is landfall
  await setup(['Llanowar Elves'], ['Ashaya, Soul of the Wild', 'Lotus Cobra', 'Forest']);
  check('Ashaya counts the lands: herself, Lotus Cobra and the Forest', await state(() => { const a = S.bf[0]; return power(a) === 3 && toughness(a) === 3 && isLandP(S.bf[1]) && landTypesP(S.bf[1]).includes('F'); }));
  check('Lotus Cobra taps for G as a Forest', await state(() => sourceColors(S.bf[1]).includes('G')));
  await go(() => cast('Llanowar Elves', 'hand')); await T.p.waitForTimeout(200);
  check('Llanowar Elves entering is a land entering: Cobra added mana', await state(() => S.bf.some(p => p.name === 'Llanowar Elves') && S.pool.A === 1));
  check('Ashaya is now 4/4', await state(() => power(S.bf[0]) === 4));
  check('A token creature is not a land', await state(() => { addTreasure(0); const t = makeTokens([['Illusion Token', 1]], 'test')[0]; return !isLandP(t); }));

  // Yavimaya: every land is a Forest
  await setup([], ['Yavimaya, Cradle of Growth', 'Crystal Vein', 'Island']);
  check('Crystal Vein and Island tap for G with Yavimaya', await state(() => sourceColors(S.bf[1]).includes('G') && sourceColors(S.bf[2]) === 'UG'));

  // Simic Growth Chamber: tapped, returns a land, taps for both
  await setup(['Simic Growth Chamber'], ['Forest']);
  await play('Simic Growth Chamber');
  check('Growth Chamber asks which land to return', (await T.title()).startsWith('Simic Growth Chamber: return a land'));
  await pick('Forest'); await press('Return it');
  check('The Forest went back to hand and the Chamber is tapped', await state(() => S.hand.includes('Forest') && S.bf.length === 1 && S.bf[0].tapped));
  await ev(() => { S.bf[0].tapped = false; });
  check('It taps for {G}{U}', await state(() => { tapFor(S.bf[0], 'G'); return S.pool.G === 1 && S.pool.U === 1; }));

  // Sunscorched Desert: 1 damage to the targeted opponent
  await setup(['Sunscorched Desert'], []);
  await play('Sunscorched Desert');
  check('Sunscorched Desert dealt 1 to opponent 1', await state(() => S.opp[0].life === 39));

  // Castle Garenbrig and Shifting Woodland: tapped unless you control a Forest; Turbulent Wilderness early on
  await setup(['Castle Garenbrig', 'Shifting Woodland', 'Turbulent Wilderness'], []);
  await play('Castle Garenbrig');
  check('Castle Garenbrig without a Forest entered tapped', await state(() => S.bf[0].tapped));
  await ev(() => { S.bf.push({ uid: S.nextId++, name: 'Forest', tapped: false }); });
  await play('Shifting Woodland');
  check('Shifting Woodland with a Forest entered untapped', await state(() => !S.bf.find(p => p.name === 'Shifting Woodland').tapped));
  await play('Turbulent Wilderness');
  check('Turbulent Wilderness enters tapped on turn 1', await state(() => S.bf.find(p => p.name === 'Turbulent Wilderness').tapped));
  await ev(() => { S.turn = 4; S.landsPlayed = 0; const p = enterLand('Turbulent Wilderness'); window.__tw = !p.tapped; });
  check('From your fourth turn it enters untapped', await state(() => window.__tw));

  // Prismatic Vista finds basics only
  await setup([], ['Prismatic Vista']);
  check('Prismatic Vista lists only basic lands', await state(() => { const t = fetchTargets('Prismatic Vista'); return t.length && t.every(isBasic) && !t.includes('Breeding Pool'); }));

  // Talon Gates: {4} from hand, then phase a creature out until your next untap
  await setup(['Talon Gates of Madara'], ['Forest', 'Forest', 'Island', 'Island', 'Llanowar Elves']);
  await go(() => handMenu('Talon Gates of Madara')); await press('{4}: put it onto');
  check('Talon Gates asks what to phase out', (await T.title()).startsWith('Talon Gates: phase out'));
  await pick('Llanowar Elves'); await press('Phase mine out');
  check('Llanowar Elves phased out, Talon Gates is on the battlefield, no land drop used', await state(() => !S.bf.some(p => p.name === 'Llanowar Elves') && S.phased.length === 1 && S.bf.some(p => p.name === 'Talon Gates of Madara') && !S.landsPlayed));
  await go(() => nextTurn()); await T.idle(); await T.p.waitForTimeout(150);
  await ev(() => { if (!document.getElementById('sheet').hidden) closeSheet(null); });
  check('It phased back in on your next turn', await state(() => S.bf.some(p => p.name === 'Llanowar Elves') && !(S.phased || []).length));

  // Dryad Arbor: a land and a 1/1 creature, summoning sick the turn it arrives
  await setup(['Dryad Arbor'], []);
  await play('Dryad Arbor');
  check('Dryad Arbor is a creature land and can\'t tap for mana yet', await state(() => { const p = S.bf[0]; return isCreatureP(p) && isLandP(p) && power(p) === 1 && !isManaSource(p); }));
  check('It sits with the lands and shows its power', await state(() => document.getElementById('lands').textContent.includes('1/1')));
  await T.done();
})();
