// Kefka deck flicker and recursion: Displacer Kitten, Essence Flux, Chain of Vapor, Snapcaster Mage and
// Flashback, Subtlety's evoke, Saw in Half, Reanimate and Unsubstantiate.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, setup, state } = T;
  const resolve = async () => { await go(() => { resolveTop(); }); };

  // Displacer Kitten: a noncreature spell flickers a tapped Grim Monolith, which comes back untapped
  await setup(['Dark Ritual'], ['Displacer Kitten', 'Grim Monolith', 'Underground Sea']);
  await ev(() => { S.bf[1].tapped = true; });
  const mono = await state(() => S.bf[1].uid);
  await go(() => cast('Dark Ritual', 'hand'));
  check('Kitten triggers on a noncreature spell', await state(() => S.stack.some(x => x.eff === 'kitten')), await state(() => S.stack.map(stackLabel).join(' / ')));
  await resolve(); await pick('Grim Monolith'); await press('Flicker it');
  check('Grim Monolith came back untapped as a new object', await state(u => { const m = S.bf.find(p => p.name === 'Grim Monolith'); return m && !m.tapped && m.uid !== u; }, mono));

  // Kitten + Thassa's Oracle: the Oracle's ETB trigger again
  await setup(['Sol Ring'], ['Displacer Kitten', "Thassa's Oracle", 'Underground Sea']);
  await go(() => cast('Sol Ring', 'hand')); await resolve(); await pick("Thassa's Oracle"); await press('Flicker it');
  check("Flickered Oracle put its ETB trigger on the stack", await state(() => S.stack.some(x => x.eff === 'oracle')), await state(() => S.stack.map(stackLabel).join(' / ')));

  // Essence Flux on a Spirit adds a counter
  await setup(['Essence Flux'], ['Simian Spirit Guide', 'Underground Sea']);
  await go(() => cast('Essence Flux', 'hand')); await resolve(); await pick('Simian Spirit Guide'); await press('Flicker it');
  check('Essence Flux: Spirit back with a +1/+1 counter', await state(() => S.bf.find(p => p.name === 'Simian Spirit Guide').counters === 1));

  // Chain of Vapor on your own Sol Ring, sacrificing a land to copy it
  await setup(['Chain of Vapor'], ['Sol Ring', 'Underground Sea', 'Volcanic Island']);
  await go(() => cast('Chain of Vapor', 'hand')); await resolve();
  await pick('Sol Ring'); await press('Return mine');
  check('Chain of Vapor returned Sol Ring', await state(() => S.hand.includes('Sol Ring')));
  await pick('Volcanic Island'); await press('Sacrifice and copy');
  check('Sacrificing a land put a copy on the stack', await state(() => S.stack.some(x => x.kind === 'copy' && x.name === 'Chain of Vapor') && S.gy.includes('Volcanic Island')));

  // Snapcaster Mage gives Dark Ritual flashback; casting it exiles it
  await setup(['Snapcaster Mage'], ['Underground Sea', 'Volcanic Island', 'Watery Grave']);
  await ev(() => { S.gy = ['Dark Ritual']; });
  await go(() => cast('Snapcaster Mage', 'hand')); await T.resolveAll(); await T.p.waitForTimeout(150);
  await press('Give it flashback');
  check('Dark Ritual has flashback this turn', await state(() => hasFlashback('Dark Ritual')));
  await go(() => zoneMenu('gy', 'Dark Ritual')); await press('Flashback');
  await T.resolveAll();
  check('Flashback Dark Ritual made BBB and went to exile', await state(() => S.pool.B === 3 && S.ex.some(e => e.n === 'Dark Ritual') && !S.gy.includes('Dark Ritual')));

  // the Flashback card does the same
  await setup(['Flashback'], ['Volcanic Island']);
  await ev(() => { S.gy = ['Gamble']; });
  await go(() => cast('Flashback', 'hand')); await resolve(); await press('Give it flashback');
  check('Flashback gives Gamble flashback', await state(() => hasFlashback('Gamble') && S.gy.includes('Flashback')));

  // Subtlety evoked by pitching a blue card: ETB and evoke sacrifice both trigger
  await setup(['Subtlety', 'Dispel'], []);
  await go(() => handMenu('Subtlety')); await press('Evoke');
  await press('Exile and cast');
  check('Dispel exiled to evoke Subtlety', await state(() => S.ex.some(e => e.n === 'Dispel')));
  await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Subtlety ETB asks for a target', (await T.title()).startsWith('Subtlety'), await T.title());
  for (let i = 0; i < 3 && (await T.sheet()).open; i++) { const b = (await T.sheet()).btns; await press(b.includes('An opponent\'s spell') ? "An opponent's spell" : b[0]); }
  await T.resolveAll(); await T.p.waitForTimeout(150);
  check('Evoked Subtlety was sacrificed', await state(() => !S.bf.some(p => p.name === 'Subtlety') && S.gy.includes('Subtlety')), await state(() => JSON.stringify({ bf: S.bf.map(p => p.name), st: S.stack.map(stackLabel) })));

  // Saw in Half on Thassa's Oracle: two half-size tokens, each with the ETB trigger
  await setup(['Saw in Half'], ["Thassa's Oracle", 'Underground Sea', 'Volcanic Island', 'Badlands']);
  await go(() => cast('Saw in Half', 'hand')); await resolve(); await pick("Thassa's Oracle"); await press('Destroy mine');
  check('Saw in Half made two 1/2 Oracle tokens', await state(() => { const t = S.bf.filter(p => p.token && ident(p) === "Thassa's Oracle"); return t.length === 2 && t.every(p => power(p) === 1 && toughness(p) === 2); }));
  check('Both tokens triggered', await state(() => S.stack.filter(x => x.eff === 'oracle').length === 2));

  // Saw in Half on Kefka: Kefka to the command zone, two tokens, legend rule keeps one
  await setup(['Saw in Half'], ['Kefka, Court Mage // Kefka, Ruler of Ruin', 'Underground Sea', 'Volcanic Island', 'Badlands']);
  await ev(() => { S.cmdZone = []; });
  await go(() => cast('Saw in Half', 'hand')); await resolve(); await pick('Kefka'); await press('Destroy mine');
  await T.p.waitForTimeout(150);
  check('Legend rule asks which Kefka to keep', (await T.title()).startsWith('Legend rule'), await T.title());
  await press('Keep it');
  check('One Kefka token is left, Kefka is in the command zone', await state(() => S.bf.filter(p => ident(p) === 'Kefka, Court Mage // Kefka, Ruler of Ruin').length === 1 && S.cmdZone.includes('Kefka, Court Mage // Kefka, Ruler of Ruin')));
  check('Kefka tokens are 2/3', await state(() => { const k = S.bf.find(p => p.token); return power(k) === 2 && toughness(k) === 3; }));

  // Reanimate: Oracle from the graveyard, lose 2 life
  await setup(['Reanimate'], ['Underground Sea']);
  await ev(() => { S.gy = ["Thassa's Oracle", 'Dispel']; });
  await go(() => cast('Reanimate', 'hand')); await resolve(); await press('Return it');
  check('Reanimate returned the Oracle for 2 life', await state(() => S.bf.some(p => p.name === "Thassa's Oracle") && S.life === 38 && (S.stack.some(x => x.eff === 'oracle') || document.getElementById('sheetTitle').textContent.startsWith("Thassa's Oracle"))));

  // Unsubstantiate your own spell back to hand
  await setup(['Demonic Tutor', 'Unsubstantiate'], ['Underground Sea', 'Watery Grave', 'Volcanic Island', 'Sol Ring']);
  await go(() => cast('Demonic Tutor', 'hand')); await go(() => cast('Unsubstantiate', 'hand'));
  await resolve(); await press('Return it');
  check('Unsubstantiate returned Demonic Tutor to hand', await state(() => S.hand.includes('Demonic Tutor') && !S.stack.length));
  await T.done();
})();
