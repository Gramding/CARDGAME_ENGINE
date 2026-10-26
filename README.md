# Cardgame engine

A browser playtester for Magic: The Gathering, starting from a Krark, the Thumbless + Sakashima of a
Thousand Faces cEDH deck, plus a Python simulator for that deck. The plan is to grow the playtester
into a general engine where card behaviour lives in per-card scripts and anything unscripted can
still be played by hand.

**Live site:** https://gramding.github.io/cardgame_engine/ (deployed from `main` by GitHub Actions)

## What is here

| Path | What it is |
| --- | --- |
| `src/playtester/` | The playtester: `page.html` (layout and styles), `app.js` (game engine and UI), `cards.json` (card data), `images.json` (Scryfall image links) |
| `build.py` | Puts those together into `site/index.html` |
| `tests/` | Browser tests (Playwright) and `run.sh` to run them all |
| `sim/krark/` | The Python simulator, its reports and the human-versus-simulator comparison |
| `.github/workflows/pages.yml` | Builds the site and publishes it to GitHub Pages on every push to `main` |

## The playtester

Goldfish the deck with a real stack: each Krark trigger flips on its own, triggers that fire together
can be ordered, you can respond to your own spells, and copies, clones and loops are handled. It
has undo and redo with seeded randomness, Moxfield-style keybinds (press `?`), a mulligan drill,
loop recording, repeated casting and automatic win checks.

Build and open it locally:

```sh
python3 build.py
open site/index.html        # or just double-click it
```

Games save in your browser and can be exported as JSON from the log drawer (`L`).

Card images are loaded from [Scryfall](https://scryfall.com). Card images and text © Wizards of the
Coast; this is unofficial fan content.

## Tests

```sh
npm install
npx playwright install chromium
npm test
```

## The simulator

```sh
cd sim/krark
python3 krark_sim.py -n 1000 --turns 4      # goldfish run, writes results/
python3 make_report.py                      # rebuilds REPORT.md
```

See `sim/krark/README.md` for how the pilot plays and `sim/krark/REPORT.md` for the latest results.
