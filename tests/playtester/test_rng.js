const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  await ev(() => { askOrder = false; newGame(); S.phase = 'play'; S.turn = 1; S.hand = ['Rite of Flame'];
    S.bf = ['Krark, the Thumbless', 'Sakashima of a Thousand Faces', 'Mountain', 'Mountain'].map(n => ({ uid: S.nextId++, name: n, tapped: false })); S.bf[1].copyOf = 'Krark, the Thumbless'; undoStack = []; render(); });
  const flips = () => ev(() => S.turnLog.filter(e => e.a === 'Krark flip').map(e => e.flip).join(''));
  const run = async () => { await ev(() => cast('Rite of Flame', 'hand')); await ev(() => resolveAll()); return flips(); };
  const a = await run();
  await ev(() => { while (undoStack.length) undo(); });
  const b2 = await run();
  console.log('first', a, 'after undo', b2, 'same', a === b2, 'peeks', await ev(() => S.peeks), 'undos', await ev(() => S.undos));
  console.log('errors', errs);
  await b.close();
})();
