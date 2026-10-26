# Krarkashima simulator

A Monte Carlo goldfish of the Krark, the Thumbless + Sakashima of a Thousand Faces list. It plays each game turn by turn and records mana, Krark triggers, copies, treasures, damage and the turn and method of each win.

```
python3 krark_sim.py --interactive-preset --sample 3
```

Output lands in `results/`:

| file | contents |
| --- | --- |
| `goldfish_summary.json` | every statistic below, plus means, medians, p90 and max for each per-turn field |
| `goldfish_per_turn.csv` | one row per turn, ready for a spreadsheet |
| `interactive_*` | the same for a table that answers back (see Interaction) |
| `sample_games.txt` | full play-by-play logs of `--sample N` games |

`results.txt` holds the console report from the last run (1,000 games per scenario, 4 turns, lookahead on).

**[REPORT.md](REPORT.md)** is the write-up of that run. `experiments.py` runs the controlled turn-2 Jeska's Will and Breach loop tests into `results/experiments.json`, and `make_report.py` rebuilds the report from the result files.

## Headline numbers (5,000 games each, 8 turns, lookahead pilot)

| | goldfish | interactive table |
| --- | --- | --- |
| win by T4 | 12.9% | 6.2% |
| win by T5 | 32.8% | 18.1% |
| win by T6 | 52.2% | 33.2% |
| win by T8 | 74.9% | 57.2% |
| mean win turn | 5.77 | 6.16 |

