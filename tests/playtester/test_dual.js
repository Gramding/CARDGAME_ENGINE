const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const sheet = () => ev(() => ({ open: !document.getElementById('sheet').hidden, title: document.getElementById('sheetTitle').textContent, picks: [...document.querySelectorAll('#sheetBody .pick')].map(x => (x.classList.contains('sel') ? '*' : '') + x.textContent.trim()), btns: [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent) }));
  const press = async l => { await ev(l => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith(l)).click(), l); await p.waitForTimeout(120); };
  const pick = t => ev(t => [...document.querySelectorAll('#sheetBody .pick')].find(x => x.textContent.trim().startsWith(t)).click(), t);
  await ev(() => { askOrder = true; newGame(); S.phase = 'play'; S.turn = 1; S.hand = ['Molten Duplication', 'Dualcaster Mage'];
    S.bf = ['Volcanic Island', 'Mountain', 'Mountain', 'Mountain', 'Steam Vents'].map(n => ({ uid: S.nextId++, name: n, tapped: false })); render(); });
  await ev(() => cast('Molten Duplication', 'hand')); await p.waitForTimeout(100);
  ev(() => cast('Dualcaster Mage', 'hand')); await p.waitForTimeout(150);
  console.log('stack after casts:', await ev(() => [...S.stack].reverse().map(stackLabel).join(' / ')));
  let first = true;
  for (let i = 0; i < 14; i++) {
    const sh = await sheet();
    if (sh.open) {
      if (sh.title.includes('copy what') && sh.title.startsWith('Dualcaster')) { await pick('Molten'); await press('Copy it'); }
      else if (sh.title.includes('copy what')) { await pick('Dualcaster'); await press('Make tokens'); }
      else await press(sh.btns[0]);
      continue;
    }
    const n = await ev(() => S.stack.length); if (n <= 1 && !first) break;   // stop with the original Molten still on the stack
    first = false;
    ev(() => resolveTop()); await p.waitForTimeout(150);
    console.log('  stack:', await ev(() => [...S.stack].reverse().map(stackLabel).join(' / ')), '| dualcasters', await ev(() => S.bf.filter(x => ident(x) === 'Dualcaster Mage').length));
  }
  console.log('tokens', await ev(() => S.bf.filter(x => x.token).map(x => x.name).join(', ')));
  console.log('errors', errs);
  await b.close();
})();
