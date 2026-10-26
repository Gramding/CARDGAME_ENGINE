const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const sheet = () => ev(() => ({ open: !document.getElementById('sheet').hidden, title: document.getElementById('sheetTitle').textContent, btns: [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent), body: document.getElementById('sheetBody').innerText.slice(0, 300) }));
  const press = async l => { await ev(l => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith(l)).click(), l); await p.waitForTimeout(100); };
  const setup = (hand, bf) => ev(([hand, bf]) => { try { localStorage.clear(); } catch (e) {} askOrder = true; holdPriority = false; newGame(); S.hand = hand; S.phase = 'play'; S.turn = 1; S.bf = bf.map(n => ({ uid: S.nextId++, name: n, tapped: false })); undoStack = []; redoStack = []; render(); }, [hand, bf]);
  const uidOf = n => ev(n => S.bf.find(x => x.name === n).uid, n);

  // 1. Staff equips from the Staff's own menu
  await setup([], ["Wizard's Staff", 'Krark, the Thumbless', 'Mountain', 'Island']);
  const su = await uidOf("Wizard's Staff"); ev(u => bfMenu(u), su); await p.waitForTimeout(100);
  let sh = await sheet(); console.log('1 staff menu:', sh.btns.slice(0, 3).join(' | '));
  await press('Equip a creature'); sh = await sheet(); console.log('  picker:', sh.title, '|', sh.body.replace(/\n/g, ' / '));
  await press('Equip'); console.log('  krark triggers now', await ev(() => krarkTriggers()), 'tapped', await ev(() => S.bf.filter(x => x.tapped).map(x => x.name).join(',')));
  // and from the creature's menu
  await setup([], ["Wizard's Staff", 'Krark, the Thumbless', 'Mountain']);
  const ku = await uidOf('Krark, the Thumbless'); ev(u => bfMenu(u), ku); await p.waitForTimeout(100); await press('Equip Wizard');
  console.log('  from Krark menu: triggers', await ev(() => krarkTriggers()));

  // 2. Ral: win flip, transform, +1 reduces cost, -8 exiles castable cards
  await setup(['Rite of Flame', 'Desperate Ritual', 'Pyretic Ritual'], ['Ral, Monsoon Mage // Ral, Leyline Prodigy', 'Mountain', 'Mountain', 'Volcanic Island']);
  await ev(() => { S.rng = null; Math.random = () => 0.1; });
  ev(() => cast('Rite of Flame', 'hand')); await p.waitForTimeout(150);
  console.log('2 stack', await ev(() => S.stack.map(stackLabel).join(' / ')));
  ev(() => resolveTop()); await p.waitForTimeout(150); sh = await sheet(); console.log('  prompt:', sh.title); await press('Transform');
  await ev(() => resolveAll()); await p.waitForTimeout(100);
  console.log('  ral', await ev(() => JSON.stringify(S.bf.filter(x => x.name.startsWith('Ral')).map(x => ({ f: x.flipped, l: x.loyalty })))), 'img back?', await ev(() => document.querySelector('#perms img.art').src.includes('back')));
  const ru = await ev(() => S.bf.find(x => x.flipped).uid); ev(u => bfMenu(u), ru); await p.waitForTimeout(100); sh = await sheet(); console.log('  pw menu:', sh.title, '|', sh.btns.slice(0, 3).join(' | ')); await press('+1');
  console.log('  after +1: loyalty', await ev(() => S.bf.find(x => x.flipped).loyalty), 'ralPlus', await ev(() => JSON.stringify(S.ralPlus)));
  const lands0 = await ev(() => S.bf.filter(x => !x.tapped && C[x.name].k === 'land').length);
  ev(() => cast('Desperate Ritual', 'hand')); await p.waitForTimeout(150); await ev(() => resolveAll()); await p.waitForTimeout(100);
  console.log('  Desperate (1R) used lands', lands0 - await ev(() => S.bf.filter(x => !x.tapped && C[x.name].k === 'land').length), 'log cost', await ev(() => JSON.stringify(S.turnLog.filter(e => e.c === 'Desperate Ritual' && e.a === 'cast')[0].tapped)));
  await ev(() => { const r = S.bf.find(x => x.flipped); r.loyalty = 9; r.pwTurn = 0; S.lib.unshift('Lightning Bolt', 'Island', 'Fork'); render(); });
  ev(u => bfMenu(u), ru); await p.waitForTimeout(100); await press('−8');
  console.log('  -8 exile:', await ev(() => S.ex.slice(-8).map(e => e.n.split(' //')[0] + (e.free ? '*' : '')).join(', ')));
  ev(() => zoneMenu('ex', 'Lightning Bolt')); await p.waitForTimeout(100); sh = await sheet(); console.log('  exile menu:', sh.btns[0]); await press('Cast free'); await p.waitForTimeout(100); await press('Target it');
  await ev(() => resolveAll()); console.log('  bolt opp life', await ev(() => S.opp[0].life));

  // 3. loop recording -> infinite
  await setup([], ['Krark, the Thumbless']);
  await ev(() => loopToggle());
  await ev(() => { S.pool.R += 2; S.treasures += 1; S.storm += 1; S.opp.forEach(o => o.life -= 1); render(); });
  ev(() => loopToggle()); await p.waitForTimeout(100); sh = await sheet(); console.log('3 loop sheet:', sh.body.split('\n').slice(0, 2).join(' / '));
  await press('Mark as infinite');
  console.log('  rail', await ev(() => ['pR', 'treas', 'storm', 'avail'].map(i => document.getElementById(i).textContent).join(' ')), 'opps', await ev(() => S.opp.map(o => o.life).join(',')), 'log', await ev(() => JSON.stringify(S.turnLog.slice(-1)[0])));
  // repeat
  await setup([], ['Krark, the Thumbless']);
  await ev(() => loopToggle()); await ev(() => { S.pool.R += 3; S.treasures -= 0; render(); });
  ev(() => loopToggle()); await p.waitForTimeout(100); await ev(() => { document.getElementById('loopN').value = 4; }); await press('Repeat');
  console.log('  repeat x4 more -> R', await ev(() => S.pool.R));

  // 4. cast Rite repeatedly with Krark: alternate flips
  await setup(['Rite of Flame'], ['Krark, the Thumbless', 'Mountain', 'Mountain', 'Mountain']);
  await ev(() => { S.rng = null; let i = 0; const seq = [0.1, 0.9, 0.1, 0.1, 0.9, 0.1, 0.1]; Math.random = () => seq[i++ % seq.length]; });
  ev(() => castRepeatMenu('Rite of Flame')); await p.waitForTimeout(100); await ev(() => { document.getElementById('repN').value = 6; }); await press('Go'); await p.waitForTimeout(300);
  console.log('4 repeat:', await ev(() => document.getElementById('banner').textContent));
  console.log('  undo stack depth', await ev(() => undoStack.length), 'hand', await ev(() => S.hand.join(',')), 'gy', await ev(() => S.gy.join(',')));
  await ev(() => undo()); console.log('  after one undo hand', await ev(() => S.hand.join(',')), 'pool', await ev(() => poolStr()));
  console.log('errors:', errs);
  await b.close();
})();