The full breakdown (kill methods, the engine turn by turn, protection under Krark, Breach and the turn-2 Jeska's Will test) is in **[REPORT.md](REPORT.md)**.

These numbers come from a simulated pilot, so they are a lower bound on what a strong player gets from the list. They are most useful for comparing versions of the deck against each other.

## Turn-2 Jeska's Will and the Breach loop

`experiments.py` runs two controlled tests: a turn-2 Jeska's Will off a single Krark, and Underworld Breach + Brain Freeze + Lotus Petal with and without Krark. The results are in [REPORT.md](REPORT.md).

## What the engine models

**Krark.** Every instant or sorcery cast flips one coin per Krark trigger. Each win makes a copy (resolved through last-known information, so wins after the spell has bounced still copy). Any loss returns the card to hand, so the original only resolves when every flip wins. Flashback casts go to exile instead.

**Trigger counts.** Sakashima enters as a copy of Krark and turns off the legend rule, which lets Phyrexian Metamorph, Twinflame and Molten Duplication add more Krarks. Veyran adds one trigger to every cast/copy-caused trigger. Harmonic Prodigy adds one to Shaman and Wizard triggers (Krark, Vivi, Archmage, Storm-Kiln, Ashling, Ral). Wizard's Staff is equipped to Krark for one more.

**Cast and copy payoffs.** Birgi and Electro add R per cast. Vivi grows and pings each opponent. Storm-Kiln makes a Treasure per cast or copy. Archmage draws. Ashling loots, deals 2 to each opponent on her second resolution and adds RRRR on the third. Tavern Scoundrel makes two Treasures per won flip, including Ral's flips. Electro and Ashling keep red mana between turns.

**Spells.** Rituals, Jeska's Will (both modes with a commander out), Strike It Rich with flashback, cantrips, Ponder, Impulse, Frantic Search and Snap untapping lands, Light Up the Stage with spectacle, Gamble's random discard, Mystical Tutor to the top, Brain Freeze with storm, burn aimed at the opponent it can kill, and Fork, Reverberate and Return the Favor cast in response to your own ritual or Jeska's Will while it is still on the stack (the Fork itself gets Krark copies and keeps bouncing back).

**Twinflame / Molten Duplication on Krark.** With Sakashima out each copy is another Krark (one more trigger on every later spell), and with Relic of Legends each legendary copy also taps for a mana, so the line pays for itself like Storm-Kiln Artist or Tavern Scoundrel. Copying Twinflame with Fork keeps enough mana to recast the original. Once the clone spell keeps returning with a dozen Krarks and the mana keeps up, the pilot calls it: endless hasty Krarks attack for the win.

**Finishers.** Dualcaster Mage flashed in response to Twinflame or Molten Duplication is an instant win, as is a Krark copy of Twinflame resolving while Dualcaster is on the battlefield. Electro is bounced with Snap, Submerge or Otawara once the mana pays X for an opponent's life. Underworld Breach lets graveyard spells escape. With Brain Freeze and Lotus Petal it is a combo on its own: escape Petal for {0} plus three cards and crack it, with Rite of Flame, Desperate Ritual and Pyretic Ritual as extra Petals, while Brain Freeze mills you for fuel until about storm 12 and then mills the opponent closest to an empty library. Lotus Petal and Brain Freeze are never exiled to pay for other escapes. Combat attacks with everything that can, including hasty Twinflame tokens, and each opponent chump-blocks the biggest attacker.

**Mana.** Every land, rock and mox has its real colors and quirks: pain lands, Ancient Tomb, City of Traitors, Mana Vault not untapping, Chrome Mox imprint, Mox Diamond discard, Mox Amber off your legends, Lotus Petal, Springleaf Drum, Relic of Legends tapping legends, Vivi's once-per-turn mana, Treasonous Ogre, Simian Spirit Guide, Gemstone Caverns with a luck counter when not first in turn order, fetches thinning the deck, and the MDFC lands.

**Mulligans.** London mulligan with a free first one, down to two cards at most (`--min-hand`). The default `--mulligan model` keeps a hand when its predicted chance to win by turn 4 beats the expected value of mulliganing again, worked out backward from the forced keep at the minimum size, so a terrible three goes to two while an ordinary three is kept. The prediction is a logistic model in `mulligan_model.json`, fitted by `tools/mulligan_data.py` on games that kept whatever they were dealt. It looks at whether the hand casts Krark on turn 1 (a land plus Lotus Petal, Simian Spirit Guide, a mox, Rite of Flame or Gemstone Caverns; Sol Ring and Mana Vault only with a second red source), Jeska's Will, cantrips, Birgi, doublers, mana engines, clone spells, rituals, tutors, fast mana, lands and protection. Cards to bottom are picked by the same model. On turns 1 and 2 Krark is cast before other permanents, and a rock comes first only if Krark stays castable. Chrome Mox imprints a red card when Krark still needs {R}. `--mulligan rule` restores the old checklist (a land, 2 to 5.5 mana sources, one action). Refit the model with `python3 tools/mulligan_data.py` after changing the list.

## Interaction

`--interactive-preset` adds a second run with two knobs (set them yourself with `--stack-rate` and `--removal-rate`):

* when a chain starts, an opponent tries to remove Krark 35% of the time;
* between your turns, an opponent removes your best engine creature 25% of the time.

Protection is an instant, so Krark flips on it: a won flip makes a copy that counters the threat (the original goes back to hand unless every flip won), and if every flip is lost the card bounces with no effect and can be recast if it can be paid for again. Protection is spent by coverage: Force of Will (pitching a blue card), Pact of Negation (only when the upkeep payment is affordable), Fierce Guardianship and Deflecting Swat (free with a commander out), An Offer You Can't Refuse, Flusterstorm, Sink into Stupor, plus partial coverage from Pyroblast, Red Elemental Blast, Mental Misstep and Stifle. Samut gives your instants and sorceries split second, which stops the response at chain start. It also stops your own Fork responses, so Samut only comes down at an interactive table.

## Pilot policy

The pilot has two layers. A greedy layer picks one action at a time, and a lookahead layer picks the plan for the whole turn.

**Greedy layer**

1. Play the best land (color needs first, fetches crack for Volcanic Island or Steam Vents). An unused land drop is spent mid-turn on a land drawn or exiled by Jeska's Will.
2. Cast fast mana, Krark, Sakashima as Krark, then engines (Veyran, Prodigy, Wizard's Staff, Birgi, Storm-Kiln, Vivi, Scoundrel, Electro), using rituals to reach a key piece when needed. Wizard's Staff is kept on a Krark (equip {1}, Krark is a Wizard) and moved back onto one if its holder leaves.
3. Before the engine is ready, cast only cantrips and tutors. Ready means two or more Krark triggers, or Krark plus a mana engine or Vivi (`--patient` waits for engine plus kill instead; in testing it won less).
4. Once ready, cast the spell with the best score: expected mana after triggers first, then cards, damage and the chance the spell comes back.
5. Hold Jeska's Will while there is exactly one Krark trigger. With one trigger it is a single coin flip; with two or more it comes back 75% of the time and pays for its own recast. `--jeska-early` turns this off.
6. Cast Underworld Breach once the graveyard holds Jeska's Will, a ritual or Strike It Rich plus three other cards to exile, and the mana covers Breach and one escape. With Brain Freeze and Lotus Petal (or an escapable ritual) available, Breach and the loop run first in the main phase, before any creatures, and Birgi, Vivi or Storm-Kiln Artist are cast mid-loop with spare mana.
7. Stop before mandatory Archmage or Ashling draws or Jeska's Will exiles could empty the library. Cantrips, tutors and Fork copies of them are also held back when their worst case (every flip won) would leave no card for the next draw step.
8. Submerge is the deck-out valve. When Archmage's draws or Ashling's loots threaten the library, Submerge (or Snap / Otawara) puts that creature on top of the library. If Submerge is already in the graveyard, Underworld Breach recurs it: escape costs {4}{U} plus three exiled cards, because escape and Submerge's free cast are both alternative costs and can't be combined. Once a Krark flip is lost, Submerge returns to hand and is free again. Breach is cast in the main phase between resolutions, or with flash from Borne Upon a Wind or Emergence Zone. The chain always keeps enough cards in the library for the Archmage/Ashling draws that casting Submerge itself causes (every flip assumed won), since those draws resolve before Submerge does. If the library is empty at upkeep, a free Submerge (or Emergence Zone into Breach into escaped Submerge) puts one of your own non-commander creatures on top so the draw step finds a card. Borne can't do that at upkeep, because its own draw would hit the empty library first. Decking now ends about 0.3% of games, almost all of them with Submerge and Breach both already in the graveyard.

**Lookahead layer** (`--lookahead N`, default 6)

At the start of each main phase where Krark is on the battlefield or castable and an instant or sorcery is available, the pilot copies the game and plays the rest of the turn plus the next turn N times under each plan:

| plan | what changes |
| --- | --- |
| `greedy` | the greedy layer as described |
| `allin` | go off with a single Krark trigger, Jeska's Will allowed |
| `wait` | only deploy and dig this turn, save the spells |
| `engine_first` | cast every permanent before any spell |
| `breach` | go off and cast Underworld Breach as soon as it has fuel (only offered with Breach in hand) |

Each rollout scores 1 for a win this turn, 0.7 for a win next turn, and otherwise up to 0.5 for damage dealt, cards in hand, Krark triggers and engines on board. Every plan sees the same coin flips (common random seeds), the best average wins, and the real turn is then played with fresh flips. Opponent interaction is part of the rollouts when it is turned on, so the lookahead also weighs the risk of losing Krark.

The lookahead picks a plan for the turn. It does not search every casting order, so a human who reads exact sequences can still beat it.

## Simplifications

* The primer (Krark Sakashima Storm [TOODEEP]) was supplied as text. Its combo lines are modeled: Jeska's Will, the Breach + Brain Freeze + Lotus Petal loop, Molten Duplication alternating Krark-trigger and mana sources, Pinnacle Monk + Molten Duplication, free Pact of Negation and Deflecting Swat, Flusterstorm with Magecraft and an aggressive Treasonous Ogre. Harnfel, Horn of Bounty, haste cantrips on Tavern Scoundrel and the Borne Upon a Wind APNAP trick are not.
* Opponents are three 40-life players with 92-card libraries and 5 to 7 cards in hand (for Jeska's Will). They draw one card per turn and do nothing else unless the interaction knobs are on.
* Krark tokens stop at 12 and all tokens at 30 to keep run time sane. Extra Twinflame/Molten bodies past the cap still count as 2-power hasty attackers.
* A turn with more than 400 spells counts as a deterministic loop. It is scored as a win when Vivi, Electro, burn or a hasty token army is available, and logged as "infinite, no outlet" otherwise.
* Games stop after turn 4 by default, since cEDH games are usually decided by then (`--turns 8` looks further). With the lookahead on, 1,000 games of 4 turns take a few minutes per scenario on 4 cores; `--lookahead 0` is much faster still.
* Ral never transforms. Birgi's Harnfel side, Pinnacle Monk's prowess, Minamo, Emergence Zone, Mindbreak Trap and An Offer You Can't Refuse aimed at your own spells are not used. Desperate Ritual splice is ignored.
* Mogg Salvage is free when an opponent has an Island (75% of games) and you control a Mountain. Submerge is free when an opponent has a Forest (every game by default, `--p-opp-forest` changes it) and you control an Island-typed land (Volcanic Island, Steam Vents, Thundering Falls or Island, which the seven fetches find).

## Options

```
-n / --games N           games per scenario (default 1000)
--turns T                turns per game (default 4)
--seed S                 RNG seed (results are reproducible)
--jobs J                 worker processes (default: CPU count)
--stack-rate P           chance Krark is attacked when a chain starts
--removal-rate P         chance per round your best engine creature is removed
--interactive-preset     also run stack 0.35 / removal 0.25
--blockers N             chump blockers per opponent in combat (default 1)
--no-combat              pure combo goldfish
--lookahead N            rollouts per plan at the start of each Krark turn (default 6, 0 = greedy only)
--bf-policy P            when Brain Freeze mills you in the Breach loop: early (default), fuel, all
--jeska-early            let the greedy layer cast Jeska's Will off a single Krark trigger
--patient                only go off with a mana engine and a kill in place
--cast-cap N             spells in one turn treated as a loop (default 400)
--no-free-mulligan       first mulligan costs a card
--mulligan model|rule     opening-hand policy (default model)
--min-hand N             smallest hand the model mulligan goes to (default 2)
--p-opp-forest P         chance an opponent controls a Forest, for free Submerge (default 1.0)
--sample N               print and save N full game logs
--out DIR                output directory (default results)
```

To test a different list, edit `DECKLIST` at the top of `krark_sim.py`. Any new card also needs an entry in `CARDS`; the script stops with the missing names if one is absent.
