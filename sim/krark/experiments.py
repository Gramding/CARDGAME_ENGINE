#!/usr/bin/env python3
"""Controlled scenario tests for the Krarkashima simulator.

1. Turn-2 Jeska's Will: Krark out on turn 1, three mana, Jeska's Will in hand. Compares the
   pilot that fires Jeska's off one Krark trigger, the greedy pilot that holds it, and the
   lookahead pilot.
2. Underworld Breach + Brain Freeze + Lotus Petal: turn 3, four lands, Breach and Brain Freeze
   in hand, Lotus Petal plus six random cards in the graveyard, with and without Krark.

Writes results/experiments.json. Usage: python3 experiments.py [-n GAMES] [--out results]
"""
import argparse
import json
import os
import random
from collections import Counter
from multiprocessing import Pool

import krark_sim as k

JESKA = "Jeska's Will"


def cfg(lookahead=0, jeska_early=False, turns=4):
    return argparse.Namespace(
        turns=turns, stack_rate=0, removal_rate=0, interactive=False, cast_cap=400, life_floor=8, ogre_floor=4,
        p_opp_island=.75, p_opp_forest=1.0, free_mulligan=True, safe_draws=False, krark_token_cap=12,
        token_cap=30, exile_floor=25, combat=True, blockers=1, patient=False, jeska_early=jeska_early,
        lookahead=lookahead, bf_policy="early", mulligan_policy="model", min_hand=2)


class JeskaProbe(k.Game):
    def resolve(self, name, is_copy, target):
        if name == JESKA:
            self.jeska_res[self.turn] += 1
        return super().resolve(name, is_copy, target)


def jeska_game(args):
    seed, jeska_early, lookahead = args
    g = JeskaProbe(k.parse_deck(k.DECKLIST), random.Random(seed), cfg(lookahead, jeska_early))
    g.jeska_res = Counter()
    g.shuffle()
    for c in ("Volcanic Island", "Mox Diamond", "Command Tower", JESKA):
        g.library.remove(c)
    g.perms += [k.Perm("Volcanic Island", "land"), k.Perm("Mox Diamond", "artifact"),
                k.Perm(k.KRARK, "creature")]
    g.cmd_zone.discard(k.KRARK)
    g.casts[k.KRARK] = 1
    g.hand = ["Command Tower", JESKA] + [g.library.pop(0) for _ in range(4)]
    g.turn = 1
    t = None
    try:
        while g.turn < 4:
            g.play_turn()
    except k.Win:
        t = g.turn
    except k.Loss:
        pass
    return t, g.jeska_res[2]


def breach_game(args):
    seed, krark = args
    g = k.Game(k.parse_deck(k.DECKLIST), random.Random(seed), cfg())
    g.shuffle()
    lands = ["Volcanic Island", "Steam Vents", "Command Tower", "Island"]
    for c in lands + [k.BREACH, "Brain Freeze", "Lotus Petal"]:
        g.library.remove(c)
    g.perms += [k.Perm(name, "land") for name in lands]
    if krark:
        g.perms.append(k.Perm(k.KRARK, "creature"))
        g.cmd_zone.discard(k.KRARK)
        g.casts[k.KRARK] = 1
    g.gy = ["Lotus Petal"] + [g.library.pop(0) for _ in range(6)]
    g.hand = [k.BREACH, "Brain Freeze"] + [g.library.pop(0) for _ in range(3)]
    g.turn = 2
    try:
        g.play_turn()
    except k.Win as w:
        return w.method
    except k.Loss:
        return "loss"
    return None


def clone_game(args):
    """Turn 3: Krark + Sakashima-as-Krark, three lands, Twinflame in hand (+ four random cards),
    with or without Relic of Legends on the battlefield."""
    seed, relic = args
    g = k.Game(k.parse_deck(k.DECKLIST), random.Random(seed), cfg())
    g.shuffle()
    lands = ["Volcanic Island", "Steam Vents", "Command Tower"]
    for c in lands + ["Twinflame", "Relic of Legends"]:
        g.library.remove(c)
    g.perms += [k.Perm(name, "land") for name in lands]
    g.perms += [k.Perm(k.KRARK, "creature"), k.Perm(k.SAKA, "creature", copy_of=k.KRARK)]
    if relic:
        g.perms.append(k.Perm("Relic of Legends", "artifact"))
    for c in (k.KRARK, k.SAKA):
        g.cmd_zone.discard(c)
        g.casts[c] = 1
    g.hand = ["Twinflame"] + [g.library.pop(0) for _ in range(4)]
    g.turn = 2
    try:
        g.play_turn()
    except k.Win as w:
        return w.method
    except k.Loss:
        return "loss"
    return None


