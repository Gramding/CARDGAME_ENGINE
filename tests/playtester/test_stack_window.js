// Everything that uses the stack waits for you: spells, triggers and activated abilities (with hold priority on,
// the default). Mana abilities stay instant.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const hold = () => ev(() => { holdPriority = true; });
  const resolve = async () => { await go(() => { resolveTop(); }); };

  check('Hold priority is on by default', await state(() => { try { localStorage.removeItem('krark-playtest-hold'); } catch (e) {} return document.getElementById('optHold').checked; }));

  // Wishclaw Talisman: cost paid at once, the search waits on the stack
  await T.setup(['Dark Ritual'], ['Wishclaw Talisman', 'Sol Ring', 'Underground Sea'], 'kefka');
  await ev(() => { S.bf[0].wish = 3; }); await hold();
  await go(() => bfMenu(S.bf[0].uid)); await press('{1}, tap');
  check('Wishclaw: tapped, counter removed, ability waiting on the stack', await state(() => S.bf[0].tapped && S.bf[0].wish === 2 && S.stack.length === 1 && S.stack[0].eff === 'abWish' && document.getElementById('sheet').hidden));
  await go(() => cast('Dark Ritual', 'hand'));
  check('You can respond to it', await state(() => S.stack.length === 2 && S.stack[1].name === 'Dark Ritual'));
  await resolve(); await resolve(); await pick('Demonic Tutor'); await press('Take it');
  check('Then it resolves: the card found, the Talisman given away', await state(() => S.hand.includes('Demonic Tutor') && S.ex.some(e => e.n === 'Wishclaw Talisman' && e.given)));

  // a lone permanent spell waits too
  await T.setup(['Sol Ring'], ['Underground Sea'], 'kefka'); await hold();
  await go(() => cast('Sol Ring', 'hand'));
  check('Sol Ring waits on the stack', await state(() => S.stack.length === 1 && !S.bf.some(p => p.name === 'Sol Ring')));

  // more abilities on the stack
  const cases = [
    ['kefka', ['Fiery Islet', 'Sol Ring'], 0, '{1}, sacrifice: draw', 'abIslet'],
    ['krark', ['Emergence Zone', 'Mountain'], 0, '{1}, sacrifice: cast spells', 'abZone'],
    ['kefka', ['Grim Monolith', 'Sol Ring', 'Ancient Tomb'], 0, 'Pay {4}: untap', 'abUntap'],
    ['nephilim', ['Kinnan, Bonder Prodigy', 'Tropical Island', 'Taiga', 'Bayou', 'Savannah', 'Tundra', 'Scrubland', 'Sol Ring'], 0, '{5}{G}{U}', 'abKinnan'],
  ];
  for (const [deck, bf, i, btn, eff] of cases) {
    await T.setup([], bf, deck); await hold();
    if (bf[0] === 'Grim Monolith') await ev(() => { S.bf[0].tapped = true; });
    await go(i => bfMenu(S.bf[i].uid), i); await press(btn);
    check(`${bf[0]}: its ability waits on the stack`, await state(e => S.stack.length === 1 && S.stack[0].eff === e, eff), await state(() => JSON.stringify(S.stack)));
  }
  // Deathrite's drain waits; its mana does not
  await T.setup([], ['Deathrite Shaman', 'Bayou'], 'nephilim'); await hold();
  await ev(() => { S.gy = ['Silence', 'Polluted Delta']; });
  await go(() => bfMenu(S.bf[0].uid)); await press('{B}, exile'); await press('Exile it');
  check('Deathrite drain waits; the card is still in the graveyard until it resolves', await state(() => S.stack[0].eff === 'abDrsB' && S.gy.includes('Silence')));
  await resolve();
  check('Resolved: Silence exiled, each opponent at 38', await state(() => !S.gy.includes('Silence') && S.opp.every(o => o.life === 38)));
  // Kefka's {8}
  await T.setup([], ['Kefka, Court Mage // Kefka, Ruler of Ruin', 'Sol Ring', 'Grim Monolith', 'Ancient Tomb', 'City of Traitors'], 'kefka'); await hold();
  await go(() => bfMenu(S.bf[0].uid)); await press('{8}');
  check('Kefka transforms only when the ability resolves', await state(() => !S.bf[0].flipped && S.stack[0].eff === 'abKefka8'));
  await resolve();
  check('Now he is Ruler of Ruin', await state(() => S.bf[0].flipped));
  // turning hold priority off brings back auto-resolution for lone items
  await T.setup(['Sol Ring'], ['Underground Sea'], 'kefka');
  await go(() => cast('Sol Ring', 'hand'));
  check('With hold priority off, a lone Sol Ring resolves by itself', await state(() => !S.stack.length && S.bf.some(p => p.name === 'Sol Ring')));
  await T.done();
})();
