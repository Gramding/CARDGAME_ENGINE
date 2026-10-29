// Zada, Hedron Grinder and the spells it copies: cantrips, threaten effects (Traitorous Greed, Involuntary Employment,
// Press into Service, Bond of Passion), Flick a Coin and Spikefield Hazard at your own creatures, Twinflame, Siege Smash,
// Spark of Creativity, Fists of Flame, Ancestral Anger, Felonious Rage, Otherworldly Outburst and the impulse pumps.
const { table, check } = require('./lib');
const ZADA = 'Zada, Hedron Grinder';
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  // the mono-red Q list as the table (Reforge's miracle would stop a turn pass); Zada is played from the battlefield
  const setup = async (h, b) => { await T.setup(h, b, 'q'); await ev(() => { S.lib = S.lib.filter(n => n !== 'Reforge the Soul'); }); };
  const resolve = async () => { await go(() => { resolveTop(); }); };
  const gob = k => Array(k).fill('Goblin Token');

  // Accelerate on Zada: a copy for each other creature you control, each giving haste and a card
  await setup(['Accelerate'], [ZADA, ...gob(3), 'Mountain', 'Mountain']);
  await ev(() => { S.bf.forEach(p => { p.etbTurn = S.turn; }); });
  const h0 = await state(() => S.hand.length);
  await go(() => cast('Accelerate', 'hand'));
  check('Zada is the preselected target', await state(() => document.querySelector('#sheetBody .pick.sel').textContent.startsWith('Zada')));
  await press('Target it');
  check("Zada's trigger is above the spell", await state(() => S.stack[S.stack.length - 1].eff === 'zada'));
  await resolve();
  check('Three copies, one per Goblin, none for opponents', await state(() => S.stack.filter(x => x.kind === 'copy' && x.name === 'Accelerate').length === 3));
  await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Four cards drawn and every creature can attack this turn', await state(h => S.hand.length === h - 1 + 4 && S.bf.filter(isCreatureP).every(p => !sick(p)), h0), await state(() => S.hand.length));

  // each copy is a copy of an instant or sorcery: magecraft triggers for it
  await setup(['Accelerate'], [ZADA, 'Storm-Kiln Artist', ...gob(2), 'Mountain', 'Mountain']);
  await go(() => cast('Accelerate', 'hand')); await press('Target it');
  check('Casting it: one Storm-Kiln trigger', await state(() => S.stack.filter(x => x.eff === 'kiln').length === 1));
  await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Three copies (Kiln and two Goblins), three more Kiln triggers: four Treasures', await state(() => S.treasures === 4 && S.turnLog.some(e => e.a === 'Zada' && e.copies === 3)), await state(() => S.treasures));

  // Traitorous Greed through Zada: every resolution untaps and adds RR (red is the only colour in this deck)
  await setup(['Traitorous Greed'], [ZADA, ...gob(3), ...Array(4).fill('Mountain')]);
  await ev(() => { S.bf.filter(p => p.name === 'Goblin Token').forEach(p => { p.tapped = true; }); });
  await go(() => cast('Traitorous Greed', 'hand')); await press('Target it'); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Four resolutions: RRRRRRRR, and the tapped Goblins untapped', await state(() => S.pool.R === 8 && S.bf.filter(p => p.name === 'Goblin Token').every(p => !p.tapped)), await state(() => S.pool.R));

  // Involuntary Employment on an opponent's creature: a Treasure and a note to take it by hand
  await setup(['Involuntary Employment'], Array(4).fill('Mountain'));
  await go(() => cast('Involuntary Employment', 'hand')); await pick("An opponent's creature"); await press('Target it'); await resolve();
  await press('Skip');   // not naming the creature leaves it to you
  check('A Treasure and the steal note', await state(() => S.treasures === 1 && S.turnLog.some(e => e.c === 'Involuntary Employment' && /opponent's creature until end of turn/.test(e.note))));

  // Flick a Coin aimed at Zada pings each of your creatures, with a Treasure and a card for each
  await setup(['Flick a Coin'], [ZADA, ...gob(2), 'Mountain', 'Mountain', 'Mountain']);
  const h1 = await state(() => S.hand.length);
  await go(() => cast('Flick a Coin', 'hand')); await pick('Zada'); await press('Target it');
  await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Both Goblins died, Zada took 1, three Treasures and three cards', await state(h => !S.bf.some(p => p.name === 'Goblin Token') && S.treasures === 3 && S.hand.length === h - 1 + 3 && dmgOf(S.bf.find(p => p.name === 'Zada, Hedron Grinder')) === 1, h1));

  // Twinflame aimed at Zada: a hasty token copy of each of your creatures
  await setup(['Twinflame'], [ZADA, 'Beetleback Chief', 'Mountain', 'Mountain']);
  await go(() => cast('Twinflame', 'hand'));
  check('With Zada out, Twinflame asks for its target as it is cast', (await T.title()).startsWith('Twinflame: target which creature'));
  await press('Target it'); await T.resolveAll(); await T.p.waitForTimeout(200);
  await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Tokens of Zada and Beetleback Chief, whose ETB made two Goblins', await state(() => S.bf.filter(p => p.token && p.temp).length === 2 && S.bf.filter(p => p.name === 'Goblin Token').length === 2), await state(() => S.bf.map(p => p.name + (p.token ? '*' : '')).join()));

  // Bond of Passion always has a second target ("any other target"), so Zada never copies it, and the page says why
  await setup(['Bond of Passion'], [ZADA, ...gob(2), ...Array(6).fill('Mountain')]);
  await ev(() => { S.bf[0].tapped = true; });
  await go(() => cast('Bond of Passion', 'hand')); await press('Target it');
  check('The 2 damage target is chosen as it is cast, and Zada is not offered for it', (await T.title()).startsWith('Bond of Passion: 2 damage to any other target') && await state(() => ![...document.querySelectorAll('#sheetBody .pick')].some(b => b.textContent.startsWith('Zada'))));
  await press('Target it');
  check('No Zada trigger, and a note says why', await state(() => !S.stack.some(x => x.eff === 'zada') && /Zada doesn't copy it/.test(document.getElementById('banner').textContent) && S.stack[0].target2.kind === 'opp'), await state(() => document.getElementById('banner').textContent));
  await resolve();
  check('Zada untapped and opponent 1 took 2, with no more questions', await state(() => !S.bf[0].tapped && S.opp[0].life === 38) && !(await T.sheet()).open);

  // on an opponent's creature: it joins your side until end of turn
  await setup(['Bond of Passion'], Array(6).fill('Mountain'));
  await go(() => cast('Bond of Passion', 'hand')); await pick("An opponent's creature"); await press('Target it'); await press('Target it'); await resolve();
  check('It asks which creature you take', (await T.title()).startsWith('Bond of Passion: gain control of which'));
  await ev(() => { document.getElementById('ocName').value = 'krenko, mob boss'; }); await press('Take it');
  check('Krenko is yours, untapped and hasty, and opponent 1 took 2', await state(() => { const k = S.bf.find(p => p.name === 'Krenko, Mob Boss'); return k && k.borrowed && !k.tapped && !sick(k) && S.opp[0].life === 38; }));
  await go(() => bfMenu(S.bf.find(p => p.name === 'Krenko, Mob Boss').uid)); await press('{T}: a Goblin');
  check('Its ability works for you', await state(() => S.bf.filter(p => p.name === 'Goblin Token').length === 1));
  await ev(() => { nextTurn(); }); await T.p.waitForTimeout(200);
  check('At end of turn it goes back, not to your graveyard', await state(() => !S.bf.some(p => p.name === 'Krenko, Mob Boss') && !S.gy.includes('Krenko, Mob Boss')));

  // a copy keeps the original's damage target
  await setup(['Bond of Passion', 'Flare of Duplication'], ['Goblin Token', ...Array(9).fill('Mountain')]);
  await go(() => cast('Bond of Passion', 'hand')); await press('Target it'); await press('Target it');
  await go(() => cast('Flare of Duplication', 'hand')); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Flare copied it: 4 damage to opponent 1 and no extra target question', await state(() => S.opp[0].life === 36) && !(await T.sheet()).open, await state(() => S.opp[0].life));

  // Press into Service: support on the spell itself
  await setup(['Press into Service'], ['Goblin Token', 'Beetleback Chief', ...Array(5).fill('Mountain')]);
  await go(() => cast('Press into Service', 'hand')); await press('Target it'); await resolve();
  check('Support asks for up to two other creatures', (await T.title()).startsWith('Press into Service: support 2'));
  await ev(() => document.querySelector('#sheetBody .pick').click()); await press('Put the counters');
  check('A +1/+1 counter on the Beetleback Chief', await state(() => S.bf.find(p => p.name === 'Beetleback Chief').counters === 1));

  // Siege Smash: the artifact mode destroys, the pump mode targets
  await setup(['Siege Smash'], ['Sol Ring', 'Mountain', 'Mountain']);
  await go(() => cast('Siege Smash', 'hand'));
  check('Siege Smash asks for its mode', (await T.title()).startsWith('Siege Smash (split second): choose one'));
  await press('Destroy target artifact'); await resolve(); await press('Destroy mine');
  check('Sol Ring destroyed', await state(() => S.gy.includes('Sol Ring')));
  await setup(['Siege Smash'], ['Goblin Token', 'Mountain', 'Mountain']);
  await go(() => cast('Siege Smash', 'hand')); await press('Target creature gets'); await press('Target it'); await resolve();
  check('The Goblin is 4/3', await state(() => { const g = S.bf.find(p => p.name === 'Goblin Token'); return power(g) === 4 && toughness(g) === 3; }));

  // Spark of Creativity: play the exiled card, or deal its mana value
  await setup(['Spark of Creativity'], ['Goblin Token', 'Mountain']);
  await ev(() => { S.lib.unshift('Sol Ring'); });
  await go(() => cast('Spark of Creativity', 'hand')); await press('Target it'); await resolve();
  check('It asks: play Sol Ring or deal 1', (await T.title()).startsWith('Spark of Creativity exiled Sol Ring (mana value 1)'));
  await press('Play it this turn');
  check('Sol Ring is playable from exile this turn', await state(() => S.ex.some(e => e.n === 'Sol Ring' && e.play && e.until === S.turn)));

  // Fists of Flame counts the cards drawn this turn; Ancestral Anger counts the Angers in the graveyard
  await setup(['Fists of Flame'], ['Goblin Token', 'Mountain', 'Mountain']);
  await ev(() => { draw(2, 'test'); });
  await go(() => cast('Fists of Flame', 'hand')); await press('Target it'); await resolve();
  check('Three cards drawn this turn: the Goblin is 4/1', await state(() => power(S.bf.find(p => p.name === 'Goblin Token')) === 4));
  await setup(['Ancestral Anger'], ['Goblin Token', 'Mountain']);
  await ev(() => { S.gy = ['Ancestral Anger', 'Ancestral Anger']; });
  await go(() => cast('Ancestral Anger', 'hand')); await press('Target it'); await resolve();
  check('Two Angers in the graveyard: +3/+0', await state(() => power(S.bf.find(p => p.name === 'Goblin Token')) === 4 && S.hand.length === 1));

  // Felonious Rage and Otherworldly Outburst leave a token when the creature dies this turn
  await setup(['Felonious Rage', 'Otherworldly Outburst'], ['Goblin Token', 'Beetleback Chief', 'Mountain', 'Mountain']);
  await go(() => cast('Felonious Rage', 'hand')); await pick('Goblin'); await press('Target it'); await resolve();
  await go(() => cast('Otherworldly Outburst', 'hand')); await pick('Beetleback'); await press('Target it'); await resolve();
  await ev(() => { leaveBf(S.bf.find(p => p.name === 'Goblin Token'), 'die'); leaveBf(S.bf.find(p => p.name === 'Beetleback Chief'), 'die'); }); await T.resolveAll(); await T.p.waitForTimeout(150);
  check('A 2/2 Detective and a 3/2 Eldrazi Horror', await state(() => S.bf.some(p => p.name === 'Detective Token' && power(p) === 2) && S.bf.some(p => p.name === 'Eldrazi Horror Token' && power(p) === 3)), await state(() => S.bf.map(p => p.name).join()));

  // Titan's Strength scries; Blazing Crescendo and Haste Magic exile a card to play
  await setup(["Titan's Strength", 'Blazing Crescendo', 'Haste Magic'], ['Goblin Token', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain']);
  const top = await state(() => S.lib[0]);
  await go(() => cast("Titan's Strength", 'hand')); await press('Target it'); await resolve();
  check("Titan's Strength: +3/+1, then scry 1", await state(() => power(S.bf[0]) === 4) && (await T.title()).startsWith("Titan's Strength: scry 1"));
  await press('Put it on the bottom');
  check('The top card went to the bottom', await state(t => S.lib[S.lib.length - 1] === t, top));
  await go(() => cast('Blazing Crescendo', 'hand')); await press('Target it'); await resolve();
  await go(() => cast('Haste Magic', 'hand')); await press('Target it'); await resolve();
  check('Crescendo\'s card lasts until next turn, Haste Magic\'s until this end step; the Goblin is 10/4', await state(() => { const e = S.ex.filter(x => x.play); return e.length === 2 && e[0].until === S.turn + 1 && e[1].until === S.turn && power(S.bf[0]) === 10 && toughness(S.bf[0]) === 4; }));

  // Spikefield Hazard: a creature it kills is exiled, so Skullclamp doesn't draw
  await setup(['Spikefield Hazard // Spikefield Cave'], ['Goblin Token', 'Skullclamp', 'Mountain']);
  await ev(() => { S.bf[1].on = S.bf[0].uid; S.bf[0].counters = 1; });
  await go(() => cast('Spikefield Hazard // Spikefield Cave', 'hand')); await pick('Goblin'); await press('Target it'); await resolve();
  check('The Goblin (3/1 with its counter and the clamp) was exiled, so Skullclamp drew nothing', await state(() => !S.bf.some(p => p.name === 'Goblin Token') && !S.stack.length && S.hand.length === 0));
  await T.done();
})();
