# Krark & Sakashima: simulation report

1,000 simulated games per scenario, 4 turns each, played by the lookahead pilot (see [README.md](README.md) for how the model works). The **goldfish** has opponents who never interact. The **interactive** table has an opponent try to remove Krark at the start of 35% of combo turns, and remove your best engine creature in 25% of rounds.

## At a glance

| | goldfish | interactive |
| --- | ---: | ---: |
| win by turn 2 | **0.4%** | **0.2%** |
| win by turn 3 | **3.2%** | **1.1%** |
| win by turn 4 | **14.0%** | **6.3%** |
| average win turn | 3.74 | 3.79 |
| median win turn | 4.0 | 4 |
| games lost to decking | 0.2% | 0.3% |

On the median winning turn the deck casts **29 spells**, gets **86 Krark triggers** (the top 10% of winning turns reach 443), makes 58 copies, produces 72 mana and 69 Treasures, and ends at 7 coin flips per spell.

## How fast it wins

Cumulative share of games won by the end of each turn.

| turn | goldfish | | interactive | |
| ---: | ---: | :--- | ---: | :--- |
| 1 | 0.0% | `▏` | 0.0% | `▏` |
| 2 | 0.4% | `▏` | 0.2% | `▏` |
| 3 | 3.2% | `▊` | 1.1% | `▎` |
| 4 | 14.0% | `███▎` | 6.3% | `█▌` |

## How it wins

Killing blow, as a share of wins.

| kill | goldfish | | interactive |
| --- | ---: | :--- | ---: |
| Vivi pings | 30.0% | `████████████████` | 23.8% |
| Twinflame Krark loop (hasty Krark army) | 18.6% | `█████████▉` | 19.0% |
| Dualcaster Mage + Twinflame | 12.9% | `██████▊` | 7.9% |
| Molten Duplication Krark loop (hasty Krark army) | 10.0% | `█████▎` | 9.5% |
| Brain Freeze mill | 10.0% | `█████▎` | 12.7% |
| Dualcaster Mage + Molten Duplication | 9.3% | `████▉` | 11.1% |
| Pinnacle Monk + Twinflame loop (infinite hasty Monks) | 2.1% | `█▏` | 1.6% |
| Gut Shot | 1.4% | `▊` | 0.0% |
| Electro | 1.4% | `▊` | 1.6% |
| Combat damage | 1.4% | `▊` | 4.8% |
| Lightning Bolt | 0.7% | `▍` | 4.8% |
| Sudden Shock | 0.7% | `▍` | 0.0% |
| near-infinite chain (cast cap) | 0.7% | `▍` | 3.2% |
| Pinnacle Monk + Molten Duplication loop (infinite hasty Monks) | 0.7% | `▍` | 0.0% |

Where the damage came from across all goldfish games:

| source | share of damage |
| --- | ---: |
| Vivi pings | 68.7% |
| Gut Shot | 9.1% |
| Lightning Bolt | 7.4% |
| Combat | 6.2% |
| Sudden Shock | 4.0% |
| Electro | 4.0% |
| Ashling | 0.7% |

## The engine, turn by turn (goldfish)

For games still running at the start of each turn. The distribution is very lopsided: most turns are setup turns, while a combo turn runs into the hundreds. So the median and the top 10% (p90) are shown instead of averages. By turns 7 and 8 the games still running are the slow draws, which is why their medians drop again.

| turn | games | mana after land drop | mana made (median / p90) | spells (median / p90) | Krark triggers (median / p90) | flips per spell (avg) | cards drawn (avg) | won this turn |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,000 | 1 | 2 / 3 | 1 / 3 | 0 / 0 | 0.5 | 1.2 | 0.0% |
| 2 | 1,000 | 2 | 2 / 5 | 1 / 3 | 0 / 2 | 1.2 | 1.3 | 0.4% |
| 3 | 996 | 3 | 4 / 9 | 1 / 5 | 0 / 6 | 2.1 | 1.8 | 2.8% |
| 4 | 968 | 4 | 4 / 39 | 1 / 18 | 0 / 58 | 4.0 | 3.2 | 11.2% |

