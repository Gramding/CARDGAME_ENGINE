const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');
(async () => {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const errs = [];
  for (const [w, h, scheme, file] of [[1280, 900, 'light', 'drill-desk.png'], [400, 860, 'dark', 'drill-phone.png']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
    await p.addInitScript(() => { window.__w = {}; const db = { doc: path => ({ set: async body => { window.__w[path] = body; } }), collection: () => ({ orderBy: () => ({ limit: () => ({ onSnapshot: () => {} }) }), limit: () => ({ onSnapshot: f => f({ docs: Object.keys(window.__w) }) }) }) }; window.claude = { use: async n => n === 'db' ? db : null }; });
    await p.goto(PAGE); await p.waitForTimeout(500);
    const txt = sel => p.evaluate(s => document.querySelector(s).textContent, sel);
    await p.click('[data-act=drill]'); await p.waitForTimeout(400);
    console.log(w, 'ctx:', await txt('#drillCtx'), '| overflow', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    await p.screenshot({ path: file });
    if (w > 900) {
      await p.evaluate(() => { drill.step = 0; drill.size = 7; renderDrill(); });
      await p.fill('#drillReason', 'test keep'); await p.click('#drillHand'); await p.keyboard.press('k'); await p.waitForTimeout(100);
      await p.keyboard.press('m'); await p.waitForTimeout(100);
      await p.evaluate(() => { drill.step = 2; drill.size = 6; renderDrill(); });
      await p.click('#drillKeep'); await p.waitForTimeout(100);
      console.log('  prompt:', await txt('#drillPrompt'), 'save disabled', await p.evaluate(() => document.getElementById('drillKeep').disabled));
      await p.click('#drillHand .card'); await p.waitForTimeout(100);
      await p.click('#drillKeep'); await p.waitForTimeout(200);
      const wr = await p.evaluate(() => Object.values(window.__w));
      for (const d of wr) console.log('  saved:', d.decision, 'size', d.size, 'step', d.step, 'seat', d.seat, 'bottom', JSON.stringify(d.bottom), 'reason', d.reason || '-', 'ms>0', d.ms > 0, 'hand', d.hand.length);
      console.log('  stats:', await txt('#drillStats'));
      await p.click('[data-act=drillExit]'); await p.waitForTimeout(100);
      console.log('  back to game, mull bar visible', await p.evaluate(() => getComputedStyle(document.getElementById('mullBar')).display !== 'none'));
    }
    await p.close();
  }
  console.log('errors:', errs);
  await b.close();
})();
