// Reordering the stack by hand: the Reorder button (runs of identical items move as one) and Move to the top / bottom
// in an item's menu. Undo puts it back.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, state } = T;
  const order = () => state(() => S.stack.map(x => x.eff || x.name).join());

  await T.setup(['Lightning Bolt', 'Rite of Flame'], ['Mountain', 'Mountain'], 'krark');
  await ev(() => { holdPriority = true; });
  await go(() => cast('Lightning Bolt', 'hand')); await press('Target it');
  check('With one item the Reorder button is hidden', await state(() => document.getElementById('reorderBtn').hidden));
  await ev(() => { for (let i = 0; i < 3; i++) S.stack.push(trig('birgi', {})); render(); });
  check('With more it shows', await state(() => !document.getElementById('reorderBtn').hidden));

  await go(() => runAct('reorderStack'));
  check('Three Birgi triggers are one row, Bolt the other', await state(() => [...document.querySelectorAll('#sheetBody .orow .olab')].map(r => r.textContent).join('|') === 'Birgi: add R ×3|Lightning Bolt → opponent 1'), await state(() => [...document.querySelectorAll('#sheetBody .orow .olab')].map(r => r.textContent).join('|')));
  await ev(() => document.querySelectorAll('#sheetBody .orow')[1].querySelector('button[aria-label="Move to the top"]').click());
  await press('Use this order');
  check('Bolt is on top now, the triggers below it', (await order()) === 'birgi,birgi,birgi,Lightning Bolt', await order());
  await ev(() => undo());
  check('Undo puts the old order back', (await order()) === 'Lightning Bolt,birgi,birgi,birgi', await order());

  // one item from its menu
  await go(() => stackMenu(S.stack[0].id)); await press('Move to the top');
  check('Move to the top from the item menu', (await order()) === 'birgi,birgi,birgi,Lightning Bolt', await order());
  await go(() => stackMenu(S.stack[3].id)); await press('Move to the bottom');
  check('And back to the bottom', (await order()) === 'Lightning Bolt,birgi,birgi,birgi', await order());
  await ev(() => { holdPriority = false; });
  await T.done();
})();
