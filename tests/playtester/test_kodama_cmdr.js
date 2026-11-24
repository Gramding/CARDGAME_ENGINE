// Kodama of the East Tree + Sakashima: the deck and its partners, Kodama's trigger for lands, creatures and Treasures,
// the "not put there by this Kodama" check, and two Kodamas (Sakashima copying it) chaining into each other.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'kodama');
  const resolve = async () => { await go(() => { resolveTop(); }); };

  await setup([], []);
  check('The Kodama deck has 98 cards and both partners in the command zone', await state(() => DECK.id === 'kodama' && DECK.cards.length === 98 && COMMANDERS.length === 2 && S.cmdZone.includes('Kodama of the East Tree') && S.cmdZone.includes('Sakashima of a Thousand Faces') && IDENT === 'UG'), await state(() => IDENT));

  // a land drop with Kodama out: put a second land in for free; that one doesn't trigger this Kodama again
  await setup(['Forest', 'Island', 'Lotus Cobra'], ['Kodama of the East Tree']);
  await go(() => handMenu('Forest')); await press('Play land');
  check('Kodama triggered for the Forest and resolves by itself', (await T.title()).startsWith('Kodama: Forest entered. Put a permanent card with mana value 0'));
  check('It offers only cards with mana value 0 (the Island, not Lotus Cobra)', (await T.title()).startsWith('Kodama: Forest entered') && await state(() => [...document.querySelectorAll('#sheetBody .pick')].map(b => b.textContent).join() .includes('Island') && ![...document.querySelectorAll('#sheetBody .pick')].some(b => b.textContent.includes('Lotus Cobra'))));
  await press('Put it in'); await T.p.waitForTimeout(150);
  check('The Island is on the battlefield and nothing triggered again', await state(() => S.bf.some(p => p.name === 'Island' && p.byKodama) && !S.stack.length && S.hand.join() === 'Lotus Cobra'), await state(() => JSON.stringify(S.stack)));
  check('One land drop used', await state(() => S.landsPlayed === 1));

  // a creature spell: mana value 2, so Lotus Cobra's entering lets a 2-drop or a land in
  await setup(['Lotus Cobra', 'Simic Signet', 'Coveted Jewel'], ['Kodama of the East Tree', 'Forest', 'Forest']);
  await go(() => cast('Lotus Cobra', 'hand')); await T.p.waitForTimeout(150);
  check('Lotus Cobra resolved and Kodama triggered with mana value 2', await state(() => S.bf.some(p => p.name === 'Lotus Cobra')) && (await T.title()).includes('mana value 2 or less'));
  await pick('Simic Signet'); await press('Put it in'); await T.p.waitForTimeout(150);
  check('Simic Signet went in for free; Coveted Jewel (6) stayed in hand', await state(() => S.bf.some(p => p.name === 'Simic Signet') && S.hand.join() === 'Coveted Jewel'));

  // a Treasure entering is a permanent entering
  await setup(['Forest'], ['Kodama of the East Tree']);
  await ev(() => { holdPriority = true; addTreasure(1); render(); }); await go(() => settle());
  check('A Treasure triggers Kodama', await state(() => S.stack.some(x => x.eff === 'kodama' && x.name.startsWith('Treasure'))));
  await ev(() => { holdPriority = false; }); await resolve(); await press('Put it in'); await T.p.waitForTimeout(150);
  check('The Forest went in off the Treasure', await state(() => S.bf.some(p => p.name === 'Forest') && !S.hand.length));

  // declining is a real answer
  await setup(['Forest', 'Island'], ['Kodama of the East Tree']);
  await go(() => handMenu('Forest')); await press('Play land');
  await press('Cancel');
  check('Declining leaves the Island in hand', await state(() => S.hand.join() === 'Island' && !S.stack.length));

  // Sakashima as a copy of Kodama: each Kodama answers what the other put in
  await setup(['Sakashima of a Thousand Faces', 'Forest', 'Island', 'Breeding Pool'], ['Kodama of the East Tree', 'Island', ...Array(5).fill('Forest')]);
  await ev(() => { S.cmdZone = []; });
  await go(() => cast('Sakashima of a Thousand Faces', 'hand')); await T.p.waitForTimeout(150);
  check('Sakashima asks what to copy', (await T.title()).includes('enter as a copy of'));
  const kod = await state(() => S.bf.find(p => p.name === 'Kodama of the East Tree').uid);
  await press('Copy it'); await T.p.waitForTimeout(150);
  check('Sakashima is a Kodama and the first Kodama triggered (mana value 6)', await state(() => S.bf.some(p => p.name === 'Sakashima of a Thousand Faces' && p.copyOf === 'Kodama of the East Tree')) && (await T.title()).includes('mana value 6 or less'));
  await pick('Island'); await press('Put it in'); await T.p.waitForTimeout(150);
  check('The Island came from the first Kodama, so only Sakashima triggers', await state(k => S.turnLog.filter(e => e.a === 'Kodama').length === 1 && S.bf.find(p => p.name === 'Island' && p.byKodama).byKodama === k, kod) && (await T.title()).startsWith('Kodama: Island entered'));
  await pick('Breeding Pool'); await press('Put it in');
  check('Breeding Pool asks about 2 life', (await T.title()).startsWith('Breeding Pool: pay 2 life'));
  await press('Pay 2 life'); await T.p.waitForTimeout(150);
  check('Breeding Pool came from Sakashima, so the first Kodama triggers again', await state(() => S.life === 38) && (await T.title()).startsWith('Kodama: Breeding Pool entered'));
  await press('Put it in'); await T.p.waitForTimeout(150);
  check('The last Forest went in, and the chain stops with an empty hand', await state(() => !S.hand.length && !S.stack.length && S.bf.filter(p => p.name === 'Forest').length === 6 && S.turnLog.filter(e => e.a === 'Kodama').length === 3));
  check('The legend rule stays off with Sakashima', await state(() => S.bf.filter(p => ident(p) === 'Kodama of the East Tree').length === 2));
  await T.done();
})();
