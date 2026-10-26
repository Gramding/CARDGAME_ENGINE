"""Compare logged playtester games with the simulator.

For every opening hand a human saw, ask the sim's mulligan model whether it would keep it.
Then play each hand the human kept many times with the sim pilot (same cards, random draws)
and compare the sim's win turns with what the human did.

usage: python tools/human_compare.py DB_DIR [-n 120] [--turns 5] [--lookahead 6] [--out results/human_compare.json]
DB_DIR holds games/<id>.json and games/<id>/turns/t<n>.json as saved by the artifact database.
"""
import argparse
import glob
import json
import os
import random
import sys
from collections import Counter
from multiprocessing import Pool

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import krark_sim as k  # noqa: E402
from experiments import cfg as exp_cfg  # noqa: E402

SHORT = {}
for full in k.CARDS:
    s = full.split(" // ")[0]
    if k.CARDS[full].get("legendary") or full in k.COMMANDERS or ", " in s:
        SHORT.setdefault(s.split(",")[0], full)
    SHORT.setdefault(s, full)
    SHORT.setdefault(full, full)


def full_name(n):
    if n in SHORT:
        return SHORT[n]
    raise KeyError(n)


def load(db):
    games = []
    for f in sorted(glob.glob(os.path.join(db, "games", "*.json"))):
        d = json.load(open(f))
        d = d.get("data", d)
        gid = os.path.basename(f)[:-5]
        turns = []
        for t in sorted(glob.glob(os.path.join(db, "games", gid, "turns", "*.json")), key=lambda p: int(os.path.basename(p)[1:-5])):
            td = json.load(open(t))
            turns.append(td.get("data", td))
        games.append(dict(id=gid, meta=d, turns=turns))
    return games


def human_outcome(g):
    """Win turn the human reached. Unfinished games count as a win on a turn whose log shows the
    deck already went off (100+ Krark triggers), as the page now calls that a won position."""
    r = g["meta"].get("result")
    if r:
        return (r["turn"] if r["result"] == "win" else None), r.get("method"), "recorded"
    for t in g["turns"]:
        st = t.get("stats", {})
        if (st.get("krarkTriggers") or 0) >= 100:
            return t["turn"], "Krark 100+ (unrecorded)", "inferred"
    return None, None, "unfinished"


def mulligan_calls(g, on_draw):
    """For each opening hand: what the human did and what the model would do."""
    model = k.mulligan_model(True, 2)
    out = []
    hands = g["meta"].get("openingHands") or []
    for m, h in enumerate(hands):
        hand = [full_name(x) for x in h]
        size = k.mull_size(m, True)
        kept = k.best_keep(hand, size, on_draw)
        v = k.hand_value(kept, on_draw)
        bar = model["value_of_mulligan"][m + 1] if m + 1 in model["value_of_mulligan"] else 0
        sim_keep = m >= model["last"] or v >= bar
        human_keep = m == len(hands) - 1
        out.append(dict(step=m, size=size, hand=h, human="keep" if human_keep else "mull",
                        sim="keep" if sim_keep else "mull", value=round(v, 3), bar=round(bar, 3),
                        sim_bottom=[k.Game.short(None, c) if hasattr(k.Game, "short") else c for c in hand if hand.count(c) > kept.count(c)],
                        t1_krark=k.turn1_krark(hand, on_draw)))
    return out


def play_from(args):
    """Sim pilot plays a fixed kept hand; library order, seat and flips are random."""
    hand, seed, turns, lookahead = args
    c = exp_cfg(lookahead=lookahead, turns=turns)
    g = k.Game(k.parse_deck(k.DECKLIST), random.Random(seed), c)
    g.shuffle()
    for card in hand:
        g.library.remove(card)
    g.hand = list(hand)
    g.mulligans = 7 - len(hand)
    g.opening_t1_krark = k.turn1_krark(hand, g.seat != 0)
    try:
        for _ in range(turns):
            g.play_turn()
            g.record_turn()
    except k.Win as w:
        return g.turn, w.method
    except k.Loss:
        return None, "loss"
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("db")
    ap.add_argument("-n", type=int, default=120)
    ap.add_argument("--turns", type=int, default=5)
    ap.add_argument("--lookahead", type=int, default=6)
    ap.add_argument("--out", default="results/human_compare.json")
    a = ap.parse_args()
    games = load(a.db)
    report = []
    jobs, keys = [], []
    for g in games:
        kept = [full_name(x) for x in (g["meta"].get("kept") or [])]
        win, method, how = human_outcome(g)
        row = dict(id=g["id"], kept=g["meta"].get("kept"), mulligans=g["meta"].get("mulligans"), undos=g["meta"].get("undos"),
                   human_win_turn=win, human_method=method, outcome=how, note=(g["meta"].get("result") or {}).get("note"),
                   mull_on_draw=mulligan_calls(g, True), mull_on_play=mulligan_calls(g, False))
        first = {}
        for t in g["turns"]:
            for e in t.get("events", []):
                if e.get("a") in ("cast", "resolve") and e.get("c") == "Krark" and "krark_turn" not in first:
                    first["krark_turn"] = t["turn"]
        row["human_krark_turn"] = first.get("krark_turn")
        report.append(row)
        for i in range(a.n):
            jobs.append((kept, 10_000 * len(keys) + i, a.turns, a.lookahead))
        keys.append(g["id"])
    with Pool() as pool:
        res = pool.map(play_from, jobs, chunksize=4)
    for gi, row in enumerate(report):
        rs = res[gi * a.n:(gi + 1) * a.n]
        wins = [t for t, _ in rs if t]
        row["sim_games"] = a.n
        row["sim_win_by"] = {t: round(sum(1 for w in wins if w <= t) / a.n, 3) for t in range(1, a.turns + 1)}
        row["sim_methods"] = dict(Counter(m for t, m in rs if t).most_common(4))
        hw = row["human_win_turn"]
        row["sim_win_by_human_turn"] = row["sim_win_by"].get(hw) if hw else None
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    json.dump(report, open(a.out, "w"), indent=1)
    for row in report:
        print(row["id"], "kept", len(row["kept"] or []), "human", row["human_win_turn"], row["human_method"], row["outcome"],
              "| sim by T3/T4/T5", row["sim_win_by"].get(3), row["sim_win_by"].get(4), row["sim_win_by"].get(5))
        for c in row["mull_on_draw"]:
            print("    step", c["step"], "size", c["size"], "human", c["human"], "sim", c["sim"], "v", c["value"], "bar", c["bar"], "t1K", c["t1_krark"])


if __name__ == "__main__":
    main()
