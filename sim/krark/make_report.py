#!/usr/bin/env python3
"""Build REPORT.md from the simulator's result files.

Reads results/goldfish_summary.json, results/interactive_summary.json, results/experiments.json
and results/sample_games.txt. Usage: python3 make_report.py [--results results] [--out REPORT.md]
"""
import argparse
import json
import os

BAR = 24


def bar(frac, width=BAR):
    full = frac * width
    whole = int(full)
    part = " ▏▎▍▌▋▊▉"[int((full - whole) * 8)]
    return ("█" * whole + (part if whole < width else "")).rstrip() or "▏"


def pct(x, digits=1):
    return f"{x * 100:.{digits}f}%"


def load(path):
    with open(path) as f:
        return json.load(f)


def turns_of(s):
    return sorted(int(t) for t in s["per_turn"])


def sample_game(path, max_lines=45):
    """Shortest winning sample game, Krark bounce lines folded away."""
    if not os.path.exists(path):
        return None
    games, cur = [], []
    for line in open(path):
        line = line.rstrip("\n")
        if line.startswith("######## sample game"):
            if cur:
                games.append(cur)
            cur = [line]
        elif cur:
            cur.append(line)
    if cur:
        games.append(cur)
    won = [g for g in games if any("*** WIN" in x for x in g)]
    if not won:
        return None
    g = min(won, key=len)
    keep = [x for x in g if "back to hand" not in x]
    if len(keep) > max_lines:
        keep = keep[:max_lines // 2] + ["   ..."] + keep[-max_lines // 2:]
    return "\n".join(keep)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", default="results")
    ap.add_argument("--out", default="REPORT.md")
    a = ap.parse_args()
    gf = load(os.path.join(a.results, "goldfish_summary.json"))
    it = load(os.path.join(a.results, "interactive_summary.json"))
    exp_path = os.path.join(a.results, "experiments.json")
    exp = load(exp_path) if os.path.exists(exp_path) else None
    T = turns_of(gf)
    cw = lambda s, t: s["cumulative_win_by_turn"][str(t)]
    out = []
    w = out.append

    # ------------------------------------------------------------------ headline
    w("# Krark & Sakashima: simulation report\n")
    w(f"{gf['games']:,} simulated games per scenario, {T[-1]} turns each, played by the lookahead pilot "
      f"(see [README.md](README.md) for how the model works). The **goldfish** has opponents who never "
      f"interact. The **interactive** table has an opponent try to remove Krark at the start of "
      f"{pct(it['config']['stack_rate'], 0)} of combo turns, and remove your best engine creature in "
      f"{pct(it['config']['removal_rate'], 0)} of rounds.\n")
    w("## At a glance\n")
    w("| | goldfish | interactive |\n| --- | ---: | ---: |")
    for t in sorted({t for t in (2, 3, 4, 5, 6) if t <= T[-1]} | {T[-1]}):
        w(f"| win by turn {t} | **{pct(cw(gf, t))}** | **{pct(cw(it, t))}** |")
    w(f"| average win turn | {gf['mean_win_turn']:.2f} | {it['mean_win_turn']:.2f} |")
    w(f"| median win turn | {gf['median_win_turn']} | {it['median_win_turn']} |")
    w(f"| games lost to decking | {pct(gf['losses'].get('drew from an empty library', 0) / gf['games'])} | "
      f"{pct(it['losses'].get('drew from an empty library', 0) / it['games'])} |")
    w("")
    wp = gf.get("winning_turn_profile", {})
    if wp:
        w(f"On the median winning turn the deck casts **{wp['spells_cast']:.0f} spells**, gets "
          f"**{wp['krark_triggers']:.0f} Krark triggers** (the top 10% of winning turns reach "
          f"{gf['winning_turn_krark_triggers_p90']:,}), makes {wp['copies']:.0f} copies, produces "
          f"{wp['mana_produced']:.0f} mana and {wp['treasures']:.0f} Treasures, and ends at "
          f"{wp['flips_per_cast']:.0f} coin flips per spell.\n")

    # ------------------------------------------------------------------ speed
    w("## How fast it wins\n")
    w("Cumulative share of games won by the end of each turn.\n")
    w("| turn | goldfish | | interactive | |\n| ---: | ---: | :--- | ---: | :--- |")
    for t in T:
        w(f"| {t} | {pct(cw(gf, t))} | `{bar(cw(gf, t))}` | {pct(cw(it, t))} | `{bar(cw(it, t))}` |")
    w("")

    # ------------------------------------------------------------------ how
    w("## How it wins\n")
    w("Killing blow, as a share of wins.\n")
    methods = sorted(set(gf["win_methods"]) | set(it["win_methods"]),
                     key=lambda m: -gf["win_methods"].get(m, 0))
    tg, ti = sum(gf["win_methods"].values()) or 1, sum(it["win_methods"].values()) or 1
    w("| kill | goldfish | | interactive |\n| --- | ---: | :--- | ---: |")
    for m in methods:
        g, i = gf["win_methods"].get(m, 0) / tg, it["win_methods"].get(m, 0) / ti
        w(f"| {m} | {pct(g)} | `{bar(g / max(0.01, max(v / tg for v in gf['win_methods'].values())), 16)}` | {pct(i)} |")
    w("\nWhere the damage came from across all goldfish games:\n")
    w("| source | share of damage |\n| --- | ---: |")
    for src, v in list(gf["damage_share"].items())[:8]:
        w(f"| {src} | {pct(v)} |")
    w("")

    # ------------------------------------------------------------------ engine per turn
    w("## The engine, turn by turn (goldfish)\n")
    w("For games still running at the start of each turn. The distribution is very lopsided: most "
      "turns are setup turns, while a combo turn runs into the hundreds. So the median and the top "
      "10% (p90) are shown instead of averages. By turns 7 and 8 the games still running are the slow "
      "draws, which is why their medians drop again.\n")
    w("| turn | games | mana after land drop | mana made (median / p90) | spells (median / p90) | "
      "Krark triggers (median / p90) | flips per spell (avg) | cards drawn (avg) | won this turn |")
    w("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for t in T:
        d = gf["per_turn"][str(t)]
        w(f"| {t} | {d['games_reaching_turn']:,} | {d['mana_potential_p50']} | "
          f"{d['mana_produced_p50']} / {d['mana_produced_p90']} | {d['spells_cast_p50']} / {d['spells_cast_p90']} | "
          f"{d['krark_triggers_p50']} / {d['krark_triggers_p90']} | {d['flips_per_cast_mean']:.1f} | "
          f"{d['cards_drawn_mean']:.1f} | {pct(d['win_this_turn'])} |")
    w("\n### Turns where the chain started\n")
    w("A chain starts with the first instant or sorcery cast while the engine is ready. These are the "
      "turns the deck actually goes for it (medians).\n")
    w("| turn | chains | won that turn | mana made | spells | Krark triggers | copies | Treasures | damage |")
    w("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for t in T:
        d = gf["per_turn"][str(t)]
        if not d.get("went_off_count"):
            continue
        w(f"| {t} | {d['went_off_count']:,} | {pct(d['went_off_win_rate'], 0)} | {d['went_off_mana_produced_p50']} | "
          f"{d['went_off_spells_cast_p50']} | {d['went_off_krark_triggers_p50']} | {d['went_off_copies_p50']} | "
          f"{d['went_off_treasures_p50']} | {d['went_off_damage_p50']} |")
    w("\n### Engine pieces on the turns the chain started\n")
    w("Share of chain-start turns with each piece on the battlefield at the end of the turn.\n")
    w("| turn | Sakashima as Krark | Veyran | Harmonic Prodigy | Staff on Krark | Relic of Legends | Vivi |")
    w("| ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for t in T:
        d = gf["per_turn"][str(t)]
        if not d.get("went_off_count") or "went_off_veyran" not in d:
            continue
        w(f"| {t} | {pct(d['went_off_saka_krark'], 0)} | {pct(d['went_off_veyran'], 0)} | {pct(d['went_off_prodigy'], 0)} | "
          f"{pct(d['went_off_staff_krark'], 0)} | {pct(d['went_off_relic'], 0)} | {pct(d['went_off_vivi'], 0)} |")
    w("\n### Board development\n")
    w("Share of running games with each piece on the battlefield at the end of the turn.\n")
    w("| turn | Krark | 2+ Krarks | doubler (Veyran, Prodigy, Staff) | mana engine | Vivi | chain started |")
    w("| ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for t in T:
        d = gf["per_turn"][str(t)]
        w(f"| {t} | {pct(d['krark_on_bf_mean'], 0)} | {pct(d['two_krarks_mean'], 0)} | {pct(d['doubler_mean'], 0)} | "
          f"{pct(d['mana_engine_mean'], 0)} | {pct(d['vivi_mean'], 0)} | {pct(d['went_off_mean'], 0)} |")
    w("")

    # ------------------------------------------------------------------ protection
    w("## Protection under Krark (interactive table)\n")
    w("Protection is an instant, so Krark flips on it. Any won flip makes a copy that counters the "
      "threat, and the original goes back to hand unless every flip won. If every flip is lost, the "
      "card bounces to hand having done nothing. It can be recast if it can be paid for again: another "
      "blue card to pitch to Force of Will, a free Fierce Guardianship or Deflecting Swat while you "
      "control a commander, or mana for the rest. One cast with one Krark trigger works 50% of the time, "
      "with two triggers 75%.\n")
    w("| card | casts | bounced with no effect | threats stopped | stopped per cast |")
    w("| --- | ---: | ---: | ---: | ---: |")
    tot_c = tot_b = tot_s = 0
    for c, d in it["protection"].items():
        tot_c, tot_b, tot_s = tot_c + d["cast"], tot_b + d["bounced_no_effect"], tot_s + d["stopped"]
        w(f"| {c} | {d['cast']:,} | {d['bounced_no_effect']:,} | {d['stopped']:,} | "
          f"{pct(d['stopped'] / max(1, d['cast']), 0)} |")
    w(f"| **all protection** | **{tot_c:,}** | **{tot_b:,}** | **{tot_s:,}** | **{pct(tot_s / max(1, tot_c), 0)}** |")
    fow = it["protection"].get("Force of Will")
    if fow:
        w(f"\nForce of Will was cast {fow['cast']:,} times in {it['games']:,} games. "
          f"{pct(fow['bounced_no_effect'] / max(1, fow['cast']), 0)} of those casts lost every flip and "
          f"did nothing. Each of those went back to hand and could be cast again if a second blue card "
          f"was there to pitch. The table made {it['interaction_hits_per_game']:.2f} removal attempts per "
          f"game on average, and protection stopped {it['protection_used_per_game']:.2f} of them.\n")

    # ------------------------------------------------------------------ breach
    w("## Underworld Breach\n")
    w("The pilot uses Breach in two ways:\n")
    w("* **Extender.** Rituals, Jeska's Will, Gut Shot, Gitaxian Probe and Brain Freeze escape from the "
      "graveyard during a chain. Escaped spells that lose a flip go back to hand and can then be cast "
      "normally.")
    w("* **Combo.** Breach + Brain Freeze + Lotus Petal: escape Petal for {0} plus three cards and crack it "
      "for one mana. Rite of Flame, Desperate Ritual and Pyretic Ritual act as extra Petals. Brain Freeze "
      "mills you for fuel until about storm 12, then goes at whichever opponent is closest to an empty "
      "library. Birgi, Vivi and Storm-Kiln Artist are cast mid-loop when there is spare mana. Brain "
      "Freeze needs blue and Petal is often the only blue source left, which is what limits the loop.\n")
    fs = gf.get("flag_game_share", {})
    w(f"In the goldfish the Breach + Brain Freeze loop started in {pct(gf.get('breach_combo_games', 0))} of games, "
      f"and those games ended in a win {pct(gf.get('breach_combo_won_that_game', 0), 0)} of the time. "
      f"Brain Freeze landed the killing blow in {pct(gf['win_methods'].get('Brain Freeze mill', 0) / tg)} of wins.\n")
    if exp:
        w(f"Controlled test ({exp['games']:,} games): turn 3, four lands, Breach and Brain Freeze in hand, "
          "Lotus Petal plus six random cards in the graveyard.\n")
        w("| | win that turn |\n| --- | ---: |")
        for row in exp["breach_loop"]:
            w(f"| {'Krark on the battlefield' if row['krark'] else 'no Krark'} | **{pct(row['win_that_turn'])}** |")
        w("\nWithout Krark the loop is fuel-bound. Each Brain Freeze costs three cards to escape plus two Petal "
          "escapes for its mana, and a thin graveyard runs dry with an opponent a few cards short. Krark copies "
          "of Brain Freeze close that gap.\n")

    # ------------------------------------------------------------------ mulligans
    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mulligan_model.json")
    if exp and exp.get("mulligan"):
        w("## Mulligans: hunting for a turn-1 Krark\n")
        w("The pilot mulligans with a model of how likely an opening hand is to win by turn 4. The model was "
          "fitted on thousands of games that kept whatever they were dealt (`tools/mulligan_data.py`). It keeps "
          "a hand when that chance beats the expected value of mulliganing again. The first mulligan is free and "
          "it may go down to two cards, but only when the hand in front of it is worse than the average hand "
          "one card smaller, so going below five is rare. The model sees whether the hand can cast Krark on turn 1, Jeska's Will, "
          "cantrips (one-mana red ones separately), Birgi, trigger doublers, mana engines, Twinflame or Molten "
          "Duplication, rituals, tutors, fast mana, lands and protection.\n")
        mr = {r["policy"]: r for r in exp["mulligan"]}
        if "rule" in mr and "model" in mr:
            n_ = mr["model"]["games"]
            w(f"Head to head ({n_:,} games each, fast greedy pilot):\n")
            w("| | old checklist | model |\n| --- | ---: | ---: |")
            for key, label in (("by_t3", "win by turn 3"), ("by_t4", "win by turn 4"),
                               ("kept_t1_krark_hand", "kept a hand that casts Krark on turn 1"),
                               ("krark_on_t1", "Krark on the battlefield after turn 1")):
                w(f"| {label} | {pct(mr['rule'][key])} | **{pct(mr['model'][key])}** |")
            names = {0: "kept the first seven", 1: "kept the second seven (free mulligan)", 2: "kept six",
                     3: "kept five", 4: "kept four", 5: "kept three", 6: "kept two"}
            steps = sorted({int(x) for r_ in mr.values() for x in r_["mulligans"]})
            for m_ in steps:
                w(f"| {names.get(m_, f'{m_} mulligans')} | {pct(mr['rule']['mulligans'].get(str(m_), 0), 1)} | "
                  f"{pct(mr['model']['mulligans'].get(str(m_), 0), 1)} |")
            w("\nThe model mulligans far more often, mostly to six or five cards; four, three or two cards happen in "
              "a few percent of games, only for very weak hands. In exchange it "
              "keeps a turn-1 Krark hand much more often, which matches the primer's \"thrives in the five to "
              "seven range\".\n")
        if os.path.exists(model_path):
            mm = load(model_path)
            labels = {"t1_krark": "can cast Krark on turn 1", "jeska": "Jeska's Will", "birgi": "Birgi",
                      "red_cantrips": "each one-mana red cantrip", "cantrips": "each other cantrip",
                      "doubler": "Veyran, Prodigy or Wizard's Staff", "mana_engine": "Storm-Kiln, Scoundrel or Electro",
                      "clone_combo": "Twinflame or Molten Duplication", "rituals": "each ritual",
                      "tutors": "each tutor", "fast_mana": "each fast mana piece", "lands": "each land",
                      "no_land": "no land at all", "cards": "each card fewer than seven (negated)",
                      "vivi": "Vivi", "protection": "each protection spell", "flood": "five or more lands",
                      "t2_krark": "Krark only castable on turn 2"}
            wts = sorted(((f_, wt) for f_, wt in zip(mm["features"], mm["weights"]) if f_ != "bias"),
                         key=lambda t: -abs(t[1]))
            w("What the model has learned, as the change in the odds of winning by turn 4 (×1.0 = no effect):\n")
            w("| hand has | odds |\n| --- | ---: |")
            import math as _m
            for f_, wt in wts:
                if f_ == "cards":
                    w(f"| one card fewer than seven | ×{_m.exp(-wt):.2f} |")
                else:
                    w(f"| {labels.get(f_, f_)} | ×{_m.exp(wt):.2f} |")
            w("")

    # ------------------------------------------------------------------ birgi cantrip
    if exp and exp.get("birgi_cantrip"):
        w("## Birgi and a one-mana red cantrip\n")
        w("Birgi refunds the {R} of every spell, so a one-mana red cantrip like Crimson Wisps costs nothing to "
          "recast. Each cast draws a card on every copy and on the original if it resolves, and Krark hands it back "
          "on any lost flip. With two Krark triggers it returns 75% of the time and draws about 1.25 cards a cast. "
          f"Controlled test ({exp['games']:,} games): turn 3, Birgi and Krark in play, two untapped lands, Crimson "
          "Wisps plus four random cards in hand.\n")
        w("| | win that turn | cards drawn (median / p90) | drew 15+ cards | spells cast (median / p90) |")
        w("| --- | ---: | ---: | ---: | ---: |")
        for r in exp["birgi_cantrip"]:
            w(f"| {r['krarks']} Krark{'s' if r['krarks'] > 1 else ''} | **{pct(r['win_that_turn'])}** | "
              f"{r['draws_p50']} / {r['draws_p90']} | {pct(r['draw_15_plus'], 0)} | {r['casts_p50']} / {r['casts_p90']} |")
        w("\nThe draw counts include the turn's normal draw. The pilot stops a card short of an empty library "
          "unless it can refill with Submerge.\n")

    # ------------------------------------------------------------------ twinflame + relic
    if exp and exp.get("twinflame_relic"):
        w("## Twinflame + Relic of Legends\n")
        w("With Sakashima out the legend rule is off, so Twinflame or Molten Duplication on Krark makes another "
          "Krark: every later spell gets one more trigger and comes back more often (1 - 2/2^n). Relic of Legends "
          "taps each of those legendary copies for a mana, so every copy also pays like a Storm-Kiln Treasure or a "
          "Tavern Scoundrel win. Once the clone spell keeps returning with a dozen Krarks, the loop makes as many "
          "hasty Krarks as you like and they attack for the win.\n")
        w(f"Controlled test ({exp['games']:,} games): turn 3, three lands, Krark and Sakashima-as-Krark in play, "
          "Twinflame plus four random cards in hand.\n")
        w("| | win that turn | via the Krark loop |\n| --- | ---: | ---: |")
        for row in exp["twinflame_relic"]:
            loop = sum(v for m, v in row["methods"].items() if "Krark loop" in m) / exp["games"]
            w(f"| {'Relic of Legends in play' if row['relic'] else 'no Relic'} | **{pct(row['win_that_turn'])}** | {pct(loop)} |")
        w("\nWith two Krark triggers the first Twinflame has a 25% chance to win both flips and resolve into the "
          "graveyard, which ends the loop. That is most of the misses.\n")

    # ------------------------------------------------------------------ jeska
    if exp:
        w("## Turn-2 Jeska's Will\n")
        w(f"Controlled test ({exp['games']:,} games per pilot): Krark cast on turn 1, Volcanic Island and "
          "Mox Diamond in play, then Command Tower, Jeska's Will and four random cards on turn 2.\n")
        ts = sorted(int(key[4:]) for key in exp["jeska_turn2"][0] if key.startswith("by_t"))
        w("| pilot | " + " | ".join("win T2" if t == 2 else f"by T{t}" for t in ts)
          + " | double Jeska's on T2 | those win T2 |")
        w("| --- | " + " | ".join("---:" for _ in ts) + " | ---: | ---: |")
        for r in exp["jeska_turn2"]:
            w(f"| {r['pilot']} | " + " | ".join(pct(r[f'by_t{t}']) for t in ts)
              + f" | {pct(r['double_jeska_t2'])} | {pct(r['double_jeska_win_t2'])} |")
        w("\nWith one Krark trigger Jeska's Will is a single coin flip. A won flip means two resolutions "
          "(about 12 red mana and 6 exiled cards). A lost flip sends it back to hand with the mana spent. "
          "With two or more triggers it comes back at least 75% of the time and pays for its own recast. "
          "The lookahead pilot takes the turn-2 shot only when its rollouts say the hand can convert it.\n")

    # ------------------------------------------------------------------ misc
    w("## Other pieces\n")
    w(f"* **Wizard's Staff** was equipped in {pct(fs.get('staff_equips', 0))} of games. It comes down "
      "right after the Krark engine pieces and is kept on a Krark for one more flip on every instant "
      "and sorcery.")
    sub = fs.get("shed_hand", 0) + fs.get("shed_escape", 0) + fs.get("shed_breach+escape", 0) + fs.get("refill_hand", 0)
    w(f"* **Submerge as the deck-out valve** was used in {pct(sub)} of games: it removes Archmage or "
      "Ashling before their forced draws empty the library, or puts one of your creatures back on top "
      "before a draw step. It is free whenever an opponent has a Forest, and Breach recurs it from the "
      "graveyard (escape costs {4}{U} plus three cards).")
    plans = gf.get("lookahead_plans", {})
    if plans:
        tp = sum(plans.values())
        w("* **Lookahead plans** picked on Krark turns: " + ", ".join(
            f"{p} {pct(c / tp, 0)}" for p, c in plans.items()) + ". The Breach loop runs first in every "
            "plan whenever its pieces are there, so the separate `breach` plan almost never adds anything.")
    mull = gf["mulligans"]
    tm = sum(mull.values())
    w("* **Mulligans** in this run (first one free, model policy): " + ", ".join(
        f"{k} mulligan{'s' if k != '1' else ''} {pct(v / tm, 0)}" for k, v in mull.items()) + ".")
    w("")

    # ------------------------------------------------------------------ primer
    w("## The primer's claims, checked\n")
    w("Claims from the Krark Sakashima Storm [TOODEEP] primer by kenbaumann, next to what the simulation shows.\n")
    rows = [("Wins most often on turns 3, 4 and 5.",
             f"The simulated goldfish wins {pct(cw(gf, 3), 1)} of games by turn 3 and {pct(cw(gf, min(4, T[-1])), 1)} by "
             f"turn {min(4, T[-1])}. The pilot is slower than the primer's 1,000 tracked games, which is the clearest "
             "sign it leaves wins on the table.")]
    rows.append(("Chance a spell is both copied and returned: 1 - 2/2^n for n Krark triggers.",
                 "Exact by construction: the simulator flips every trigger, copies on each win and returns the "
                 "card on any loss. n = 1: 0%, 2: 50%, 3: 75%, 4: 88%, 6: 97%."))
    if exp:
        fire = next((r for r in exp["jeska_turn2"] if r["pilot"].startswith("fires")), None)
        look = next((r for r in exp["jeska_turn2"] if r["pilot"].startswith("lookahead")), None)
        hold = next((r for r in exp["jeska_turn2"] if r["pilot"].startswith("greedy")), None)
        last_t = max(int(key[4:]) for key in exp["jeska_turn2"][0] if key.startswith("by_t"))
        last_key = f"by_t{last_t}"
        if fire and look and hold:
            rows.append(("Jeska's Will with one Krark trigger: win the flip and you likely win the game.",
                         f"After a turn-2 double Jeska's, the lookahead pilot wins that turn "
                         f"{pct(look['double_jeska_win_t2'], 0)} of the time and the greedy pilot "
                         f"{pct(fire['double_jeska_win_t2'], 0)}. Firing it off one Krark wins {pct(fire['by_t2'], 1)} on turn 2 and "
                         f"{pct(fire[last_key], 0)} by turn {last_t}, against {pct(hold['by_t2'], 1)} and {pct(hold[last_key], 0)} "
                         "for holding it. Converting "
                         "12 red mana and 6 exiled cards is the hardest part for a program."))
        bl = {r["krark"]: r["win_that_turn"] for r in exp["breach_loop"]}
        rows.append(("Breach: Brain Freeze yourself, escape Lotus Petal to pay for it, repeat.",
                     f"Turn-3 test: {pct(bl.get(False, 0), 0)} win that turn without Krark, {pct(bl.get(True, 0), 0)} with "
                     "Krark. Submerge on your own creatures keeps you from decking."))
    monk = sum(v for m, v in gf["win_methods"].items() if m.startswith("Pinnacle Monk"))
    fsg = gf.get("flag_game_share", {})
    clones = sum(v for k, v in gf.get("flags", {}).items() if k.startswith("clone_"))
    rows.append(("Molten Duplication: alternate a Krark-trigger source and a mana source; with Pinnacle Monk "
                 "it makes infinite hasty Monks.",
                 f"The pilot alternates targets (Krark tokens with Sakashima, Harmonic Prodigy, then Mana Vault, "
                 f"Sol Ring, Relic, Scoundrel, Storm-Kiln); {clones:,} clone tokens were made. The Monk loop landed "
                 f"{pct(monk / tg)} of kills and Dualcaster Mage + Twinflame or Molten Duplication "
                 f"{pct(sum(v for m, v in gf['win_methods'].items() if m.startswith('Dualcaster')) / tg)}."))
    rows.append(("Pact of Negation can be spammed; Deflecting Swat starts Magecraft.",
                 f"Both are cast as free spells while one of ours is on the stack: Swat in "
                 f"{pct(fsg.get('fodder_Deflecting Swat', 0), 0)} of games, Pact in "
                 f"{pct(fsg.get('fodder_Pact of Negation', 0), 0)}, Flusterstorm for its storm copies in "
                 f"{pct(fsg.get('fodder_Flusterstorm', 0), 0)}."))
    ci = {d["card"]: d for d in gf.get("card_impact", {}).get("cards", [])}
    over = ["Jeska's Will", "Tavern Scoundrel", "Archmage Emeritus", "Harmonic Prodigy", "Treasonous Ogre"]
    weak = [c.split(",")[0] for c in over if c in ci and ci[c]["lift"] < 0.05]
    weak_text = ""
    if weak:
        weak_text = (" " + " and ".join(weak) + (" barely moves" if len(weak) == 1 else " barely move")
                     + " the needle in the simulation, which points at how the pilot uses "
                     + ("it." if len(weak) == 1 else "them."))
    if ci:
        rows.append(("Overperformers: Jeska's Will, Tavern Scoundrel, Archmage Emeritus, Harmonic Prodigy, "
                     "Treasonous Ogre.",
                     "Change in win rate by turn " + str(gf["card_impact"]["by_turn"]) + " when the card was found "
                     "by turn 3: " + ", ".join(
                         f"{c.split(',')[0]} {ci[c]['lift'] * 100:+.0f}" for c in over if c in ci)
                     + " points. Jeska's Will is the deck's best card here too."
                     + weak_text))
    rows.append(("Mulligan to a hand with a plan; the deck thrives at five to seven cards.",
                 "The mulligan keeps a hand when its modeled chance to win by turn 4 beats mulliganing again. "
                 "A hand that casts Krark on turn 1 is worth the most after Jeska's Will, so the pilot mulligans "
                 "hard for one, mostly to six or five cards. It may go to two, but only when the smaller hand is "
                 "worth more on average, so four or fewer happens in a few percent of games."))
    w("| primer | simulation |\n| --- | --- |")
    for a_, b_ in rows:
        w(f"| {a_} | {b_} |")
    w("")
    if ci:
        cards = gf["card_impact"]["cards"]
        w("## Which cards matter\n")
        w(f"Win rate by turn {gf['card_impact']['by_turn']} when a card had left the library by the end of turn 3 "
          "(drawn, tutored, fetched or exiled to play), minus the rate when it had not. This is a correlation: a "
          "card seen early also means a game that drew more cards, so lands and cantrips get some credit "
          "they don't fully earn.\n")
        w("| card | lift | seen by T3 |\n| --- | ---: | ---: |")
        for d in cards[:12]:
            w(f"| {d['card']} | {d['lift'] * 100:+.1f} pts | {pct(d['seen_share'], 0)} |")
        w("| ... | | |")
        for d in cards[-6:]:
            w(f"| {d['card']} | {d['lift'] * 100:+.1f} pts | {pct(d['seen_share'], 0)} |")
        w("")

    # ------------------------------------------------------------------ history
    w("## How the numbers moved as the model improved\n")
    w("Earlier versions ran to turn 8; their first four turns compare directly.\n")
    w("| version | goldfish by T3 | goldfish by T4 | interactive by T4 |")
    w("| --- | ---: | ---: | ---: |")
    w("| first greedy pilot | 2.7% | 10.0% | 4.7% |")
    w("| + lookahead, Jeska's hold rule, Breach timing | 2.5% | 12.2% | 6.0% |")
    w("| + Submerge valve, Breach loop, Staff priority, protection under Krark | 2.7% | 12.5% | 6.0% |")
    w("| + primer lines: Molten/Monk loops, free Pact and Swat, Flusterstorm, Ogre | 2.7% | 12.9% | 6.2% |")
    w("| + Relic of Legends with Twinflame/Molten Krark loop, 4-turn horizon | 3.1% | 13.9% | 6.5% |")
    w(f"| + model mulligan for turn-1 Krark, Krark-first turns 1-2, Step Through / Recruiter timing (this run) | "
      f"{pct(cw(gf, 3))} | {pct(cw(gf, min(4, T[-1])))} | {pct(cw(it, min(4, T[-1])))} |")
    w("")

    # ------------------------------------------------------------------ sample
    sg = sample_game(os.path.join(a.results, "sample_games.txt"))
    if sg:
        w("## A sample winning game\n")
        w("Krark bounce lines are folded away.\n")
        w("```\n" + sg + "\n```\n")

    # ------------------------------------------------------------------ caveats
    w("## Read these numbers with care\n")
    w("* The pilot is a program. It picks a plan for each turn by playing the turn out several times "
      "on copies of the game, but it does not search every casting order. A strong player converts "
      "more of these turns, so treat the win rates as a floor.")
    w("* Opponents are three 40-life players with 92-card libraries. They interact only through the two "
      "settings above and never counter your protection back.")
    w("* Free spells assume a legal target exists: an opponent's artifact for Mogg Salvage, an "
      "opponent's creature for Submerge and Snap.")
    w("* Krark tokens stop at 12 and all tokens at 30, and a turn with more than 400 spells counts as a "
      "loop. Extra hasty Twinflame bodies past the cap still attack.")
    w("* The primer guided the combo lines, but the pilot is still a program working from heuristics. "
      "It has no notion of the political or table-reading parts of the primer.\n")
    w("Regenerate with `python3 krark_sim.py --interactive-preset --sample 3`, then "
      "`python3 experiments.py`, then `python3 make_report.py`.")

    with open(a.out, "w") as f:
        f.write("\n".join(out) + "\n")
    print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