def cantrip_game(args):
    """Turn 3: Krark (and optionally Sakashima-as-Krark) plus Birgi in play, two untapped lands,
    Crimson Wisps and four random cards in hand. How far does a one-mana red cantrip go?"""
    seed, two_krarks = args
    g = k.Game(k.parse_deck(k.DECKLIST), random.Random(seed), cfg())
    g.shuffle()
    lands = ["Volcanic Island", "Steam Vents"]
    for c in lands + ["Crimson Wisps", k.BIRGI]:
        g.library.remove(c)
    g.perms += [k.Perm(name, "land") for name in lands] + [k.Perm(k.KRARK, "creature"), k.Perm(k.BIRGI, "creature")]
    g.cmd_zone.discard(k.KRARK)
    g.casts[k.KRARK] = 1
    if two_krarks:
        g.perms.append(k.Perm(k.SAKA, "creature", copy_of=k.KRARK))
        g.cmd_zone.discard(k.SAKA)
        g.casts[k.SAKA] = 1
    g.hand = ["Crimson Wisps"] + [g.library.pop(0) for _ in range(4)]
    g.turn = 2
    won = None
    try:
        g.play_turn()
    except k.Win as w:
        won = w.method
    except k.Loss:
        won = "loss"
    return won, g.ts["cards_drawn"], g.ts["spells_cast"]


def mulligan_game(args):
    """Full games with the fast greedy pilot, comparing the old checklist mulligan and the model."""
    seed, policy = args
    c = cfg(turns=4)
    c.mulligan_policy = policy
    g = k.Game(k.parse_deck(k.DECKLIST), random.Random(seed), c)
    r = g.run(4)
    return r["win_turn"], r["mulligans"], r["t1_krark_hand"], bool(r["turns"]) and r["turns"][0]["krark_on_bf"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-n", "--games", type=int, default=1000)
    ap.add_argument("--out", default="results")
    a = ap.parse_args()
    out = {"games": a.games, "jeska_turn2": [], "breach_loop": [], "twinflame_relic": [], "birgi_cantrip": [],
           "mulligan": []}
    with Pool(os.cpu_count() or 1) as pool:
        for label, early, look in (("fires Jeska's off one Krark", True, 0),
                                   ("greedy, holds Jeska's for 2+ triggers", False, 0),
                                   ("lookahead (default)", False, 6)):
            res = pool.map(jeska_game, [(s, early, look) for s in range(a.games)])
            two = [r for r in res if r[1] >= 2]

            def by(rows, t):
                return sum(1 for r in rows if r[0] and r[0] <= t) / max(1, len(rows))
            row = {"pilot": label, **{f"by_t{t}": by(res, t) for t in (2, 3, 4)},
                   "double_jeska_t2": len(two) / a.games, "double_jeska_win_t2": by(two, 2)}
            out["jeska_turn2"].append(row)
            print(row, flush=True)
        for krark in (False, True):
            res = Counter(pool.map(breach_game, [(s, krark) for s in range(a.games)]))
            row = {"krark": krark, "win_that_turn": sum(v for m, v in res.items() if m and m != "loss") / a.games,
                   "methods": {str(m): v for m, v in res.items()}}
            out["breach_loop"].append(row)
            print(row, flush=True)
        for relic in (False, True):
            res = Counter(pool.map(clone_game, [(s, relic) for s in range(a.games)]))
            row = {"relic": relic, "win_that_turn": sum(v for m, v in res.items() if m and m != "loss") / a.games,
                   "methods": {str(m): v for m, v in res.most_common()}}
            out["twinflame_relic"].append(row)
            print(row, flush=True)
        for two in (False, True):
            res = pool.map(cantrip_game, [(s, two) for s in range(a.games)])
            draws = sorted(r[1] for r in res)
            casts = sorted(r[2] for r in res)
            row = {"krarks": 2 if two else 1,
                   "win_that_turn": sum(1 for r in res if r[0] and r[0] != "loss") / a.games,
                   "draws_p50": draws[len(draws) // 2], "draws_p90": draws[int(.9 * len(draws))],
                   "draw_15_plus": sum(1 for d in draws if d >= 15) / a.games,
                   "casts_p50": casts[len(casts) // 2], "casts_p90": casts[int(.9 * len(casts))]}
            out["birgi_cantrip"].append(row)
            print(row, flush=True)
        n_mull = a.games * 3
        for policy in ("rule", "model"):
            res = pool.map(mulligan_game, [(s, policy) for s in range(n_mull)], chunksize=25)
            mull = Counter(r[1] for r in res)
            row = {"policy": policy, "games": n_mull,
                   **{f"by_t{t}": sum(1 for r in res if r[0] and r[0] <= t) / n_mull for t in (2, 3, 4)},
                   "kept_t1_krark_hand": sum(1 for r in res if r[2]) / n_mull,
                   "krark_on_t1": sum(1 for r in res if r[3]) / n_mull,
                   "mulligans": {str(m_): mull[m_] / n_mull for m_ in sorted(mull)}}
            out["mulligan"].append(row)
            print(row, flush=True)
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "experiments.json"), "w") as f:
        json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