### Turns where the chain started

A chain starts with the first instant or sorcery cast while the engine is ready. These are the turns the deck actually goes for it (medians).

| turn | chains | won that turn | mana made | spells | Krark triggers | copies | Treasures | damage |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 3 | 0% | 3 | 4 | 1 | 1 | 0 | 0 |
| 2 | 93 | 4% | 4 | 3 | 3 | 2 | 0 | 0 |
| 3 | 252 | 10% | 5 | 3 | 4 | 2 | 0 | 0 |
| 4 | 375 | 28% | 8 | 5 | 10 | 6 | 0 | 0 |

### Engine pieces on the turns the chain started

Share of chain-start turns with each piece on the battlefield at the end of the turn.

| turn | Sakashima as Krark | Veyran | Harmonic Prodigy | Staff on Krark | Relic of Legends | Vivi |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 33% | 0% | 0% | 0% | 0% | 0% |
| 2 | 47% | 3% | 12% | 5% | 6% | 4% |
| 3 | 69% | 8% | 12% | 9% | 8% | 7% |
| 4 | 89% | 26% | 20% | 15% | 17% | 22% |

### Board development

Share of running games with each piece on the battlefield at the end of the turn.

| turn | Krark | 2+ Krarks | doubler (Veyran, Prodigy, Staff) | mana engine | Vivi | chain started |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 53% | 0% | 0% | 0% | 0% | 0% |
| 2 | 95% | 17% | 7% | 5% | 0% | 9% |
| 3 | 97% | 57% | 19% | 16% | 3% | 25% |
| 4 | 98% | 83% | 38% | 29% | 12% | 39% |

## Protection under Krark (interactive table)

Protection is an instant, so Krark flips on it. Any won flip makes a copy that counters the threat, and the original goes back to hand unless every flip won. If every flip is lost, the card bounces to hand having done nothing. It can be recast if it can be paid for again: another blue card to pitch to Force of Will, a free Fierce Guardianship or Deflecting Swat while you control a commander, or mana for the rest. One cast with one Krark trigger works 50% of the time, with two triggers 75%.

| card | casts | bounced with no effect | threats stopped | stopped per cast |
| --- | ---: | ---: | ---: | ---: |
| Deflecting Swat | 37 | 10 | 27 | 73% |
| Force of Will | 35 | 15 | 20 | 57% |
| Fierce Guardianship | 32 | 10 | 22 | 69% |
| Mental Misstep | 19 | 13 | 6 | 32% |
| Flusterstorm | 5 | 3 | 2 | 40% |
| Red Elemental Blast | 3 | 1 | 2 | 67% |
| Pyroblast | 3 | 1 | 2 | 67% |
| Sink into Stupor // Soporific Springs | 3 | 0 | 3 | 100% |
| An Offer You Can't Refuse | 2 | 1 | 1 | 50% |
| Pact of Negation | 1 | 0 | 1 | 100% |
| **all protection** | **140** | **54** | **86** | **61%** |

Force of Will was cast 35 times in 1,000 games. 43% of those casts lost every flip and did nothing. Each of those went back to hand and could be cast again if a second blue card was there to pitch. The table made 0.70 removal attempts per game on average, and protection stopped 0.09 of them.

## Underworld Breach

The pilot uses Breach in two ways:

* **Extender.** Rituals, Jeska's Will, Gut Shot, Gitaxian Probe and Brain Freeze escape from the graveyard during a chain. Escaped spells that lose a flip go back to hand and can then be cast normally.
* **Combo.** Breach + Brain Freeze + Lotus Petal: escape Petal for {0} plus three cards and crack it for one mana. Rite of Flame, Desperate Ritual and Pyretic Ritual act as extra Petals. Brain Freeze mills you for fuel until about storm 12, then goes at whichever opponent is closest to an empty library. Birgi, Vivi and Storm-Kiln Artist are cast mid-loop when there is spare mana. Brain Freeze needs blue and Petal is often the only blue source left, which is what limits the loop.

