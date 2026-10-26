// Kefka as commander: cast from the command zone, the discard-and-draw trigger (doubled by Harmonic
// Prodigy), the {8} transform, Ruler of Ruin's draws, Cursed Totem, tax, and combat with Gogo and Irma.
const { table, check } = require('./lib');
const KEFKA = 'Kefka, Court Mage // Kefka, Ruler of Ruin';
(async () => {
  const T = await table();
  const { ev, go, press, pick, setup, state } = T;
  const discards = async (opp) => {   // answer Kefka's sheet: opponents' discards by type
    await T.p.waitForFunction(() => document.getElementById('sheetTitle').textContent.startsWith('Kefka'), null, { timeout: 4000 });
    await ev(o => { o.forEach((k, i) => { const s = document.getElementById('kd' + i); if (s) s.value = k; }); }, opp);
    await press('Discard and draw');
  };

  await setup(['Island', 'Dispel', 'Gamble'], ['Underground Sea', 'Badlands', 'Volcanic Island', 'Sol Ring']);
  check('Kefka starts in the command zone; the pool shows U, B and R pips', await state(() => S.cmdZone[0] === 'Kefka, Court Mage // Kefka, Ruler of Ruin' && ['pU', 'pB', 'pR'].every(i => document.getElementById(i)) && !document.getElementById('pW')));
  check('The Krark counter is hidden for this deck', await state(() => document.querySelector('.sgrp.krark').hidden));
  await go(() => zoneMenu('cmd', 'Kefka, Court Mage // Kefka, Ruler of Ruin')); await press('Cast (tax 0)');
  await T.p.waitForTimeout(200);
  check('Kefka resolved and all four sources paid', await state(() => S.bf.some(p => p.name === 'Kefka, Court Mage // Kefka, Ruler of Ruin') && S.bf.filter(p => p.tapped).length === 4));
  const hand0 = await state(() => S.hand.length);
  await ev(() => { const l = document.querySelectorAll('#sheetBody .pick'); [...l].find(b => b.textContent.includes('Island')).click(); });
  await discards(['instant', 'creature', '']);
  check('Kefka ETB: discarded a land; land, instant and creature = 3 draws', await state(h => S.hand.length === h - 1 + 3 && S.gy.includes('Island'), hand0), await state(() => JSON.stringify(S.turnLog.filter(e => e.a === 'Kefka'))));
  check('Opponents discarding shrink the tracked hand size', await state(() => S.oppHand === 4));

  // Harmonic Prodigy doubles Kefka's trigger (he's a Wizard)
  await setup(['Island', 'Gamble'], ['Harmonic Prodigy']);
  await go(() => enterBf('Kefka, Court Mage // Kefka, Ruler of Ruin'));
  check('Two Kefka triggers with Harmonic Prodigy', await state(() => S.stack.filter(x => x.eff === 'kefka').length === 2));

  // the {8} ability transforms him; then opponents losing life draws cards
  await setup([], [KEFKA, 'Sol Ring', 'Grim Monolith', 'Ancient Tomb', 'City of Traitors']);
  await go(() => bfMenu(S.bf[0].uid)); await press('{8}');
  check('Kefka transformed into Ruler of Ruin, a 5/7', await state(() => S.bf[0].flipped && isCreatureP(S.bf[0]) && power(S.bf[0]) === 5 && toughness(S.bf[0]) === 7));
  const lib0 = await state(() => S.lib.length);
  await ev(() => { S.target = 1; runAct('opp:life,-5'); });
  check('An opponent losing 5 life puts a draw-5 trigger on the stack', await state(() => S.stack.some(x => x.eff === 'ruler' && x.n === 5)));
  await go(() => { resolveTop(); });
  check('Ruler of Ruin drew 5', await state(l => S.lib.length === l - 5, lib0));

  // Cursed Totem stops the {8}
  await setup([], [KEFKA, 'Cursed Totem', 'Sol Ring', 'Grim Monolith', 'Ancient Tomb', 'City of Traitors']);
  await go(() => bfMenu(S.bf[0].uid)); await press('{8}');
  check('Cursed Totem blocks the transform', await state(() => !S.bf[0].flipped && /Cursed Totem/.test(document.getElementById('banner').textContent)));

  // dying sends him to the command zone; the next cast costs 2 more
  await setup([], [KEFKA]);
  await ev(k => { S.cmdZone = []; S.cmd[k] = 1; }, KEFKA);
  await go(() => bfMenu(S.bf[0].uid)); await press('Sacrifice / dies');
  check('Kefka went back to the command zone', await state(k => S.cmdZone.includes(k) && !S.bf.length, KEFKA));
  await go(k => zoneMenu('cmd', k), KEFKA);
  check('The command zone shows tax 2', (await T.sheet()).btns[0] === 'Cast (tax 2)');

  // combat: Gogo copies Kefka, both get +2/+0, both attack; Kefka's attack trigger fires for each
  await setup(['Island', 'Gamble', 'Dispel'], [KEFKA, 'Gogo, Mysterious Mime']);
  await ev(() => { S.target = 0; });
  await go(() => combat());
  check('Beginning of combat puts Gogo on the stack', await state(() => S.stack.some(x => x.eff === 'gogo')));
  await go(() => { resolveTop(); }); await pick('Kefka'); await press('Copy it');
  check('Gogo is a copy of Kefka, both 6 power', await state(() => { const g = S.bf.find(p => p.name === 'Gogo, Mysterious Mime'), k = S.bf.find(p => p.name !== g.name); return ident(g).startsWith('Kefka') && power(g) === 6 && power(k) === 6; }));
  await go(() => combat()); await press('Attack');
  check('Both attacked and each has Kefka\'s attack trigger', await state(() => S.bf.every(p => p.tapped) && S.stack.filter(x => x.eff === 'kefka' && x.attack).length === 2));
  for (let i = 0; i < 2; i++) { await go(() => { resolveTop(); }); await discards(['', '', '']); }
  await go(() => combat());
  check('Combat damage: 12 to opponent 1', await state(() => S.opp[0].life === 28), await state(() => S.opp.map(o => o.life).join(',')));
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(150);
  check('Gogo is Gogo again next turn', await state(() => { const g = S.bf.find(p => p.name === 'Gogo, Mysterious Mime'); return !g.copyOf && power(g) === 2; }));

  // Irma copies for good and keeps her trigger, with a +1/+1 counter
  await setup([], ['Irma, Part-Time Mutant', "Thassa's Oracle"]);
  await go(() => combat()); await go(() => { resolveTop(); }); await pick("Thassa's Oracle"); await press('Copy it');
  check('Irma is an Oracle copy with a counter', await state(() => { const p = S.bf.find(q => q.name === 'Irma, Part-Time Mutant'); return ident(p) === "Thassa's Oracle" && p.counters === 1 && power(p) === 2; }));
  await ev(() => { endTurn(); startTurn(); S.combat = null; }); await T.p.waitForTimeout(100);
  await go(() => combat());
  check('Irma still triggers at the next combat', await state(() => S.stack.some(x => x.eff === 'irma')));
  await T.done();
})();
