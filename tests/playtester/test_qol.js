// Alternative costs from every zone, the exile and graveyard viewers, library search, and the Ral counter.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const sheetBtns = () => state(() => [...document.querySelectorAll('#sheetButtons button, #sheetBody .zact')].map(b => b.textContent));

  // Gut Shot exiled by Jeska's Will can be cast for 2 life
  await T.setup([], [], 'krark');
  await ev(() => { S.ex = [{ n: 'Gut Shot', play: true, until: S.turn }, { n: 'Mountain', play: true, until: S.turn }, { n: 'Ponder' }]; render(); });
  await go(() => zoneMenu('ex', 'Gut Shot'));
  check('Exile menu offers Gut Shot for 2 life', (await sheetBtns()).some(b => /^Cast: 2 life/.test(b)), (await sheetBtns()).join(' | '));
  await press('Cast: 2 life'); await press('Target it');
  check('Cast from exile for 2 life with no mana', await state(() => S.life === 38 && S.stack.some(x => x.name === 'Gut Shot' && x.from === 'exile') && !S.ex.some(e => e.n === 'Gut Shot')));

  // the exile viewer: playable cards on top with their buttons, a search box
  await T.setup(['Island', 'Ponder'], [], 'krark');
  await ev(() => { S.ex = [{ n: 'Gut Shot', play: true, until: S.turn }, { n: 'Mountain', play: true, until: S.turn }, { n: 'Force of Will', play: true, until: S.turn }, { n: 'Lightning Bolt' }]; render(); });
  await go(() => pileMenu('ex'));
  const secs = await state(() => [...document.querySelectorAll('#sheetBody .zsec h4')].map(h => h.textContent));
  check('Exile viewer: a playable section and an exiled section', /You can play these now/.test(secs[0]) && /Exiled/.test(secs[secs.length - 1]), secs.join(' | '));
  check('Force of Will from exile offers the pitch', (await sheetBtns()).some(b => /Pitch a blue card/.test(b)));
  check('Mountain from exile offers Play', (await sheetBtns()).includes('Play'));
  await ev(() => { const i = document.querySelector('.zsearch'); i.value = 'bolt'; i.oninput(); });
  check('Searching "bolt" leaves only Lightning Bolt', await state(() => [...document.querySelectorAll('.zrow')].filter(r => !r.hidden).map(r => r.dataset.n).join() === 'lightning bolt'));
  await ev(() => { const i = document.querySelector('.zsearch'); i.value = ''; i.oninput(); });
  await ev(() => [...document.querySelectorAll('.zact')].find(b => /^Cast: 2 life/.test(b.textContent) && b.dataset.zn === 'Gut Shot').click());
  await press('Target it');
  check('Casting straight from the viewer row', await state(() => S.stack.some(x => x.name === 'Gut Shot') && S.life === 38));

  // Yawgmoth's Will: the graveyard gets the same cost options
  await T.setup([], [], 'kefka');
  await ev(() => { S.gy = ['Mental Misstep', 'Island']; S.ywill = S.turn; render(); });
  await go(() => pileMenu('gy'));
  check("Graveyard viewer under Yawgmoth's Will offers Mental Misstep for 2 life", (await sheetBtns()).some(b => /Cast \(Yawgmoth's Will\): 2 life/.test(b)), (await sheetBtns()).join(' | '));
  await ev(() => [...document.querySelectorAll('.zact')].find(b => /2 life/.test(b.textContent)).click()); await T.p.waitForTimeout(150);
  check('Mental Misstep cast from the graveyard for 2 life', await state(() => S.life === 38 && S.stack.some(x => x.name === 'Mental Misstep' && x.from === 'gycast')));

  // library search: grouped, searchable, more places to put a card
  await T.setup([], ['Mountain'], 'krark');
  await go(() => librarySearch());
  const groups = await state(() => [...document.querySelectorAll('#sheetBody .zsec h4')].map(h => h.textContent.split(' ')[0]));
  check('Library search groups by type', ['Creatures', 'Instants', 'Sorceries', 'Artifacts', 'Lands'].every(g => groups.includes(g)), groups.join(','));
  const lb = await sheetBtns();
  check('Library search has bottom, battlefield, graveyard and exile', ['To bottom', 'Onto the battlefield', 'To graveyard', 'To exile'].every(b => lb.includes(b)), lb.join(' | '));
  await ev(() => { const i = document.querySelector('.zsearch'); i.value = 'sol ri'; i.oninput(); });
  check('One match is picked by itself', await state(() => document.querySelector('#sheetBody .pick.sel') && document.querySelector('#sheetBody .pick.sel').dataset.q === 'sol ring'));
  await press('Onto the battlefield');
  check('Sol Ring went onto the battlefield', await state(() => S.bf.some(p => p.name === 'Sol Ring')));
  await go(() => librarySearch()); await ev(() => { const i = document.querySelector('.zsearch'); i.value = 'island'; i.oninput(); }); await press('To bottom');
  check('Island went to the bottom', await state(() => S.lib[S.lib.length - 1] === 'Island'));

  // tutors use the same picker
  await T.setup(['Demonic Tutor'], ['Underground Sea', 'Sol Ring'], 'kefka');
  await go(() => cast('Demonic Tutor', 'hand')); await go(() => { resolveTop(); });
  check('Demonic Tutor shows the grouped, searchable library', await state(() => !!document.querySelector('#sheetBody .zsearch') && document.querySelectorAll('#sheetBody .zsec').length >= 4));

  // Ral counts instants and sorceries only
  await T.setup(['Gut Shot', 'Lightning Bolt', 'Sol Ring'], ['Mountain', 'Mountain', 'Mountain'], 'krark');
  check('No Ral counter while Ral is in the library', await state(() => document.getElementById('ralIS').hidden));
  await ev(() => { S.hand.push('Ral, Monsoon Mage // Ral, Leyline Prodigy'); render(); });
  check('The Ral counter shows once Ral is in hand', await state(() => !document.getElementById('ralIS').hidden));
  for (const n of ['Gut Shot', 'Lightning Bolt']) { await go(n => cast(n, 'hand', { phyLife: true }), n); await press('Target it'); await T.resolveAll(); for (let i = 0; i < 6 && (await T.sheet()).open; i++) await press((await T.sheet()).btns[0]); }
  await go(() => cast('Sol Ring', 'hand')); await T.resolveAll();
  check('Storm 3, Ral 2 (Sol Ring is not an instant or sorcery)', await state(() => document.getElementById('storm').textContent === '3' && document.getElementById('ralN').textContent === '2'), await state(() => document.getElementById('storm').textContent + ' / ' + document.getElementById('ralN').textContent));
  await T.setup([], [], 'kefka');
  check('No Ral counter in the Kefka deck', await state(() => document.getElementById('ralIS').hidden));
  await T.done();
})();
