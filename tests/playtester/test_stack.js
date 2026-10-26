const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const sheet = () => ev(() => ({ open: !document.getElementById('sheet').hidden, title: document.getElementById('sheetTitle').textContent, rows: [...document.querySelectorAll('#sheetBody .olab, #sheetBody .pick')].map(x => x.textContent), btns: [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent) }));
  const press = async l => { await ev(l => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith(l)).click(), l); await p.waitForTimeout(80); };
  const stack = () => ev(() => [...S.stack].reverse().map(stackLabel));
  const setup = (hand, bf) => ev(([hand, bf]) => { try { localStorage.clear(); } catch (e) {} askOrder = true; holdPriority = false; newGame(); S.hand = hand; S.phase = 'play'; S.turn = 1; S.bf = bf.map(n => ({ uid: S.nextId++, name: n, tapped: false })); undoStack = []; redoStack = []; render(); }, [hand, bf]);

  await setup(['Rite of Flame', 'Fork', 'Lotus Petal'], ['Krark, the Thumbless', 'Birgi, God of Storytelling // Harnfel, Horn of Bounty', 'Storm-Kiln Artist', 'Volcanic Island', 'Mountain', 'Steam Vents']);
  // a lone permanent spell resolves on its own
  await ev(() => cast('Lotus Petal', 'hand')); await p.waitForTimeout(50);
  let sh = await sheet(); console.log('A petal: sheet', sh.open, sh.title, '| stack', JSON.stringify(await stack()), 'bf has petal', await ev(() => onBf('Lotus Petal')));
  if (sh.open) await press('Put them'); // Birgi trigger alone -> no order prompt expected
  console.log('  after petal stack', JSON.stringify(await stack()));
  await ev(() => resolveAll()); await p.waitForTimeout(50);
  // cast Rite: Birgi + Kiln + Krark triggers -> ordering sheet
  ev(() => cast('Rite of Flame', 'hand')); await p.waitForTimeout(120);
  sh = await sheet(); console.log('B order sheet:', sh.title, JSON.stringify(sh.rows));
  // move Krark to first
  await ev(() => { const rows = [...document.querySelectorAll('.orow')]; const i = rows.findIndex(r => r.textContent.includes('Krark')); rows[i].querySelectorAll('button')[2].click(); });
  sh = await sheet(); console.log('  reordered:', JSON.stringify(sh.rows)); await press('Put them');
  console.log('  stack top first:', JSON.stringify(await stack()));
  // respond with Fork targeting Rite
  ev(() => cast('Fork', 'hand')); await p.waitForTimeout(150);
  sh = await sheet(); if (sh.open) { console.log('  fork order sheet', JSON.stringify(sh.rows)); await press('Put them'); }
  console.log('C after Fork cast:', JSON.stringify(await stack()));
  // resolve one at a time until Fork is on top
  for (let i = 0; i < 12; i++) {
    const top = (await stack())[0]; if (!top) break;
    ev(() => resolveTop()); await p.waitForTimeout(120);
    sh = await sheet();
    if (sh.open) { console.log('   prompt:', sh.title, JSON.stringify(sh.rows.slice(0, 6))); await press(sh.btns[0]); }
    console.log('  resolved', top, '->', JSON.stringify(await stack()), 'pool', await ev(() => poolStr()), 'tr', await ev(() => S.treasures));
  }
  console.log('D log:', await ev(() => S.turnLog.map(e => e.a + (e.c ? ':' + e.c : '') + (e.flip ? '[' + e.flip + ']' : '') + (e.order ? '{' + e.order + '}' : '')).join(' > ')));
  console.log('  hand', await ev(() => S.hand.join(',')), 'gy', await ev(() => S.gy.join(',')));
  // undo walks back one resolution at a time
  const n0 = await ev(() => S.turnLog.length); await ev(() => undo()); await ev(() => undo());
  console.log('E undo x2: log', n0, '->', await ev(() => S.turnLog.length), 'stack', JSON.stringify(await stack()));
  await ev(() => redo()); console.log('  redo: stack', JSON.stringify(await stack()));
  // land blocked with stack
  console.log('  next turn blocked?', await ev(() => { const t = S.turn; nextTurn(); return [S.turn === t, document.getElementById('banner').textContent]; }));
  await p.screenshot({ path: 'stack-desk.png' });
  const p2 = await b.newPage({ viewport: { width: 400, height: 860 }, colorScheme: 'dark' });
  await p2.goto(PAGE); await p2.waitForTimeout(200);
  await p2.evaluate(() => { newGame(); S.phase = 'play'; S.turn = 1; S.hand = ['Jeska\'s Will']; S.bf = [{ uid: 900, name: 'Krark, the Thumbless' }, { uid: 901, name: 'Sakashima of a Thousand Faces', copyOf: 'Krark, the Thumbless' }]; S.stack = [{ id: 1, kind: 'spell', name: 'Jeska\'s Will', mode: 'both' }, { id: 2, kind: 'trigger', eff: 'krark', name: 'Jeska\'s Will', spellId: 1 }, { id: 3, kind: 'trigger', eff: 'krark', name: 'Jeska\'s Will', spellId: 1 }, { id: 4, kind: 'copy', name: 'Jeska\'s Will' }]; render(); });
  console.log('phone overflow', await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await p2.screenshot({ path: 'stack-phone.png' });
  console.log('errors:', errs);
  await b.close();
})();