In the goldfish the Breach + Brain Freeze loop started in 0.7% of games, and those games ended in a win 29% of the time. Brain Freeze landed the killing blow in 10.0% of wins.

Controlled test (1,000 games): turn 3, four lands, Breach and Brain Freeze in hand, Lotus Petal plus six random cards in the graveyard.

| | win that turn |
| --- | ---: |
| no Krark | **54.3%** |
| Krark on the battlefield | **94.9%** |

Without Krark the loop is fuel-bound. Each Brain Freeze costs three cards to escape plus two Petal escapes for its mana, and a thin graveyard runs dry with an opponent a few cards short. Krark copies of Brain Freeze close that gap.

## Mulligans: hunting for a turn-1 Krark

The pilot mulligans with a model of how likely an opening hand is to win by turn 4. The model was fitted on thousands of games that kept whatever they were dealt (`tools/mulligan_data.py`). It keeps a hand when that chance beats the expected value of mulliganing again. The first mulligan is free and it may go down to two cards, but only when the hand in front of it is worse than the average hand one card smaller, so going below five is rare. The model sees whether the hand can cast Krark on turn 1, Jeska's Will, cantrips (one-mana red ones separately), Birgi, trigger doublers, mana engines, Twinflame or Molten Duplication, rituals, tutors, fast mana, lands and protection.

Head to head (3,000 games each, fast greedy pilot):

| | old checklist | model |
| --- | ---: | ---: |
| win by turn 3 | 1.6% | **2.5%** |
| win by turn 4 | 10.1% | **12.2%** |
| kept a hand that casts Krark on turn 1 | 31.7% | **44.8%** |
| Krark on the battlefield after turn 1 | 35.6% | **49.1%** |
| kept the first seven | 54.9% | 23.9% |
| kept the second seven (free mulligan) | 26.4% | 29.0% |
| kept six | 14.9% | 24.6% |
| kept five | 3.8% | 18.5% |
| kept four | 0.0% | 3.2% |
| kept three | 0.0% | 0.5% |
| kept two | 0.0% | 0.2% |

The model mulligans far more often, mostly to six or five cards; four, three or two cards happen in a few percent of games, only for very weak hands. In exchange it keeps a turn-1 Krark hand much more often, which matches the primer's "thrives in the five to seven range".

What the model has learned, as the change in the odds of winning by turn 4 (×1.0 = no effect):

| hand has | odds |
| --- | ---: |
| Jeska's Will | ×6.25 |
| no land at all | ×0.31 |
| Vivi | ×0.59 |
| Birgi | ×1.65 |
| each fast mana piece | ×1.45 |
| each land | ×1.43 |
| one card fewer than seven | ×0.72 |
| can cast Krark on turn 1 | ×1.38 |
| short | ×0.75 |
| each protection spell | ×0.76 |
| five or more lands | ×0.77 |
| each ritual | ×1.29 |
| each other cantrip | ×1.25 |
| Twinflame or Molten Duplication | ×1.19 |
| each one-mana red cantrip | ×1.14 |
| Storm-Kiln, Scoundrel or Electro | ×0.90 |
| Krark only castable on turn 2 | ×1.09 |
| Veyran, Prodigy or Wizard's Staff | ×1.08 |
| each tutor | ×0.94 |

## Birgi and a one-mana red cantrip

Birgi refunds the {R} of every spell, so a one-mana red cantrip like Crimson Wisps costs nothing to recast. Each cast draws a card on every copy and on the original if it resolves, and Krark hands it back on any lost flip. With two Krark triggers it returns 75% of the time and draws about 1.25 cards a cast. Controlled test (1,000 games): turn 3, Birgi and Krark in play, two untapped lands, Crimson Wisps plus four random cards in hand.

