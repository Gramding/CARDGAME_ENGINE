// The rest of the Kefka list: Final Fortune, Yawgmoth's Will, Toxic Deluge, Fire Covenant, Wishclaw
// Talisman, Rhystic Study, Mystic Remora, Swan Song, Force of Negation, Commandeer, Gilded Drake,
// Amphibian Downpour, Redirect Lightning, Snuff Out and switching decks.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, setup, state } = T;
  const resolve = async () => { await go(() => { resolveTop(); }); };

  // Final Fortune: an extra turn (opponents don't draw), then you lose at its end step
  await setup(['Final Fortune'], ['Volcanic Island', 'Badlands']);
  await go(() => cast('Final Fortune', 'hand')); await resolve();
  await ev(() => nextTurn()); await T.p.waitForTimeout(150);
  check('Extra turn: turn 2, opponents\' libraries unchanged', await state(() => S.turn === 2 && S.opp.every(o => o.lib === 92) && S.loseAt === 2));
  await go(() => { nextTurn(); });
  check("Passing the extra turn asks you to lose", (await T.title()).startsWith('Final Fortune: you lose'));
  await press('Lose the game'); await press('Save result');
  check('Game saved as a loss', await state(() => S.phase === 'over' && S.result.result === 'loss'));

  // Yawgmoth's Will: cast Dark Ritual from the graveyard; it's exiled when it resolves
  await setup(["Yawgmoth's Will"], ['Underground Sea', 'Watery Grave', 'Sol Ring']);
  await ev(() => { S.gy = ['Dark Ritual', 'Underground Sea']; S.landDrop = false; });
  await go(() => cast("Yawgmoth's Will", 'hand')); await resolve();
  check("Yawgmoth's Will itself is exiled", await state(() => S.ex.some(e => e.n === "Yawgmoth's Will") && !S.gy.includes("Yawgmoth's Will")));
  await ev(() => { S.pool.B = 1; });
  await go(() => zoneMenu('gy', 'Dark Ritual')); await press('Cast (Yawgmoth');
  await T.resolveAll();
  check('Dark Ritual from the graveyard made BBB and was exiled', await state(() => S.pool.B === 3 && S.ex.some(e => e.n === 'Dark Ritual') && !S.gy.includes('Dark Ritual')));
  await go(() => zoneMenu('gy', 'Underground Sea')); await press('Play land (Yawgmoth');
  check('A land played from the graveyard', await state(() => S.bf.filter(p => p.name === 'Underground Sea').length === 2));

  // Toxic Deluge for 3 kills the small creatures, Kefka survives
  await setup(['Toxic Deluge'], ['Kefka, Court Mage // Kefka, Ruler of Ruin', 'Displacer Kitten', "Thassa's Oracle", 'Underground Sea', 'Watery Grave', 'Sol Ring']);
  await go(() => cast('Toxic Deluge', 'hand')); await ev(() => { document.getElementById('xLife').value = 3; }); await press('Pay it');
  check('Deluge paid 3 life', await state(() => S.life === 37));
  await resolve(); await press('Nothing');   // the Kitten trigger above it
  await resolve();
  check('Kitten and Oracle died, Kefka is a 1/2', await state(() => S.bf.filter(isCreatureP).map(p => p.name).join() === 'Kefka, Court Mage // Kefka, Ruler of Ruin' && power(S.bf[0]) === 1 && toughness(S.bf[0]) === 2));

  // Fire Covenant: 4 life, 2 to your Kitten, the rest at opponents' creatures
  await setup(['Fire Covenant'], ['Displacer Kitten', 'Badlands', 'Volcanic Island', 'Underground Sea']);
  await go(() => cast('Fire Covenant', 'hand')); await press('Pay it'); await resolve(); await press('Nothing'); await resolve();
  await ev(() => { document.querySelector('#sheetBody input[type=number]').value = 2; }); await press('Deal it');
  check('Fire Covenant killed the Kitten and logged 2 to opponents', await state(() => !S.bf.some(p => p.name === 'Displacer Kitten') && S.life === 36 && S.turnLog.some(e => e.c === 'Fire Covenant' && e.toOpponents === 2)));

  // Wishclaw Talisman: tutor, then an opponent has it until you take it back
  await setup(['Wishclaw Talisman'], ['Underground Sea', 'Sol Ring']);
  await go(() => cast('Wishclaw Talisman', 'hand'));
  check('Wishclaw enters with three wish counters', await state(() => S.bf.find(p => p.name === 'Wishclaw Talisman').wish === 3));
  await ev(() => { S.bf.forEach(p => { p.tapped = false; }); });
  await go(() => bfMenu(S.bf.find(p => p.name === 'Wishclaw Talisman').uid)); await press('{1}, tap'); await pick('Demonic Consultation'); await press('Take it');
  check('Wishclaw found a card and went to an opponent', await state(() => S.hand.includes('Demonic Consultation') && S.ex.some(e => e.n === 'Wishclaw Talisman' && e.given && e.wish === 2)));
  await go(() => zoneMenu('ex', 'Wishclaw Talisman')); await press('Take control');
  check('Taken back with two counters', await state(() => S.bf.find(p => p.name === 'Wishclaw Talisman').wish === 2));

  // Rhystic Study and Mystic Remora draw when you say an opponent didn't pay; Remora asks for its upkeep
  await setup([], ['Rhystic Study', 'Mystic Remora', 'Sol Ring']);
  await go(() => bfMenu(S.bf[0].uid)); await press('An opponent cast a spell');
  check('Rhystic Study drew a card', await state(() => S.hand.length === 1));
  await ev(() => nextTurn()); await T.p.waitForTimeout(150);
  check('Remora upkeep is on the stack', await state(() => S.stack.some(x => x.eff === 'remora')));
  await resolve(); await press('Pay {1}');
  check('Paid {1} with Sol Ring, Remora stays', await state(() => S.bf.some(p => p.name === 'Mystic Remora') && S.pool.C === 1));

  // Swan Song on your own spell gives you the Bird
  await setup(['Dark Ritual', 'Swan Song'], ['Underground Sea', 'Volcanic Island']);
  await go(() => cast('Dark Ritual', 'hand')); await go(() => cast('Swan Song', 'hand')); await resolve(); await press('Counter it');
  check('Swan Song countered Dark Ritual and you got a 2/2 Bird', await state(() => S.bf.some(p => p.name === 'Bird Token' && power(p) === 2) && S.gy.includes('Dark Ritual')));

  // Force of Negation pitching a blue card exiles what it counters
  await setup(['Demonic Tutor', 'Force of Negation', 'Dispel'], ['Underground Sea', 'Sol Ring']);
  await go(() => cast('Demonic Tutor', 'hand')); await go(() => handMenu('Force of Negation')); await press('Exile a blue card'); await press('Exile and cast');
  await resolve(); await press('Counter it');
  check('Force of Negation exiled the countered spell', await state(() => S.ex.some(e => e.n === 'Demonic Tutor') && S.ex.some(e => e.n === 'Dispel')));

  // Commandeer for two blue cards
  await setup(['Commandeer', 'Dispel', 'Spell Pierce'], []);
  await go(() => handMenu('Commandeer')); await press('Exile two blue cards'); await press('Exile and cast');
  check('Commandeer cast for two blue cards', await state(() => S.ex.length === 2 && S.stack.some(x => x.name === 'Commandeer')));

  // Gilded Drake: no exchange means sacrifice; an exchange gives it away
  await setup(['Gilded Drake'], ['Underground Sea', 'Watery Grave']);
  await go(() => cast('Gilded Drake', 'hand')); await T.p.waitForTimeout(150); await press("Don't");
  check('Gilded Drake sacrificed without an exchange', await state(() => S.gy.includes('Gilded Drake') && !S.bf.some(p => p.name === 'Gilded Drake')));

  // Amphibian Downpour with storm 2: two token copies, enchanting opponents' creatures or turning yours into a Frog
  await setup(['Dark Ritual', 'Lotus Petal', 'Amphibian Downpour'], ['Underground Sea', 'Watery Grave', 'Volcanic Island', 'Displacer Kitten']);
  await ev(() => { S.storm = 2; });   // two spells cast before it this turn
  await go(() => cast('Amphibian Downpour', 'hand'));
  await T.p.waitForTimeout(150);
  check('Storm trigger for 2 copies (Kitten trigger too)', await state(() => S.stack.some(x => x.eff === 'storm' && x.count === 2)), await state(() => S.stack.map(stackLabel).join(' / ')));
  let enchanted = false;
  for (let i = 0; i < 12; i++) {
    const sh = await T.sheet();
    if (sh.open) { if (sh.title.startsWith('Amphibian')) { await press(enchanted ? "An opponent's" : 'Enchant mine'); enchanted = true; } else await press(sh.btns.includes('Nothing') ? 'Nothing' : sh.btns[0]); continue; }
    if (!(await state(() => S.stack.length))) break;
    await resolve();
  }
  check('Three Downpours on the battlefield, two of them tokens', await state(() => S.bf.filter(p => p.name === 'Amphibian Downpour').length === 3 && S.bf.filter(p => p.name === 'Amphibian Downpour' && p.token).length === 2));
  check('Displacer Kitten is a 1/1 Frog that no longer triggers', await state(() => { const k = S.bf.find(p => p.name === 'Displacer Kitten'); return k.frog && power(k) === 1 && castTriggerItems('Dark Ritual', { id: 0 }).every(t => t.eff !== 'kitten'); }));

  // Redirect Lightning paying 5 life
  await setup(['Redirect Lightning'], ['Volcanic Island']);
  await go(() => cast('Redirect Lightning', 'hand')); await press('Pay 5 life');
  check('Redirect Lightning cost R and 5 life', await state(() => S.life === 35 && S.stack.some(x => x.name === 'Redirect Lightning')));

  // Snuff Out for 4 life with a Swamp
  await setup(['Snuff Out'], ['Underground Sea']);
  await go(() => handMenu('Snuff Out'));
  check('Snuff Out offers the 4 life cost with a Swamp', (await T.sheet()).btns.some(b => b.startsWith('Pay 4 life')));
  await press('Pay 4 life');
  check('Snuff Out cast for 4 life, land untapped', await state(() => S.life === 36 && !S.bf[0].tapped && S.stack.some(x => x.name === 'Snuff Out')));

  // switching decks
  await setup([], []);
  await go(() => deckMenu()); await pick('Krark'); await press('Play this deck');
  check('Switched to the Krark deck', await state(() => DECK.id === 'krark' && S.cmdZone.length === 2 && !document.querySelector('.sgrp.krark').hidden));
  await T.done();
})();
