const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__w = {};
    const db = { doc: path => ({ set: async body => { window.__w[path] = JSON.parse(JSON.stringify(body)); }, delete: async () => { delete window.__w[path]; } }),
      collection: () => ({ orderBy: () => ({ limit: () => ({ onSnapshot: () => {} }) }) }) };
    window.claude = { use: async n => n === 'db' ? db : null };
  });
  await p.goto(PAGE); await p.waitForTimeout(500);
  const ev = (f, a) => p.evaluate(f, a);
  await ev(() => { S.hand = ['Rite of Flame', 'Mountain', 'Island', 'Sol Ring', 'Ponder', 'Expedite', 'Lotus Petal']; render(); });
  await ev(() => keep()); await p.waitForTimeout(100);
  await ev(() => { holdPriority = false; }); await ev(() => playLand('Mountain', 'hand')); await ev(() => cast('Rite of Flame', 'hand')); await ev(() => resolveAll());
  await ev(() => nextTurn()); await ev(() => cast('Lotus Petal', 'hand'));
  ev(() => endGame()); await p.waitForTimeout(200);
  await ev(() => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith('Save')).click());
  await p.waitForTimeout(5500);   // past the delayed autosave
  const w = await ev(() => window.__w);
  for (const [k, v] of Object.entries(w)) console.log(k, v.events ? 'events ' + v.events.length + ': ' + v.events.map(e => e.a + (e.c ? ' ' + e.c : '')).join(', ') : 'meta phase ' + v.phase + ' result ' + (v.result && v.result.result));
  const turns = Object.keys(w).filter(k => k.includes('/turns/'));
  if (turns.length < 2 || turns.some(k => !w[k].events.length)) errs.push('a turn was saved without its events');
  console.log('errors:', errs);
  await b.close();
})();
