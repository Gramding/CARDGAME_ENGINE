const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const sheet = () => ev(() => ({ open: !document.getElementById('sheet').hidden, title: document.getElementById('sheetTitle').textContent, btns: [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent), box: !!document.getElementById('copySame') }));
  const press = async l => { await ev(l => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith(l)).click(), l); await p.waitForTimeout(120); };
  // Fork with 5 Krark triggers (Krark, Saka, 3 tokens) aimed at Rite of Flame: how many times does it ask?
  await ev(() => { askOrder = false; newGame(); S.phase = 'play'; S.turn = 2; S.hand = ['Rite of Flame', 'Fork'];
    const mk = (n, o = {}) => ({ uid: S.nextId++, name: n, tapped: false, ...o });
    S.bf = [mk('Krark, the Thumbless'), mk('Sakashima of a Thousand Faces', { copyOf: 'Krark, the Thumbless' }), mk('Krark, the Thumbless', { copyOf: 'Krark, the Thumbless', token: true }), mk('Krark, the Thumbless', { copyOf: 'Krark, the Thumbless', token: true }), mk('Krark, the Thumbless', { copyOf: 'Krark, the Thumbless', token: true }),
      mk('Volcanic Island'), mk('Mountain'), mk('Mountain'), mk('Steam Vents')]; render(); });
  await ev(() => cast('Rite of Flame', 'hand')); await ev(() => cast('Fork', 'hand'));
  console.log('stack:', await ev(() => [...S.stack].reverse().map(stackLabel).join(' / ')));
  let asks = 0;
  for (let i = 0; i < 80; i++) {
    const sh = await sheet();
    if (sh.open) { if (sh.title.includes('copy what')) { asks++; console.log('  ask', asks, sh.title, 'checkbox', sh.box); await ev(() => [...document.querySelectorAll('#sheetBody .pick')].find(x => x.textContent.startsWith('Rite')).click()); await press('Copy it'); } else await press(sh.btns[0]); continue; }
    if (!(await ev(() => S.stack.length))) break;
    ev(() => resolveTop()); await p.waitForTimeout(80);
  }
  console.log('copy prompts', asks, '| Fork copies made', await ev(() => S.turnLog.filter(e => e.a === 'copy' && e.c === 'Fork').length), '| R in pool', await ev(() => S.pool.R), '| copyAuto cleared', await ev(() => S.copyAuto === null || S.copyAuto === undefined));
  console.log('errors', errs);
  await b.close();
})();
