// Choices with only one legal answer make themselves; "may" and "up to one" choices still ask; the log drawer turns it off.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;

  // Lion's Eye Diamond in a mono-red deck: red is the only colour to pick
  await T.setup(['Abrade'], ["Lion's Eye Diamond"], 'q');
  await go(() => bfMenu(S.bf[0].uid)); await press('Discard your hand');
  check('No colour sheet: RRR straight away, and a note says why', await state(() => S.pool.R === 3 && !S.bf.length && /Red was the only choice/.test(document.getElementById('banner').textContent)) && !(await T.sheet()).open);

  // Fireblast with exactly two Mountains sacrifices both without a picker
  await T.setup(['Fireblast'], ['Mountain', 'Mountain'], 'q');
  await go(() => handMenu('Fireblast')); await press('Sacrifice two Mountains');
  check('Straight to the target', (await T.title()).startsWith('Fireblast: 4 damage to what?'), await T.title());
  await press('Target it');
  check('Both Mountains sacrificed', await state(() => S.gy.filter(n => n === 'Mountain').length === 2 && !S.bf.length));

  // Faithless Looting from an empty hand: the two cards drawn are the two discarded
  await T.setup(['Faithless Looting'], ['Mountain'], 'q');
  await go(() => cast('Faithless Looting', 'hand')); await go(() => { resolveTop(); });
  check('Drew two, discarded both, no sheet', await state(() => !S.hand.length && S.gy.length === 3) && !(await T.sheet()).open);

  // a tutor with one possible card takes it
  await T.setup(['Gamble'], ['Mountain'], 'q');
  await ev(() => { S.lib = ['Lightning Bolt', 'Mountain']; S.lib = S.lib.filter(n => n !== 'Mountain'); S.hand.push('Abrade'); });
  await go(() => cast('Gamble', 'hand')); await go(() => { resolveTop(); });
  check('Gamble found Lightning Bolt, the only card left, and discarded one at random', await state(() => S.turnLog.some(e => e.a === 'tutor' && e.found === 'Lightning Bolt' && e.discarded)) && !(await T.sheet()).open);

  // Displacer Kitten's "up to one" still asks, even with one permanent to pick
  await T.setup(['Sol Ring'], ['Displacer Kitten', 'Underground Sea']);
  await go(() => cast('Sol Ring', 'hand')); await go(() => { resolveTop(); });
  check('Kitten asks: flickering nothing is a legal answer', (await T.title()).startsWith('Displacer Kitten: exile and return'), await T.title());
  await press('Nothing');

  // turned off in the log drawer, a single answer asks again
  await T.setup(['Fireblast'], ['Mountain', 'Mountain'], 'q');
  await ev(() => { const b = document.getElementById('optOne'); b.checked = false; b.dispatchEvent(new Event('change')); });
  check('The setting is off and remembered', await state(() => !autoOne && localStorage.getItem('cge-auto-one') === 'off'));
  await go(() => handMenu('Fireblast')); await press('Sacrifice two Mountains');
  check('Now the Mountains are picked by hand', (await T.title()).startsWith('Fireblast: sacrifice two Mountains'), await T.title());
  await press('Cancel');
  await ev(() => { const b = document.getElementById('optOne'); b.checked = true; b.dispatchEvent(new Event('change')); });
  await T.done();
})();
