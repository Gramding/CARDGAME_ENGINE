const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const stack = () => ev(() => [...S.stack].reverse().map(x => stackLabel(x) + (x.stop ? ' [STOP]' : '')).join(' / '));
  await ev(() => { askOrder = false; newGame(); S.phase = 'play'; S.turn = 2; S.hand = ['Rite of Flame', 'Desperate Ritual'];
    S.bf = ['Krark, the Thumbless', 'Birgi, God of Storytelling // Harnfel, Horn of Bounty', 'Volcanic Island', 'Mountain', 'Mountain'].map(n => ({ uid: S.nextId++, name: n, tapped: false })); render(); });
  await ev(() => cast('Desperate Ritual', 'hand')); await ev(() => cast('Rite of Flame', 'hand')); console.log('log flips so far', await ev(() => S.turnLog.length));
  console.log('stack:', await stack());
  // mark the original Rite of Flame as a stop through its stack menu
  const rid = await ev(() => S.stack.find(x => x.kind === 'trigger' && x.eff === 'krark' && x.name === 'Desperate Ritual').id);
  ev(id => stackMenu(id), rid); await p.waitForTimeout(150);
  console.log('menu:', await ev(() => [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent).join(' | ')));
  await ev(() => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith('Stop Resolve')).click()); await p.waitForTimeout(150);
  console.log('marked:', await stack(), '| row badge', await ev(() => document.querySelector('.si.stop .sk') && document.querySelector('.si.stop .sk').textContent));
  await ev(() => resolveAll()); await p.waitForTimeout(150);
  console.log('after Resolve all:', await stack(), '| banner', await ev(() => document.getElementById('banner').textContent));
  await ev(() => resolveTop()); await p.waitForTimeout(150);
  console.log('after Resolve top:', await stack());
  await ev(() => resolveAll()); await p.waitForTimeout(150);
  console.log('after Resolve all again:', await stack() || '(empty)');
  console.log('errors', errs);
  await b.close();
})();
