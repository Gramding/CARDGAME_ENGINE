// The Kodama deck's creatures: Disciple of Freyalise, Endurance (and its evoke), Formidable Speaker, Psychic Pickpocket,
// Trophy Mage, Woodland Bellower, Prime Speaker Zegana, Phantasmal Image, Cloudstone Curio, Aphetto Alchemist's morph,
// and the untappers: Arbor Elf, Quirion Ranger, Oboro Breezecaller, plus Meloku and Sewer-veillance Cam.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'kodama');
  const put = async (n, extra) => { await go(async ([n, x]) => { await enterBf(n, x || {}); await settle(); render(); }, [n, extra]); await T.p.waitForTimeout(150); };
  const menu = async (n, label) => { await go(n => bfMenu(S.bf.find(p => ident(p) === n).uid), n); await press(label); await T.p.waitForTimeout(120); };
  const topLib = top => ev(top => { S.lib = [...top, ...S.lib.filter(n => !top.includes(n))]; }, top);

  // Disciple of Freyalise: sacrifice another creature, gain life and draw for its power
  await setup([], ['Woodland Bellower']);
  await put('Disciple of Freyalise // Garden of Freyalise');
  check('Disciple asks for a creature to sacrifice', (await T.title()).startsWith('Disciple of Freyalise: sacrifice another creature'));
  await press('Sacrifice it'); await T.p.waitForTimeout(100);
  check('Bellower (6 power): 6 life, 6 cards', await state(() => S.life === 46 && S.hand.length === 6 && S.gy.includes('Woodland Bellower')));
  await setup(['Disciple of Freyalise // Garden of Freyalise'], []);
  await go(() => handMenu('Disciple of Freyalise // Garden of Freyalise')); await press('Play as land'); await T.p.waitForTimeout(100);
  check('Played as Garden of Freyalise it asks for 3 life', (await T.title()).startsWith('Garden of Freyalise: pay 3 life'));
  await press('Pay 3 life');
  check('Garden of Freyalise is an untapped land that taps for G, no sacrifice trigger', await state(() => S.bf[0].asLand && !S.bf[0].tapped && sourceColors(S.bf[0]) === 'G' && !S.stack.length && S.life === 37));

  // Endurance: graveyard to the bottom; evoke by exiling a green card
  await setup(['Endurance', 'Llanowar Elves'], []);
  await ev(() => { S.gy = ['Forest', 'Mental Misstep', 'Sol Ring']; });
  await go(() => handMenu('Endurance'));
  check('Endurance offers evoke for a green card', await state(() => [...document.querySelectorAll('#sheetButtons button')].some(b => b.textContent === 'Evoke: exile a green card')));
  await press('Evoke: exile a green card'); await T.p.waitForTimeout(150);
  check('Evoked: Llanowar Elves exiled, Endurance and the sacrifice trigger', await state(() => S.ex.some(e => e.n === 'Llanowar Elves') && S.bf.some(p => p.name === 'Endurance')));
  await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Endurance asks which player', (await T.title()).startsWith('Endurance: which player'));
  await press('You'); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Your graveyard went to the bottom; Endurance was sacrificed', await state(() => S.lib.slice(-3).sort().join() === 'Forest,Mental Misstep,Sol Ring' && S.gy.join() === 'Endurance'), await state(() => JSON.stringify({ gy: S.gy, st: S.stack.map(x => x.eff || x.name) })));

  // Formidable Speaker: discard to find a creature; {1}, {T}: untap another permanent
  await setup(['Forest'], ['Island']);
  await put('Formidable Speaker');
  await press('Discard it'); await T.p.waitForTimeout(100);
  check('It discarded the Forest and asks for a creature', (await T.title()).startsWith('Formidable Speaker: find a creature card') && await state(() => S.gy.includes('Forest')));
  await pick('Woodland Bellower'); await press('Take it');
  check('Woodland Bellower is in hand', await state(() => S.hand.includes('Woodland Bellower')));
  await ev(() => { S.bf.forEach(p => { if (p.name !== 'Island') p.etbTurn = 0; }); S.bf.push({ uid: S.nextId++, name: 'Sol Ring', tapped: true }); render(); });
  await menu('Formidable Speaker', '{1}, {T}: untap another');
  await pick('Sol Ring'); await press('Untap it'); await T.p.waitForTimeout(150);
  check('Speaker untapped Sol Ring, paid with the Island', await state(() => !S.bf.find(p => p.name === 'Sol Ring').tapped && S.bf.find(p => p.name === 'Island').tapped && S.bf.find(p => p.name === 'Formidable Speaker').tapped));

  // Psychic Pickpocket: connive, then return up to one nonland permanent
  await setup(['Sol Ring'], ['Simic Signet']);
  await topLib(['Forest']);
  await put('Psychic Pickpocket');
  check('It drew and asks for a discard', (await T.title()).startsWith('Psychic Pickpocket connives: discard a card') && await state(() => S.hand.includes('Forest')));
  await pick('Sol Ring'); await press('Discard it');
  await pick('Simic Signet'); await press('Return mine'); await T.p.waitForTimeout(100);
  check('Discarded a nonland: a +1/+1 counter; Simic Signet back in hand', await state(() => S.bf.find(p => p.name === 'Psychic Pickpocket').counters === 1 && S.hand.includes('Simic Signet') && S.gy.includes('Sol Ring')));

  // Trophy Mage finds an artifact with mana value 3; Woodland Bellower a green nonlegendary creature (3 or less)
  await setup([], []);
  await put('Trophy Mage');
  check('Trophy Mage offers only MV 3 artifacts', await state(() => { const p = [...document.querySelectorAll('#sheetBody .pick')].map(b => b.textContent); return p.length && p.some(t => t.includes('Staff of Compleation')) && !p.some(t => t.includes('Sol Ring')); }));
  await pick('Cloudstone Curio'); await press('Take it');
  check('Cloudstone Curio in hand', await state(() => S.hand.includes('Cloudstone Curio')));
  await put('Woodland Bellower');
  check('Bellower lists green nonlegendary creatures (Dryad Arbor too), not Gwenna', await state(() => { const p = [...document.querySelectorAll('#sheetBody .pick')].map(b => b.textContent); return p.some(t => t.includes('Lotus Cobra')) && p.some(t => t.includes('Dryad Arbor')) && !p.some(t => t.includes('Gwenna')) && !p.some(t => t.includes('Endurance') && false); }));
  await pick('Lotus Cobra'); await press('Put it in'); await T.p.waitForTimeout(100);
  check('Lotus Cobra entered from the library', await state(() => S.bf.some(p => p.name === 'Lotus Cobra')));

  // Prime Speaker Zegana: counters for the greatest other power, then draws that many
  await setup([], ['Woodland Bellower']);
  await put('Prime Speaker Zegana');
  check('Zegana entered with six counters (7/7) and drew seven', await state(() => { const z = S.bf.find(p => p.name === 'Prime Speaker Zegana'); return z.counters === 6 && power(z) === 7 && S.hand.length === 7; }));

  // Phantasmal Image copies a creature; the copy gets its abilities
  await setup([], ['Kodama of the East Tree']);
  await put('Phantasmal Image');
  check('Phantasmal Image asks what to copy', (await T.title()).startsWith('Phantasmal Image: enter as a copy'));
  await press('Copy it'); await T.p.waitForTimeout(120);
  check('A second Kodama; the legend rule asks which to keep', (await T.title()).startsWith('Legend rule: keep which'));
  await press('Keep it'); await T.p.waitForTimeout(120);
  check('One Kodama is left', await state(() => S.bf.filter(p => ident(p) === 'Kodama of the East Tree').length === 1));
  await setup([], []);
  await put('Phantasmal Image');
  check('With nothing to copy it dies as a 0/0', await state(() => !S.bf.length && S.gy.includes('Phantasmal Image')));

  // Cloudstone Curio: a nonartifact permanent enters, return another that shares a type
  await setup([], ['Cloudstone Curio', 'Llanowar Elves', 'Simic Signet']);
  await put('Lotus Cobra');
  check('Curio offers creatures only (not Simic Signet)', (await T.title()).startsWith('Cloudstone Curio: Lotus Cobra entered') && await state(() => { const p = [...document.querySelectorAll('#sheetBody .pick')].map(b => b.textContent); return p.join() === 'Llanowar Elves'; }));
  await press('Return it');
  check('Llanowar Elves returned to hand', await state(() => S.hand.includes('Llanowar Elves')));
  await put('Simic Signet');
  check('An artifact entering doesn\'t trigger Curio', await state(() => !S.stack.length && document.getElementById('sheet').hidden));

  // Aphetto Alchemist: morph for {3}, a 2/2 with mana value 0; turn it face up for {U}
  await setup(['Aphetto Alchemist'], ['Forest', 'Forest', 'Forest', 'Island', 'Kodama of the East Tree']);
  await ev(() => { S.hand.push('Forest'); });
  await go(() => handMenu('Aphetto Alchemist')); await press('Cast face down for {3}'); await T.p.waitForTimeout(200);
  check('A face-down 2/2 entered; Kodama triggered with mana value 0', await state(() => { const p = S.bf.find(q => q.faceDown); return p && isCreatureP(p) && power(p) === 2 && !typesOf(p).length && S.stack.length === 1 && S.stack[0].mv === 0; }));
  await go(() => resolveTop());
  check('Kodama offers mana value 0', (await T.title()).includes('mana value 0 or less'));
  await press('Put it in'); await T.p.waitForTimeout(100);
  await ev(() => { S.bf.forEach(p => { p.etbTurn = 0; }); });
  await menu('Aphetto Alchemist', 'Turn face up');
  check('Turned face up with the Island', await state(() => !S.bf.find(p => p.name === 'Aphetto Alchemist').faceDown && S.bf.find(p => p.name === 'Island').tapped));
  await ev(() => { S.bf.find(p => p.name === 'Kodama of the East Tree').tapped = true; });
  await menu('Aphetto Alchemist', '{T}: untap target');
  check('It can target artifacts and creatures, not lands', await state(() => { const p = [...document.querySelectorAll('#sheetBody .pick')].map(b => b.textContent); return p.some(t => t.includes('Kodama')) && !p.some(t => t.includes('Island')); }));
  await pick('Kodama'); await press('Untap it'); await T.p.waitForTimeout(100);
  check('The Alchemist untapped Kodama', await state(() => !S.bf.find(p => p.name === 'Kodama of the East Tree').tapped && S.bf.find(p => p.name === 'Aphetto Alchemist').tapped));

  // Arbor Elf untaps a Forest; Quirion Ranger returns one to untap a creature
  await setup([], ['Arbor Elf', 'Quirion Ranger', 'Breeding Pool', 'Llanowar Elves']);
  await ev(() => { S.bf[2].tapped = true; S.bf[3].tapped = true; });
  await menu('Arbor Elf', '{T}: untap target Forest');
  check('Arbor Elf untapped Breeding Pool (a Forest)', await state(() => !S.bf.find(p => p.name === 'Breeding Pool').tapped));
  await menu('Quirion Ranger', 'Return a Forest');
  await pick('Llanowar Elves'); await press('Untap it'); await T.p.waitForTimeout(100);
  check('Quirion Ranger returned Breeding Pool and untapped Llanowar Elves', await state(() => S.hand.includes('Breeding Pool') && !S.bf.find(p => p.name === 'Llanowar Elves').tapped));
  await go(() => bfMenu(S.bf.find(p => p.name === 'Quirion Ranger').uid));
  check('Only once each turn', await state(() => ![...document.querySelectorAll('#sheetButtons button')].some(b => b.textContent.startsWith('Return a Forest'))));
  await press('Cancel');

  // Oboro Breezecaller and Meloku return lands
  await setup([], ['Oboro Breezecaller', 'Meloku the Clouded Mirror', 'Forest', 'Island', 'Island', 'Island']);
  await ev(() => { S.bf.find(p => p.name === 'Forest').tapped = true; });
  await menu('Oboro Breezecaller', '{2}, return a land');
  await pick('Forest'); await press('Return it'); await pick('Island'); await press('Untap it'); await T.p.waitForTimeout(100);
  check('Breezecaller: Forest returned, two Islands paid', await state(() => S.hand.includes('Forest') && S.bf.filter(p => p.name === 'Island' && p.tapped).length <= 2));
  await ev(() => { S.bf.forEach(p => p.tapped = false); });
  await menu('Meloku the Clouded Mirror', '{1}, return a land'); await pick('Island'); await press('Return it'); await T.p.waitForTimeout(100);
  check('Meloku made a 1/1 flying Illusion', await state(() => S.bf.some(p => p.name === 'Illusion Token') && S.hand.includes('Island')));

  // Sewer-veillance Cam: tap or untap on entering and leaving; {3}{U}, sacrifice: draw two
  await setup([], ['Woodland Bellower', 'Island', 'Island', 'Island', 'Island']);
  await ev(() => { S.bf[0].tapped = true; });
  await put("Sewer-veillance Cam"); await press('Tap or untap it');
  check('The Cam untapped Woodland Bellower', await state(() => !S.bf[0].tapped));
  await menu('Sewer-veillance Cam', '{3}{U}, sacrifice: draw two'); await T.p.waitForTimeout(100);
  check('Leaving, the Cam triggers again, above the draw', await state(() => S.stack.map(x => x.eff).join() === 'abKdDraw,cam'));
  await T.resolveAll(); await T.p.waitForTimeout(100);
  check('Its trigger asks first', (await T.title()).startsWith('Sewer-veillance Cam: tap or untap'));
  await press('Tap or untap it'); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Bellower tapped, two cards drawn', await state(() => S.bf[0].tapped && S.hand.length === 2 && S.gy.includes('Sewer-veillance Cam')), await state(() => JSON.stringify({ t: S.bf[0], h: S.hand, gy: S.gy, st: S.stack, sh: document.getElementById('sheetTitle').textContent })));
  await T.done();
})();
