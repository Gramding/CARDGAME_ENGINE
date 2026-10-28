// The Q deck's storm and mana: Grapeshot copies aimed at several opponents, Empty the Warrens, Aetherflux Reservoir,
// Ruby Medallion and Cloud Key, Runaway Steam-Kin, Seething Song, Inner Fire, Mana Geyser, Past in Flames and Reckless Impulse.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'q');
  const resolve = async () => { await go(() => { resolveTop(); }); };

  // Grapeshot with storm 5: the copies are spread over the opponents you choose
  await setup(['Grapeshot'], ['Mountain', 'Mountain']);
  await ev(() => { S.storm = 5; S.target = 0; });
  await go(() => cast('Grapeshot', 'hand')); await press('Target it');
  check('Grapeshot and its storm trigger are on the stack', await state(() => S.stack.map(x => x.eff || x.name).join() === 'Grapeshot,storm'));
  await resolve();
  check('The storm trigger asks where the five copies go', (await T.title()).startsWith('Grapeshot: aim the storm copies') && await state(() => document.getElementById('aim0').value === '5'));
  await ev(() => { document.getElementById('aim0').value = 2; document.getElementById('aim1').value = 3; document.getElementById('aim2').value = 0; });
  await press('Aim them');
  check('Five copies with their own targets', await state(() => S.stack.filter(x => x.kind === 'copy').length === 5 && S.stack.filter(x => x.target && x.target.i === 1).length === 3));
  await T.resolveAll(); await T.p.waitForTimeout(200);
  check('Opponent 1 lost 3 (the spell and two copies), opponent 2 lost 3', await state(() => S.opp[0].life === 37 && S.opp[1].life === 37 && S.opp[2].life === 40), await state(() => S.opp.map(o => o.life).join()));

  // Empty the Warrens with storm 3: four casts' worth of two Goblins
  await setup(['Empty the Warrens'], Array(4).fill('Mountain'));
  await ev(() => { S.storm = 3; });
  await go(() => cast('Empty the Warrens', 'hand')); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Eight 1/1 Goblins', await state(() => S.bf.filter(p => p.name === 'Goblin Token' && isCreatureP(p) && power(p) === 1).length === 8));

  // Aetherflux Reservoir: 1 + 2 + 3 life for three spells, then 50 life for 50 damage
  await setup(['Rite of Flame', 'Rite of Flame', 'Lightning Bolt'], ['Aetherflux Reservoir', 'Mountain', 'Mountain', 'Mountain']);
  for (const n of ['Rite of Flame', 'Rite of Flame']) { await go(n => cast(n, 'hand'), n); await T.resolveAll(); }
  await go(() => cast('Lightning Bolt', 'hand')); await press('Target it'); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Three spells: 1 + 2 + 3 = 6 life', await state(() => S.life === 46), await state(() => String(S.life)));
  await ev(() => { S.life = 100; });
  await go(() => bfMenu(S.bf.find(p => p.name === 'Aetherflux Reservoir').uid)); await press('Pay 50 life'); await press('Target it');
  await T.p.waitForTimeout(150);
  check('Paid 50 life and dealt 50 to the targeted opponent', await state(() => S.life === 50 && S.opp[0].life <= 0));
  check('The win check names Aetherflux Reservoir', (await T.title()).startsWith('Every opponent is out') === false && await state(() => deadOppsMethod() === 'Aetherflux Reservoir'));

  // Ruby Medallion takes {1} off red spells; Cloud Key off the type you choose
  await setup(['Seething Song', 'Cloud Key', 'Sol Ring'], ['Ruby Medallion', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain']);
  await go(() => cast('Seething Song', 'hand')); await resolve();
  check('Seething Song cost {1}{R} with Ruby Medallion and made five', await state(() => S.bf.filter(p => p.tapped).length === 2 && S.pool.R === 5));
  await ev(() => { S.pool.R = 0; });
  await go(() => cast('Cloud Key', 'hand')); await T.p.waitForTimeout(150);
  check('Cloud Key asks for a type as it enters', (await T.title()).startsWith('Cloud Key: spells of which type'));
  await press('Artifact');
  await go(() => cast('Sol Ring', 'hand')); await T.p.waitForTimeout(150);
  check('Sol Ring cost nothing with Cloud Key on artifacts', await state(() => S.bf.some(p => p.name === 'Sol Ring') && S.bf.filter(p => p.tapped).length === 5));

  // Runaway Steam-Kin: a counter per red spell, three of them for RRR
  await setup(['Rite of Flame', 'Lightning Bolt', 'Pyretic Ritual', 'Sol Ring'], ['Runaway Steam-Kin', 'Mountain', 'Mountain', 'Mountain']);
  await go(() => cast('Rite of Flame', 'hand')); await T.resolveAll();
  await go(() => cast('Pyretic Ritual', 'hand')); await T.resolveAll();
  await go(() => cast('Lightning Bolt', 'hand')); await press('Target it'); await T.resolveAll();
  await go(() => cast('Sol Ring', 'hand')); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Three red spells, three counters (Sol Ring is colourless)', await state(() => S.bf.find(p => p.name === 'Runaway Steam-Kin').counters === 3));
  const r0 = await state(() => S.pool.R);
  await go(() => bfMenu(S.bf.find(p => p.name === 'Runaway Steam-Kin').uid)); await press('Remove three');
  check('Removing them adds RRR', await state(r => S.pool.R === r + 3 && !S.bf.find(p => p.name === 'Runaway Steam-Kin').counters, r0));

  // Inner Fire counts your hand as it resolves; Mana Geyser asks about the opponents' lands
  await setup(['Inner Fire', 'Mountain', 'Mountain', 'Fireblast', 'Abrade'], Array(4).fill('Mountain'));
  await go(() => cast('Inner Fire', 'hand')); await resolve();
  check('Inner Fire: four cards in hand, RRRR', await state(() => S.pool.R === 4));
  await ev(() => { S.hand.push('Mana Geyser'); S.pool.R = 5; S.turn = 3; });
  await go(() => cast('Mana Geyser', 'hand')); await resolve();
  check('Mana Geyser suggests three tapped lands for each of three opponents', (await T.title()).startsWith('Mana Geyser') && await state(() => document.getElementById('geyN').value === '9'));
  await ev(() => { document.getElementById('geyN').value = 7; }); await press('Add the mana');
  check('Mana Geyser added seven', await state(() => S.pool.R === 7));

  // Past in Flames: flashback for the instants and sorceries in the graveyard, at their mana cost
  await setup(['Past in Flames'], Array(4).fill('Mountain'));
  await ev(() => { S.gy = ['Rite of Flame', 'Faithless Looting', 'Sol Ring']; });
  await go(() => cast('Past in Flames', 'hand')); await resolve();
  check('Rite of Flame and Faithless Looting have flashback, Sol Ring doesn\'t', await state(() => hasFlashback('Rite of Flame') && hasFlashback('Faithless Looting') && !hasFlashback('Sol Ring') && fbCost('Faithless Looting') === 'R'));
  await ev(() => { S.pool.R = 1; });
  await go(() => zoneMenu('gy', 'Rite of Flame')); await press('Flashback {R}'); await T.resolveAll();
  check('Rite of Flame flashed back for R, made RR, and was exiled', await state(() => S.pool.R === 2 && S.ex.some(e => e.n === 'Rite of Flame') && !S.gy.includes('Rite of Flame')));
  check('Past in Flames keeps its own flashback {4}{R}', await state(() => S.gy.includes('Past in Flames') && fbCost('Past in Flames') === '4R'));

  // Reckless Impulse: the top two are playable until the end of your next turn
  await setup(['Reckless Impulse'], ['Mountain', 'Mountain']);
  const top2 = await state(() => S.lib.slice(0, 2));
  await go(() => cast('Reckless Impulse', 'hand')); await resolve();
  check('Two cards exiled to play, until next turn', await state(t => t.every(n => S.ex.some(e => e.n === n && e.play && e.until === S.turn + 1)), top2));
  await T.done();
})();
