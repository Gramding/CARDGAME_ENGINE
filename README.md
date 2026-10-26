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
| `src/engine/` | Shared engine code in TypeScript. `registry.ts` knows which cards the engine models and which colors it supports |
| `src/importer/` | The deck importer: decklist parser, Scryfall lookup, coverage check and the request writer |
| `web/import/` | The importer page (built by Vite into `site/import/`) |
| `build.py` | Puts the playtester together into `site/index.html` |
| `tests/` | Unit tests (Vitest) in `unit/`, browser tests (Playwright) in `playtester/` and `importer/`, and `run.sh` to run the browser tests |
| `sim/krark/` | The Python simulator, its reports and the human-versus-simulator comparison |
| `.github/workflows/pages.yml` | Type checks, runs the unit tests, builds the site and publishes it to GitHub Pages on every push to `main` |

## The playtester

Goldfish the deck with a real stack: each Krark trigger flips on its own, triggers that fire together
can be ordered, you can respond to your own spells, and copies, clones and loops are handled. It
has undo and redo with seeded randomness, Moxfield-style keybinds (press `?`), a mulligan drill,
loop recording, repeated casting and automatic win checks.

Build and open it locally:

```sh
npm install
npm run build               # Vite builds the importer, then build.py writes the playtester
open site/index.html        # the playtester also works straight from the file
```

The importer page uses ES modules, so serve `site/` over HTTP to try it locally
(`python3 -m http.server --directory site`), or run `npm run dev` for Vite's dev server.

Games save in your browser and can be exported as JSON from the log drawer (`L`).

Card images are loaded from [Scryfall](https://scryfall.com). Card images and text © Wizards of the
Coast; this is unofficial fan content.

## Deck import

Open it from the playtester's Game menu (**Import a deck**) or at `/import/` on the site. Paste a
Moxfield or Arena export with the commander first and a blank line after it (a `Commander`
heading works too). The importer looks every card up on Scryfall and sorts each one into a bucket:

- **Modeled:** the engine already plays it.
- **Data only:** a mana land, fetch land or mana rock that only needs a data entry.
- **Needs scripting:** anything with its own rules.

It also flags engine work the deck needs first, such as a color the engine can't make yet. Then it
writes a request with every missing card's cost, type and full rules text. Copy it or download it
as Markdown and send it to Claude to get those cards implemented.

Lookups are cached in your browser for a week.

## Tests

```sh
npm install
npx playwright install chromium
npm test                    # type check is separate: npx tsc
```

`npm run test:unit` runs only the Vitest unit tests. `bash tests/run.sh` builds the site and runs
only the browser tests; set `PW` and `CHROMIUM` to use an existing Playwright install.

## The simulator

```sh
cd sim/krark
python3 krark_sim.py -n 1000 --turns 4      # goldfish run, writes results/
python3 make_report.py                      # rebuilds REPORT.md
```

See `sim/krark/README.md` for how the pilot plays and `sim/krark/REPORT.md` for the latest results.
