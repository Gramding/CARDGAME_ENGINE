// Shared helpers for the Kefka browser tests: open the built page, set up a board, answer sheets.
const { chromium } = require(process.env.PW || 'playwright');
const PAGE = process.env.PAGE || 'file://' + require('path').resolve(__dirname, '../../site/index.html');

async function table() {
  const b = await chromium.launch((process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
  await p.goto(PAGE); await p.waitForTimeout(300);
  const ev = (f, a) => p.evaluate(f, a);
  const T = {
    b, p, ev, errs,
    // run something in the page without waiting for it (it may open sheets)
    go: async (f, a) => { await p.evaluate(([src, a]) => { window.__run = (0, eval)(src)(a); }, [f.toString(), a]); await p.waitForTimeout(120); },
    sheet: () => ev(() => ({ open: !document.getElementById('sheet').hidden, title: document.getElementById('sheetTitle').textContent, btns: [...document.querySelectorAll('#sheetButtons button')].map(x => x.textContent) })),
    title: async () => (await T.sheet()).title,
    press: async l => {
      await p.waitForFunction(l => [...document.querySelectorAll('#sheetButtons button')].some(x => x.textContent.startsWith(l)), l, { timeout: 4000 });
      await ev(l => [...document.querySelectorAll('#sheetButtons button')].find(x => x.textContent.startsWith(l)).click(), l);
      await p.waitForTimeout(120);
    },
    // click a choice in the open sheet by its text
    pick: async t => {
      await p.waitForFunction(t => [...document.querySelectorAll('#sheetBody .pick')].some(x => x.textContent.includes(t)), t, { timeout: 4000 });
      await ev(t => [...document.querySelectorAll('#sheetBody .pick')].find(x => x.textContent.includes(t)).click(), t);
    },
    setup: async (hand, bf, deck = 'kefka') => { for (let i = 0; i < 5 && (await T.sheet()).open; i++) { await ev(() => closeSheet(null)); await p.waitForTimeout(80); } return ev(([hand, bf, deck]) => {
      try { localStorage.clear(); } catch (e) {}
      askOrder = false; holdPriority = false; simOpps = false; newGame(deck);
      S.lib = [...S.lib, ...S.hand].filter(n => !hand.includes(n) && !bf.includes(n));
      S.hand = hand; S.phase = 'play'; S.turn = 1;
      S.bf = bf.map(n => ({ uid: S.nextId++, name: n, tapped: false }));
      undoStack = []; redoStack = []; render();
    }, [hand, bf, deck]); },
    idle: () => p.waitForFunction(() => document.getElementById('sheet').hidden, null, { timeout: 4000 }).catch(() => {}),
    resolveAll: async () => { await T.go(() => { resolveAll(); }); },
    state: (f, a) => ev(f, a),
    done: async () => { console.log('errors:', JSON.stringify(errs)); await b.close(); },
  };
  return T;
}
function check(label, ok, extra = '') { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`); if (!ok) process.exitCode = 1; }
module.exports = { table, check };
