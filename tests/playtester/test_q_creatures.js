// The Q deck's creatures: the Kiki-Jiki + Zealous Conscripts loop, Fable of the Mirror-Breaker's chapters and
// Reflection of Kiki-Jiki, Fury's evoke and double strike, Ragavan's dash and combat damage, and Blood Moon effects.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  // Reforge the Soul drawn in a turn pass would stop for its miracle; the wheels test puts it on top itself
  const setup = async (h, b) => { await T.setup(h, b, 'q'); await ev(() => { S.lib = S.lib.filter(n => n !== 'Reforge the Soul'); }); };
  const resolve = async () => { await go(() => { resolveTop(); }); };
  const menu = async (name, btn) => { await go(n => bfMenu(S.bf.find(p => p.name === n).uid), name); await press(btn); };

  // Kiki-Jiki copies Zealous Conscripts; the token untaps Kiki: an infinite loop the page calls a win
  await setup([], ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts', 'Mountain']);
  await ev(() => { S.bf[0].etbTurn = S.turn; render(); });
  await go(() => bfMenu(S.bf[0].uid));
  check('Kiki-Jiki has haste: it can tap the turn it arrives', await state(() => [...document.querySelectorAll('#sheetButtons button')].some(b => b.textContent.startsWith('{T}: a hasty token copy'))));
  await press('{T}: a hasty token copy'); await T.p.waitForTimeout(150);
  check('Zealous Conscripts is the only nonlegendary creature, so Kiki copies it without asking', await state(() => /Zealous Conscripts was the only choice/.test(document.getElementById('banner').textContent) || S.stack.some(x => x.eff === 'conscripts')));
  check('A hasty Conscripts token, gone at end of turn; its trigger is on the stack', await state(() => S.bf.some(p => p.token && p.name === 'Zealous Conscripts' && p.temp && p.hasteTurn === S.turn) && S.stack.some(x => x.eff === 'conscripts') && S.bf[0].tapped));
  await resolve();
  check('The trigger points at Kiki-Jiki first', (await T.title()).startsWith('Zealous Conscripts: gain control') && await state(() => document.querySelector('#sheetBody .pick.sel').textContent.startsWith('Kiki-Jiki')));
  await press('Untap mine'); await T.p.waitForTimeout(200);
  check('Kiki-Jiki untapped, and the page calls the loop', await state(() => !S.bf[0].tapped) && (await T.title()).startsWith('A Zealous Conscripts token untapped Kiki-Jiki'), await T.title());
  await press('End as a win');
  check('The method is preset', await state(() => document.getElementById('egMethod').value === 'Kiki-Jiki + Zealous Conscripts'));
  await press('Save result'); await press('Close');

  // Fable: a Goblin Shaman, a loot, then Reflection of Kiki-Jiki
  await setup(['Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', 'Abrade'], ['Mountain', 'Mountain', 'Mountain']);
  await go(() => cast('Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', 'hand')); await T.p.waitForTimeout(200);
  check('Chapter I: lore 1 and a 2/2 Goblin Shaman', await state(() => S.bf.find(p => p.name.startsWith('Fable')).lore === 1 && S.bf.some(p => p.name === 'Goblin Shaman Token' && power(p) === 2)));
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(250);
  check('Chapter II asks for up to two discards', (await T.title()).startsWith('Fable chapter II'), await T.title());
  await pick('Abrade'); await press('Discard and draw');
  check('Discarded Abrade, drew one', await state(() => S.gy.includes('Abrade') && S.hand.length === 2 && S.turnLog.some(e => e.a === 'Fable' && e.chapter === 'II')));
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(250);
  check('Chapter III: Reflection of Kiki-Jiki, a 2/2 Goblin Shaman creature that just arrived', await state(() => { const r = S.bf.find(p => p.name.startsWith('Fable')); return r && r.flipped && isCreatureP(r) && typesOf(r).includes('Shaman') && power(r) === 2 && sick(r); }));
  await go(() => combat()); await T.p.waitForTimeout(100);
  check('The Goblin Shaman token is ready to attack, the new Reflection isn\'t preselected', await state(() => { const sel = [...document.querySelectorAll('#sheetBody .pick.sel')].map(b => b.textContent); return sel.length === 1 && sel[0].startsWith('Goblin Shaman'); }));
  await press('Attack');
  check('Its attack trigger is on the stack', await state(() => S.stack.some(x => x.eff === 'shamanAtk')));
  await resolve(); await go(() => combat());
  check('A Treasure, and 2 damage', await state(() => S.treasures === 1 && S.opp[0].life === 38));
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(250);
  await menu('Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', '{1}, {T}: a hasty token copy');
  await T.p.waitForTimeout(150);   // the Goblin Shaman is the only thing it can copy
  check('Reflection paid {1} and copied the Goblin Shaman with haste', await state(() => S.bf.filter(p => p.name === 'Goblin Shaman Token').length === 2 && S.bf.some(p => p.name === 'Goblin Shaman Token' && p.temp && p.hasteTurn === S.turn)));

  // Fury: evoked for a red card, 4 damage divided, then sacrificed; double strike in combat
  await setup(['Fury', 'Abrade'], ['Walking Ballista']);
  await ev(() => { S.bf[0].counters = 1; });
  await go(() => handMenu('Fury'));
  check('Fury offers evoke for a red card', await state(() => [...document.querySelectorAll('#sheetButtons button')].some(b => b.textContent === 'Evoke: exile a red card')));
  await press('Evoke'); await T.p.waitForTimeout(150);   // Abrade is the only other red card
  check('Abrade exiled, Fury in play with its ETB and evoke triggers', await state(() => S.ex.some(e => e.n === 'Abrade') && S.bf.some(p => p.name === 'Fury') && S.stack.map(x => x.eff).join() === 'evoke,fury'));
  await resolve();
  check('Fury asks how to divide 4 damage', (await T.title()).startsWith('Fury: divide 4 damage'));
  await ev(() => { document.querySelector('#sheetBody input').value = 1; }); await press('Deal it');
  check('The 1/1 Ballista took 1 and died; 3 went to opponents\' creatures', await state(() => !S.bf.some(p => p.name === 'Walking Ballista') && S.turnLog.some(e => e.a === 'Fury' && e.toOpponents === 3)));
  await resolve();
  check('Then the evoke trigger sacrificed Fury', await state(() => !S.bf.some(p => p.name === 'Fury') && S.gy.includes('Fury')));
  await setup([], ['Fury']);
  await go(() => combat()); await press('Attack'); await go(() => combat());
  check('Double strike: a 3/3 deals 6', await state(() => S.opp[0].life === 34));

  // Ragavan: dash for {1}{R}, hits, makes a Treasure and steals the top card; back to hand at the end step
  await setup(['Ragavan, Nimble Pilferer'], ['Mountain', 'Mountain']);
  await go(() => handMenu('Ragavan, Nimble Pilferer')); await press('Dash {1R}'); await T.p.waitForTimeout(150);
  check('Dashed: haste, two Mountains tapped', await state(() => { const r = S.bf.find(p => p.name.startsWith('Ragavan')); return r && r.dash && !sick(r) && S.bf.filter(p => p.tapped).length === 2; }));
  await go(() => combat()); await press('Attack'); await go(() => combat());
  check('2 damage, and Ragavan\'s trigger', await state(() => S.opp[0].life === 38 && S.stack.some(x => x.eff === 'ragavan')));
  await resolve();
  await ev(() => { document.getElementById('ragName').value = 'lightning bolt'; }); await press('Done');
  check('A Treasure, their library down one, and their Lightning Bolt castable from exile', await state(() => S.treasures === 1 && S.opp[0].lib === 91 && S.ex.some(e => e.n === 'Lightning Bolt' && e.play && e.owner === 0)));
  await go(() => zoneAct('ex', 'Lightning Bolt', 'pay:cast')); await press('Target it'); await resolve();
  check('Their Bolt hit and went to their graveyard, not yours', await state(() => S.opp[0].life === 35 && !S.gy.includes('Lightning Bolt') && !S.ex.some(e => e.n === 'Lightning Bolt')));
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(200);
  check('Ragavan went back to hand at the end step', await state(() => S.hand.includes('Ragavan, Nimble Pilferer') && !S.bf.some(p => p.name.startsWith('Ragavan'))));

  // Blood Moon and Magus of the Moon: nonbasic lands tap for R and lose their other abilities
  await setup(['Mountain', "Urza's Saga", 'Abrade'], ['Magus of the Moon', 'Ancient Tomb', 'City of Traitors']);
  check('Ancient Tomb under the Moon: one R, no damage', await state(() => { const t = S.bf.find(p => p.name === 'Ancient Tomb'); return sourceColors(t) === 'R' && srcAmt(t) === 1 && painFor(t, 'R') === 0; }));
  await go(() => cast('Abrade', 'hand')); await T.p.waitForTimeout(100);
  check('Abrade paid with Tomb and City: two lands, no life lost', await state(() => S.life === 40 && S.bf.filter(p => p.tapped).length === 2));
  await ev(() => { S.stack = []; });
  await go(() => handMenu('Mountain')); await press('Play land');
  check('City of Traitors stays when you play another land', await state(() => S.bf.some(p => p.name === 'City of Traitors')));
  await ev(() => { S.landDrop = false; });
  await go(() => handMenu("Urza's Saga")); await press('Play land'); await T.p.waitForTimeout(150);
  check("Urza's Saga gets no chapter and taps for R", await state(() => { const s = S.bf.find(p => p.name === "Urza's Saga"); return !s.lore && !S.stack.length && sourceColors(s) === 'R'; }));
  check('The tiles say Mountain', await state(() => [...document.querySelectorAll('#lands .card')].filter(b => /Mountain$/.test(b.querySelector('.cc').textContent)).length === 3));
  await ev(() => { leaveBf(S.bf.find(p => p.name === 'Magus of the Moon'), 'die'); });
  check('With the Magus gone, Ancient Tomb makes CC again', await state(() => { const t = S.bf.find(p => p.name === 'Ancient Tomb'); return sourceColors(t) === 'C' && srcAmt(t) === 2; }));
  await setup(['Blood Moon'], ['Mountain', 'Mountain', 'Great Furnace']);
  await go(() => cast('Blood Moon', 'hand')); await T.p.waitForTimeout(150);
  check('Blood Moon in play: the engine line says so', await state(() => moonOn() && /Blood Moon/.test(document.getElementById('engines').textContent)));
  await T.done();
})();