| | win that turn | cards drawn (median / p90) | drew 15+ cards | spells cast (median / p90) |
| --- | ---: | ---: | ---: | ---: |
| 1 Krark | **28.6%** | 5 / 18 | 13% | 10 / 51 |
| 2 Krarks | **54.3%** | 7 / 22 | 23% | 23 / 70 |

The draw counts include the turn's normal draw. The pilot stops a card short of an empty library unless it can refill with Submerge.

## Twinflame + Relic of Legends

With Sakashima out the legend rule is off, so Twinflame or Molten Duplication on Krark makes another Krark: every later spell gets one more trigger and comes back more often (1 - 2/2^n). Relic of Legends taps each of those legendary copies for a mana, so every copy also pays like a Storm-Kiln Treasure or a Tavern Scoundrel win. Once the clone spell keeps returning with a dozen Krarks, the loop makes as many hasty Krarks as you like and they attack for the win.

Controlled test (1,000 games): turn 3, three lands, Krark and Sakashima-as-Krark in play, Twinflame plus four random cards in hand.

| | win that turn | via the Krark loop |
| --- | ---: | ---: |
| no Relic | **9.6%** | 2.3% |
| Relic of Legends in play | **68.8%** | 49.2% |

With two Krark triggers the first Twinflame has a 25% chance to win both flips and resolve into the graveyard, which ends the loop. That is most of the misses.

## Turn-2 Jeska's Will

Controlled test (1,000 games per pilot): Krark cast on turn 1, Volcanic Island and Mox Diamond in play, then Command Tower, Jeska's Will and four random cards on turn 2.

| pilot | win T2 | by T3 | by T4 | double Jeska's on T2 | those win T2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| fires Jeska's off one Krark | 7.9% | 27.4% | 56.5% | 32.3% | 24.5% |
| greedy, holds Jeska's for 2+ triggers | 1.3% | 22.2% | 64.3% | 2.0% | 65.0% |
| lookahead (default) | 9.5% | 31.5% | 67.4% | 25.6% | 37.1% |

With one Krark trigger Jeska's Will is a single coin flip. A won flip means two resolutions (about 12 red mana and 6 exiled cards). A lost flip sends it back to hand with the mana spent. With two or more triggers it comes back at least 75% of the time and pays for its own recast. The lookahead pilot takes the turn-2 shot only when its rollouts say the hand can convert it.

## Other pieces

* **Wizard's Staff** was equipped in 12.7% of games. It comes down right after the Krark engine pieces and is kept on a Krark for one more flip on every instant and sorcery.
* **Submerge as the deck-out valve** was used in 0.6% of games: it removes Archmage or Ashling before their forced draws empty the library, or puts one of your creatures back on top before a draw step. It is free whenever an opponent has a Forest, and Breach recurs it from the graveyard (escape costs {4}{U} plus three cards).
* **Lookahead plans** picked on Krark turns: greedy 86%, wait 8%, allin 4%, engine_first 2%, breach 0%. The Breach loop runs first in every plan whenever its pieces are there, so the separate `breach` plan almost never adds anything.
* **Mulligans** in this run (first one free, model policy): 0 mulligans 26%, 1 mulligan 27%, 2 mulligans 26%, 3 mulligans 16%, 4 mulligans 3%, 5 mulligans 1%.

## The primer's claims, checked

Claims from the Krark Sakashima Storm [TOODEEP] primer by kenbaumann, next to what the simulation shows.

