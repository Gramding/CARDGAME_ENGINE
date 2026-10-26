# Your playtests against the simulator

11 games logged in the playtester (26 Oct 2026), compared with the simulator playing **the exact hands you kept** 150 times each over 5 turns. Script: `tools/human_compare.py`, raw numbers in `results/human_compare.json`.

## The headline

| | you | sim pilot, same kept hands |
| --- | ---: | ---: |
| wins by turn 4 | **5 of 11** (45%) | 1.4 of 11 expected (12%) |
| wins by turn 5 | **7 of 11** (64%) | 3.7 of 11 expected (34%) |

If the sim pilot were as good as you on these hands, a result this strong would happen about 1 time in 200 by turn 4 and 1 in 30 by turn 5. Leaving out the three games with more than two undos still gives 3 wins by turn 4 against 0.8 expected (about 1 in 30). The sample is small, but the gap is far too large to be luck: **you are winning roughly three times as often as the pilot by turn 4.**

How each game went:

| game | kept | Krark | you | sim by T4 | sim by T5 |
| --- | ---: | ---: | --- | ---: | ---: |
| gmvp1g9 | 7 | T2 | **win T3**, burn copies | 31% | 65% |
| gmvozck | 6 | T2 | **win T4**, Dualcaster loop | 22% | 35% |
| gmvp20z | 7 | T2 | **win T4**, 2,108 Krark triggers (not ended in the page) | 14% | 36% |
| gmvp50a | 7 | T3 | **win T4**, Dualcaster + Molten loop | 17% | 44% |
| gmvp5lv | 7 | T3 | **win T4**, Krark 100+ | 9% | 36% |
| gmvp4a9 | 6 | T1 | **win T5**, Krark 100+ | 7% | 27% |
| gmvp595 | 5 | T1 | **win T5**, Krark 100+ | 6% | 23% |
| gmvp2fg | 6 | T3 | big T5 (150 mana, not ended) | 7% | 28% |
| gmvp30r | 7 | T1 | unfinished at T4 | 10% | 40% |
| gmvoxq | 6 | T1 | abandoned at T3 | 11% | 24% |
| gmvoym | 4 | T2 | stopped at T5 | 3% | 10% |

## Where you and the pilot differ

**1. You win with the clone engine, the pilot wins with Vivi.** In the pilot's wins on your hands, Vivi pings are the most common kill in every single game. You never won with Vivi. Your kills were Krark 100+ (via Twinflame or Molten Duplication on Krark, doubling each cast: 4, 10, 16, 32, 62, 100 triggers), Dualcaster in response to a clone spell, and burn copies. The simulator only calls the clone loop a win once Sakashima is out, 12 Krarks are on the battlefield and the mana keeps up, and its pilot rarely gets that far on these hands. **Fix in the sim: count 100+ Krark triggers as a win, as the playtester now does, and let the pilot start the doubling chain earlier.**

**2. You go off with almost nothing on the board.** Before your winning turn you usually had Krark plus at most one or two pieces (Relic, Sakashima, Ral or Prodigy). The engine gets built during the combo turn: Tavern Scoundrel, Storm-Kiln, Birgi and Sakashima are cast mid-turn with mana from the chain. The pilot only starts a chain with two Krark triggers, or with one trigger plus Birgi, Electro, Kiln, Scoundrel or Vivi already on the battlefield. Your turn-3 win in the Ogre game started from a lone Krark, and your Krark 100+ win in gmvp5lv started from Krark with Archmage and Ral, neither of which the pilot counts.

**3. You recast 1-mana cantrips over and over.** Expedite, Borne Upon a Wind, Gitaxian Probe, Strike It Rich, Might of the Meek and Pyretic Ritual were cast up to 10 times in a turn. With two Krarks and Scoundrel each cast pays for itself in Treasures and draws cards, which digs to Gamble and Twinflame. This "cheap cantrip engine" is your main way to turn one Krark into a win, and the pilot's check for starting a chain doesn't count it at all.

**4. You cast Sakashima mid-combo as Krark.** In three winning turns Sakashima came down during the chain, right when the cantrip engine had made enough mana, doubling every flip that followed.

**5. You hold Dualcaster as a response.** Twice you cast Dualcaster in response to your own Krark trigger for Molten Duplication or Twinflame, which is the infinite hasty-Dualcaster loop.

**6. Trigger order.** You almost always put mana and card triggers (Birgi, Archmage, Vivi, Ashling) above Krark, so they resolve first, and you put Ral's flips either first or last. That matches the playtester's default, so no change is needed.

**7. Ral and Prodigy before Krark.** In three games you cast Ral or Harmonic Prodigy on turn 2 and Krark on turn 3, and two of those won on turn 4. The pilot always plays Krark first.

## Mulligans

You and the mulligan model agreed on 15 of 26 decisions (58%).

- **You keep sevens the model ships.** In four games the model would have mulliganed a seven you kept, and three of those were turn-4 wins, for example *City of Traitors, Probe, Swat, two fetches, Scoundrel, Pinnacle Monk* and *Mountain, Ral, Foothills, Force, Expedite, Mana Vault, Fiery Islet*. The model's bar for keeping seven looks too high.
- **You ship some hands the model likes.** For example *Polluted Delta, Rite of Flame, Bolt, Jeska's Will, Electro, Mana Vault, Ponder*, a turn-1 Krark hand with Jeska's Will that the model rates as one of its best. The model leans heavily on "turn-1 Krark" and "has Jeska's Will". You seem to value a coherent plan for turns 2 to 4 more.
- **Your note on the Ogre hand** ("can go from Ogre to Jeska's Will with one Krark out; safety and recasts if it fails") describes a backup plan, which the model has no feature for.

Eleven games give only 26 mulligan decisions. The new **Mulligan drill** in the playtester collects them about 100 times faster, and 300 to 500 drill answers would be enough to refit the model to your keeps.

## Data notes

- **Lost final turns.** The final turn of four finished games was lost to an autosave bug (fixed). Those games still count here because the result was saved.
- **Truncated long turn.** The 2,108-trigger turn kept only its last 1,500 events, so its opening decisions are missing. Long turns now keep their beginning.
- **Undo could reroll flips.** Undoing a cast and casting it again used to give fresh coin flips. The random sequence is now part of the saved game, so Undo replays the same results, and the page counts undos that took back a flip you had already seen.

## What to change in the simulator next

1. Treat 100+ Krark triggers as a win and lift the Krark token cap, so the clone engine is valued correctly.
2. Teach the pilot the mid-turn engine: let one Krark plus 1-mana cantrips start a chain, keep recasting them, cast Scoundrel, Kiln or Sakashima from the mana as soon as it can, then look for a clone spell.
3. Allow Ral or Prodigy before Krark when Krark can still come down on the next turn.
4. Refit the mulligan model once the drill has a few hundred of your answers.
