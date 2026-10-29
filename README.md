# Cardgame engine

A browser playtester for Commander goldfishing. It ships with four cEDH decks (Krark, the Thumbless +
Sakashima of a Thousand Faces, Kefka, Court Mage, Nephilim Epochal, and Q, Stacking the Deck) and plays any deck you import. There is also a
Python simulator for the Krark deck. The plan is to grow the playtester
into a general engine where card behaviour lives in per-card scripts and anything unscripted can
still be played by hand.

**Live site:** https://gramding.github.io/cardgame_engine/ (deployed from `main` by GitHub Actions)

## What is here

| Path | What it is |
| --- | --- |
| `src/playtester/` | The playtester: `page.html` (layout and styles), `app.js` (game engine and UI), `cards.json` (every modeled card), `decks.json` (the built-in decks), `images.json` (Scryfall image links) |
| `src/engine/` | Shared engine code in TypeScript. `registry.ts` knows which cards the engine models and which colors it supports |
| `src/importer/` | The deck importer: decklist parser, Scryfall lookup, coverage check and the request writer |
| `web/import/` | The importer page (built by Vite into `site/import/`) |
| `build.py` | Puts the playtester together into `site/index.html` |
| `tools/audit_cards.py` | Checks every card in `cards.json` against Scryfall (cost, types, power and toughness, keywords, mana); run it after adding cards |
| `tests/` | Unit tests (Vitest) in `unit/`, browser tests (Playwright) in `playtester/` and `importer/`, and `run.sh` to run the browser tests |
| `sim/krark/` | The Python simulator, its reports and the human-versus-simulator comparison |
| `.github/workflows/pages.yml` | Type checks, runs the unit tests, builds the site and publishes it to GitHub Pages on every push to `main` |

## The playtester

Goldfish a deck with a real stack: triggers that fire together can be ordered, you can respond to your
own spells, and copies, clones and loops are handled. It has undo and redo with seeded randomness,
Moxfield-style keybinds (press `?`), a mulligan drill, loop recording, repeated casting and automatic
win checks. Mana covers all five colours, land types for fetches, shocks and painlands.

Switch decks from the Game menu (**Switch deck**).

Everything that uses the stack waits for you: spells, triggers and activated abilities (Wishclaw Talisman,
Kinnan, Deathrite Shaman, channel and the rest) sit on the stack until you press Resolve or `R`, so you can
respond first. Mana abilities stay instant. Turn off "Hold priority" in the log drawer to let a lone item
resolve by itself.

A choice with only one legal answer makes itself, with a short note: the only colour in a mono-red deck,
the only card a tutor can find, the only spell Flare of Duplication can copy, or a discard of your whole
hand. Choices where declining is legal still ask, such as Displacer Kitten's "up to one" or Kari Zev's
Expertise's "may cast". The log drawer has a switch to turn this off.

Passing the turn plays your opponents' turns at random: how many spells each casts (creature or
not) and how many cards they draw, on their turn and off it. Cards that watch opponents, such as
Rhystic Study, Mystic Remora, Esper Sentinel, Smothering Tithe and Tataru Taru, trigger from that, and
opponents sometimes pay the tax (rarely for Esper Sentinel and Mystic Remora). A summary shows what
happened. The odds sit in `OPP_SIM` in `app.js`, and the log drawer has a switch to turn it off.

Each opponent's hand is tracked on its own. They start with seven, draw on their turns, play a land,
cast only what they hold (cantrips refill it) and discard down to seven at their end step. Kefka's
discards come out of those hands, and an opponent with an empty hand discards nothing. The opponent
chips show library and hand, and the hand counter in the top bar adjusts the targeted opponent.

- **Krark + Sakashima:** each Krark trigger flips on its own, with copies, Birgi, Vivi, Ral, Twinflame
  loops and the rest of the storm package.
- **Kefka, Court Mage:** Kefka's discard-and-draw trigger and his {8} transform (Ruler of Ruin draws
  whenever an opponent loses life), Displacer Kitten flicker, Thassa's Oracle with Demonic
  Consultation and Tainted Pact, the tutors, flashback and Yawgmoth's Will, evoke, Final Fortune's
  extra turn, and a combat step with Gogo and Irma. Choices an opponent would make, like what they
  discard or whether they pay for Rhystic Study, are asked of you.
- **Nephilim Epochal:** Ink-Treader Nephilim copies a creature cantrip for every other creature,
  so Wisps untap your mana creatures and draw. It also has hybrid and X costs, convoke and
  harmonize, mana creatures that can't tap the turn they arrive, Gaea's Cradle, Kinnan, Utopia Sprawl
  and Enduring Vitality. Smothering Tithe, Tataru Taru and the other cards that react to opponents get
  a button for "an opponent drew" or "an opponent cast a spell".
- **Q, Stacking the Deck:** Q's trigger exiles a nonland card. The exile viewer then copies it for a
  card from your hand, one at a time or several in a row. Grapeshot's storm copies can be aimed at any
  opponent, and wheels refill your hand. Reforge the Soul offers its miracle cost when it's the first
  card you draw in a turn. Ruby Medallion and Cloud Key lower costs. Aetherflux Reservoir and both Saga
  cards are scripted, and the page calls the Kiki-Jiki + Zealous Conscripts loop a win. Blood Moon
  turns your nonbasic lands into Mountains. Alternative costs work for Fireblast, Flare of
  Duplication, Fury's evoke and Ragavan's dash. Mana Geyser asks how many lands your opponents have
  tapped, since the page doesn't track their boards.

Imported decks get the same rules help for their modeled cards. A mono-red Zada list is covered: Zada,
Hedron Grinder copies a spell aimed only at it for each other creature you control, so the cantrips,
pumps and threaten effects (Traitorous Greed adds RR per copy) multiply across your Goblins. Both
Krenkos, the token spells, Mogg War Marshal's echo, Roaming Throne, the Lieutenants (with your commander
out) and the Equipment work, Skullclamp included. When a pasted list has several legends that could lead
it, the importer offers each one as a button.

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
Moxfield or Arena export with the commander first and a blank line after it. A `Commander` heading
or Moxfield's `[Commander]` category tag works too, and other category tags are ignored. The importer looks every card up on Scryfall and sorts each one into a bucket:

- **Modeled:** the engine already plays it.
- **Data only:** a mana land, fetch land or mana rock that only needs a data entry.
- **Needs scripting:** anything with its own rules.

If no commander is marked, it guesses the one legendary creature whose colours cover the whole deck.
It writes a request with every missing card's cost, type and full rules text. Copy it or download it
as Markdown and send it to Claude to get those cards implemented.

**Play it in the playtester** hands the deck over right away. Cards the engine doesn't model yet come
along as plain cards (type, cost, power and toughness, image, and the mana a simple land makes) that
you play by hand. Imported decks stay in your browser and show up under **Switch deck**.

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
