const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1500, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const sheet = () => ev(() => ({ open: !document.getElementById('sheet').hidden, title: document.getElementById('sheetTitle').textContent }));
  await ev(() => { askOrder = false; keep(); S.hand = ['Mountain', 'Lightning Bolt', 'Ponder', 'Sol Ring']; S.bf = ['Krark, the Thumbless', 'Volcanic Island', 'Island'].map(n => ({ uid: S.nextId++, name: n, tapped: false })); S.lib.unshift('Gamble', 'Expedite', 'Impulse'); render(); });
  await p.mouse.move(5, 5);
  const hoverUid = async name => { const box = await ev(n => { const el = [...document.querySelectorAll('#perms [data-uid], #lands [data-uid], #arts [data-uid]')].find(e => S.bf.find(x => x.uid === +e.dataset.uid).name === n); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, name); await p.mouse.move(box[0], box[1]); };
  const hoverHand = async name => { const box = await ev(n => { const el = [...document.querySelectorAll('#hand .card')].find(e => e.dataset.n === n); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, name); await p.mouse.move(box[0], box[1]); };
  // ? opens and closes
  await p.keyboard.press('Shift+Slash'); await p.waitForTimeout(100); console.log('? ->', JSON.stringify(await sheet()));
  await p.keyboard.press('Shift+Slash'); await p.waitForTimeout(100); console.log('? again -> open', (await sheet()).open);
  // T taps the hovered permanent, twice without moving the mouse
  await hoverUid('Krark, the Thumbless'); await p.keyboard.press('t'); await p.waitForTimeout(50);
  const t1 = await ev(() => S.bf.find(x => x.name.startsWith('Krark')).tapped); await p.keyboard.press('t'); await p.waitForTimeout(50);
  console.log('T T on Krark:', t1, '->', await ev(() => S.bf.find(x => x.name.startsWith('Krark')).tapped));
  // + adds a counter, C makes a token copy
  await p.keyboard.press('+'); await p.keyboard.press('c'); await p.waitForTimeout(100);
  console.log('+ and C:', await ev(() => JSON.stringify(S.bf.filter(x => ident(x).startsWith('Krark')).map(x => ({ c: x.counters || 0, t: !!x.token })))));
  // move hovered hand card to graveyard (G), top of library (Y)
  await hoverHand('Ponder'); await p.keyboard.press('g'); await p.waitForTimeout(80);
  await hoverHand('Sol Ring'); await p.keyboard.press('y'); await p.waitForTimeout(80);
  console.log('G / Y from hand:', await ev(() => [S.hand.join(','), S.gy.join(','), S.lib[0]].join(' | ')));
  // E on the graveyard pile exiles its top card
  const gb = await ev(() => { const r = document.getElementById('gy').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await p.mouse.move(gb[0], gb[1]); await p.keyboard.press('e'); await p.waitForTimeout(80);
  console.log('E on graveyard pile:', await ev(() => [S.gy.length, S.ex.map(e => e.n).join(',')].join(' | ')));
  // U untaps all, 1 plays card 1 (Mountain), Alt+2 peeks
  await p.mouse.move(700, 300);
  await ev(() => { S.bf.forEach(x => x.tapped = true); render(); }); await p.keyboard.press('u'); await p.waitForTimeout(50);
  console.log('U:', await ev(() => S.bf.filter(x => x.tapped).length), 'tapped left');
  await p.keyboard.press('1'); await p.waitForTimeout(150); console.log('1 plays', await ev(() => S.bf.some(x => x.name === 'Mountain')), '| hand', await ev(() => S.hand.join(',')));
  await p.keyboard.press('Alt+2'); await p.waitForTimeout(100); console.log('Alt+2:', (await sheet()).title); await p.keyboard.press('Shift+Slash'); await ev(() => closeSheet(null));
  await p.keyboard.press('Control+m'); await p.waitForTimeout(100); console.log('Ctrl+M:', (await sheet()).title, await ev(() => document.querySelectorAll('table.metrics tr').length), 'rows'); await ev(() => closeSheet(null));
  await p.keyboard.press('Control+y'); await p.waitForTimeout(100); console.log('Ctrl+Y:', (await sheet()).title); await ev(() => closeSheet(null));
  await p.keyboard.press('Control+h'); await p.waitForTimeout(100); console.log('Ctrl+H:', (await sheet()).title); await ev(() => closeSheet(null));
  const lib0 = await ev(() => S.lib.slice(0, 3).join(',')); await p.keyboard.press('Control+s'); await p.waitForTimeout(80); console.log('Ctrl+S shuffled', lib0 !== await ev(() => S.lib.slice(0, 3).join(',')));
  await p.keyboard.press('Control+z'); await p.waitForTimeout(80); console.log('Ctrl+Z restores order', lib0 === await ev(() => S.lib.slice(0, 3).join(',')));
  await p.keyboard.press('?'); await p.waitForTimeout(100); await p.screenshot({ path: 'keys.png' });
  console.log('errors', errs);
  await b.close();
})();
