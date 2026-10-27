// Every mana source in every deck: it shows "Tap for mana", automatic payment can use it, and it makes each colour
// it claims. Cavern of Souls and Delighted Halfling make restricted colours, tapped by hand or spent by autopay.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, state } = T;
  const NEEDS = { 'Mox Amber': ['Krark, the Thumbless'], 'Mox Opal': ['Sol Ring', 'Lotus Petal'], 'Spire of Industry': ['Sol Ring'], "Gaea's Cradle": ['Llanowar Elves'],
    'Springleaf Drum': ['Llanowar Elves'], 'Relic of Legends': [], 'Bloom Tender': [], 'Faeburrow Elder': [] };
  const failures = [];
  for (const deck of ['krark', 'kefka', 'nephilim']) {
    const sources = await ev(d => { const D = allDecks().find(x => x.id === d); return [...new Set([...D.commanders, ...D.cards])].filter(n => C[n].mana); }, deck);
    for (const n of sources) {
      await T.setup([], [n, ...(NEEDS[n] || [])], deck);
      const r = await ev(n => {
        const p = S.bf[0];
        if (n === 'Chrome Mox') p.imprint = 'Lightning Bolt';
        if (n === 'Gemstone Caverns') p.luck = true;
        const cols = sourceColors(p), out = { n, cols, src: isManaSource(p), auto: autoPay({ g: 1 }, true).ok, colourFail: [] };
        for (const ch of cols.replace('C', '')) if (!autoPay({ [ch]: 1 }, true).ok) out.colourFail.push(ch);
        return out;
      }, n);
      await go(() => bfMenu(S.bf[0].uid));
      const menu = (await T.sheet()).btns;
      await ev(() => closeSheet(null)); await T.p.waitForTimeout(40);
      if (!r.src || !r.auto || r.colourFail.length || !menu.includes('Tap for mana')) failures.push(`${deck}/${n}: source ${r.src}, autopay ${r.auto}, colours ${r.cols} failing ${r.colourFail.join('')}, menu ${menu.includes('Tap for mana')}`);
    }
  }
  check('Every mana source taps by hand and pays automatically, in every colour it claims', !failures.length, failures.join(' || '));

  // Cavern of Souls by hand: colourless or a restricted colour, spent only on its creature type
  await T.setup(["Thassa's Oracle", 'Dark Ritual'], ['Cavern of Souls', 'Volcanic Island'], 'kefka');
  await ev(() => { S.bf[0].ctype = 'Wizard'; });
  await go(() => bfMenu(S.bf[0].uid)); await press('Tap for mana');
  check('Cavern offers colourless and colours for Wizard creature spells', (await T.sheet()).btns.includes('Blue (only for Wizard creature spells)'));
  await press('Blue (only for Wizard creature spells)');
  check('The blue waits in the restricted pool and shows in the status bar', await state(() => S.rpool.length === 1 && S.pool.U === 0 && /U for Wizard creature spells/.test(document.getElementById('rpool').textContent)));
  check("It can't pay for Dark Ritual", await state(() => !autoPay(parseCost('B'), true, { name: 'Dark Ritual' }).ok));
  await go(() => cast("Thassa's Oracle", 'hand')); await T.p.waitForTimeout(150);
  check("Thassa's Oracle (a Wizard) paid with the Cavern blue and Volcanic Island", await state(() => !S.rpool.length && S.bf.some(p => p.name === "Thassa's Oracle")));
  await T.setup([], ['Cavern of Souls'], 'kefka');
  await go(() => bfMenu(S.bf[0].uid)); await press('Tap for mana'); await press('Colourless');
  check('Or plain colourless', await state(() => S.pool.C === 1 && !(S.rpool || []).length));
  // the restricted pool empties at end of turn
  await go(() => bfMenu(S.bf[0].uid)); await press('Untap'); await go(() => bfMenu(S.bf[0].uid)); await press('Tap for mana'); await press('Red');
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(150);
  check('Restricted mana is gone next turn', await state(() => !S.rpool.length && document.getElementById('rpool').hidden));

  // Delighted Halfling: colours only for legendary spells
  await T.setup(['Kinnan, Bonder Prodigy', 'Llanowar Elves'], ['Delighted Halfling', 'Tropical Island'], 'nephilim');
  await go(() => bfMenu(S.bf[0].uid)); await press('Tap for mana'); await press('Blue (only for legendary spells)');
  check("Halfling's blue can't pay for Llanowar Elves", await state(() => !restrictedOk(S.rpool[0], { name: 'Llanowar Elves' }) && restrictedOk(S.rpool[0], { name: 'Kinnan, Bonder Prodigy' })));
  await go(() => cast('Kinnan, Bonder Prodigy', 'hand')); await T.p.waitForTimeout(150);
  check('Kinnan (legendary) paid with it', await state(() => !S.rpool.length && S.bf.some(p => p.name === 'Kinnan, Bonder Prodigy')));
  await T.done();
})();
