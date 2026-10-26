const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const sheet = () => ev(() => ({ open: !document.getElementById('sheet').hidden, title: document.getElementById('sheetTitle').textContent, btns: [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent), method: (document.getElementById('egMethod') || {}).value }));
  const press = async l => { await ev(l => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith(l)).click(), l); await p.waitForTimeout(150); };
  const pick = t => ev(t => [...document.querySelectorAll('#sheetBody .pick')].find(x => x.textContent.trim().startsWith(t)).click(), t);
  const setup = (hand, bf) => ev(([hand, bf]) => { askOrder = false; newGame(); S.phase = 'play'; S.turn = 3; S.hand = hand; S.bf = bf.map(n => ({ uid: S.nextId++, name: n, tapped: false })); render(); }, [hand, bf]);
  const drive = async (label, onPrompt) => {   // resolve until a win prompt or 12 steps
    for (let i = 0; i < 16; i++) {
      const sh = await sheet();
      if (sh.open) {
        if (sh.title.includes('End the game as a win')) { console.log(label, 'WIN PROMPT:', sh.title.slice(0, 150)); await press('End as a win'); await p.waitForTimeout(150); const e = await sheet(); console.log('   end form method:', e.method); await press('Save result'); console.log('   result', await ev(() => JSON.stringify(S.result && { r: S.result.result, m: S.result.method, n: S.result.note }))); return; }
        await onPrompt(sh); continue;
      }
      if (!(await ev(() => S.stack.length))) { await p.waitForTimeout(100); if (!(await sheet()).open) { console.log(label, 'no prompt; stack empty'); return; } continue; }
      ev(() => resolveTop()); await p.waitForTimeout(150);
    }
    console.log(label, 'gave up');
  };
  // 1. Dualcaster in response to Molten Duplication
  await setup(['Molten Duplication', 'Dualcaster Mage'], ['Volcanic Island', 'Mountain', 'Mountain', 'Mountain', 'Steam Vents']);
  await ev(() => cast('Molten Duplication', 'hand')); await ev(() => cast('Dualcaster Mage', 'hand'));
  await drive('1 dualcaster', async sh => { if (sh.title.startsWith('Dualcaster')) { await pick('Molten'); await press('Copy it'); } else if (sh.title.includes('copy what')) { await pick('Dualcaster'); await press('Make tokens'); } else await press(sh.btns[0]); });
  // 2. Monk loop with Birgi + Storm-Kiln (2 back per cast, Twinflame costs 2)
  await setup(['Twinflame'], ['Pinnacle Monk // Mystic Peak', 'Birgi, God of Storytelling // Harnfel, Horn of Bounty', 'Storm-Kiln Artist', 'Volcanic Island', 'Mountain']);
  await ev(() => cast('Twinflame', 'hand'));
  await drive('2 monk', async sh => { if (sh.title.includes('copy what')) { await pick('Pinnacle'); await press('Make tokens'); } else await press(sh.btns[0]); });
  // 2b. same without mana engines: no win prompt
  await setup(['Twinflame'], ['Pinnacle Monk // Mystic Peak', 'Volcanic Island', 'Mountain']);
  await ev(() => cast('Twinflame', 'hand'));
  await drive('2b monk without engines', async sh => { if (sh.title.includes('copy what')) { await pick('Pinnacle'); await press('Make tokens'); } else await press(sh.btns[0]); });
  // 3. opponents knocked out with the life buttons
  await setup([], ['Island']);
  await ev(() => { S.opp[0].life = 1; S.opp[1].lib = 0; S.opp[2].life = 2; S.target = 0; render(); });
  await ev(() => runAct('opp:life,-1')); await ev(() => { S.target = 2; render(); }); await ev(() => runAct('opp:life,-5')); await p.waitForTimeout(200);
  await drive('3 opponents', async sh => press(sh.btns[0]));
  // 4. infinite storm loop with Brain Freeze in hand
  await setup(['Brain Freeze'], ['Krark, the Thumbless']);
  await ev(() => loopToggle()); await ev(() => { S.storm += 1; S.pool.R += 1; render(); });
  ev(() => loopToggle()); await p.waitForTimeout(150); await press('Mark as infinite'); await p.waitForTimeout(200);
  await drive('4 storm', async sh => press(sh.btns[0]));
  console.log('errors', errs);
  await b.close();
})();
