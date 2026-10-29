// The Goblin package around Zada: token spells, ETB and dies tokens, Mogg War Marshal's echo, both Krenkos, Young
// Pyromancer, Battle Hymn and Brightstone Ritual, Roaming Throne, the Lieutenants, Dragonmaster Outcast, Dwarven
// Mine, the four Equipment, Thought Vessel and the can't-block cantrips.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = async (h, b) => { await T.setup(h, b, 'q'); await ev(() => { S.lib = S.lib.filter(n => n !== 'Reforge the Soul'); }); };
  const resolve = async () => { await go(() => { resolveTop(); }); };
  const menu = async (name, btn) => { await go(n => bfMenu(S.bf.find(p => p.name === n).uid), name); await press(btn); };
  const count = n => state(n => S.bf.filter(p => p.name === n).length, n);

  // token spells
  await setup(['Dragon Fodder', "Krenko's Command", 'Hordeling Outburst', "Ral's Reinforcements", 'Forbidden Friendship', 'Rally at the Hornburg'], Array(13).fill('Mountain'));
  for (const n of ['Dragon Fodder', "Krenko's Command", 'Hordeling Outburst']) { await go(n => cast(n, 'hand'), n); await resolve(); }
  check('Fodder 2, Command 2, Outburst 3: seven Goblins', (await count('Goblin Token')) === 7);
  await go(() => cast("Ral's Reinforcements", 'hand')); await resolve();
  check('Two 1/1 Elementals', (await count('Elemental Token')) === 2);
  await go(() => cast('Forbidden Friendship', 'hand')); await resolve();
  check('A hasty Dinosaur and a Human Soldier', await state(() => { const d = S.bf.find(p => p.name === 'Dinosaur Token'); return d && !sick(d) && S.bf.some(p => p.name === 'Human Soldier Token' && sick(p)); }));
  await go(() => cast('Rally at the Hornburg', 'hand')); await resolve();
  check('Rally: two more Soldiers, and every Human has haste now', await state(() => S.bf.filter(p => p.name === 'Human Soldier Token').length === 3 && S.bf.filter(p => p.name === 'Human Soldier Token').every(p => !sick(p))));

  // ETB tokens, and Mogg War Marshal's dies trigger and echo
  await setup(['Beetleback Chief', 'Goblin Instigator', 'Mogg War Marshal'], Array(8).fill('Mountain'));
  for (const n of ['Beetleback Chief', 'Goblin Instigator', 'Mogg War Marshal']) { await go(n => cast(n, 'hand'), n); await T.p.waitForTimeout(150); }
  check('Beetleback 2 + Instigator 1 + Marshal 1 = four Goblin tokens', (await count('Goblin Token')) === 4);
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(200);
  check("Next upkeep the Marshal's echo is on the stack", await state(() => S.stack.some(x => x.eff === 'echo')));
  await resolve(); await press('Sacrifice it'); await T.p.waitForTimeout(100); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Sacrificed: its dies trigger made a fifth Goblin', await state(() => !S.bf.some(p => p.name === 'Mogg War Marshal') && S.bf.filter(p => p.name === 'Goblin Token').length === 5));

  // Krenko, Mob Boss doubles the Goblins; Tin Street Kingpin grows as it attacks
  await setup([], ['Krenko, Mob Boss', 'Goblin Token', 'Goblin Token']);
  await menu('Krenko, Mob Boss', '{T}: a Goblin for each Goblin you control (3)');
  check('Three more Goblins', (await count('Goblin Token')) === 5);
  await setup([], ['Krenko, Tin Street Kingpin']);
  await go(() => combat()); await press('Attack'); await resolve(); await go(() => combat());
  check('Kingpin: a counter (2/3), two Goblins, 2 damage', await state(() => power(S.bf[0]) === 2 && S.bf.filter(p => p.name === 'Goblin Token').length === 2 && S.opp[0].life === 38));

  // Young Pyromancer, Battle Hymn, Brightstone Ritual
  await setup(['Battle Hymn', 'Brightstone Ritual'], ['Young Pyromancer', 'Goblin Token', 'Mountain', 'Mountain']);
  await go(() => cast('Battle Hymn', 'hand')); await T.resolveAll(); await T.p.waitForTimeout(100);
  check('Pyromancer made an Elemental first, then Battle Hymn counted three creatures', await state(() => S.bf.some(p => p.name === 'Elemental Token') && S.pool.R === 3), await state(() => S.pool.R));
  await go(() => cast('Brightstone Ritual', 'hand')); await T.resolveAll(); await T.p.waitForTimeout(100);
  check('Brightstone Ritual: R for the one Goblin (R3 - R + R)', await state(() => S.pool.R === 3));

  // Roaming Throne naming Goblin doubles Beetleback Chief's ETB
  await setup(['Roaming Throne', 'Beetleback Chief'], Array(8).fill('Mountain'));
  await go(() => cast('Roaming Throne', 'hand')); await T.p.waitForTimeout(150);
  check('The Throne asks for a type, Goblin first', (await T.title()).startsWith('Roaming Throne: choose a creature type') && await state(() => document.getElementById('rtT').value === 'Goblin'));
  await press('Choose it');
  await go(() => cast('Beetleback Chief', 'hand')); await T.p.waitForTimeout(150); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Two ETB triggers: four Goblins', (await count('Goblin Token')) === 4);

  // Lieutenants at the beginning of combat need the commander out; Siege-Gang pings
  await setup([], ['Loyal Apprentice', 'Siege-Gang Lieutenant', 'Mountain', 'Mountain']);
  await go(() => combat()); await T.p.waitForTimeout(100);
  check('Without the commander no Lieutenant trigger', await state(() => !S.stack.length));
  await press('Cancel');
  await setup([], ['Q, Stacking the Deck', 'Loyal Apprentice', 'Siege-Gang Lieutenant', 'Mountain', 'Mountain']);
  await ev(() => { S.cmdZone = []; });
  await go(() => combat()); await T.p.waitForTimeout(100); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('With Q out: a hasty Thopter and two hasty Goblins', await state(() => S.bf.some(p => p.name === 'Thopter Token' && !sick(p) && isArtifactP(p)) && S.bf.filter(p => p.name === 'Goblin Token' && !sick(p)).length === 2));
  await ev(() => { S.combat = null; });
  await menu('Siege-Gang Lieutenant', '{2}, sacrifice a Goblin'); await pick('Goblin'); await press('Sacrifice it'); await press('Target it');
  check('A Goblin sacrificed for 1 damage', await state(() => S.opp[0].life === 39 && S.bf.filter(p => p.name === 'Goblin Token').length === 1));

  // Dragonmaster Outcast at upkeep with six lands
  await setup([], ['Dragonmaster Outcast', ...Array(6).fill('Mountain')]);
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(200); await T.resolveAll(); await T.p.waitForTimeout(100);
  check('A 5/5 flying Dragon', await state(() => S.bf.some(p => p.name === 'Dragon Token' && power(p) === 5)));

  // Dwarven Mine: tapped with two other Mountains, untapped with a Dwarf with three
  await setup(['Dwarven Mine'], ['Mountain', 'Mountain']);
  await go(() => handMenu('Dwarven Mine')); await press('Play land');
  check('Two other Mountains: tapped, no Dwarf', await state(() => S.bf.find(p => p.name === 'Dwarven Mine').tapped && !S.bf.some(p => p.name === 'Dwarf Token')));
  await setup(['Dwarven Mine'], ['Mountain', 'Mountain', 'Mountain']);
  await go(() => handMenu('Dwarven Mine')); await press('Play land');
  check('Three: untapped and a 1/1 Dwarf', await state(() => !S.bf.find(p => p.name === 'Dwarven Mine').tapped && S.bf.some(p => p.name === 'Dwarf Token')));

  // Equipment: Helm, Shield, Boots, and Skullclamp drawing two when a 1/1 dies to it
  await setup([], ["Champion's Helm", 'Mirror Shield', 'Swiftfoot Boots', 'Skullclamp', 'Beetleback Chief', 'Goblin Token', ...Array(5).fill('Mountain')]);
  await ev(() => { S.bf.find(p => p.name === 'Beetleback Chief').etbTurn = S.turn; });
  await menu("Champion's Helm", 'Equip {1}'); await pick('Beetleback'); await press('Equip it');
  await menu('Mirror Shield', 'Equip {2}'); await pick('Beetleback'); await press('Equip it');
  check('Helm and Shield: Beetleback Chief is 4/6', await state(() => { const b = S.bf.find(p => p.name === 'Beetleback Chief'); return power(b) === 4 && toughness(b) === 6; }));
  check('The Equipment tiles say what they\'re on', await state(() => /on Beetleback Chief/.test(document.getElementById('arts').textContent)));
  await menu('Swiftfoot Boots', 'Equip {1}'); await pick('Beetleback'); await press('Equip it');
  check('Swiftfoot Boots: the Chief that just arrived has haste', await state(() => !sick(S.bf.find(p => p.name === 'Beetleback Chief'))));
  await menu('Skullclamp', 'Equip {1}'); await pick('Goblin'); await press('Equip it'); await T.p.waitForTimeout(100);
  check('The clamped 1/1 Goblin died and Skullclamp drew two', await state(() => !S.bf.some(p => p.name === 'Goblin Token') && S.hand.length === 2), await state(() => JSON.stringify({ hand: S.hand.length, st: S.stack.map(x => x.eff) })));
  await ev(() => { S.stack.push({ id: S.nextId++, kind: 'spell', name: 'Stun' }); });
  await menu('Skullclamp', 'Equip {1}');
  check('Equip waits for an empty stack', await state(() => /sorcery speed/.test(document.getElementById('banner').textContent)));

  // Thought Vessel: no maximum hand size
  await setup([], ['Thought Vessel']);
  await ev(() => { for (let i = 0; i < 9; i++) S.hand.push('Mountain'); });
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(200);
  check('Ten cards kept through the cleanup step', await state(() => S.turn === 2 && S.hand.length === 10) && !(await T.sheet()).open);

  // the can't-block and must-attack cantrips draw and note their effect
  await setup(['Stun', 'Renegade Tactics', 'Boiling Blood'], ['Goblin Token', ...Array(6).fill('Mountain')]);
  for (const n of ['Stun', 'Renegade Tactics', 'Boiling Blood']) { await go(n => cast(n, 'hand'), n); await pick("An opponent's creature"); await press('Target it'); await resolve(); }
  check('Three cards drawn, three notes in the log', await state(() => S.hand.length === 3 && S.turnLog.filter(e => e.a === 'effect' && /can't block|attacks this turn/.test(e.gains || '')).length === 3));
  await T.done();
})();
