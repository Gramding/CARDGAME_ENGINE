// The Kodama deck's mana: Badgermole Cub and Leyline of Abundance (+G per creature tapped), Wild Growth, Somberwald Sage,
// Gwenna and Castle Garenbrig (creature spells only), Simic Signet, Baxter Building, Crystal Vein, Talon Gates, Staff of
// Compleation, Talisman of Curiosity, Leyline in the opening hand, and Lotus Bloom's suspend.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'kodama');
  const menu = async (n, label) => { await go(n => bfMenu(S.bf.find(p => ident(p) === n).uid), n); await press(label); await T.p.waitForTimeout(120); };

  // Badgermole Cub and Leyline of Abundance: each creature tapped for mana adds G more
  await setup([], ['Badgermole Cub', 'Leyline of Abundance', 'Llanowar Elves', 'Forest']);
  await menu('Llanowar Elves', 'Tap for mana');
  check('Llanowar Elves made G, plus G from each', await state(() => S.pool.G === 3));
  await menu('Forest', 'Tap for mana');
  check('A Forest (not a creature) makes just G', await state(() => S.pool.G === 4));
  check('Available mana counts the extra G: Elves 1 + 2, Forest 1', await state(() => { S.bf.forEach(p => p.tapped = false); S.pool.G = 0; return availableMana() === 4; }));

  // Badgermole Cub entering earthbends 1
  await setup(['Badgermole Cub'], ['Forest', 'Forest']);
  await go(() => cast('Badgermole Cub', 'hand')); await T.p.waitForTimeout(150);
  check('Badgermole Cub asks which land to earthbend', (await T.title()).startsWith('Badgermole Cub: earthbend 1'));
  await press('Earthbend it'); await T.p.waitForTimeout(100);
  check('The Forest is a 1/1 creature with haste, still a land', await state(() => { const f = S.bf.find(p => p.earth); return f && isCreatureP(f) && isLandP(f) && power(f) === 1 && hasHaste(f) && !sick(f); }));
  check('Tapping the earthbent Forest adds G from Badgermole too', await state(() => { const f = S.bf.find(p => p.earth); f.tapped = false; tapFor(f, 'G'); return S.pool.G === 2; }));
  await ev(() => { const f = S.bf.find(p => p.earth); leaveBf(f, 'die', 'test'); });
  check('When it dies it returns to the battlefield tapped', await state(() => S.bf.filter(p => p.name === 'Forest').length === 2 && S.bf.some(p => p.name === 'Forest' && p.tapped && !p.earth) && !S.gy.includes('Forest')));

  // Wild Growth on a land: one more G
  await setup(['Wild Growth'], ['Forest', 'Island']);
  await go(() => cast('Wild Growth', 'hand')); await T.p.waitForTimeout(150);
  await pick('Island'); await press('Enchant it'); await T.p.waitForTimeout(100);
  check('Wild Growth enchants the Island', await state(() => S.bf.find(p => p.name === 'Island').wild === 1));
  await ev(() => { S.bf.forEach(p => p.tapped = false); });
  await menu('Island', 'Tap for mana');
  check('The Island made U and G', await state(() => S.pool.U === 1 && S.pool.G === 1));
  await ev(() => { leaveBf(S.bf.find(p => p.name === 'Island'), 'hand'); });
  check('Wild Growth goes to the graveyard with its land', await state(() => S.gy.includes('Wild Growth') && !S.bf.some(p => p.name === 'Wild Growth')));

  // Somberwald Sage pays creature spells only
  await setup(['Woodland Bellower', 'Coveted Jewel'], ['Somberwald Sage', 'Forest', 'Forest', 'Forest']);
  check('Sage is no source for an artifact', await state(() => !isManaSource(S.bf[0], { name: 'Coveted Jewel' }) && isManaSource(S.bf[0], { name: 'Woodland Bellower' })));
  await go(() => cast('Woodland Bellower', 'hand')); await T.p.waitForTimeout(150);
  await ev(() => { if (!document.getElementById('sheet').hidden) closeSheet(null); });
  check('Woodland Bellower (6) cast with Sage (3) and three Forests', await state(() => S.bf.some(p => p.name === 'Woodland Bellower') && S.bf.filter(p => p.tapped).length === 4 && !(S.rpool || []).length), await state(() => JSON.stringify({ bf: S.bf.map(p => p.name + p.tapped), rp: S.rpool, pool: S.pool })));
  await setup([], ['Somberwald Sage']);
  await menu('Somberwald Sage', '{T}: three mana'); await press('Green');
  check('Tapped by hand, the three G wait as creature-only mana', await state(() => S.rpool.length === 3 && S.rpool.every(r => r.c === 'G' && r.kind === 'creature') && S.pool.G === 0));

  // Gwenna: two mana for creature spells; power 5 or more creature spell: a counter and untap
  await setup(['Woodland Bellower'], ['Gwenna, Eyes of Gaea', ...Array(4).fill('Forest')]);
  await go(() => cast('Woodland Bellower', 'hand')); await T.p.waitForTimeout(150);
  check('Gwenna triggers on a power 6 creature spell', await state(() => S.stack.some(x => x.eff === 'gwenna') && S.bf.find(p => ident(p) === 'Gwenna, Eyes of Gaea').tapped));
  await T.resolveAll(); await T.p.waitForTimeout(150);
  await ev(() => { if (!document.getElementById('sheet').hidden) closeSheet(null); });
  check('Gwenna helped pay, then untapped with a +1/+1 counter', await state(() => { const g = S.bf.find(p => ident(p) === 'Gwenna, Eyes of Gaea'); return !g.tapped && g.counters === 1 && S.turnLog.some(e => e.a === 'Gwenna'); }), await state(() => JSON.stringify(S.turnLog.slice(-6).map(e => e.a))));

  // Castle Garenbrig: six G for creature spells
  await setup(['Woodland Bellower'], ['Castle Garenbrig', ...Array(4).fill('Forest')]);
  await menu('Castle Garenbrig', '{2}{G}{G}, {T}: six');
  check('Castle Garenbrig made six creature-only G', await state(() => S.rpool.length === 6 && S.bf.every(p => p.tapped)));
  await go(() => cast('Woodland Bellower', 'hand')); await T.p.waitForTimeout(150);
  await ev(() => { if (!document.getElementById('sheet').hidden) closeSheet(null); });
  check('Woodland Bellower paid from it', await state(() => S.bf.some(p => p.name === 'Woodland Bellower') && !S.rpool.length));

  // Simic Signet, Baxter Building, Crystal Vein, Talon Gates
  await setup([], ['Simic Signet', 'Forest']);
  await menu('Simic Signet', '{1}, {T}: add {G}{U}');
  check('Simic Signet: the Forest paid {1}, GU added', await state(() => S.pool.G === 1 && S.pool.U === 1 && S.bf.every(p => p.tapped)));
  await setup([], ['Baxter Building', ...Array(4).fill('Forest')]);
  await menu('Baxter Building', '{4}, {T}: four mana');
  await ev(() => { document.getElementById('cmU').value = 3; document.getElementById('cmG').value = 1; }); await press('Add it');
  check('Baxter Building: four Forests in, UUUG out', await state(() => S.pool.U === 3 && S.pool.G === 1));
  await setup([], ['Crystal Vein']);
  await menu('Crystal Vein', '{T}, sacrifice: add {C}{C}');
  check('Crystal Vein sacrificed for CC', await state(() => S.pool.C === 2 && S.gy.includes('Crystal Vein')));
  await setup([], ['Talon Gates of Madara', 'Forest']);
  await menu('Talon Gates of Madara', '{1}, {T}: one mana'); await press('Blue');
  check('Talon Gates filtered G into U', await state(() => S.pool.U === 1 && S.bf.every(p => p.tapped)));

  // Staff of Compleation: 2 life for any colour, {5} to untap
  await setup([], ['Staff of Compleation', ...Array(5).fill('Forest')]);
  await menu('Staff of Compleation', '{T}, 2 life: one mana'); await press('Blue');
  check('Staff: 2 life for U', await state(() => S.life === 38 && S.pool.U === 1));
  await ev(() => { S.pool.U = 0; });
  await menu('Staff of Compleation', 'Pay {5}: untap');
  check('{5} untapped it', await state(() => !S.bf[0].tapped && S.bf.filter(p => p.name === 'Forest' && p.tapped).length === 5));
  await menu('Staff of Compleation', '{T}, 4 life: draw');
  check('Staff: 4 life to draw', await state(() => S.life === 34 && S.hand.length === 1));

  // Talisman of Curiosity: colourless free, G or U for 1 damage
  await setup([], ['Talisman of Curiosity']);
  check('Talisman pings you only for colours', await state(() => { const t = S.bf[0]; const r = tapFor(t, 'U'); t.tapped = false; const c = tapFor(t, 'C'); return r.pain === 1 && c.pain === 0 && S.life === 39; }));

  // Avatar Kyoshi taps for X of one colour, X = the greatest power among your creatures
  await setup([], ['Woodland Bellower']);
  await ev(() => { S.bf.push({ uid: S.nextId++, name: 'The Legend of Kyoshi // Avatar Kyoshi', flipped: true, tapped: false, etbTurn: 0 }); render(); });
  check('Avatar Kyoshi makes six of one colour (Bellower is 6/5)', await state(() => { const k = S.bf[1]; return srcAmt(k) === 6 && sourceColors(k).includes('U') && isCreatureP(k) && power(k) === 5; }));

  // Leyline of Abundance in the opening hand
  await ev(() => { localStorage.clear(); askOrder = false; holdPriority = false; simOpps = false; newGame('kodama'); S.hand = ['Leyline of Abundance', 'Forest', 'Island', 'Forest', 'Island', 'Forest', 'Island']; render(); });
  await go(() => keep()); await T.p.waitForTimeout(150);
  check('Keeping asks about the Leyline', (await T.title()).startsWith('Leyline of Abundance is in your opening hand'));
  await press('Put it on the battlefield'); await T.p.waitForTimeout(150);
  check('It starts on the battlefield', await state(() => S.bf.some(p => p.name === 'Leyline of Abundance') && !S.hand.includes('Leyline of Abundance') && S.phase === 'play'));

  // Lotus Bloom: no casting from hand, suspend 3, cast free when the last counter comes off
  await setup(['Lotus Bloom'], []);
  await go(() => handMenu('Lotus Bloom'));
  check('Lotus Bloom offers suspend and no cast', await state(() => { const b = [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent); return b.some(t => t.startsWith('Suspend 3')) && !b.some(t => t.startsWith('Cast')); }));
  await press('Suspend 3');
  check('Suspended with three time counters', await state(() => S.ex.some(e => e.n === 'Lotus Bloom' && e.suspend === 3) && !S.hand.length));
  for (let i = 0; i < 2; i++) { await go(() => nextTurn()); await T.p.waitForTimeout(200); await ev(() => { if (!document.getElementById('sheet').hidden && /played/.test(document.getElementById('sheetTitle').textContent)) closeSheet(null); }); }
  check('Two upkeeps later it has one counter', await state(() => S.ex.find(e => e.n === 'Lotus Bloom').suspend === 1));
  await go(() => nextTurn()); await T.p.waitForTimeout(250);
  check('The third upkeep offers to cast it free', (await T.title()).startsWith('Lotus Bloom: the last time counter is gone'));
  await press('Cast it free'); await T.p.waitForTimeout(200);
  check('Lotus Bloom is on the battlefield', await state(() => S.bf.some(p => p.name === 'Lotus Bloom') && !S.ex.some(e => e.n === 'Lotus Bloom')));
  await menu('Lotus Bloom', 'Tap for mana'); await press('Green');
  check('It sacrifices for three of one colour', await state(() => S.pool.G === 3 && S.gy.includes('Lotus Bloom')));
  await T.done();
})();
