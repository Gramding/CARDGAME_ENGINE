// The rest of the Nephilim list: cards that react to opponents (Smothering Tithe, Tataru Taru, Gleaming
// Splendor, Esper Sentinel, The Queen of Dale, Lotho, The Cabbage Merchant), Spellseeker, Silence and
// Orim's Chant, Boseiju's channel, Deathrite Shaman, exalted and vigilance in combat.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'nephilim');
  const resolve = async () => { await go(() => { resolveTop(); }); };

  // Smothering Tithe: an opponent's draw makes a Treasure unless they pay
  await setup([], ['Smothering Tithe']);
  await go(() => bfMenu(S.bf[0].uid)); await press('Opponent 1 drew a card'); await press("They don't");
  check('Smothering Tithe made a Treasure', await state(() => S.treasures === 1));

  // Tataru Taru: you draw, the opponent draws, and that off-turn draw makes a tapped Treasure (once a turn)
  await setup(['Tataru Taru'], ['Tundra', 'Savannah', 'Smothering Tithe']);
  const h0 = await state(() => S.hand.length);
  await go(() => cast('Tataru Taru', 'hand')); await T.p.waitForTimeout(200);
  await press('They draw'); await press("They don't");
  check('Tataru: you drew, a tapped Treasure, and a Tithe Treasure', await state(h => S.hand.length === h - 1 + 1 && S.tTreasures === 1 && S.treasures === 1, h0), await state(() => JSON.stringify({ h: S.hand.length, t: S.treasures, tt: S.tTreasures })));
  check('The tapped Treasure shows next to the count', await state(() => document.getElementById('treas').textContent.includes('+1')));
  await go(() => bfMenu(S.bf.find(p => p.name === 'Tataru Taru').uid)); await press('Opponent 1 drew'); await press("They don't");
  check("Tataru's Treasure only once a turn", await state(() => S.tTreasures === 1 && S.treasures === 2));
  await ev(() => nextTurn()); await T.p.waitForTimeout(150);
  check('Tapped Treasures untap on your turn', await state(() => S.treasures === 3 && !S.tTreasures));

  // Gleaming Splendor: an opponent's second draw this turn
  await setup([], ['Gleaming Splendor', 'Tundra', 'Savannah', 'Scrubland']);
  await go(() => bfMenu(S.bf[0].uid)); await press('{2}{W}');
  await go(() => bfMenu(S.bf[0].uid)); await press('Opponent 1 drew');
  check('Second opponent draw made a Treasure', await state(() => S.treasures === 1 && S.oppDraws.n[0] === 2));

  // Esper Sentinel, The Queen of Dale, Lotho, The Cabbage Merchant
  await setup(['Island'], ['Esper Sentinel', 'The Queen of Dale', 'Lotho, Corrupt Shirriff', 'The Cabbage Merchant']);
  await go(() => bfMenu(S.bf[0].uid)); await press('An opponent\'s first noncreature');
  check('Esper Sentinel drew', await state(() => S.hand.length === 2));
  await ev(() => { S.lib.unshift('Silence'); });
  await go(() => bfMenu(S.bf[1].uid)); await press('An opponent cast their first'); await pick('Silence'); await press('Discard it');
  check('Recruit discarding a nonland made a 1/1 Human Soldier', await state(() => S.bf.some(p => p.name === 'Human Soldier Token' && power(p) === 1)));
  await go(() => bfMenu(S.bf[2].uid)); await press('An opponent cast their second');
  check('Lotho: lose 1, Treasure', await state(() => S.life === 39 && S.treasures === 1));
  for (let i = 0; i < 2; i++) { await go(() => bfMenu(S.bf.find(p => p.name === 'The Cabbage Merchant').uid)); await press('An opponent cast a noncreature'); }
  await go(() => bfMenu(S.bf.find(p => p.name === 'The Cabbage Merchant').uid)); await press('Tap two Foods'); await press('Green');
  check('Two Foods tapped for one green', await state(() => S.pool.G === 1 && S.bf.filter(p => p.name === 'Food Token' && p.tapped).length === 2));

  // Lotho on your own second spell
  await setup(['Silence', 'Defiant Strike'], ['Lotho, Corrupt Shirriff', 'Tundra', 'Savannah']);
  await go(() => cast('Silence', 'hand')); await go(() => cast('Defiant Strike', 'hand')); await press('Target it');
  check('Your second spell triggers Lotho', await state(() => S.life === 39 && S.treasures === 1));

  // Orim's Chant kicked costs WW
  await setup(["Orim's Chant"], ['Tundra', 'Savannah']);
  await go(() => cast("Orim's Chant", 'hand')); await press('Kick it');
  check("Kicked Orim's Chant tapped both lands", await state(() => S.bf.every(p => p.tapped) && S.stack.some(x => x.kicked)));
  await resolve();
  check("Orim's Chant logged its effect", await state(() => S.turnLog.some(e => e.c === "Orim's Chant" && /attack/.test(e.note))));

  // Spellseeker finds a cheap instant or sorcery
  await setup(['Spellseeker'], ['Tropical Island', 'Tundra', 'Volcanic Island']);
  await go(() => cast('Spellseeker', 'hand')); await T.p.waitForTimeout(200);
  await pick('Cerulean Wisps'); await press('Take it');
  check('Spellseeker found Cerulean Wisps', await state(() => S.hand.includes('Cerulean Wisps')));

  // Boseiju's channel, cheaper with a legend out
  await setup(['Boseiju, Who Endures'], ['Lotho, Corrupt Shirriff', 'Taiga']);
  await go(() => handMenu('Boseiju, Who Endures')); await press('Channel');
  check('Boseiju channelled for G with a legend out', await state(() => S.gy.includes('Boseiju, Who Endures') && S.bf.find(p => p.name === 'Taiga').tapped));

  // Deathrite Shaman's three abilities
  await setup([], ['Deathrite Shaman', 'Bayou']);
  await ev(() => { S.gy = ['Polluted Delta', 'Silence', 'Llanowar Elves']; });
  await go(() => bfMenu(S.bf[0].uid)); await press('Exile a land card'); await press('Exile it'); await press('Black');
  check('Deathrite exiled Polluted Delta for B', await state(() => S.pool.B === 1 && S.ex.some(e => e.n === 'Polluted Delta') && S.bf[0].tapped));
  await ev(() => { S.bf[0].tapped = false; S.pool.B = 0; });
  await go(() => bfMenu(S.bf[0].uid)); await press('{B}, exile'); await press('Exile it');
  check('Deathrite drained each opponent for 2', await state(() => S.opp.every(o => o.life === 38)));

  // exalted and vigilance
  await setup([], ['Ink-Treader Nephilim', 'Noble Hierarch', 'Ignoble Hierarch', 'Faeburrow Elder']);
  await ev(() => { S.target = 0; });
  await go(() => combat()); await T.p.waitForTimeout(100);
  await ev(() => { [...document.querySelectorAll('#sheetBody .pick.sel')].forEach(b => b.click()); [...document.querySelectorAll('#sheetBody .pick')][0].click(); });
  await press('Attack');
  check('Ink-Treader attacking alone gets +2/+2 from two exalted', await state(() => { const p = S.bf.find(q => q.name === 'Ink-Treader Nephilim'); return power(p) === 5 && toughness(p) === 5; }));
  await go(() => combat());
  check('Exalted damage: 5 to opponent 1', await state(() => S.opp[0].life === 35));
  await setup([], ['Faeburrow Elder', 'Noble Hierarch']);
  await go(() => combat()); await T.p.waitForTimeout(100);
  await ev(() => { [...document.querySelectorAll('#sheetBody .pick.sel')].forEach(b => b.click()); [...document.querySelectorAll('#sheetBody .pick')][0].click(); });
  await press('Attack');
  check('Faeburrow Elder attacks without tapping (vigilance)', await state(() => !S.bf.find(p => p.name === 'Faeburrow Elder').tapped));
  await T.done();
})();
