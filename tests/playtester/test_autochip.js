const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const sheet = () => ev(() => ({ open: !document.getElementById('sheet').hidden, title: document.getElementById('sheetTitle').textContent, btns: [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent), box: !!document.getElementById('copySame') }));
  const press = async l => { await ev(l => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith(l)).click(), l); await p.waitForTimeout(120); };
  await ev(() => { askOrder = false; newGame(); S.phase = 'play'; S.turn = 2; S.hand = ['Rite of Flame', 'Reverberate'];
    const mk = (n, o = {}) => ({ uid: S.nextId++, name: n, tapped: false, ...o });
    S.bf = [mk('Krark, the Thumbless'), mk('Sakashima of a Thousand Faces', { copyOf: 'Krark, the Thumbless' }), mk('Krark, the Thumbless', { copyOf: 'Krark, the Thumbless', token: true }), mk('Krark, the Thumbless', { copyOf: 'Krark, the Thumbless', token: true }), mk('Krark, the Thumbless', { copyOf: 'Krark, the Thumbless', token: true }),
      mk('Volcanic Island'), mk('Mountain'), mk('Mountain'), mk('Steam Vents')]; render(); });
  await ev(() => cast('Rite of Flame', 'hand')); await ev(() => cast('Reverberate', 'hand'));
  let asks = 0, cleared = false, copies = () => ev(() => S.turnLog.filter(e => e.a === 'copy' && e.c === 'Reverberate').length);
  for (let i = 0; i < 120; i++) {
    const sh = await sheet();
    if (sh.open) {
      if (sh.title.includes('copy what')) {
        asks++;
        if (!cleared) { console.log('ask', asks, '(first): checkbox', sh.box); await ev(() => [...document.querySelectorAll('#sheetBody .pick')].find(x => x.textContent.startsWith('Rite')).click()); await press('Copy it'); }
        else { console.log('ask', asks, 'after clearing: answering Nothing'); await press('Nothing'); }
      } else await press(sh.btns[0]);
      continue;
    }
    if (!cleared && (await copies()) >= 1 && (await ev(() => !!document.querySelector('.autochip')))) {
      console.log('chip shown:', await ev(() => document.querySelector('.autochip').textContent), '| copies so far', await copies());
      await p.click('.autochip'); await p.waitForTimeout(100); cleared = true;
      console.log('after clearing: chip gone', await ev(() => !document.querySelector('.autochip')), '| banner', await ev(() => document.getElementById('banner').textContent));
      continue;
    }
    if (!(await ev(() => S.stack.length))) break;
    ev(() => resolveTop()); await p.waitForTimeout(80);
  }
  console.log('prompts', asks, '| Reverberate copies made', await copies(), '| errors', errs);
  await b.close();
})();
