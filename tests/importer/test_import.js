// Importer page: paste the Kefka list, check it against a Scryfall fixture, read the coverage, then
// hand the deck to the playtester. A second paste without a marked commander gets Kefka guessed.
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.SITE_URL || 'http://127.0.0.1:4173/';
const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/kefka.scryfall.json'), 'utf8')).data;
const deckText = fs.readFileSync(path.resolve(__dirname, '../fixtures/kefka.txt'), 'utf8');
const TWIN = { name: 'Kefka Twin', layout: 'normal', mana_cost: '{U}{B}{R}', cmc: 3, type_line: 'Legendary Creature — Human Wizard', oracle_text: '', power: '2', toughness: '2', color_identity: ['B', 'R', 'U'] };
const ELVES = { name: 'Arbor Elf', layout: 'normal', mana_cost: '{G}', cmc: 1, type_line: 'Creature — Elf Druid', oracle_text: '{T}: Add {G}.', power: '1', toughness: '1', color_identity: ['G'], produced_mana: ['G'] };
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const errs = [];
  const fail = m => errs.push(m);
  const page = async (w, h) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|net::/.test(m.text())) errs.push(m.text()); });
    p.requests = 0;
    await p.route('https://api.scryfall.com/cards/collection', async route => {
      p.requests++;
      const all = [...fixture, ELVES, TWIN];
      const ids = JSON.parse(route.request().postData()).identifiers;
      const data = ids.map(i => all.find(c => c.name.split(' // ')[0] === i.name)).filter(Boolean);
      const not_found = ids.filter(i => !all.some(c => c.name.split(' // ')[0] === i.name));
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data, not_found }) });
    });
    await p.route('https://cards.scryfall.io/**', r => r.abort());
    await p.goto(BASE + 'import/');
    await p.evaluate(() => localStorage.clear());
    return p;
  };
  const check = async (p, text) => {
    await p.fill('#deckText', text);
    await p.click('#check');
    await p.waitForFunction(() => /^Done|Couldn't/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  };
  for (const [w, h, shot] of [[1280, 900, 'import-desk.png'], [400, 860, 'import-phone.png']]) {
    const p = await page(w, h);
    // Kefka is fully modeled; a card the engine lacks and a misspelled one still show up
    await check(p, deckText.replace('1 Mox Opal', '1 Arbor Elf') + '\n1 Not A Real Card Name');
    const status = await p.textContent('#status');
    const stats = await p.$$eval('.stat', els => els.map(e => e.textContent.trim()));
    const prompt = await p.inputValue('#prompt');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    console.log(w, '| requests', p.requests, '| status:', status);
    console.log('   stats', stats.join(' · '), '| gaps', await p.$$eval('.gap', els => els.length), '| overflow', overflow, '| play hint:', await p.textContent('#playHint'));
    for (const m of ['### Arbor Elf', '### Not A Real Card Name', 'Commander: Kefka, Court Mage']) if (!prompt.includes(m)) fail('prompt lacks ' + m);
    if (prompt.includes('## Engine work needed first')) fail('prompt still asks for engine work');
    if (!stats.some(s => /^99modeled/.test(s))) fail('expected 99 modeled: ' + stats.join(','));
    if (!/Not found on Scryfall: Not A Real Card Name/.test(status)) fail('missing card not reported');
    if (overflow > 0) fail(`page scrolls sideways at ${w}px`);
    await p.screenshot({ path: path.resolve(__dirname, shot), fullPage: false });
    if (w === 1280) {
      // hand it to the playtester
      await p.fill('#deckName', 'Kefka test');
      await Promise.all([p.waitForNavigation(), p.click('#play')]);
      await p.waitForTimeout(400);
      const st = await p.evaluate(() => ({ deck: DECK.id, cmd: S.cmdZone, size: S.lib.length + S.hand.length, elves: S.lib.concat(S.hand).includes('Arbor Elf'), fake: S.lib.concat(S.hand).includes('Not A Real Card Name'), elf: C['Arbor Elf'], url: location.search }));
      console.log('   playtester:', JSON.stringify({ ...st, elf: undefined }));
      if (st.deck !== 'imp-kefka-test' || st.cmd[0] !== 'Kefka, Court Mage // Kefka, Ruler of Ruin' || st.size !== 99 || !st.elves || st.fake) fail('playtester did not load the imported deck');
      if (!st.elf || st.elf.k !== 'creature' || st.elf.c !== 'G') fail('unmodeled card has no plain data');
      if (st.url) fail('the deck query stays in the address bar');
      // the elf plays by hand: cast it with a Forest-free board via the pool
      await p.evaluate(() => { S.phase = 'play'; S.hand = ['Arbor Elf']; S.pool.G = 1; cast('Arbor Elf', 'hand'); });
      await p.waitForTimeout(200);
      if (!(await p.evaluate(() => S.stack.some(x => x.name === 'Arbor Elf')))) fail('with hold priority on, the spell should wait on the stack');
      await p.evaluate(() => { resolveTop(); }); await p.waitForTimeout(200);
      if (!(await p.evaluate(() => S.bf.some(x => x.name === 'Arbor Elf')))) fail('an unmodeled creature could not be cast');
    }
    await p.close();
  }
  // a paste without a marked commander: Kefka is guessed
  const p = await page(1280, 900);
  const lines = deckText.trim().split('\n').filter(Boolean);
  await check(p, [...lines.slice(1, 40), lines[0], ...lines.slice(40)].join('\n'));
  const warn = await p.textContent('#warnings');
  const prompt = await p.inputValue('#prompt');
  console.log('guess | warnings:', warn.slice(0, 90), '| promptBox hidden', await p.evaluate(() => document.getElementById('promptBox').hidden));
  if (!/the guess is Kefka, Court Mage/.test(warn)) fail('commander not guessed');
  if (/No commander found/.test(warn)) fail('still says no commander');
  if (prompt) fail('a fully modeled deck should need no request');
  // two legends could lead it: the warning offers both, and a click picks one
  await check(p, [...lines.slice(1, 40), lines[0], ...lines.slice(40, -1), '1 Kefka Twin'].join('\n'));
  const picks = await p.$$eval('[data-cmdr]', els => els.map(e => e.textContent));
  console.log('tie | picks:', picks.join(', '));
  if (picks.length !== 2 || !picks.includes('Kefka Twin')) fail('the tied legends are not offered');
  await p.click('[data-cmdr="Kefka, Court Mage // Kefka, Ruler of Ruin"]');
  if (!/Kefka, Court Mage is the commander/.test(await p.textContent('#status'))) fail('picking a commander did not take');
  if (await p.$('[data-cmdr]')) fail('the commander buttons stay after a pick');
  await p.close();
  console.log('errors:', errs);
  await b.close();
})();
