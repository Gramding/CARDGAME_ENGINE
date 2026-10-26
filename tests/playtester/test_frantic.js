const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const sheet = () => ev(() => ({ open: !document.getElementById('sheet').hidden, title: document.getElementById('sheetTitle').textContent, btns: [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent) }));
  const press = async l => { await ev(l => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith(l)).click(), l); await p.waitForTimeout(120); };
  // Frantic Search: draw 2, discard 2, untap the best 3 lands
  await ev(() => { askOrder = false; newGame(); S.phase = 'play'; S.turn = 1; S.hand = ['Frantic Search', 'Lightning Bolt', 'Ponder'];
    S.bf = ['Island', 'Ancient Tomb', 'City of Traitors', 'Volcanic Island', 'Mountain'].map(n => ({ uid: S.nextId++, name: n, tapped: false })); render(); });
  await ev(() => cast('Frantic Search', 'hand')); ev(() => resolveTop()); await p.waitForTimeout(200);
  let sh = await sheet(); console.log('1 prompt:', sh.title);
  await ev(() => { const bs = [...document.querySelectorAll('#sheetBody .pick')]; bs[0].click(); bs[1].click(); });
  await press('Discard them');
  console.log('  hand', await ev(() => S.hand.length), 'gy', await ev(() => S.gy.join(', ')), 'tapped lands', await ev(() => S.bf.filter(x => x.tapped).map(x => x.name).join(', ')));
  console.log('  log', await ev(() => S.turnLog.filter(e => ['discard', 'effect', 'draw', 'Frantic Search'].includes(e.a) || e.cards).map(e => e.a + ':' + JSON.stringify(e.cards || e.untapped || e.c)).join(' | ')));
  // Birgi back face
  await ev(() => { newGame(); S.phase = 'play'; S.turn = 1; S.hand = ['Birgi, God of Storytelling // Harnfel, Horn of Bounty', 'Lightning Bolt', 'Rite of Flame'];
    S.bf = ['Volcanic Island', 'Mountain', 'Mountain', 'Ancient Tomb', 'Vivi Ornitier'].map(n => ({ uid: S.nextId++, name: n, tapped: false })); render(); });
  ev(() => handMenu('Birgi, God of Storytelling // Harnfel, Horn of Bounty')); await p.waitForTimeout(120);
  sh = await sheet(); console.log('2 hand menu:', sh.btns.slice(0, 3).join(' | ')); await press('Cast Harnfel');
  await ev(() => resolveAll()); await p.waitForTimeout(150);
  console.log('  bf harnfel', await ev(() => JSON.stringify(S.bf.filter(x => x.name.startsWith('Birgi')).map(x => ({ f: x.flipped })))), 'vivi counters', await ev(() => S.bf.find(x => x.name === 'Vivi Ornitier').counters || 0), 'row', await ev(() => document.querySelector('#arts [data-uid]') ? 'arts' : 'other'));
  const hu = await ev(() => S.bf.find(x => x.name.startsWith('Birgi')).uid);
  ev(u => bfMenu(u), hu); await p.waitForTimeout(120); sh = await sheet(); console.log('  bf menu:', sh.title, '|', sh.btns[0]); await press('Discard a card');
  await p.waitForTimeout(100); await press('Discard and exile');
  console.log('  exile playable', await ev(() => S.ex.filter(e => e.play).map(e => e.n.split(' //')[0]).join(', ')), 'hand', await ev(() => S.hand.length));
  ev(() => cast('Lightning Bolt', 'hand')); await p.waitForTimeout(150); sh = await sheet(); if (sh.open) await press('Target it'); await ev(() => resolveAll());
  console.log('  Birgi trigger from Harnfel? stack/log birgi:', await ev(() => S.turnLog.some(e => (e.c || '').startsWith('Birgi:'))));
  console.log('errors', errs);
  await b.close();
})();
