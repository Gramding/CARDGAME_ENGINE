// End-of-turn cleanup: discard down to seven when passing the turn.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, state } = T;
  const nine = ['Island', 'Mountain', 'Gut Shot', 'Ponder', 'Sol Ring', 'Lightning Bolt', 'Expedite', 'Rite of Flame', 'Gamble'];

  await T.setup(nine, [], 'krark');
  await go(() => { nextTurn(); });
  check('Passing with nine cards asks to discard two', (await T.title()).startsWith('End of turn: discard 2 down to 7'), await T.title());
  await press('Discard them');
  check('It insists on exactly two', await state(() => !document.getElementById('sheet').hidden && S.turn === 1));
  await ev(() => { const b = [...document.querySelectorAll('#sheetBody .pick')]; b[0].click(); b[1].click(); });
  await press('Discard them'); await T.p.waitForTimeout(150);
  check('Island and Mountain discarded, turn 2 starts with 7 + 1 cards', await state(() => S.turn === 2 && S.gy.includes('Island') && S.gy.includes('Mountain') && S.hand.length === 8));
  check('The discard is in the log of turn 1', await state(() => S.allTurns[0].events.some(e => e.a === 'cleanup discard')));
  await ev(() => undo()); await T.p.waitForTimeout(100);
  check('Undo takes back the discard with the pass', await state(() => S.turn === 1 && S.hand.length === 9 && !S.gy.length));

  // closing the sheet keeps the turn going
  await go(() => { nextTurn(); }); await ev(() => closeSheet(null)); await T.p.waitForTimeout(150);
  check('Closing the discard sheet cancels the pass', await state(() => S.turn === 1 && S.hand.length === 9));

  // seven or fewer: no prompt
  await T.setup(nine.slice(0, 7), [], 'krark');
  await ev(() => nextTurn()); await T.p.waitForTimeout(150);
  check('Seven cards pass without a prompt', await state(() => S.turn === 2 && document.getElementById('sheet').hidden));

  // under Yawgmoth's Will the discards are exiled
  await T.setup(nine, [], 'kefka');
  await ev(() => { S.ywill = S.turn; });
  await go(() => { nextTurn(); }); await ev(() => { const b = [...document.querySelectorAll('#sheetBody .pick')]; b[0].click(); b[1].click(); }); await press('Discard them'); await T.p.waitForTimeout(150);
  check("Yawgmoth's Will exiles the cleanup discards", await state(() => S.ex.some(e => e.n === 'Island') && !S.gy.includes('Island')));
  await T.done();
})();
