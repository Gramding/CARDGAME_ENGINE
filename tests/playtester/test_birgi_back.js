// Birgi's back face, Harnfel, Horn of Bounty, can be cast from every zone the front can: hand, exile (Jeska's Will,
// Light Up the Stage) and the graveyard under Yawgmoth's Will.
const { table, check } = require('./lib');
const BIRGI = 'Birgi, God of Storytelling // Harnfel, Horn of Bounty';
(async () => {
  const T = await table();
  const { ev, go, press, state } = T;
  const harnfelOut = () => state(n => S.bf.some(p => p.name === n && p.flipped), BIRGI);

  // from exile, played through Jeska's Will's exile
  await T.setup([], Array(5).fill('Mountain'), 'krark');
  await ev(n => { S.ex.push({ n, play: true, until: S.turn }); }, BIRGI);
  await go(() => pileMenu('ex'));
  check('The exile viewer offers Harnfel next to Birgi', await state(() => [...document.querySelectorAll('.zact')].some(b => b.textContent.startsWith('Cast Harnfel'))));
  await ev(() => [...document.querySelectorAll('.zact')].find(b => b.textContent.startsWith('Cast Harnfel')).click());
  await T.p.waitForTimeout(200);
  check('Harnfel was cast from exile for {4}{R} and is on the battlefield', await harnfelOut() && await state(() => S.bf.filter(p => p.tapped).length === 5 && !S.ex.length));

  // from the exile card's own menu
  await T.setup([], Array(5).fill('Mountain'), 'krark');
  await ev(n => { S.ex.push({ n, play: true, until: S.turn }); }, BIRGI);
  await go(n => zoneMenu('ex', n), BIRGI); await press('Cast Harnfel'); await T.p.waitForTimeout(200);
  check('The exile menu casts it too', await harnfelOut());

  // from the graveyard with Yawgmoth's Will
  await T.setup([], Array(5).fill('Mountain'), 'kefka');
  await ev(n => { S.gy = [n]; S.ywill = S.turn; }, BIRGI);
  await go(n => zoneMenu('gy', n), BIRGI); await press('Cast Harnfel'); await T.p.waitForTimeout(200);
  check("Yawgmoth's Will casts Harnfel from the graveyard", await harnfelOut() && await state(n => !S.gy.includes(n), BIRGI));

  // and from the hand, as before
  await T.setup([BIRGI], Array(5).fill('Mountain'), 'krark');
  await go(n => handMenu(n), BIRGI); await press('Cast Harnfel'); await T.p.waitForTimeout(200);
  check('The hand menu still casts Harnfel', await harnfelOut());
  await T.done();
})();
