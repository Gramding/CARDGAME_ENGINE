// The Q deck's hand refills: Wheel of Fortune, Reforge the Soul's miracle, Magus of the Wheel, Wheel of Misfortune,
// Faithless Looting, the discard costs of Big Score and Thrill of Possibility, and Valakut Awakening (both faces).
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  // Reforge the Soul drawn in a turn pass would stop for its miracle; the wheels test puts it on top itself
  const setup = async (h, b) => { await T.setup(h, b, 'q'); await ev(() => { S.lib = S.lib.filter(n => n !== 'Reforge the Soul'); }); };
  const resolve = async () => { await go(() => { resolveTop(); }); };

  // Wheel of Fortune: your hand for seven new cards; each opponent discards and draws seven too
  await setup(['Wheel of Fortune', 'Abrade', 'Fireblast'], ['Mountain', 'Mountain', 'Mountain']);
  await ev(() => { S.opp[1].hand = 3; });
  await go(() => cast('Wheel of Fortune', 'hand')); await resolve();
  check('Your two cards went to the graveyard, seven new ones in hand', await state(() => S.hand.length === 7 && ['Abrade', 'Fireblast', 'Wheel of Fortune'].every(n => S.gy.includes(n))));
  check('Opponents have seven cards each and seven fewer in the library', await state(() => S.opp.every(o => o.hand === 7 && o.lib === 85)));

  // Reforge the Soul drawn first in a turn: cast it for its miracle cost
  await setup([], ['Mountain', 'Mountain', 'Mountain']);
  await ev(() => { S.lib.unshift('Reforge the Soul'); S.hand = ['Abrade']; });
  await go(() => { nextTurn(); }); await T.p.waitForTimeout(250);
  check('The draw step offers the miracle', (await T.title()).startsWith('Miracle: Reforge the Soul is the first card'), await T.title());
  await press('Cast it for {1R}'); await T.p.waitForTimeout(150);
  check('Reforge is on the stack for {1}{R}: two Mountains tapped', await state(() => S.stack.some(x => x.name === 'Reforge the Soul') && S.bf.filter(p => p.tapped).length === 2 && S.turnLog.some(e => e.a === 'cast' && /miracle/.test(e.cost))));
  await resolve();
  check('Reforge wheeled: seven cards', await state(() => S.hand.length === 7 && S.gy.includes('Abrade') && S.gy.includes('Reforge the Soul')));
  await ev(() => { S.lib.unshift('Reforge the Soul'); S.hand = []; S.gy = S.gy.filter(n => n !== 'Reforge the Soul'); });
  await go(() => { draw(1, 'test'); miracleCheck(); });
  check('A second draw that turn is no miracle', !(await T.sheet()).open && await state(() => S.hand.includes('Reforge the Soul')));

  // Magus of the Wheel: {1}{R}, tap, sacrifice, on the stack
  await setup(['Abrade'], ['Magus of the Wheel', 'Mountain', 'Mountain']);
  await go(() => bfMenu(S.bf[0].uid)); await press('{1}{R}, tap, sacrifice');
  check('Magus was sacrificed and you drew seven', await state(() => S.gy.includes('Magus of the Wheel') && S.hand.length === 7 && S.gy.includes('Abrade') && S.opp.every(o => o.hand === 7)));
  await setup([], ['Magus of the Wheel', 'Mountain', 'Mountain']);
  await ev(() => { S.bf[0].etbTurn = S.turn; render(); });
  await go(() => bfMenu(S.bf[0].uid));
  check('A Magus that just arrived can\'t tap for it', await state(() => ![...document.querySelectorAll('#sheetButtons button')].some(b => b.textContent.startsWith('{1}{R}, tap'))));
  await press('Cancel');

  // Wheel of Misfortune: you pick 2, they pick 0: you take 2 and wheel, they keep their hands
  await setup(['Wheel of Misfortune', 'Abrade'], ['Mountain', 'Mountain', 'Mountain']);
  await ev(() => { S.opp.forEach(o => { o.hand = 4; }); });
  await go(() => cast('Wheel of Misfortune', 'hand')); await resolve();
  await ev(() => { document.getElementById('womMe').value = 2; }); await press('Reveal');
  check('You took 2 and wheeled; opponents kept their four cards', await state(() => S.life === 38 && S.hand.length === 7 && S.opp.every(o => o.hand === 4)));
  await setup(['Wheel of Misfortune'], ['Mountain', 'Mountain', 'Mountain']);
  await go(() => cast('Wheel of Misfortune', 'hand')); await resolve();
  await ev(() => { document.getElementById('womMe').value = 0; document.getElementById('wom0').value = 3; }); await press('Reveal');
  check('Opponent 1 picked 3: it takes 3 and wheels with the other opponents; you picked lowest and keep your hand', await state(() => S.opp[0].life === 37 && S.life === 40 && S.hand.length === 0 && S.opp[0].hand === 7));

  // Faithless Looting: draw two, discard two, flashback {2}{R}
  await setup(['Faithless Looting', 'Abrade'], ['Mountain', 'Mountain', 'Mountain']);
  await go(() => cast('Faithless Looting', 'hand')); await resolve();
  check('Looting asks for two discards', (await T.title()).startsWith('Faithless Looting: discard 2'));
  await ev(() => { [...document.querySelectorAll('#sheetBody .pick')].slice(0, 2).forEach(b => b.click()); }); await press('Discard them');
  check('Three cards became one', await state(() => S.hand.length === 1 && S.gy.length === 3));
  await go(() => zoneMenu('gy', 'Faithless Looting'));
  check('Its own flashback costs {2}{R}', await state(() => [...document.querySelectorAll('#sheetButtons button')].some(b => b.textContent === 'Flashback {2R}')));
  await press('Cancel');

  // Big Score: discard a card as you cast it, then draw two and make two Treasures
  await setup(['Big Score', 'Abrade', 'Fireblast'], Array(4).fill('Mountain'));
  await go(() => cast('Big Score', 'hand'));
  check('Big Score asks for the card to discard', (await T.title()).startsWith('Big Score: discard a card to cast it'));
  await ev(() => { document.querySelectorAll('#sheetBody .pick.sel').forEach(b => b.click()); }); await pick('Abrade');
  await press('Discard and cast');
  check('Abrade discarded on casting', await state(() => S.gy.includes('Abrade') && S.stack.some(x => x.name === 'Big Score')), await state(() => JSON.stringify({ gy: S.gy, hand: S.hand })));
  await resolve();
  check('Big Score: two cards and two Treasures', await state(() => S.hand.length === 3 && S.treasures === 2));
  await setup(['Thrill of Possibility'], ['Mountain', 'Mountain']);
  await go(() => cast('Thrill of Possibility', 'hand'));
  check('Thrill with nothing else in hand can\'t be cast', await state(() => /needs another card in your hand/.test(document.getElementById('banner').textContent) && S.hand.length === 1 && !S.stack.length));

  // Valakut Awakening: bottom any number, draw that many plus one; the back face enters tapped
  await setup(['Valakut Awakening // Valakut Stoneforge', 'Abrade', 'Fireblast', 'Mountain'], ['Mountain', 'Mountain', 'Mountain']);
  await go(() => cast('Valakut Awakening // Valakut Stoneforge', 'hand')); await resolve();
  await ev(() => { [...document.querySelectorAll('#sheetBody .pick')].filter(b => /Abrade|Fireblast/.test(b.textContent)).forEach(b => b.click()); });
  await press('Put them on the bottom');
  check('Two on the bottom, three drawn', await state(() => S.hand.length === 4 && S.lib.slice(-2).join() === 'Abrade,Fireblast' && !S.hand.includes('Abrade')));
  await setup(['Valakut Awakening // Valakut Stoneforge'], []);
  await go(() => handMenu('Valakut Awakening // Valakut Stoneforge')); await press('Play as land');
  check('Valakut Stoneforge entered tapped without asking about life', await state(() => S.bf[0].asLand && S.bf[0].tapped && S.life === 40));
  await setup(['Shatterskull Smashing // Shatterskull, the Hammer Pass'], []);
  await go(() => handMenu('Shatterskull Smashing // Shatterskull, the Hammer Pass')); await press('Play as land');
  check('Shatterskull, the Hammer Pass asks for 3 life', (await T.title()).startsWith('Shatterskull, the Hammer Pass: pay 3 life'));
  await press('Pay 3 life');
  check('It entered untapped for 3 life and taps for R', await state(() => !S.bf[0].tapped && S.life === 37 && sourceColors(S.bf[0]) === 'R'));
  await T.done();
})();
