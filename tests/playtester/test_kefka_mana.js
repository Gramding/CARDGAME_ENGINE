// Kefka deck mana: black mana, land types for fetches, shocks, pain on coloured mana, Cavern of Souls,
// Mox Opal, Spire of Industry, Lion's Eye Diamond, Grim Monolith and the B pip in the pool.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, setup, state } = T;

  // Dark Ritual paid by Underground Sea's black, then BBB in the pool
  await setup(['Dark Ritual'], ['Underground Sea']);
  await go(() => cast('Dark Ritual', 'hand')); await T.resolveAll();
  check('Dark Ritual makes BBB from Underground Sea', await state(() => S.pool.B === 3 && S.bf[0].tapped));
  check('B pip shows in the pool', await state(() => document.getElementById('pB').textContent === '3'));

  // Cabal Ritual with threshold
  await setup(['Cabal Ritual'], ['Badlands', 'Sol Ring']);
  await ev(() => { S.gy = ['Island', 'Mountain', 'Swamp', 'Gamble', 'Rite of Flame', 'Dispel', 'Reanimate']; });
  await go(() => cast('Cabal Ritual', 'hand')); await T.resolveAll();
  check('Cabal Ritual with threshold makes five black', await state(() => S.pool.B === 5), await state(() => JSON.stringify(S.pool)));

  // fetch lands find Swamp-typed duals; autopay cracks Polluted Delta for black
  await setup(['Demonic Tutor'], ['Polluted Delta', 'Sol Ring']);
  await ev(() => { S.lib = ['Underground Sea', 'Volcanic Island', 'Badlands', ...S.lib.filter(n => !['Underground Sea', 'Volcanic Island', 'Badlands'].includes(n))]; });
  check('Bloodstained Mire finds Badlands, Blood Crypt and Underground Sea', await state(() => ['Badlands', 'Blood Crypt', 'Underground Sea'].every(n => fetchTargets('Bloodstained Mire').includes(n)) && fetchTargets('Bloodstained Mire').includes('Volcanic Island')));
  check('Marsh Flats and Verdant Catacombs find Swamps', await state(() => fetchTargets('Marsh Flats').includes('Underground Sea') && fetchTargets('Verdant Catacombs').includes('Badlands') && !fetchTargets('Marsh Flats').includes('Volcanic Island')));
  await go(() => cast('Demonic Tutor', 'hand'));
  check('Demonic Tutor paid by cracking Polluted Delta into a black land', await state(() => S.bf.some(p => p.name === 'Underground Sea' || p.name === 'Badlands' || p.name === 'Watery Grave') && S.life === 39), await state(() => S.bf.map(p => p.name).join(',')));
  await T.resolveAll(); await pick("Thassa's Oracle"); await press('Take it');
  check('Demonic Tutor puts the card into your hand', await state(() => S.hand.includes("Thassa's Oracle")));

  // Command Tower and Arcane Signet make the commander's colours
  await setup([], ['Command Tower', 'Arcane Signet', 'City of Brass']);
  check('Command Tower makes U, B and R', await state(() => sourceColors(S.bf[0]) === 'UBR' && sourceColors(S.bf[1]) === 'UBR' && sourceColors(S.bf[2]) === 'WUBRG'));

  // Talisman hurts for coloured mana only
  await setup(['Imperial Seal'], ['Talisman of Dominance']);
  await go(() => cast('Imperial Seal', 'hand'));
  check('Talisman of Dominance: black costs 1 life', await state(() => S.bf[0].tapped && S.life === 39));
  await T.resolveAll(); await pick('Dark Ritual'); await press('Take it');
  check('Imperial Seal puts the card on top and costs 2 life', await state(() => S.lib[0] === 'Dark Ritual' && S.life === 37));

  // Spire of Industry needs an artifact, and black costs 1 life
  await setup(['Dark Ritual'], ['Spire of Industry']);
  check('Spire of Industry without an artifact makes only colourless', await state(() => sourceColors(S.bf[0]) === 'C'));
  await setup(['Dark Ritual'], ['Spire of Industry', 'Mox Amber']);
  await go(() => cast('Dark Ritual', 'hand'));
  check('Spire of Industry with an artifact pays B for 1 life', await state(() => S.bf.find(p => p.name === 'Spire of Industry').tapped && S.life === 39));

  // Cavern of Souls: any colour only for creature spells of the chosen type
  await setup(['Island'], []);
  await go(() => { S.hand = ['Cavern of Souls']; playLand('Cavern of Souls', 'hand'); });
  check('Cavern of Souls asks for a creature type', (await T.title()).startsWith('Cavern of Souls'));
  await press('Choose it');
  check('Cavern of Souls remembers Wizard', await state(() => S.bf[0].ctype === 'Wizard'));
  await ev(() => { S.bf.push({ uid: S.nextId++, name: 'Volcanic Island', tapped: false }); S.hand = ["Thassa's Oracle", 'Dark Ritual']; });
  check('Cavern can pay U for a Wizard but not for Dark Ritual', await state(() => autoPay(parseCost('UU'), true, { name: "Thassa's Oracle" }).ok && !autoPay(parseCost('BB'), true, { name: 'Dark Ritual' }).ok));

  // Mox Opal turns on with three artifacts
  await setup([], ['Mox Opal', 'Sol Ring']);
  check('Mox Opal is off with two artifacts', await state(() => sourceColors(S.bf[0]) === ''));
  await ev(() => { S.bf.push({ uid: S.nextId++, name: 'Lotus Petal', tapped: false }); });
  check('Mox Opal makes any colour with three', await state(() => sourceColors(S.bf[0]) === 'WUBRG'));

  // Lion's Eye Diamond
  await setup(['Island', 'Gamble'], ["Lion's Eye Diamond"]);
  await go(() => bfMenu(S.bf[0].uid)); await press('Discard your hand'); await press('Black');
  check("Lion's Eye Diamond: hand discarded, three black", await state(() => S.pool.B === 3 && !S.hand.length && S.gy.length === 3 && !S.bf.length));

  // Grim Monolith: CCC, doesn't untap, {4} untaps it
  await setup([], ['Grim Monolith', 'Sol Ring', 'Ancient Tomb']);
  await go(() => bfMenu(S.bf[0].uid)); await press('Tap for mana');
  check('Grim Monolith makes CCC', await state(() => S.pool.C === 3));
  await ev(() => { S.pool.C = 0; nextTurn(); }); await T.p.waitForTimeout(150);
  check("Grim Monolith stays tapped in the untap step", await state(() => S.bf[0].tapped && !S.bf[1].tapped));
  await go(() => bfMenu(S.bf[0].uid)); await press('Pay {4}: untap');
  check('Grim Monolith untaps for {4}', await state(() => !S.bf[0].tapped && S.bf[1].tapped && S.bf[2].tapped));

  // shock lands ask for 2 life
  await setup(['Blood Crypt'], []);
  await go(() => playLand('Blood Crypt', 'hand'));
  check('Blood Crypt asks to pay 2 life', (await T.title()).startsWith('Blood Crypt: pay 2 life'));
  await press('Enter tapped');
  check('Blood Crypt entered tapped', await state(() => S.bf[0].tapped && S.life === 40));

  // the manual mana sheet offers the deck's colours for an any-colour source
  await setup([], ['Mana Confluence']);
  await go(() => bfMenu(S.bf[0].uid)); await press('Tap for mana');
  check('Mana Confluence asks blue, black or red', JSON.stringify((await T.sheet()).btns) === JSON.stringify(['Blue', 'Black', 'Red']), JSON.stringify((await T.sheet()).btns));
  await press('Black');
  check('Mana Confluence made B for 1 life', await state(() => S.pool.B === 1 && S.life === 39));
  await T.done();
})();
