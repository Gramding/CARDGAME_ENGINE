const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const errs = [];
  for (const [w, h, file] of [[1600, 900, 'lay-desk.png'], [400, 860, 'lay-phone.png']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
    await p.goto(PAGE); await p.waitForTimeout(400);
    if (w > 900) { await p.screenshot({ path: 'lay-mull.png' }); }
    await p.evaluate(() => { keep(); });
    await p.waitForTimeout(150);
    await p.evaluate(() => { const mk = (n, o = {}) => ({ uid: S.nextId++, name: n, tapped: false, ...o });
      S.bf.push(mk('Krark, the Thumbless'), mk('Sakashima of a Thousand Faces', { copyOf: 'Krark, the Thumbless' }), mk('Storm-Kiln Artist'), mk('Birgi, God of Storytelling // Harnfel, Horn of Bounty'),
        mk('Relic of Legends'), mk("Wizard's Staff"), mk('Sol Ring', { tapped: true }), mk('Volcanic Island', { tapped: true }), mk('Steam Vents'), mk('Command Tower', { tapped: true }), mk('Island'));
      for (let i = 0; i < 6; i++) S.bf.push(mk('Krark, the Thumbless', { copyOf: 'Krark, the Thumbless', token: true, temp: true }));
      S.cmdZone = []; S.gy = ['Lightning Bolt', 'Rite of Flame', 'Gitaxian Probe']; S.ex = [{ n: 'Ponder', play: true }]; S.pool.R = 3; S.treasures = 4; S.storm = 5;
      S.stack = [{ id: 901, kind: 'spell', name: 'Twinflame', from: 'hand' }, { id: 902, kind: 'trigger', eff: 'krark', name: 'Twinflame', spellId: 901 }, { id: 903, kind: 'trigger', eff: 'kiln', src: 1 }];
      toast('Twinflame is on the stack with 9 Krark triggers above it.'); render(); });
    await p.waitForTimeout(500);
    console.log(w, 'overflow', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'body scroll', await p.evaluate(() => document.documentElement.scrollHeight - innerHeight));
    await p.screenshot({ path: file });
    if (w > 900) {
      await p.click('[data-act=menu] >> nth=0'); await p.waitForTimeout(150);
      console.log('  menu:', await p.evaluate(() => [...document.querySelectorAll('#sheetBody .btn')].map(x => x.textContent).join(' | ')));
      const hand0 = await p.evaluate(() => S.hand.length);
      await p.click('#sheetBody [data-act=draw]'); await p.waitForTimeout(150);
      console.log('  draw from menu:', hand0, '->', await p.evaluate(() => S.hand.length), 'sheet closed', await p.evaluate(() => document.getElementById('sheet').hidden));
      await p.click('#gy'); await p.waitForTimeout(150);
      console.log('  gy viewer:', await p.evaluate(() => document.getElementById('sheetTitle').textContent));
      await p.click('#sheetBody .pick >> nth=0'); await p.waitForTimeout(200);
      console.log('  then zone menu:', await p.evaluate(() => document.getElementById('sheetTitle').textContent));
      await p.click('#sheetClose'); await p.waitForTimeout(100);
      await p.click('[data-act="pool:R,1"]', { button: 'right' }); console.log('  right-click R ->', await p.evaluate(() => S.pool.R));
      await p.keyboard.press('l'); await p.waitForTimeout(100); console.log('  L opens log drawer', await p.evaluate(() => !document.getElementById('drawer').hidden));
      await p.screenshot({ path: 'lay-drawer.png' });
    }
    await p.close();
  }
  console.log('errors:', errs);
  await b.close();
})();
