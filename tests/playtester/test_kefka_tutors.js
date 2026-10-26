// Kefka deck tutors and the Thassa's Oracle win: Vampiric Tutor, Demonic Counsel and delirium,
// Beseech the Mirror with bargain, Demonic Consultation, Tainted Pact and the Oracle itself.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, setup, state } = T;
  const resolve = async () => { await go(() => { resolveTop(); }); };

  // Vampiric Tutor: top of library, 2 life
  await setup(['Vampiric Tutor'], ['Underground Sea']);
  await go(() => cast('Vampiric Tutor', 'hand')); await resolve();
  await pick('Demonic Consultation'); await press('Take it');
  check('Vampiric Tutor: on top, 2 life', await state(() => S.lib[0] === 'Demonic Consultation' && S.life === 38));

  // Demonic Counsel without delirium finds no Demon; with delirium it finds anything
  await setup(['Demonic Counsel'], ['Underground Sea', 'Sol Ring']);
  await go(() => cast('Demonic Counsel', 'hand')); await resolve();
  check('Demonic Counsel without delirium finds nothing', await state(() => S.turnLog.some(e => e.a === 'tutor' && e.found === 'nothing')));
  await setup(['Demonic Counsel'], ['Underground Sea', 'Sol Ring']);
  await ev(() => { S.gy = ['Island', 'Gogo, Mysterious Mime', 'Dispel', 'Sol Ring']; });
  await go(() => cast('Demonic Counsel', 'hand')); await resolve();
  check('Demonic Counsel with delirium opens the whole library', (await T.title()).startsWith('Demonic Counsel: search your library'));
  await pick('Reanimate'); await press('Take it');
  check('Demonic Counsel put Reanimate in hand', await state(() => S.hand.includes('Reanimate')));

  // Beseech the Mirror, bargaining a Lotus Petal: Thassa's Oracle cast for free
  await setup(['Beseech the Mirror'], ['Underground Sea', 'Watery Grave', 'Badlands', 'Sol Ring', 'Lotus Petal']);
  await go(() => cast('Beseech the Mirror', 'hand'));
  check('Beseech asks to bargain', (await T.title()).startsWith('Beseech the Mirror: bargain'));
  await pick('Lotus Petal'); await press('Sacrifice it');
  check('Petal sacrificed as it was cast', await state(() => !S.bf.some(p => p.name === 'Lotus Petal') && S.gy.includes('Lotus Petal')));
  await resolve();
  await pick("Thassa's Oracle"); await press('Exile it face down');
  check('Bargained Beseech offers a free cast', (await T.title()).startsWith("Cast Thassa's Oracle without paying"));
  await press('Cast it free');
  check("Thassa's Oracle is on the stack, cast for free", await state(() => S.stack.some(x => x.name === "Thassa's Oracle") || S.bf.some(p => p.name === "Thassa's Oracle")), await state(() => JSON.stringify(S.stack.map(stackLabel))));

  // Demonic Consultation naming a card not in the library, then Oracle wins
  await setup(['Demonic Consultation', "Thassa's Oracle"], ['Underground Sea', 'Volcanic Island', 'Watery Grave']);
  await go(() => cast('Demonic Consultation', 'hand')); await resolve();
  check('Consultation preselects a card not in the library when Oracle is in hand', await state(() => document.querySelector('#sheetBody .pick.sel').textContent.includes("isn't in your library")));
  await press('Name it');
  check('Consultation exiled the whole library', await state(() => S.lib.length === 0 && S.ex.length > 80));
  await go(() => cast("Thassa's Oracle", 'hand')); await T.p.waitForTimeout(200);
  await T.resolveAll(); await T.p.waitForTimeout(200);
  check("Oracle with an empty library offers the win", (await T.title()).includes('You win the game'), await T.title());
  await press('End as a win'); await press('Save result');
  check('Game ended as a Thassa\'s Oracle win', await state(() => S.phase === 'over' && S.result.method === "Thassa's Oracle"));

  // Thassa's Oracle with a real library: look at the top X = devotion
  await setup(["Thassa's Oracle"], ['Underground Sea', 'Volcanic Island', 'Irma, Part-Time Mutant']);
  const top2 = await state(() => S.lib.slice(0, 3));
  await go(() => cast("Thassa's Oracle", 'hand')); await T.resolveAll(); await T.p.waitForTimeout(200);
  check('Oracle looks at devotion (UU + Irma U = 3) cards', (await T.title()).includes('devotion 3'), await T.title());
  await press('Keep it on top');
  check('Oracle kept one on top, the rest at the bottom', await state(t => S.lib[0] === t[0] && t.slice(1).every(n => S.lib.slice(-2).includes(n)), top2));

  // Tainted Pact: keep going twice, then take the third card
  await setup(['Tainted Pact'], ['Underground Sea', 'Sol Ring']);
  const three = await state(() => S.lib.slice(0, 3));
  await go(() => cast('Tainted Pact', 'hand')); await resolve();
  await press('Keep going'); await press('Keep going'); await press('Put it into your hand');
  check('Tainted Pact exiled two and took the third', await state(t => S.hand.includes(t[2]) && S.ex.length === 2, three));
  await setup(['Tainted Pact'], ['Underground Sea', 'Sol Ring']);
  await go(() => cast('Tainted Pact', 'hand')); await resolve(); await press('Exile the whole library'); await T.p.waitForTimeout(150);
  check('Tainted Pact can exile the whole library', await state(() => S.lib.length === 0));
  await T.done();
})();
