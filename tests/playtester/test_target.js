const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const sheet = () => ev(() => ({ open: !document.getElementById('sheet').hidden, title: document.getElementById('sheetTitle').textContent, btns: [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent), picks: [...document.querySelectorAll('#sheetBody .pick')].map(x => x.textContent) }));
  const press = async l => { await ev(l => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith(l)).click(), l); await p.waitForTimeout(100); };
  const pick = async t => { await ev(t => [...document.querySelectorAll('#sheetBody .pick')].find(x => x.textContent.startsWith(t)).click(), t); };
  const setup = (hand, bf) => ev(([hand, bf]) => { try { localStorage.clear(); } catch (e) {} askOrder = true; holdPriority = false; newGame(); S.hand = hand; S.phase = 'play'; S.turn = 1; S.bf = bf.map(n => ({ uid: S.nextId++, name: n, tapped: false })); undoStack = []; redoStack = []; render(); }, [hand, bf]);

  // 1. Phyrexian choice
  await setup(['Gitaxian Probe', 'Gut Shot', 'Phyrexian Metamorph'], ['Island', 'Mountain', 'Harmonic Prodigy']);
  ev(() => handMenu('Gitaxian Probe')); await p.waitForTimeout(100); let sh = await sheet(); console.log('1 probe menu:', sh.btns.slice(0, 2).join(' | '));
  await press('Cast paying'); await p.waitForTimeout(100); await p.evaluate(() => resolveAll()); await p.waitForTimeout(100); console.log('  paid mana: life', await ev(() => S.life), 'island tapped', await ev(() => S.bf[0].tapped));
  ev(() => handMenu('Phyrexian Metamorph')); await p.waitForTimeout(100); sh = await sheet(); console.log('  metamorph menu:', sh.btns.slice(0, 2).join(' | ')); await press('Cancel');
  // 2. Gut Shot for life targeting own Prodigy: prowess makes it 2/4 so it survives
  ev(() => handMenu('Gut Shot')); await p.waitForTimeout(100); await press('Cast: 2 life'); await p.waitForTimeout(100);
  sh = await sheet(); console.log('2 target sheet:', sh.title, '|', sh.picks.join(' / '));
  await pick('Harmonic Prodigy'); await press('Target it'); await p.waitForTimeout(150); await p.evaluate(() => resolveAll()); await p.waitForTimeout(100);
  console.log('  stack', await ev(() => S.stack.map(stackLabel).join(' / ')));
  await ev(() => resolveAll()); await p.waitForTimeout(100);
  console.log('  life', await ev(() => S.life), 'prodigy', await ev(() => { const q = S.bf.find(x => x.name === 'Harmonic Prodigy'); return q ? power(q) + '/' + toughness(q) + ' dmg ' + dmgOf(q) : 'dead'; }));
  // 3. Bolt own Electro with Krark: copies keep the target, Electro dies, his trigger pays X
  await setup(['Lightning Bolt'], ['Krark, the Thumbless', 'Electro, Assaulting Battery', 'Mountain', 'Mountain', 'Mountain', 'Volcanic Island']);
  await ev(() => { S.rng = null; Math.random = () => 0.1; });
  ev(() => handMenu('Lightning Bolt')); await p.waitForTimeout(100); await press('Cast'); await p.waitForTimeout(100);
  await pick('Electro'); await press('Target it'); await p.waitForTimeout(150);
  sh = await sheet(); if (sh.open) { console.log('  order:', sh.title); await press('Put them'); }
  console.log('3 stack', await ev(() => S.stack.slice().reverse().map(stackLabel).join(' / ')));
  for (let i = 0; i < 6; i++) { const st = await ev(() => S.stack.length); if (!st) break; ev(() => resolveTop()); await p.waitForTimeout(150); sh = await sheet(); if (sh.open) { console.log('   prompt:', sh.title); if (sh.title.startsWith('Electro')) { await ev(() => { document.getElementById('elX').value = 2; document.getElementById('elT').value = '1'; }); } await press(sh.btns[0]); } }
  console.log('  electro on bf', await ev(() => onBf('Electro, Assaulting Battery')), 'opps', await ev(() => S.opp.map(o => o.life).join(',')), 'stack', await ev(() => S.stack.map(stackLabel).join(' / ')));
  console.log('  log', await ev(() => S.turnLog.filter(e => ['damage', 'dies', 'Electro', 'fizzle'].includes(e.a)).map(e => e.a + ':' + (e.c || e.target || '') + (e.amount ? ' ' + e.amount : '') + (e.x !== undefined ? ' X=' + e.x : '')).join(' > ')));
  console.log('errors:', errs);
  await b.close();
})();
