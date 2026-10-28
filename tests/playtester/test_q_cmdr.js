// Q, Stacking the Deck: cast from the command zone with tax, the ETB that exiles a nonland card, copying it for a
// card from hand (one at a time and the repeat shortcut), copies of permanents, Pithing Needle and switching decks.
const { table, check } = require('./lib');
const Q = 'Q, Stacking the Deck';
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'q');
  const resolve = async () => { await go(() => { resolveTop(); }); };
  // the library order Q sees: shuffles keep it when Math.random sits at the top of its range
  const stackLib = top => ev(top => { window.__mr = window.__mr || Math.random; S.rng = null; Math.random = () => 0.9999; S.lib = [...top, ...S.lib.filter(n => !top.includes(n))]; }, top);
  const unstack = () => ev(() => { if (window.__mr) Math.random = window.__mr; });

  await setup(['Mountain', 'Lightning Bolt'], Array(7).fill('Mountain'));
  check('The Q deck has 99 cards and Q in the command zone', await state(() => DECK.id === 'q' && DECK.cards.length === 99 && S.cmdZone.includes('Q, Stacking the Deck') && COMMANDERS.length === 1));
  await stackLib(['Mountain', 'Great Furnace', 'Seething Song']);
  await go(() => zoneMenu('cmd', 'Q, Stacking the Deck')); await press('Cast (tax 0)');
  await T.p.waitForTimeout(200); await unstack();
  check('Q resolved and its trigger exiled two lands, then Seething Song', await state(() => S.bf.some(p => p.name === 'Q, Stacking the Deck') && S.ex.map(e => e.n).join() === 'Mountain,Great Furnace,Seething Song' && S.ex[2].q && !S.ex[0].q), await state(() => JSON.stringify(S.ex)));
  check('The exile pile counts the copyable card', await state(() => document.getElementById('ex').textContent.includes('1 ▶')));
  check('The engine line names the Q card', await state(() => /Q copies: Seething Song/.test(document.getElementById('engines').textContent)));

  // the exile viewer offers the copy ability
  await go(() => pileMenu('ex'));
  check('The exile viewer has a Q button on Seething Song', await state(() => [...document.querySelectorAll('.zact')].some(b => b.dataset.zn === 'Seething Song' && b.dataset.zact === 'qcopy')));
  await ev(() => [...document.querySelectorAll('.zact')].find(b => b.dataset.zn === 'Seething Song' && b.dataset.zact === 'qcopy').click());
  check('It asks which card to exile from your hand', (await T.title()).startsWith('Seething Song (Q): exile which card'), await T.title());
  await pick('Mountain'); await press('Exile it');
  check('The ability resolved and offers to cast the copy', (await T.title()).startsWith('Q: a copy of Seething Song'), await T.title());
  await press('Cast the copy');
  check('The copy is on the stack, paid with the last three Mountains', await state(() => S.stack.some(x => x.qcopy && x.name === 'Seething Song') && S.bf.filter(p => p.name === 'Mountain' && !p.tapped).length === 0 && S.storm === 2));
  await resolve();
  check('Copy resolved: RRRRR, nothing in the graveyard, Seething Song still copyable in exile', await state(() => S.pool.R === 5 && !S.gy.includes('Seething Song') && S.ex.some(e => e.n === 'Seething Song' && e.q) && S.ex.some(e => e.n === 'Mountain' && !e.q)));

  // the repeat shortcut: two more cards, two more copies, each paid from the pool
  await ev(() => { S.hand.push('Rite of Flame', 'Abrade'); render(); });
  await go(() => zoneAct('ex', 'Seething Song', 'qrepeat'));
  await ev(() => { [...document.querySelectorAll('#sheetBody .pick')].forEach(b => { if (/Rite of Flame|Abrade/.test(b.textContent)) b.click(); }); });
  await press('Exile and cast copies'); await T.p.waitForTimeout(250);
  check('Two copies: R5 - 3 + 5 - 3 + 5 = R9, storm 4, both cards exiled', await state(() => S.pool.R === 9 && S.storm === 4 && ['Rite of Flame', 'Abrade'].every(n => S.ex.some(e => e.n === n)) && S.hand.length === 1), await state(() => JSON.stringify({ R: S.pool.R, storm: S.storm, hand: S.hand })));
  await ev(() => { S.pool.R = 0; S.hand.push('Abrade'); render(); });
  await go(() => zoneAct('ex', 'Seething Song', 'qrepeat'));
  await ev(() => { [...document.querySelectorAll('#sheetBody .pick')].forEach(b => b.click()); });
  await press('Exile and cast copies'); await T.p.waitForTimeout(250);
  check('Without mana the shortcut stops before exiling anything', await state(() => S.hand.length === 2 && S.storm === 4 && /not enough mana/.test(document.getElementById('banner').textContent)), await state(() => document.getElementById('banner').textContent));

  // a copy of a permanent card becomes a token
  await setup(['Mountain'], ['Mountain', 'Mountain']);
  await ev(() => { S.ex.push({ n: 'Ragavan, Nimble Pilferer', q: true }); });
  await go(() => zoneAct('ex', 'Ragavan, Nimble Pilferer', 'qcopy')); await press('Exile it');
  check('Ragavan\'s copy can be dashed too', await state(() => [...document.querySelectorAll('#sheetButtons button')].some(b => b.textContent.startsWith('Dash {1R}'))));
  await press('Cast the copy'); await T.p.waitForTimeout(200);
  check('The copy of Ragavan entered as a token', await state(() => S.bf.some(p => p.name === 'Ragavan, Nimble Pilferer' && p.token) && S.ex.some(e => e.q)));

  // Q dies and comes back with tax; Ruby Medallion takes {1} off
  await setup([], ['Q, Stacking the Deck', 'Ruby Medallion', ...Array(5).fill('Mountain')]);
  await ev(() => { S.cmdZone = []; leaveBf(S.bf[0], 'die', 'test'); render(); });
  check('Q went back to the command zone', await state(() => S.cmdZone.includes('Q, Stacking the Deck') && !S.gy.includes('Q, Stacking the Deck')));
  await ev(() => { S.cmd['Q, Stacking the Deck'] = 1; });
  await stackLib(['Lightning Bolt']);
  await go(() => zoneMenu('cmd', 'Q, Stacking the Deck')); await press('Cast (tax 2)'); await T.p.waitForTimeout(200); await unstack();
  check('Q with tax 2 and Ruby Medallion cost five: all five Mountains', await state(() => S.bf.filter(p => p.name === 'Mountain' && p.tapped).length === 5 && S.bf.some(p => p.name === 'Q, Stacking the Deck')));
  check('The log notes the cheaper cast', await state(() => S.turnLog.some(e => e.a === 'cast' && e.c === 'Q' && e.cheaper === 1)));

  // Pithing Needle naming the exiled card shuts the ability off
  await setup(['Mountain'], ['Mountain', 'Pithing Needle']);
  await ev(() => { S.ex.push({ n: 'Lightning Bolt', q: true }); S.bf.find(p => p.name === 'Pithing Needle').named = 'Lightning Bolt'; });
  await go(() => zoneAct('ex', 'Lightning Bolt', 'qcopy'));
  check('Needle blocks the copy ability', await state(() => /Pithing Needle names Lightning Bolt/.test(document.getElementById('banner').textContent) && S.hand.length === 1));

  // the deck switcher lists it
  await go(() => deckMenu());
  check('Switch deck lists Q, Stacking the Deck', await state(() => [...document.querySelectorAll('#sheetBody .pick')].some(b => b.textContent.startsWith('Q, Stacking the Deck'))));
  await press('Cancel');
  await T.done();
})();
