const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const sheet = () => ev(() => ({ open: !document.getElementById('sheet').hidden, title: document.getElementById('sheetTitle').textContent, btns: [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent), opts: [...document.querySelectorAll('#repPay option')].map(o => o.textContent) }));
  const press = async l => { await ev(l => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith(l)).click(), l); await p.waitForTimeout(120); };
  const run = async (label, card, mode, extraHand = [], prep = () => {}) => {
    await ev(([card, extra]) => { askOrder = false; newGame(); S.phase = 'play'; S.turn = 2; S.hand = [card, ...extra]; S.cmdZone = [];
      S.bf = ['Krark, the Thumbless', 'Sakashima of a Thousand Faces'].map(n => ({ uid: S.nextId++, name: n, tapped: false })); S.bf[1].copyOf = 'Krark, the Thumbless'; render(); }, [card, extraHand]);
    await ev(prep);
    ev(c => castRepeatMenu(c), card); await p.waitForTimeout(150);
    let sh = await sheet(); console.log(label, 'options:', sh.opts.join(' | '));
    await ev(m => { document.getElementById('repN').value = 6; const s = document.getElementById('repPay'); if (s) s.value = m; }, mode);
    await press('Go');
    for (let i = 0; i < 40; i++) { await p.waitForTimeout(120); sh = await sheet(); if (!sh.open) { if (!(await ev(() => quiet))) break; continue; }
      if (sh.title.includes('End the game')) { await press('Keep playing'); continue; }
      await press(sh.btns[0]); }
    console.log('   ', await ev(() => document.getElementById('banner').textContent).then(t => t.slice(0, 170)), '| life', await ev(() => S.life));
  };
  await run('Mogg Salvage', 'Mogg Salvage', 'free');
  await run('Fierce Guardianship', 'Fierce Guardianship', 'free');
  await run('Gitaxian Probe', 'Gitaxian Probe', 'life');
  await run('Light Up the Stage', 'Light Up the Stage', 'spectacle', [], () => { S.turnStats.damage = 1; S.opp[0].life = 39; });
  await run('Force of Will', 'Force of Will', 'pitch', ['Ponder', 'Impulse', 'Snap']);
  console.log('errors', errs);
  await b.close();
})();