| primer | simulation |
| --- | --- |
| Wins most often on turns 3, 4 and 5. | The simulated goldfish wins 3.2% of games by turn 3 and 14.0% by turn 4. The pilot is slower than the primer's 1,000 tracked games, which is the clearest sign it leaves wins on the table. |
| Chance a spell is both copied and returned: 1 - 2/2^n for n Krark triggers. | Exact by construction: the simulator flips every trigger, copies on each win and returns the card on any loss. n = 1: 0%, 2: 50%, 3: 75%, 4: 88%, 6: 97%. |
| Jeska's Will with one Krark trigger: win the flip and you likely win the game. | After a turn-2 double Jeska's, the lookahead pilot wins that turn 37% of the time and the greedy pilot 24%. Firing it off one Krark wins 7.9% on turn 2 and 56% by turn 4, against 1.3% and 64% for holding it. Converting 12 red mana and 6 exiled cards is the hardest part for a program. |
| Breach: Brain Freeze yourself, escape Lotus Petal to pay for it, repeat. | Turn-3 test: 54% win that turn without Krark, 95% with Krark. Submerge on your own creatures keeps you from decking. |
| Molten Duplication: alternate a Krark-trigger source and a mana source; with Pinnacle Monk it makes infinite hasty Monks. | The pilot alternates targets (Krark tokens with Sakashima, Harmonic Prodigy, then Mana Vault, Sol Ring, Relic, Scoundrel, Storm-Kiln); 12,125 clone tokens were made. The Monk loop landed 2.9% of kills and Dualcaster Mage + Twinflame or Molten Duplication 22.1%. |
| Pact of Negation can be spammed; Deflecting Swat starts Magecraft. | Both are cast as free spells while one of ours is on the stack: Swat in 3% of games, Pact in 3%, Flusterstorm for its storm copies in 1%. |
| Overperformers: Jeska's Will, Tavern Scoundrel, Archmage Emeritus, Harmonic Prodigy, Treasonous Ogre. | Change in win rate by turn 4 when the card was found by turn 3: Jeska's Will +20, Tavern Scoundrel +25, Archmage Emeritus +4, Harmonic Prodigy +7, Treasonous Ogre +7 points. Jeska's Will is the deck's best card here too. Archmage Emeritus barely moves the needle in the simulation, which points at how the pilot uses it. |
| Mulligan to a hand with a plan; the deck thrives at five to seven cards. | The mulligan keeps a hand when its modeled chance to win by turn 4 beats mulliganing again. A hand that casts Krark on turn 1 is worth the most after Jeska's Will, so the pilot mulligans hard for one, mostly to six or five cards. It may go to two, but only when the smaller hand is worth more on average, so four or fewer happens in a few percent of games. |

## Which cards matter

Win rate by turn 4 when a card had left the library by the end of turn 3 (drawn, tutored, fetched or exiled to play), minus the rate when it had not. This is a correlation: a card seen early also means a game that drew more cards, so lands and cantrips get some credit they don't fully earn.

| card | lift | seen by T3 |
| --- | ---: | ---: |
| Tavern Scoundrel | +25.1 pts | 8% |
| Sol Ring | +23.0 pts | 12% |
| Pact of Negation | +21.0 pts | 8% |
| Jeska's Will | +19.9 pts | 22% |
| Twinflame | +19.8 pts | 14% |
| Sink into Stupor // Soporific Springs | +18.7 pts | 9% |
| Flusterstorm | +18.4 pts | 6% |
| Mystical Tutor | +17.8 pts | 8% |
| Molten Duplication | +16.2 pts | 13% |
| Might of the Meek | +16.1 pts | 11% |
| Dualcaster Mage | +15.4 pts | 11% |
| Strike It Rich | +15.1 pts | 12% |
| ... | | |
| Borne Upon a Wind | +1.9 pts | 12% |
| Misty Rainforest | +1.6 pts | 16% |
| Expedite | +1.5 pts | 11% |
| Lightning Bolt | +1.1 pts | 8% |
| Polluted Delta | +0.9 pts | 16% |
| Volcanic Island | -0.5 pts | 71% |

## How the numbers moved as the model improved

Earlier versions ran to turn 8; their first four turns compare directly.

