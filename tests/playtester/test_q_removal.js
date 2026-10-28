// The Q deck's interaction and alternative costs: Fireblast's Mountains, Flare of Duplication's sacrifice, Abrade,
// Chaos Warp, Tibalt's Trickery on your own spell, Sundering Eruption and Shatterskull Smashing.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { ev, go, press, pick, state } = T;
  const setup = (h, b) => T.setup(h, b, 'q');
  const resolve = async () => { await go(() => { resolveTop(); }); };

  // Fireblast: sacrifice two Mountains (tapped ones first) instead of paying
  await setup(['Fireblast'], ['Mountain', 'Mountain', 'Mountain']);
  await ev(() => { S.bf[1].tapped = true; S.bf[2].tapped = true; });
  await go(() => handMenu('Fireblast')); await press('Sacrifice two Mountains');
  check('The two tapped Mountains are preselected', await state(() => document.querySelectorAll('#sheetBody .pick.sel').length === 2));
  await press('Sacrifice and cast'); await press('Target it'); await resolve();
  check('Fireblast dealt 4 for two tapped Mountains; the untapped one stays', await state(() => S.opp[0].life === 36 && S.gy.filter(n => n === 'Mountain').length === 2 && S.bf.length === 1 && !S.bf[0].tapped));

  // Flare of Duplication: sacrifice a nontoken red creature to copy a spell
  await setup(['Lightning Bolt', 'Flare of Duplication'], ['Ragavan, Nimble Pilferer', 'Mountain']);
  await go(() => cast('Lightning Bolt', 'hand')); await press('Target it');
  await go(() => handMenu('Flare of Duplication')); await press('Sacrifice a nontoken red creature');
  await press('Sacrifice it'); await T.p.waitForTimeout(100);
  check('Ragavan was sacrificed and Flare is on the stack for free', await state(() => S.gy.includes('Ragavan, Nimble Pilferer') && S.stack.some(x => x.name === 'Flare of Duplication')));
  await resolve();
  check('Flare asks what to copy', (await T.title()).startsWith('Flare of Duplication: copy what?'));
  await press('Copy it'); await T.resolveAll(); await T.p.waitForTimeout(100);
  check('Bolt and its copy: 6 damage', await state(() => S.opp[0].life === 34));

  // Abrade destroys your own artifact, or hits an opponent's creature
  await setup(['Abrade'], ['Sol Ring', 'Mountain', 'Mountain']);
  await go(() => cast('Abrade', 'hand')); await resolve();
  await press('Destroy target artifact');
  check('The opponent\'s artifact is the default', await state(() => document.querySelector('#sheetButtons button.primary').textContent === "An opponent's artifact"));
  await press('Destroy mine');
  check('Sol Ring destroyed', await state(() => S.gy.includes('Sol Ring') && !S.bf.some(p => p.name === 'Sol Ring')));

  // Chaos Warp on your own Sol Ring: shuffled in, the top card is revealed and a permanent comes in
  await setup(['Chaos Warp'], ['Sol Ring', 'Mountain', 'Mountain', 'Mountain']);
  await ev(() => { window.__mr = Math.random; S.rng = null; Math.random = () => 0.9999; S.lib = ['Mox Opal', ...S.lib.filter(n => n !== 'Mox Opal')]; });
  await go(() => cast('Chaos Warp', 'hand')); await resolve();
  await pick('Sol Ring'); await press('Shuffle mine in'); await T.p.waitForTimeout(150);
  await ev(() => { Math.random = window.__mr; });
  check('Sol Ring went into the library and Mox Opal came off the top', await state(() => S.lib.includes('Sol Ring') && !S.bf.some(p => p.name === 'Sol Ring') && S.bf.some(p => p.name === 'Mox Opal')));

  // Tibalt's Trickery on your own Lightning Bolt: mill 1 to 3, then cast the next nonland card free
  await setup(['Lightning Bolt', "Tibalt's Trickery"], ['Mountain', 'Mountain', 'Mountain']);
  await ev(() => { S.lib = ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Seething Song', ...S.lib]; });
  await go(() => cast('Lightning Bolt', 'hand')); await press('Target it');
  await go(() => cast("Tibalt's Trickery", 'hand')); await resolve();
  check('It asks which spell to counter', (await T.title()).startsWith("Tibalt's Trickery: counter which spell"));
  await press('Counter it');
  check('Bolt countered; it offers Seething Song for free', await state(() => S.gy.includes('Lightning Bolt') && !S.stack.some(x => x.name === 'Lightning Bolt')) && (await T.title()).startsWith("Tibalt's Trickery: cast Seething Song"), await T.title());
  await press('Cast it free'); await T.p.waitForTimeout(100);
  const milled = await state(() => S.turnLog.find(e => e.a === "Tibalt's Trickery").milled.length);
  check(`Milled ${milled} (1 to 3); the other Mountains went to the bottom`, milled >= 1 && milled <= 3 && await state(m => S.gy.filter(n => n === 'Mountain').length === m && S.lib.slice(-(4 - m)).every(n => n === 'Mountain'), milled));
  await T.resolveAll(); await T.p.waitForTimeout(100);
  check('Seething Song resolved for RRRRR and the opponent took no damage', await state(() => S.pool.R === 5 && S.opp[0].life === 40));

  // Sundering Eruption on your own land: a basic Mountain comes back tapped
  await setup(['Sundering Eruption // Volcanic Fissure'], ['Ancient Tomb', 'Mountain', 'Mountain', 'Mountain']);
  await ev(() => { S.lib.push('Mountain'); S.bf[0].tapped = true; });
  await go(() => cast('Sundering Eruption // Volcanic Fissure', 'hand')); await resolve();
  await pick('Ancient Tomb'); await press('Destroy mine');
  await press('Put it in');
  check('Ancient Tomb destroyed, a tapped Mountain fetched, and the no-blocks note', await state(() => S.gy.includes('Ancient Tomb') && S.bf.filter(p => p.name === 'Mountain').length === 4 && S.bf[S.bf.length - 1].tapped && /can't block/.test(document.getElementById('banner').textContent)));

  // Shatterskull Smashing with X = 6 deals 12, divided
  await setup(['Shatterskull Smashing // Shatterskull, the Hammer Pass'], ['Magus of the Wheel', ...Array(8).fill('Mountain')]);
  await go(() => cast('Shatterskull Smashing // Shatterskull, the Hammer Pass', 'hand')); await ev(() => { document.getElementById('xVal').value = 6; }); await press('Cast it');
  check('X = 6 cost all eight Mountains', await state(() => S.bf.filter(p => p.tapped).length === 8));
  await resolve();
  check('Twice X: 12 damage to divide', (await T.title()).includes('12 damage'));
  await ev(() => { document.querySelector('#sheetBody input').value = 3; }); await press('Deal it');
  check('Magus took 3 and died, 9 went to opponents\' creatures', await state(() => S.gy.includes('Magus of the Wheel') && S.turnLog.some(e => e.c === 'Shatterskull Smashing' && e.damage === 12 && e.toOpponents === 9)));
  await T.done();
})();
