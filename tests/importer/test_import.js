// Importer page: paste the Kefka list, check it against a Scryfall fixture, read the coverage and the request.
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.SITE_URL || 'http://127.0.0.1:4173/';
const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/kefka.scryfall.json'), 'utf8')).data;
const deckText = fs.readFileSync(path.resolve(__dirname, '../fixtures/kefka.txt'), 'utf8');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const errs = [];
  for (const [w, h, shot] of [[1280, 900, 'import-desk.png'], [400, 860, 'import-phone.png']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|net::/.test(m.text())) errs.push(m.text()); });
    let requests = 0;
    await p.route('https://api.scryfall.com/cards/collection', async route => {
      requests++;
      const ids = JSON.parse(route.request().postData()).identifiers;
      const data = ids.map(i => fixture.find(c => c.name.split(' // ')[0] === i.name)).filter(Boolean);
      const not_found = ids.filter(i => !fixture.some(c => c.name.split(' // ')[0] === i.name));
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data, not_found }) });
    });
    await p.route('https://cards.scryfall.io/**', r => r.abort());
    await p.goto(BASE + 'import/');
    await p.evaluate(() => localStorage.clear());
    await p.fill('#deckText', deckText + '\n1 Not A Real Card Name');
    await p.click('#check');
    await p.waitForFunction(() => /^Done|Couldn't/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
    const status = await p.textContent('#status');
    const stats = await p.$$eval('.stat', els => els.map(e => e.textContent.trim()));
    const gaps = await p.$$eval('.gap b', els => els.map(e => e.textContent));
    await p.click('[data-filter=script]');
    const scriptCards = await p.$$eval('#grid .card', els => els.length);
    const prompt = await p.inputValue('#prompt');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    console.log(w, '| requests', requests, '| status:', status);
    console.log('   stats', stats.join(' · '), '| gaps', gaps.join(' | '), '| needs-scripting tiles', scriptCards, '| overflow', overflow);
    const must = ['## Engine work needed first', '### Thassa\'s Oracle', 'Face 2: Kefka, Ruler of Ruin', '### Not A Real Card Name', 'Not found on Scryfall'];
    const lacking = must.filter(m => !prompt.includes(m));
    if (lacking.length) errs.push('prompt lacks: ' + lacking.join(', '));
    if (!/Not found on Scryfall: Not A Real Card Name/.test(status)) errs.push('missing card not reported');
    if (overflow > 0) errs.push(`page scrolls sideways at ${w}px`);
    // a second check uses the cache and sends no requests
    const before = requests; await p.click('#check'); await p.waitForTimeout(400);
    console.log('   second check requests', requests - before - 1 >= 0 ? requests - before : 0, '(one for the unknown card)');
    await p.click('[data-filter=all]');
    await p.screenshot({ path: path.resolve(__dirname, shot), fullPage: false });
    await p.close();
  }
  console.log('errors:', errs);
  await b.close();
})();
