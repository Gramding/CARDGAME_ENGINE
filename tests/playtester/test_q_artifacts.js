// The Q deck's artifacts and lands: Basalt Monolith, Mind Stone, War Room, Chromatic Sphere and Star, the two Baubles,
// Sensei's Divining Top, Tormod's Crypt, Pithing Needle, Walking Ballista, Urza's Saga, Great Furnace and Defense Grid.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'q');
  const resolve = async () => { await go(() => { resolveTop(); }); };
  const menu = async (name, btn) => { await go(n => bfMenu(S.bf.find(p => p.name === n).uid), name); await press(btn); };

  // Basalt Monolith: three colourless, stays tapped, {3} untaps it
  await setup([], ['Basalt Monolith', 'Mountain', 'Mountain', 'Mountain']);
  await menu('Basalt Monolith', 'Tap for mana');
  check('Basalt made CCC', await state(() => S.pool.C === 3 && S.bf[0].tapped));
  await menu('Basalt Monolith', 'Pay {3}: untap');
  check('{3} from its own mana untapped it', await state(() => !S.bf[0].tapped && S.pool.C === 0));
  await ev(() => { S.bf[0].tapped = true; nextTurn(); }); await T.p.waitForTimeout(200);
  check('It doesn\'t untap in your untap step', await state(() => S.bf[0].tapped && !S.bf[1].tapped));

  // Mind Stone and War Room draw
  await setup([], ['War Room', 'Mountain', 'Mountain', 'Mountain']);
  await menu('War Room', '{3}, tap, pay 1 life');
  check('War Room: {3} and 1 life (mono-red) for a card', await state(() => S.hand.length === 1 && S.life === 39 && S.bf.every(p => p.tapped)));
  await setup([], ['Mind Stone', 'Mountain']);
  await menu('Mind Stone', '{1}, tap, sacrifice: draw');
  check('Mind Stone sacrificed for a card', await state(() => S.hand.length === 1 && S.gy.includes('Mind Stone') && S.bf[0].tapped));

  // Chromatic Sphere: mana and a card at once; Chromatic Star: mana, then its trigger draws
  await setup([], ['Chromatic Sphere', 'Chromatic Star', 'Mountain', 'Mountain']);
  await menu('Chromatic Sphere', '{1}, tap, sacrifice'); await press('Blue');
  check('Sphere turned a Mountain into U and drew', await state(() => S.pool.U === 1 && S.hand.length === 1 && S.gy.includes('Chromatic Sphere')));
  await menu('Chromatic Star', '{1}, tap, sacrifice'); await press('Red');
  check('Star made R and its draw trigger resolved', await state(() => S.pool.R === 1 && S.hand.length === 2 && S.gy.includes('Chromatic Star')));

  // Mishra's Bauble: look at your top card now, draw at the next upkeep
  await setup([], ["Mishra's Bauble", "Urza's Bauble"]);
  const top = await state(() => S.lib[0]);
  await menu("Mishra's Bauble", 'Tap, sacrifice'); await press('You');
  check('It shows your top card', (await T.title()).includes('the top card of your library is'), await T.title());
  await press('OK');
  await menu("Urza's Bauble", 'Tap, sacrifice'); await press('Opponent 1');
  check('Urza\'s Bauble names a random card type in the opponent\'s hand', await state(() => /Urza's Bauble: a random card in opponent 1's hand is/.test(document.getElementById('banner').textContent)));
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(200);
  check('Next turn: two Bauble draws, then the draw step', await state(t => S.hand.length === 3 && S.hand[0] === t && !S.delayed.length, top), await state(() => JSON.stringify(S.hand)));

  // Sensei's Divining Top: reorder the top three; tap to draw and put Top on top
  await setup([], ["Sensei's Divining Top", 'Mountain']);
  const three = await state(() => S.lib.slice(0, 3));
  await menu("Sensei's Divining Top", '{1}: look at the top three');
  check('The top three wait to be ordered', (await T.title()).startsWith("Sensei's Divining Top: put the top 3 back"));
  await ev(() => document.querySelectorAll('#sheetBody .orow')[2].querySelector('button[aria-label="Move up"]').click());
  await press('Put them back');
  check('The third card moved up one', await state(t => S.lib.slice(0, 3).join() === [t[0], t[2], t[1]].join(), three));
  await menu("Sensei's Divining Top", '{T}: draw a card');
  check('Top drew the top card and went on top of the library', await state(t => S.hand[0] === t[0] && S.lib[0] === "Sensei's Divining Top" && !S.bf.some(p => p.name === "Sensei's Divining Top"), three));

  // Tormod's Crypt on your own graveyard
  await setup([], ["Tormod's Crypt"]);
  await ev(() => { S.gy = ['Abrade', 'Fireblast']; });
  await menu("Tormod's Crypt", 'Tap, sacrifice'); await press('You');
  check('Your graveyard is exiled (the Crypt with it)', await state(() => S.gy.length === 0 && ['Abrade', 'Fireblast', "Tormod's Crypt"].every(n => S.ex.some(e => e.n === n))), await state(() => JSON.stringify({ gy: S.gy, ex: S.ex })));

  // Walking Ballista: X counters, pings, dies at zero; {4} adds a counter
  await setup(['Walking Ballista', 'Walking Ballista'], Array(8).fill('Mountain'));
  await go(() => cast('Walking Ballista', 'hand')); await ev(() => { document.getElementById('xVal').value = 2; }); await press('Cast it');
  await T.p.waitForTimeout(150);
  check('X = 2 cost four and it entered with two counters', await state(() => { const b = S.bf.find(p => p.name === 'Walking Ballista'); return b && b.counters === 2 && power(b) === 2 && S.bf.filter(p => p.tapped).length === 4; }));
  await menu('Walking Ballista', 'Remove a counter'); await press('Target it');
  check('One counter for 1 damage to opponent 1', await state(() => S.opp[0].life === 39 && S.bf.find(p => p.name === 'Walking Ballista').counters === 1));
  await menu('Walking Ballista', '{4}: put a +1/+1 counter');
  check('{4} put a counter back', await state(() => S.bf.find(p => p.name === 'Walking Ballista').counters === 2));
  await menu('Walking Ballista', 'Remove all 2'); await press('Target it');
  check('Removing both: 2 more damage and Ballista died', await state(() => S.opp[0].life === 37 && !S.bf.some(p => p.name === 'Walking Ballista') && S.gy.includes('Walking Ballista')));
  await ev(() => { S.bf.forEach(p => { p.tapped = false; }); });
  await go(() => cast('Walking Ballista', 'hand')); await ev(() => { document.getElementById('xVal').value = 0; }); await press('Cast it'); await T.p.waitForTimeout(150);
  check('X = 0: it dies as it enters', await state(() => !S.bf.some(p => p.name === 'Walking Ballista') && S.gy.filter(n => n === 'Walking Ballista').length === 2));

  // Pithing Needle naming Walking Ballista stops its pings
  await setup(['Pithing Needle'], ['Walking Ballista', 'Mountain']);
  await ev(() => { S.bf[0].counters = 2; });
  await go(() => cast('Pithing Needle', 'hand')); await T.p.waitForTimeout(150);
  check('Needle asks for a name', (await T.title()).startsWith('Pithing Needle: name a card'));
  await ev(() => { document.getElementById('pnName').value = 'walking ballista'; }); await press('Name it');
  check('It named Walking Ballista', await state(() => S.bf.find(p => p.name === 'Pithing Needle').named === 'Walking Ballista'));
  await menu('Walking Ballista', 'Remove a counter');
  check('The ping is blocked', await state(() => /Pithing Needle names Walking Ballista/.test(document.getElementById('banner').textContent) && S.bf.find(p => p.name === 'Walking Ballista').counters === 2));

  // Urza's Saga: I gives it {T}: {C}, II makes Constructs, III finds a {0} or {1} artifact and it's sacrificed
  await setup(["Urza's Saga"], ['Mountain', 'Mountain', 'Sol Ring']);
  await ev(() => { S.lib = S.lib.filter(n => n !== 'Mox Opal'); S.lib.push('Mox Opal'); });
  await go(() => handMenu("Urza's Saga")); await press('Play land'); await T.p.waitForTimeout(150);
  check('Chapter I resolved: lore 1, taps for C', await state(() => { const s = S.bf.find(p => p.name === "Urza's Saga"); return s.lore === 1 && s.sagaMana && sourceColors(s) === 'C'; }));
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(200);
  check('Next turn chapter II: lore 2 and the Construct ability', await state(() => { const s = S.bf.find(p => p.name === "Urza's Saga"); return s.lore === 2 && s.sagaConstruct; }));
  await menu("Urza's Saga", '{2}, tap: create a Construct');
  check('A Construct: an artifact creature, +1/+1 for each artifact (Sol Ring and itself)', await state(() => { const c = S.bf.find(p => p.name === 'Construct Token'); return c && isArtifactP(c) && power(c) === 2 && toughness(c) === 2; }));
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(200);
  check('Chapter III asks for an artifact with mana cost {0} or {1}', (await T.title()).startsWith("Urza's Saga: put an artifact with mana cost"));
  check('Walking Ballista ({X}{X}) isn\'t offered, Mox Opal is', await state(() => { const t = [...document.querySelectorAll('#sheetBody .pick')].map(b => b.textContent); return t.some(x => x.startsWith('Mox Opal')) && !t.some(x => x.startsWith('Walking Ballista')); }));
  await pick('Mox Opal'); await press('Put it in'); await T.p.waitForTimeout(150);
  check('Mox Opal is in play and the Saga was sacrificed', await state(() => S.bf.some(p => p.name === 'Mox Opal') && !S.bf.some(p => p.name === "Urza's Saga") && S.gy.includes("Urza's Saga")));
  check('Metalcraft: Sol Ring, the Construct and Mox Opal', await state(() => sourceColors(S.bf.find(p => p.name === 'Mox Opal')).length === 5));

  // Great Furnace is an artifact land; Defense Grid just sits there
  await setup(['Defense Grid'], ['Great Furnace', 'Mountain']);
  check('Great Furnace taps for R and counts as an artifact', await state(() => { const g = S.bf[0]; return sourceColors(g) === 'R' && isArtifactP(g) && artifactCount() === 1; }));
  await go(() => cast('Defense Grid', 'hand')); await T.p.waitForTimeout(150);
  check('Defense Grid resolves onto the battlefield', await state(() => S.bf.some(p => p.name === 'Defense Grid')));
  await T.done();
})();
