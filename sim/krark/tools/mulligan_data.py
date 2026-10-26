#!/usr/bin/env python3
"""Fit the opening-hand model the mulligan uses.

Plays games that keep whatever they are dealt (forced to 7, 6, 5, 4, 3 or 2 cards in equal shares,
bottoming the weakest cards), records hand_features() of the kept hand and whether the game was won by
turn 4, and fits a logistic regression. Writes mulligan_model.json next to krark_sim.py.

Usage: python3 tools/mulligan_data.py [-n GAMES]
"""
import argparse
import json
import os
import random
import sys
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import krark_sim as k  # noqa: E402


def cfg():
    return argparse.Namespace(
        turns=4, stack_rate=0, removal_rate=0, interactive=False, cast_cap=400, life_floor=8, ogre_floor=4,
        p_opp_island=.75, p_opp_forest=1.0, free_mulligan=True, safe_draws=False, krark_token_cap=12,
        token_cap=30, exile_floor=25, combat=True, blockers=1, patient=False, jeska_early=False, lookahead=0,
        bf_policy="early", mulligan_policy="rule", min_hand=2)


class Forced(k.Game):
    def mulligan(self):
        self.shuffle()
        self.draw(7)
        for _ in range(7 - self.keep_size):
            worst = min(self.hand, key=self.card_value)
            self.hand.remove(worst)
            self.library.append(worst)
        self.kept = list(self.hand)
        self.ts["cards_drawn"] = 0
        if "Gemstone Caverns" in self.hand and self.seat != 0:
            self.hand.remove("Gemstone Caverns")
            p = k.Perm("Gemstone Caverns", "land")
            p.luck = True
            self.perms.append(p)
            worst = min(self.hand, key=self.card_value)
            self.hand.remove(worst)
            self.exile.append(worst)


def one(seed):
    g = Forced(k.parse_deck(k.DECKLIST), random.Random(seed), cfg())
    g.keep_size = 7 - seed % 6  # keep 7, 6, 5, 4, 3 or 2 cards
    r = g.run(4)
    f = k.hand_features(g.kept, g.seat != 0)
    return f, int(bool(r["win_turn"]))


def fit(X, y, l2=1.0, iters=4000, lr=0.5):
    w = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-X @ w))
        grad = X.T @ (p - y) / len(y) + l2 * np.r_[0, w[1:]] / len(y)
        w -= lr * grad
    return w


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-n", "--games", type=int, default=9000)
    a = ap.parse_args()
    with Pool(os.cpu_count() or 1) as pool:
        rows = pool.map(one, range(a.games), chunksize=20)
    names = list(rows[0][0])
    X = np.array([[f[n] for n in names] for f, _ in rows], dtype=float)
    y = np.array([w for _, w in rows], dtype=float)
    w = fit(X, y)
    print(f"{len(y)} games, win by T4 {y.mean():.1%}")
    for size in (7, 6, 5, 4, 3, 2):
        m = X[:, names.index("cards")] == size - 7
        print(f"  kept {size}: win by T4 {y[m].mean():.1%}")
    for feat in ("t1_krark", "t2_krark", "birgi", "jeska", "doubler", "mana_engine"):
        m = X[:, names.index(feat)] > 0
        print(f"  {feat:<12} with {y[m].mean():.1%} ({m.mean():.0%} of hands)  without {y[~m].mean():.1%}")
    rc = X[:, names.index("red_cantrips")]
    for c in (0, 1, 2):
        m = rc == c if c < 2 else rc >= 2
        print(f"  red cantrips {c}{'+' if c == 2 else ''}: win by T4 {y[m].mean():.1%} ({m.mean():.0%})")
    print("coefficients (log-odds):")
    for n_, c in sorted(zip(names, w), key=lambda t: -abs(t[1])):
        print(f"  {n_:<14} {c:+.2f}")
    out = os.path.join(os.path.dirname(__file__), "..", "mulligan_model.json")
    with open(out, "w") as f:
        json.dump({"features": names, "weights": [round(float(v), 4) for v in w], "games": len(y),
                   "win_rate": float(y.mean())}, f, indent=2)
    print("wrote mulligan_model.json")


if __name__ == "__main__":
    main()
