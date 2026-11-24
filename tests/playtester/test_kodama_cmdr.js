// Kodama of the East Tree + Sakashima: the deck and its partners, Kodama's trigger for lands, creatures and Treasures
// (always on the stack, so you can respond), the "not put there by this Kodama" check, and two Kodamas
// (Sakashima copying it) chaining into each other.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'kodama');
  const resolve = async () => { await go(() => { resolveTop(); }); };
  const play = async n => { await go(n => handMenu(n), n); await press('Play land'); await T.p.waitForTimeout(120); };
  const kodamas = () => state(() => S.stack.filter(x => x.eff === 'kodama').length);

  await setup([], []);
  check('The Kodama deck has 98 cards and both partners in the command zone', await state(() => DECK.id === 'kodama' && DECK.cards.length === 98 && COMMANDERS.length === 2 && S.cmdZone.includes('Kodama of the East Tree') && S.cmdZone.includes('Sakashima of a Thousand Faces') && IDENT === 'UG'), await state(() => IDENT));

  // a land drop with Kodama out: the trigger waits on the stack even without holding priority
  await setup(['Forest', 'Island', 'Lotus Cobra'], ['Kodama of the East Tree']);
  await play('Forest');
  check('Kodama triggered for the Forest and waits on the stack', await state(() => S.stack.length === 1 && S.stack[0].eff === 'kodama' && S.stack[0].mv === 0) && !(await T.sheet()).open);
  check('A toast says you can respond', await state(() => /Kodama trigger is on the stack/.test(document.getElementById('banner').textContent)));
  await resolve();
  check('Resolving it offers only cards with mana value 0 (the Island, not Lotus Cobra)', (await T.title()).startsWith('Kodama: Forest entered') && await state(() => [...document.querySelectorAll('#sheetBody .pick')].some(b => b.textContent.includes('Island')) && ![...document.querySelectorAll('#sheetBody .pick')].some(b => b.textContent.includes('Lotus Cobra'))));
  await press('Put it in'); await T.p.waitForTimeout(150);
  check('The Island is on the battlefield and this Kodama didn\'t trigger for it', await state(() => S.bf.some(p => p.name === 'Island' && p.byKodama) && !S.stack.length && S.hand.join() === 'Lotus Cobra'), await state(() => JSON.stringify(S.stack)));
  check('One land drop used', await state(() => S.landsPlayed === 1));

  // it triggers with nothing to put in, so you can respond: Quirion Ranger returns the Forest, Kodama puts it back
  await setup(['Forest'], ['Kodama of the East Tree', 'Quirion Ranger', 'Llanowar Elves']);
  await ev(() => { S.bf[2].tapped = true; });
  await play('Forest');
  check('An empty hand still gets the trigger', await state(() => !S.hand.length && S.stack.length === 1 && S.stack[0].eff === 'kodama'));
  await go(() => bfMenu(S.bf.find(p => p.name === 'Quirion Ranger').uid)); await press('Return a Forest');
  await pick('Llanowar Elves'); await press('Untap it'); await T.p.waitForTimeout(100);
  check('In response, Quirion Ranger returned the Forest; its ability sits above the Kodama trigger', await state(() => S.hand.join() === 'Forest' && S.stack.map(x => x.eff).join() === 'kodama,abKdUntap'));
  await resolve();
  check('The untap resolved first', await state(() => S.hand.join() === 'Forest' && !S.bf.find(p => p.name === 'Llanowar Elves').tapped && S.stack.length === 1 && S.stack[0].eff === 'kodama'));
  await resolve(); await press('Put it in'); await T.p.waitForTimeout(120);
  check('Kodama put the Forest back: landfall again without a land drop', await state(() => S.bf.some(p => p.name === 'Forest') && !S.hand.length && S.landsPlayed === 1 && !S.stack.length));

  // a creature spell: mana value 2, so Lotus Cobra's entering lets a 2-drop or a land in
  await setup(['Lotus Cobra', 'Simic Signet', 'Coveted Jewel'], ['Kodama of the East Tree', 'Forest', 'Forest']);
  await go(() => cast('Lotus Cobra', 'hand')); await T.p.waitForTimeout(150);
  check('Lotus Cobra resolved and Kodama triggered with mana value 2', await state(() => S.bf.some(p => p.name === 'Lotus Cobra') && S.stack.length === 1 && S.stack[0].mv === 2));
  await resolve(); await pick('Simic Signet'); await press('Put it in'); await T.p.waitForTimeout(150);
  check('Simic Signet went in for free; Coveted Jewel (6) stayed in hand', await state(() => S.bf.some(p => p.name === 'Simic Signet') && S.hand.join() === 'Coveted Jewel'));

  // a Treasure entering is a permanent entering
  await setup(['Forest'], ['Kodama of the East Tree']);
  await ev(() => { addTreasure(1); render(); }); await go(() => settle());
  check('A Treasure triggers Kodama', await state(() => S.stack.some(x => x.eff === 'kodama' && x.name.startsWith('Treasure'))));
  await resolve(); await press('Put it in'); await T.p.waitForTimeout(150);
  check('The Forest went in off the Treasure', await state(() => S.bf.some(p => p.name === 'Forest') && !S.hand.length));

  // declining is a real answer
  await setup(['Forest', 'Island'], ['Kodama of the East Tree']);
  await play('Forest'); await resolve();
  await press('Cancel');
  check('Declining leaves the Island in hand', await state(() => S.hand.join() === 'Island' && !S.stack.length));

  // two Kodamas: a land you play triggers both
  await setup(['Forest', 'Island', 'Hedge Maze'], ['Kodama of the East Tree', 'Sakashima of a Thousand Faces']);
  await ev(() => { S.bf[1].copyOf = 'Kodama of the East Tree'; S.cmdZone = []; });
  await play('Forest');
  check('Both Kodamas triggered for the land drop', (await kodamas()) === 2);
  await resolve(); await pick('Island'); await press('Put it in'); await T.p.waitForTimeout(120);
  check('The Island came from the first Kodama: only Sakashima triggers for it, beside its own trigger for the Forest', await state(() => S.stack.length === 2 && S.stack.every(x => x.eff === 'kodama' && x.src === S.bf[1].uid)));
  await ev(() => { S.stack = []; render(); });

  // Sakashima cast as a copy of Kodama: each Kodama answers what the other put in
  await setup(['Sakashima of a Thousand Faces', 'Forest', 'Island', 'Breeding Pool'], ['Kodama of the East Tree', 'Island', ...Array(5).fill('Forest')]);
  await ev(() => { S.cmdZone = []; });
  await go(() => cast('Sakashima of a Thousand Faces', 'hand')); await T.p.waitForTimeout(150);
  check('Sakashima asks what to copy', (await T.title()).includes('enter as a copy of'));
  const kod = await state(() => S.bf.find(p => p.name === 'Kodama of the East Tree').uid);
  await press('Copy it'); await T.p.waitForTimeout(150);
  check('Sakashima is a Kodama and the first Kodama triggered (mana value 6)', await state(k => S.bf.some(p => p.name === 'Sakashima of a Thousand Faces' && p.copyOf === 'Kodama of the East Tree') && S.stack.length === 1 && S.stack[0].src === k && S.stack[0].mv === 6, kod));
  await resolve(); await pick('Island'); await press('Put it in'); await T.p.waitForTimeout(150);
  check('The Island came from the first Kodama, so only Sakashima triggers', await state(k => S.stack.length === 1 && S.stack[0].src !== k && S.bf.find(p => p.name === 'Island' && p.byKodama).byKodama === k, kod));
  await resolve(); await pick('Breeding Pool'); await press('Put it in');
  check('Breeding Pool asks about 2 life', (await T.title()).startsWith('Breeding Pool: pay 2 life'));
  await press('Pay 2 life'); await T.p.waitForTimeout(150);
  check('Breeding Pool came from Sakashima, so the first Kodama triggers again', await state(k => S.life === 38 && S.stack.length === 1 && S.stack[0].src === k, kod));
  await resolve(); await press('Put it in'); await T.p.waitForTimeout(150);
  check('The last Forest went in; Sakashima\'s trigger for it waits with nothing left to put in', await state(() => !S.hand.length && S.stack.length === 1 && S.bf.filter(p => p.name === 'Forest').length === 6));
  await resolve();
  check('It resolves to nothing', await state(() => !S.stack.length && S.turnLog.filter(e => e.a === 'Kodama').length === 4));
  check('The legend rule stays off with Sakashima', await state(() => S.bf.filter(p => ident(p) === 'Kodama of the East Tree').length === 2));
  await T.done();
})();