| version | goldfish by T3 | goldfish by T4 | interactive by T4 |
| --- | ---: | ---: | ---: |
| first greedy pilot | 2.7% | 10.0% | 4.7% |
| + lookahead, Jeska's hold rule, Breach timing | 2.5% | 12.2% | 6.0% |
| + Submerge valve, Breach loop, Staff priority, protection under Krark | 2.7% | 12.5% | 6.0% |
| + primer lines: Molten/Monk loops, free Pact and Swat, Flusterstorm, Ogre | 2.7% | 12.9% | 6.2% |
| + Relic of Legends with Twinflame/Molten Krark loop, 4-turn horizon | 3.1% | 13.9% | 6.5% |
| + model mulligan for turn-1 Krark, Krark-first turns 1-2, Step Through / Recruiter timing (this run) | 3.2% | 14.0% | 6.3% |

## A sample winning game

Krark bounce lines are folded away.

```
######## sample game 2 (seat 4, mulligans 0)
T0 | Gemstone Caverns starts in play (exile Thundering Falls)
T1 | --- turn 1: hand = Light Up the Stage, Vivi Ornitier, Birgi, Command Tower, Fiery Islet, Harmonic Prodigy
T1 | play Command Tower
T1 | lookahead: greedy 0.11, allin 0.11, wait 0.11, engine_first 0.11 -> greedy
T1 | cast Krark (cmd)
T2 | --- turn 2: hand = Light Up the Stage, Vivi Ornitier, Birgi, Fiery Islet, Harmonic Prodigy, Steam Vents
T2 | play Fiery Islet
T2 | lookahead: greedy 0.14, allin 0.14, wait 0.14, engine_first 0.14 -> greedy
T2 | cast Harmonic Prodigy
T3 | --- turn 3: hand = Light Up the Stage, Vivi Ornitier, Birgi, Steam Vents, Submerge
T3 | play Steam Vents
T3 | lookahead: greedy 0.25, allin 0.25, wait 0.64, engine_first 0.25 -> wait
T3 | cast Sakashima of a Thousand Faces (cmd)
T3 |   Sakashima of a Thousand Faces enters as Krark
T4 | --- turn 4: hand = Light Up the Stage, Vivi Ornitier, Birgi, Submerge, Lightning Bolt
T4 | lookahead: greedy 1.00, allin 1.00, wait 0.18, engine_first 1.00 -> greedy
T4 | cast Birgi
T4 | cast Lightning Bolt
T4 | cast Lightning Bolt
T4 | cast Lightning Bolt
T4 | cast Lightning Bolt
   ...
T4 | cast Submerge
T4 | cast Submerge
T4 | cast Submerge
T4 | cast Submerge
T4 | cast Submerge
T4 | cast Submerge
T4 |   Krark x4: 4 copies, original resolves
T4 | cast Light Up the Stage
T4 | cast Light Up the Stage
T4 | play City of Brass
T4 | cast Vivi Ornitier
T4 | cast Light Up the Stage
T4 | cast Light Up the Stage
T4 | cast Wizard's Staff (exile)
T4 |   equip Wizard's Staff -> Krark
T4 | cast Brain Freeze (exile)
T4 | cast Jeska's Will (exile)
T4 | cast Treasonous Ogre (exile)
T4 | cast Jeska's Will
T4 | cast Lotus Petal (exile)
T4 | cast Brain Freeze
T4 | *** WIN on turn 4 via Brain Freeze mill (storm 44)

```

## Read these numbers with care

* The pilot is a program. It picks a plan for each turn by playing the turn out several times on copies of the game, but it does not search every casting order. A strong player converts more of these turns, so treat the win rates as a floor.
* Opponents are three 40-life players with 92-card libraries. They interact only through the two settings above and never counter your protection back.
* Free spells assume a legal target exists: an opponent's artifact for Mogg Salvage, an opponent's creature for Submerge and Snap.
* Krark tokens stop at 12 and all tokens at 30, and a turn with more than 400 spells counts as a loop. Extra hasty Twinflame bodies past the cap still attack.
* The primer guided the combo lines, but the pilot is still a program working from heuristics. It has no notion of the political or table-reading parts of the primer.

Regenerate with `python3 krark_sim.py --interactive-preset --sample 3`, then `python3 experiments.py`, then `python3 make_report.py`.
