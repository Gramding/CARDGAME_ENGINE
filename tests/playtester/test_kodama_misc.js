// The rest of the Kodama deck: both Tezzerets, Memory Jar, Expedition Map, Urza's Cave, Fight Rigging, The Legend of
// Kyoshi, Crop Rotation, Summoner's Pact, Tidal Bore, Legolas's Quick Reflexes, Coveted Jewel, Trade Routes,
// Fountainport, The Gold Saucer, Bonders' Enclave, Oboro, Shifting Woodland and Staff of Compleation's other modes.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'kodama');
  const put = async n => { await go(async n => { await enterBf(n); await settle(); render(); }, n); await T.p.waitForTimeout(150); };
  const menu = async (n, label) => { await go(n => bfMenu(S.bf.find(p => ident(p) === n).uid), n); await press(label); await T.p.waitForTimeout(120); };
  const close = () => ev(() => { if (!document.getElementById('sheet').hidden) closeSheet(null); });

  // Tezzeret the Seeker: enters with 4; +1 untaps two artifacts; −X puts an artifact in; −5 makes 5/5s
  await setup([], ['Sol Ring', 'Simic Signet']);
  await ev(() => { S.bf.forEach(p => p.tapped = true); });
  await put('Tezzeret the Seeker');
  check('Tezzeret enters with 4 loyalty and shows with the creatures', await state(() => S.bf.find(p => p.name === 'Tezzeret the Seeker').loyalty === 4 && document.getElementById('perms').textContent.includes('loyalty 4')));
  await menu('Tezzeret the Seeker', '+1: untap up to two'); await press('Untap them'); await T.p.waitForTimeout(100);
  check('+1: both artifacts untapped, loyalty 5', await state(() => S.bf.filter(isArtifactP).every(p => !p.tapped) && S.bf.find(p => p.name === 'Tezzeret the Seeker').loyalty === 5));
  await go(() => bfMenu(S.bf.find(p => p.name === 'Tezzeret the Seeker').uid));
  check('One loyalty ability a turn', await state(() => ![...document.querySelectorAll('#sheetButtons button')].some(b => /^[+−]\d|^−X/.test(b.textContent))));
  await press('Cancel');
  await ev(() => { S.bf.find(p => p.name === 'Tezzeret the Seeker').pwTurn = 0; });
  await menu('Tezzeret the Seeker', '−X'); await ev(() => { document.getElementById('tezX').value = 3; }); await press('Search');
  check('−3 asks for an artifact with mana value 3 or less', (await T.title()).startsWith('Tezzeret the Seeker: find an artifact card with mana value 3'));
  await pick('Cloudstone Curio'); await press('Take it'); await T.p.waitForTimeout(100);
  check('Cloudstone Curio is on the battlefield, loyalty 2', await state(() => S.bf.some(p => p.name === 'Cloudstone Curio') && S.bf.find(p => p.name === 'Tezzeret the Seeker').loyalty === 2));
  await ev(() => { const t = S.bf.find(p => p.name === 'Tezzeret the Seeker'); t.pwTurn = 0; t.loyalty = 5; });
  await menu('Tezzeret the Seeker', '−5');
  check('−5: Sol Ring is a 5/5 artifact creature; Tezzeret died with no loyalty', await state(() => { const s = S.bf.find(p => p.name === 'Sol Ring'); return isCreatureP(s) && power(s) === 5 && !S.bf.some(p => p.name === 'Tezzeret the Seeker') && S.gy.includes('Tezzeret the Seeker'); }));

  // Tezzeret, Cruel Captain: a loyalty counter per artifact entering; 0 untaps; −3 finds a 1-drop artifact; −7 emblem
  await setup(['Simic Signet'], ['Tezzeret, Cruel Captain', 'Forest', 'Forest']);
  await ev(() => { S.bf[0].loyalty = 4; });
  await go(() => cast('Simic Signet', 'hand')); await T.p.waitForTimeout(150); await T.resolveAll(); await T.p.waitForTimeout(100);
  check('An artifact entered: loyalty 5', await state(() => S.bf[0].loyalty === 5));
  await ev(() => { addTreasure(1); }); await go(() => settle()); await T.p.waitForTimeout(100);
  check('A Treasure counts too: loyalty 6', await state(() => S.bf[0].loyalty === 6));
  await menu('Tezzeret, Cruel Captain', '−3'); await pick('Expedition Map'); await press('Take it');
  check('−3 found Expedition Map', await state(() => S.hand.includes('Expedition Map') && S.bf[0].loyalty === 3));
  await ev(() => { const t = S.bf[0]; t.pwTurn = 0; t.loyalty = 8; });
  await menu('Tezzeret, Cruel Captain', '−7');
  check('−7: an emblem', await state(() => S.tezEmblem === 1 && S.bf[0].loyalty === 1));
  await go(() => combat()); await T.p.waitForTimeout(150); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Beginning of combat: three counters make Simic Signet a 3/3 Robot', await state(() => { const s = S.bf.find(p => p.name === 'Simic Signet'); return s.robot && isCreatureP(s) && power(s) === 3; }), await state(() => document.getElementById('sheetTitle').textContent));
  await close();

  // Memory Jar: hands are exiled, everyone draws seven, the old hands come back at the end step
  await setup(['Forest', 'Island'], ['Memory Jar']);
  await menu('Memory Jar', '{T}, sacrifice: each player');
  check('Seven new cards; opponents have seven', await state(() => S.hand.length === 7 && !S.hand.includes('Island') && S.opp.every(o => o.hand === 7) && S.gy.includes('Memory Jar')));
  await ev(() => { S.opp[0].hand = 7; });
  await go(() => nextTurn()); await T.p.waitForTimeout(250); await close();
  check('At the end step the seven were discarded and the old hand came back (plus the draw)', await state(() => S.hand.includes('Forest') && S.hand.includes('Island') && S.hand.length === 3 && S.gy.length >= 8), await state(() => JSON.stringify(S.hand)));

  // Expedition Map and Urza's Cave
  await setup([], ['Expedition Map', 'Forest', 'Forest']);
  await menu('Expedition Map', '{2}, {T}, sacrifice'); await pick('Yavimaya'); await press('Take it');
  check('Expedition Map found Yavimaya', await state(() => S.hand.includes('Yavimaya, Cradle of Growth') && S.gy.includes('Expedition Map')));
  await setup([], ["Urza's Cave", 'Forest', 'Forest', 'Forest']);
  await menu("Urza's Cave", '{3}, {T}, sacrifice');   await ev(() => { [...document.querySelectorAll('#sheetBody .pick')].find(b => b.textContent.includes('Hedge Maze')).click(); }); await press('Take it'); await T.p.waitForTimeout(150);
  await close();
  check("Urza's Cave put Hedge Maze onto the battlefield tapped", await state(() => S.bf.some(p => p.name === 'Hedge Maze' && p.tapped) && S.gy.includes("Urza's Cave")));

  // Fight Rigging: hideaway 5, a counter each combat, the card free with power 7
  await setup([], ['Woodland Bellower']);
  await ev(() => { S.lib = ['Forest', 'Ashaya, Soul of the Wild', 'Island', 'Island', 'Island', ...S.lib.filter(n => n !== 'Ashaya, Soul of the Wild')]; });
  await put('Fight Rigging');
  check('Hideaway looks at five', (await T.title()).startsWith('Fight Rigging: hideaway'));
  await pick('Ashaya'); await press('Exile it');
  check('Ashaya hidden, the rest on the bottom', await state(() => S.ex.some(e => e.n === 'Ashaya, Soul of the Wild' && e.hidden) && S.lib.slice(-4).includes('Forest')));
  await go(() => combat()); await T.p.waitForTimeout(150);
  await T.resolveAll(); await T.p.waitForTimeout(150);
  check('A counter made Bellower 7/5, so it offers Ashaya free', await state(() => power(S.bf.find(p => p.name === 'Woodland Bellower')) === 7) && (await T.title()).startsWith('Fight Rigging: you control a creature with power 7'));
  await press('Play it free'); await T.resolveAll(); await T.p.waitForTimeout(200);
  check('Ashaya was cast free from exile', await state(() => S.bf.some(p => p.name === 'Ashaya, Soul of the Wild') && S.turnLog.some(e => e.a === 'cast' && e.cost === 'Fight Rigging')));

  // The Legend of Kyoshi: draw for the greatest power, earthbend X as an Island, then Avatar Kyoshi
  await setup(['Forest', 'Island'], ['Woodland Bellower', 'Forest']);
  await put('The Legend of Kyoshi // Avatar Kyoshi');
  check('Chapter I drew six (Bellower is 6/5)', await state(() => S.hand.length === 8));
  await ev(() => { S.hand = ['Forest', 'Island', 'Sol Ring']; });
  await go(() => nextTurn()); await T.p.waitForTimeout(350);
  check('Chapter II earthbent the only land with 4 counters (the hand after the draw)', await state(() => S.turnLog.some(e => e.a === 'earthbend' && e.counters === 4)));
  check('The Forest is a 4/4 creature land and an Island', await state(() => { const f = S.bf.find(p => p.earth); return f && power(f) === 4 && landTypesP(f).includes('I') && sourceColors(f).includes('U'); }));
  await go(() => nextTurn()); await T.p.waitForTimeout(250); await close(); await T.p.waitForTimeout(150);
  check('Chapter III: Avatar Kyoshi, a 5/4 legendary creature', await state(() => { const k = S.bf.find(p => p.name === 'The Legend of Kyoshi // Avatar Kyoshi'); return k && k.flipped && isCreatureP(k) && power(k) === 5; }));

  // Crop Rotation: sacrifice a land, put any land onto the battlefield
  await setup(['Crop Rotation'], ['Forest']);
  await go(() => cast('Crop Rotation', 'hand')); await T.p.waitForTimeout(150);
  await go(() => resolveTop()); await T.p.waitForTimeout(100);
  check('Crop Rotation sacrificed the Forest (it also paid G) and searches', await state(() => S.gy.includes('Forest')) && (await T.title()).startsWith('Crop Rotation: put a land card'));
  await pick('Yavimaya'); await press('Take it'); await T.p.waitForTimeout(100);
  check('Yavimaya is on the battlefield', await state(() => S.bf.some(p => p.name === 'Yavimaya, Cradle of Growth')));

  // Summoner's Pact: a green creature now, {2}{G}{G} at the next upkeep
  await setup(["Summoner's Pact"], ['Forest', 'Forest', 'Forest', 'Forest']);
  await go(() => cast("Summoner's Pact", 'hand')); await go(() => resolveTop()); await T.p.waitForTimeout(100);
  await pick('Woodland Bellower'); await press('Take it');
  check('Pact found Woodland Bellower and waits for your upkeep', await state(() => S.hand.includes('Woodland Bellower') && S.pacts.length === 1));
  await go(() => nextTurn()); await T.p.waitForTimeout(250);
  await ev(() => { if (/played/.test(document.getElementById('sheetTitle').textContent)) closeSheet(null); }); await T.p.waitForTimeout(150);
  check('The upkeep asks for {2GG}', (await T.title()).startsWith("Summoner's Pact: pay {2GG}"));
  await press('Pay {2GG}'); await T.p.waitForTimeout(100);
  check('Paid with four Forests; the game goes on', await state(() => S.bf.filter(p => p.tapped).length === 4 && S.phase === 'play' && !S.pacts.length));

  // Tidal Bore: return an Island instead of paying, tap or untap a creature
  await setup(['Tidal Bore'], ['Breeding Pool', 'Woodland Bellower']);
  await ev(() => { S.bf[1].tapped = true; });
  await go(() => handMenu('Tidal Bore')); await press('Return an Island');
  await pick('Woodland Bellower'); await press('Target it'); await T.resolveAll(); await T.p.waitForTimeout(100);
  check('Breeding Pool returned, Bellower untapped', await state(() => S.hand.includes('Breeding Pool') && !S.bf.find(p => p.name === 'Woodland Bellower').tapped));

  // Legolas's Quick Reflexes untaps a creature
  await setup(["Legolas's Quick Reflexes"], ['Forest', 'Woodland Bellower']);
  await ev(() => { S.bf[1].tapped = true; });
  await go(() => cast("Legolas's Quick Reflexes", 'hand')); await pick('Woodland Bellower'); await press('Target it'); await T.resolveAll(); await T.p.waitForTimeout(100);
  check("Legolas's Quick Reflexes untapped Bellower", await state(() => !S.bf.find(p => p.name === 'Woodland Bellower').tapped));

  // Coveted Jewel: draw three, taps for three of one colour
  await setup([], []);
  await put('Coveted Jewel');
  check('Coveted Jewel drew three and taps for three', await state(() => S.hand.length === 3 && srcAmt(S.bf[0]) === 3));

  // Trade Routes, Oboro, Fountainport, The Gold Saucer, Bonders' Enclave
  await setup(['Forest'], ['Trade Routes', 'Island', 'Island', 'Island']);
  await menu('Trade Routes', '{1}: return a land'); await press('Return it'); await T.p.waitForTimeout(100);
  check('Trade Routes returned a land', await state(() => S.hand.filter(n => n === 'Island').length === 1));
  await menu('Trade Routes', '{1}, discard a land card'); await pick('Forest'); await press('Discard it'); await T.p.waitForTimeout(100);
  check('Trade Routes: a land discarded for a card', await state(() => S.gy.includes('Forest') || S.gy.includes('Island')) && await state(() => S.turnStats.draws === 1));
  await setup([], ['Oboro, Palace in the Clouds', 'Forest']);
  await menu('Oboro, Palace in the Clouds', '{1}: return Oboro');
  check('Oboro went back to hand', await state(() => S.hand.includes('Oboro, Palace in the Clouds')));
  await setup([], ['Fountainport', ...Array(4).fill('Forest')]);
  await menu('Fountainport', '{4}, {T}: a Treasure');
  check('Fountainport made a Treasure', await state(() => S.treasures === 1));
  await ev(() => { S.bf.forEach(p => p.tapped = false); });
  await menu('Fountainport', '{2}, {T}, sacrifice a token'); await T.p.waitForTimeout(100);
  check('The Treasure paid for the draw sacrifice', await state(() => S.treasures === 0 && S.hand.length === 1));
  await setup([], ['The Gold Saucer', 'Forest', 'Forest']);
  await menu('The Gold Saucer', '{2}, {T}: flip a coin');
  check('The Gold Saucer flipped', await state(() => S.turnLog.some(e => e.a === 'The Gold Saucer' && e.flip)));
  await setup([], ["Bonders' Enclave", 'Forest', 'Forest', 'Forest']);
  await go(() => bfMenu(S.bf[0].uid));
  check("Bonders' Enclave can't draw without a power 4 creature", await state(() => ![...document.querySelectorAll('#sheetButtons button')].some(b => b.textContent.startsWith('{3}, {T}: draw'))));
  await press('Cancel');
  await ev(() => { S.bf.push({ uid: S.nextId++, name: 'Woodland Bellower', tapped: false }); });
  await menu("Bonders' Enclave", '{3}, {T}: draw');
  check('With Bellower it draws', await state(() => S.hand.length === 1));

  // Shifting Woodland: with delirium it copies a permanent card in the graveyard until end of turn
  await setup([], ['Shifting Woodland', 'Forest', 'Forest', 'Island', 'Island']);
  await ev(() => { S.gy = ['Woodland Bellower', 'Sol Ring', 'Crop Rotation', 'Forest']; });
  await menu('Shifting Woodland', 'Delirium'); await pick('Woodland Bellower'); await press('Copy it'); await T.p.waitForTimeout(100);
  check('Shifting Woodland is a copy of Woodland Bellower', await state(() => { const p = S.bf.find(q => q.name === 'Shifting Woodland'); return ident(p) === 'Woodland Bellower' && isCreatureP(p); }));
  await go(() => nextTurn()); await T.p.waitForTimeout(250); await close();
  check('It is a land again next turn', await state(() => { const p = S.bf.find(q => q.name === 'Shifting Woodland'); return !p.copyOf && isLandP(p); }));

  // Staff of Compleation: destroy one of yours, proliferate; Leyline of Abundance's counters
  await setup([], ['Staff of Compleation', 'Woodland Bellower', 'Tezzeret the Seeker', 'Leyline of Abundance', ...Array(8).fill('Forest')]);
  await ev(() => { S.bf[1].counters = 1; S.bf[2].loyalty = 3; });
  await menu('Staff of Compleation', '{T}, 3 life: proliferate');
  check('Proliferate: Bellower +1 counter, Tezzeret +1 loyalty', await state(() => S.bf[1].counters === 2 && S.bf[2].loyalty === 4 && S.life === 37));
  await menu('Leyline of Abundance', '{6}{G}{G}');
  check('Leyline: a counter on each creature', await state(() => S.bf[1].counters === 3));
  await ev(() => { S.bf[0].tapped = false; });
  await menu('Staff of Compleation', '{T}, 1 life: destroy'); await pick('Woodland Bellower'); await press('Destroy it'); await T.p.waitForTimeout(100);
  check('Staff destroyed Woodland Bellower', await state(() => S.gy.includes('Woodland Bellower') && S.life === 36));
  await T.done();
})();
