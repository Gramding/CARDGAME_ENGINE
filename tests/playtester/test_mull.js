const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  // keep() can stop at the Gemstone Caverns question when the hand holds it, so it's started, then any sheet is answered
  const keep = async () => { await ev(() => { window.keep(); }); await p.waitForTimeout(150); await ev(() => { if (!document.getElementById('sheet').hidden) closeSheet(null); }); await p.waitForTimeout(100); };
  await ev(() => newGame());
  await ev(() => mulligan()); await ev(() => mulligan());          // free mulligan, then mulligan 2: keep 6
  await ev(() => handMenu(S.hand[0]));                              // pick one card for the bottom
  console.log('mull 2: need', await ev(() => bottomCount()), 'picked', await ev(() => S.bottomSel.length));
  await ev(() => mulligan());                                       // mulligan 3: keep 5
  console.log('mull 3: need', await ev(() => bottomCount()), 'picked after mulligan', await ev(() => S.bottomSel.length), '| info:', await ev(() => document.getElementById('mullInfo').textContent));
  await ev(() => handMenu(S.hand[0]));
  await keep(); console.log('keep with 1 of 2 picked -> phase', await ev(() => S.phase), '| banner', await ev(() => document.getElementById('banner').textContent));
  await ev(() => handMenu(S.hand[1])); await keep();
  console.log('keep with 2 picked -> phase', await ev(() => S.phase), 'kept', await ev(() => S.kept.length), 'cards');
  console.log('errors', errs);
  await b.close();
})();
