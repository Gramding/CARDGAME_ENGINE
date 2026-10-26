#!/usr/bin/env python3
"""
Krark & Sakashima (Krarkashima) cEDH goldfish simulator.

Plays the 100-card list turn by turn with a rules-aware engine for the deck's
core loop: Krark coin flips (copy on win, bounce to hand on loss), Sakashima as
a second Krark, trigger doublers (Veyran, Harmonic Prodigy, Wizard's Staff),
cast/copy payoffs (Birgi, Storm-Kiln Artist, Electro, Vivi, Archmage, Ashling,
Tavern Scoundrel, Ral) and the finishers (Vivi pings, Ashling, burn copies,
Electro bounce, Brain Freeze, Dualcaster + Twinflame / Molten Duplication,
Underworld Breach recursion, Fork-family copies of rituals).

Run `python3 krark_sim.py --help` for options. See README.md for the model.
"""
from __future__ import annotations

import argparse
import copy
import csv
import json
import math
import os
import random
import statistics
from collections import Counter
from multiprocessing import Pool

DECKLIST = """\
1 An Offer You Can't Refuse
1 Ancient Tomb
1 Arcane Signet
1 Archmage Emeritus
1 Arid Mesa
1 Ashling, Flame Dancer
1 Birgi, God of Storytelling // Harnfel, Horn of Bounty
1 Bloodstained Mire
1 Borne Upon a Wind
1 Brain Freeze
1 Chrome Mox
1 City of Brass
1 City of Traitors
1 Command Tower
1 Crimson Wisps
1 Deflecting Swat
1 Desperate Ritual
1 Dualcaster Mage
1 Electro, Assaulting Battery
1 Emergence Zone
1 Expedite
1 Fellwar Stone
1 Fierce Guardianship
1 Fiery Islet
1 Flooded Strand
1 Flusterstorm
1 Force of Will
1 Fork
1 Frantic Search
1 Gamble
1 Gemstone Caverns
1 Gitaxian Probe
1 Gut Shot
1 Harmonic Prodigy
1 Imperial Recruiter
1 Impulse
1 Into the Flood Maw
1 Island
1 Jeska's Will
1 Krark, the Thumbless
1 Light Up the Stage
1 Lightning Bolt
1 Lotus Petal
1 Mana Confluence
1 Mana Vault
1 Mental Misstep
1 Might of the Meek
1 Minamo, School at Water's Edge
1 Mindbreak Trap
1 Misty Rainforest
1 Mogg Salvage
1 Molten Duplication
1 Mountain
1 Mox Amber
1 Mox Diamond
1 Mystic Remora
1 Mystical Tutor
1 Otawara, Soaring City
1 Overmaster
1 Pact of Negation
1 Phyrexian Metamorph
1 Pinnacle Monk // Mystic Peak
1 Polluted Delta
1 Ponder
1 Pyretic Ritual
1 Pyroblast
1 Ral, Monsoon Mage // Ral, Leyline Prodigy
1 Red Elemental Blast
1 Relic of Legends
1 Return the Favor
1 Reverberate
1 Rite of Flame
1 Riverglide Pathway // Lavaglide Pathway
1 Sakashima of a Thousand Faces
1 Samut, Tyrant of Naktamun
1 Scalding Tarn
1 Shivan Reef
1 Simian Spirit Guide
1 Sink into Stupor // Soporific Springs
1 Snap
1 Sol Ring
1 Springleaf Drum
1 Steam Vents
1 Step Through
1 Stifle
1 Storm-Kiln Artist
1 Strike It Rich
1 Submerge
1 Sudden Shock
1 Tavern Scoundrel
1 Thundering Falls
1 Training Center
1 Treasonous Ogre
1 Twinflame
1 Underworld Breach
1 Veyran, Voice of Duality
1 Vivi Ornitier
1 Volcanic Island
1 Wizard's Staff
1 Wooded Foothills
"""

KRARK = "Krark, the Thumbless"
SAKA = "Sakashima of a Thousand Faces"
VIVI = "Vivi Ornitier"
VEYRAN = "Veyran, Voice of Duality"
PRODIGY = "Harmonic Prodigy"
KILN = "Storm-Kiln Artist"
ARCHMAGE = "Archmage Emeritus"
BIRGI = "Birgi, God of Storytelling // Harnfel, Horn of Bounty"
SCOUNDREL = "Tavern Scoundrel"
RAL = "Ral, Monsoon Mage // Ral, Leyline Prodigy"
ELECTRO = "Electro, Assaulting Battery"
ASHLING = "Ashling, Flame Dancer"
DUALCASTER = "Dualcaster Mage"
SAMUT = "Samut, Tyrant of Naktamun"
RECRUITER = "Imperial Recruiter"
OGRE = "Treasonous Ogre"
METAMORPH = "Phyrexian Metamorph"
MONK = "Pinnacle Monk // Mystic Peak"
SINK = "Sink into Stupor // Soporific Springs"
PATHWAY = "Riverglide Pathway // Lavaglide Pathway"
STAFF = "Wizard's Staff"
SSG = "Simian Spirit Guide"
OTAWARA = "Otawara, Soaring City"
BREACH = "Underworld Breach"
REMORA = "Mystic Remora"
COMMANDERS = (KRARK, SAKA)
CLONES = ("Twinflame", "Molten Duplication")
COPIERS = ("Fork", "Reverberate", "Return the Favor")
WIZARDS = (VEYRAN, PRODIGY, VIVI, ARCHMAGE, DUALCASTER, RAL, SAMUT)

# --------------------------------------------------------------------------- cards


def L(colors, amount=1, **kw):
    return dict(kind="land", land=dict(colors=colors, amount=amount, **kw))


def S(kind, g=0, r=0, u=0, **kw):
    d = dict(kind=kind, cost=(g, r, u))
    d.update(kw)
    return d


FETCHES = {
    "Arid Mesa": ("Mountain",), "Bloodstained Mire": ("Mountain",),
    "Flooded Strand": ("Island",), "Misty Rainforest": ("Island",),
    "Polluted Delta": ("Island",), "Scalding Tarn": ("Island", "Mountain"),
    "Wooded Foothills": ("Mountain",),
}

CARDS = {f: dict(kind="land", fetch=set(t)) for f, t in FETCHES.items()}
CARDS.update({
    # lands
    "Ancient Tomb": L("C", 2, pain=2),
    "City of Traitors": L("C", 2, traitors=True),
    "City of Brass": L("UR", pain=1),
    "Mana Confluence": L("UR", pain=1),
    "Fiery Islet": L("UR", pain=1),
    "Shivan Reef": L("CUR", reef=True),
    "Command Tower": L("UR"),
    "Training Center": L("UR"),
    "Volcanic Island": L("UR", types=("Island", "Mountain")),
    "Steam Vents": L("UR", types=("Island", "Mountain"), shock=True),
    "Thundering Falls": L("UR", types=("Island", "Mountain"), tapped=True),
    PATHWAY: L("UR", pathway=True),
    "Island": L("U", types=("Island",)),
    "Mountain": L("R", types=("Mountain",)),
    "Minamo, School at Water's Edge": L("U"),
    OTAWARA: L("U"),
    "Emergence Zone": L("C"),
    "Gemstone Caverns": L("C", caverns=True),
    # mana artifacts
    "Sol Ring": S("artifact", 1, rock=dict(colors="C", amount=2)),
    "Mana Vault": S("artifact", 1, rock=dict(colors="C", amount=3, no_untap=True)),
    "Arcane Signet": S("artifact", 2, rock=dict(colors="UR")),
    "Fellwar Stone": S("artifact", 2, rock=dict(colors="UR")),
    "Chrome Mox": S("artifact", 0, rock=dict(colors="imprint")),
    "Mox Diamond": S("artifact", 0, rock=dict(colors="UR")),
    "Mox Amber": S("artifact", 0, rock=dict(colors="amber")),
    "Lotus Petal": S("artifact", 0, rock=dict(colors="UR", sac=True)),
    "Springleaf Drum": S("artifact", 1, rock=dict(colors="drum")),
    "Relic of Legends": S("artifact", 3, rock=dict(colors="UR"), relic=True),
    STAFF: S("artifact", 1, 0, 1, equipment=True),
    # creatures
    KRARK: S("creature", 1, 1, 0, legendary=True, types={"Goblin", "Wizard"}, power=2),
    SAKA: S("creature", 3, 0, 1, legendary=True, types={"Human", "Rogue"}, power=3),
    VIVI: S("creature", 1, 1, 1, legendary=True, types={"Wizard"}, power=0),
    VEYRAN: S("creature", 1, 1, 1, legendary=True, types={"Efreet", "Wizard"}, power=2),
    PRODIGY: S("creature", 1, 1, 0, types={"Human", "Wizard"}, power=1),
    KILN: S("creature", 3, 1, 0, types={"Dwarf", "Shaman"}, power=2),
    ARCHMAGE: S("creature", 2, 0, 2, types={"Human", "Wizard"}, power=2),
    BIRGI: S("creature", 2, 1, 0, legendary=True, types={"God"}, power=3),
    SCOUNDREL: S("creature", 1, 1, 0, types={"Human", "Rogue"}, power=1),
    RAL: S("creature", 1, 1, 0, legendary=True, types={"Human", "Wizard"}, power=1),
    ELECTRO: S("creature", 1, 2, 0, legendary=True, types={"Human", "Villain"}, power=2),
    ASHLING: S("creature", 2, 2, 0, legendary=True, types={"Elemental", "Shaman"}, power=4),
    DUALCASTER: S("creature", 1, 2, 0, types={"Human", "Wizard"}, power=2),
    SAMUT: S("creature", 1, 0, 1, legendary=True, types={"Human", "Wizard"}, power=2),
    RECRUITER: S("creature", 2, 1, 0, types={"Human", "Advisor"}, power=1),
    OGRE: S("creature", 3, 1, 0, types={"Ogre", "Shaman"}, power=2),
    METAMORPH: S("creature", 3, 0, 0, phy="U", types={"Shapeshifter"}, power=0),
    SSG: S("creature", 2, 1, 0, types={"Ape", "Spirit"}, power=2),
    MONK: S("creature", 3, 2, 0, types={"Djinn", "Monk"}, power=2, mdfc=dict(colors="R")),
    # enchantments
    REMORA: S("enchantment", 0, 0, 1),
    BREACH: S("enchantment", 1, 1, 0),
    # instants & sorceries
    "Rite of Flame": S("sorcery", 0, 1, 0, ritual=2),
    "Desperate Ritual": S("instant", 1, 1, 0, ritual=3),
    "Pyretic Ritual": S("instant", 1, 1, 0, ritual=3),
    "Jeska's Will": S("sorcery", 2, 1, 0, jeska=True),
    "Strike It Rich": S("sorcery", 0, 1, 0, treasure=1, flashback=(2, 1, 0)),
    "Gitaxian Probe": S("sorcery", 0, 0, 0, phy="U", draw=1),
    "Crimson Wisps": S("instant", 0, 1, 0, draw=1),
    "Expedite": S("instant", 0, 1, 0, draw=1),
    "Might of the Meek": S("instant", 0, 1, 0, draw=1),
    "Overmaster": S("sorcery", 0, 1, 0, draw=1),
    "Borne Upon a Wind": S("instant", 1, 0, 1, draw=1, flash_turn=True),
    "Ponder": S("sorcery", 0, 0, 1, look=3),
    "Impulse": S("instant", 1, 0, 1, look=4),
    "Frantic Search": S("instant", 2, 0, 1, draw=2, discard=2, untap=3),
    "Snap": S("instant", 1, 0, 1, untap=2, bounce=True),
    "Submerge": S("instant", 4, 0, 1, bounce=True, free_if="forest"),
    "Light Up the Stage": S("sorcery", 2, 1, 0, exile_play=2),
    "Gamble": S("sorcery", 0, 1, 0, tutor="any"),
    "Mystical Tutor": S("instant", 0, 0, 1, tutor="instsorc"),
    "Brain Freeze": S("instant", 1, 0, 1, mill=3, storm=True),
    "Gut Shot": S("instant", 0, 0, 0, phy="R", burn=1),
    "Lightning Bolt": S("instant", 0, 1, 0, burn=3),
    "Sudden Shock": S("instant", 1, 1, 0, burn=2, split=True),
    "Into the Flood Maw": S("instant", 0, 0, 1, fodder=True),
    "Mogg Salvage": S("instant", 2, 1, 0, fodder=True, free_if="island"),
    "Twinflame": S("sorcery", 1, 1, 0, clone=True),
    "Molten Duplication": S("sorcery", 1, 1, 0, clone=True),
    "Fork": S("instant", 0, 2, 0, copier=True),
    "Reverberate": S("instant", 0, 2, 0, copier=True),
    "Return the Favor": S("instant", 1, 2, 0, copier=True),
    "Step Through": S("sorcery", 3, 0, 2, wizardcycling=2),
    # protection / interaction (held, see Game.protect)
    "Pyroblast": S("instant", 0, 1, 0, protect="blue", fodder=True),
    "Red Elemental Blast": S("instant", 0, 1, 0, protect="blue"),
    "Force of Will": S("instant", 3, 0, 2, protect="any"),
    "Fierce Guardianship": S("instant", 2, 0, 1, protect="any", free_cmdr=True),
    "Deflecting Swat": S("instant", 2, 1, 0, protect="any", free_cmdr=True, stack_fodder=True),
    "Pact of Negation": S("instant", 0, 0, 0, protect="any", stack_fodder=True, pact=True),
    "Flusterstorm": S("instant", 0, 0, 1, protect="instsorc", stack_fodder=True, storm=True),
    "Mental Misstep": S("instant", 0, 0, 0, phy="U", protect="mv1"),
    "Stifle": S("instant", 0, 0, 1, protect="ability"),
    "Mindbreak Trap": S("instant", 2, 0, 2, protect="trap"),
    "An Offer You Can't Refuse": S("instant", 0, 0, 1, protect="any"),
    SINK: S("instant", 1, 0, 2, protect="any", mdfc=dict(colors="U")),
})

# fraction of opposing removal each blocker can stop (Pyroblast vs blue removal etc.)
PROTECT_COVERAGE = {"any": 1.0, "instsorc": 0.85, "blue": 0.35, "mv1": 0.35,
                    "ability": 0.10, "trap": 0.0}


def card_colors(name):
    c = CARDS[name]
    if "cost" not in c:
        return ""
    _, r, u = c["cost"]
    out = ("R" if r else "") + ("U" if u else "")
    if c.get("phy"):
        out += c["phy"]
    return out


def land_info(p):
    """Land data for a land permanent (MDFC back faces get a one-mana stub)."""
    c = CARDS[p.name]
    return c["land"] if "land" in c else dict(colors=c["mdfc"]["colors"], amount=1)


RED_CANTRIPS = ("Crimson Wisps", "Expedite", "Might of the Meek", "Overmaster")
CANTRIPS = RED_CANTRIPS + ("Gitaxian Probe", "Ponder", "Impulse", "Borne Upon a Wind", "Frantic Search",
                           "Light Up the Stage")
TUTORS = ("Gamble", "Mystical Tutor", "Imperial Recruiter", "Step Through")


def turn1_krark(hand, on_the_draw):
    """Can this hand cast Krark ({1}{R}) on turn 1? One land drop plus one-shot / free mana.
    Sol Ring and Mana Vault need the land's mana to cast, so they only help when another red
    source (Lotus Petal, Simian Spirit Guide, a mox, Gemstone Caverns) supplies the {R}."""
    lands = [h for h in hand if is_land(h) and h != "Gemstone Caverns"]
    land_amt, land_red = 0, False
    for l in lands:
        ld = CARDS[l].get("land")
        amt, red = (1, True) if ld is None else (ld["amount"], "R" in ld["colors"] or bool(ld.get("pathway")))
        if (amt + (1 if red else 0)) > (land_amt + (1 if land_red else 0)):
            land_amt, land_red = amt, red
    if not lands and "Gemstone Caverns" in hand and not on_the_draw:
        land_amt, land_red = 1, False   # played as a plain land
    red_extra = 0                        # one-shot sources that make {R}
    if "Gemstone Caverns" in hand and on_the_draw:
        red_extra += 1                   # starts in play with a luck counter
    red_extra += sum(1 for c in ("Lotus Petal", SSG) if c in hand)
    others = [h for h in hand if not is_land(h) and CARDS[h]["kind"] != "artifact" and h != KRARK]
    if "Chrome Mox" in hand and any("R" in card_colors(h) for h in others):
        red_extra += 1
    if "Mox Diamond" in hand and len(lands) >= 2:
        red_extra += 1
    total = land_amt + red_extra
    red = land_red or red_extra > 0
    if "Rite of Flame" in hand and red and total >= 1:
        total += 1                       # {R} -> {R}{R}
    if total >= 2 and red:
        return True
    rock = 2 if "Mana Vault" in hand else (1 if "Sol Ring" in hand else 0)
    # pay {1} for the rock with the land, keep a non-land red source for Krark's {R}
    return bool(rock) and land_amt >= 1 and red_extra >= 1


def hand_features(hand, on_the_draw):
    """Opening-hand features the mulligan model scores (see mulligan_model.json)."""
    lands = sum(1 for h in hand if is_land(h)) + 0.5 * sum(1 for h in hand if CARDS[h].get("mdfc"))
    fast = sum(1 for h in hand if "rock" in CARDS[h] or h == SSG)
    rituals = sum(1 for h in hand if CARDS[h].get("ritual"))
    t1 = turn1_krark(hand, on_the_draw)
    t2 = t1 or (lands >= 2) or (lands >= 1 and fast + rituals >= 1)
    return {
        "bias": 1.0,
        "cards": len(hand) - 7,
        "short": max(0, 5 - len(hand)),
        "t1_krark": float(t1),
        "t2_krark": float(t2 and not t1),
        "red_cantrips": min(3, sum(1 for h in hand if h in RED_CANTRIPS)),
        "cantrips": min(3, sum(1 for h in hand if h in CANTRIPS and h not in RED_CANTRIPS)),
        "birgi": float(BIRGI in hand),
        "doubler": float(VEYRAN in hand or PRODIGY in hand or STAFF in hand),
        "mana_engine": float(KILN in hand or SCOUNDREL in hand or ELECTRO in hand),
        "vivi": float(VIVI in hand),
        "jeska": float("Jeska's Will" in hand),
        "clone_combo": float(any(c in hand for c in CLONES)),
        "rituals": min(2, rituals),
        "tutors": min(2, sum(1 for h in hand if h in TUTORS)),
        "lands": min(lands, 4),
        "no_land": float(lands == 0),
        "flood": float(lands >= 5),
        "fast_mana": min(3, fast),
        "protection": min(2, sum(1 for h in hand if CARDS[h].get("protect"))),
    }


_MULL = {}


def mull_size(m, free):
    """Cards kept after the m-th mulligan (London; the first one free if `free`)."""
    return 7 - max(0, m - (1 if free else 0))


def mulligan_model(free=True, min_hand=2):
    """Logistic model of P(win by turn 4) from opening-hand features, fitted by
    tools/mulligan_data.py, plus the value of mulliganing at each step. The values are worked out
    backward from the forced keep at `min_hand` cards by sampling hands from the deck, so going
    below a size only happens when the hand in front of you is worse than the average hand you
    would get one card smaller."""
    if "w" not in _MULL:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mulligan_model.json")
        if not os.path.exists(path):
            _MULL["w"] = None
            return _MULL
        with open(path) as f:
            m = json.load(f)
        _MULL["w"] = dict(zip(m["features"], m["weights"]))
    if _MULL["w"] is None:
        return _MULL
    key = (free, min_hand)
    if key not in _MULL:
        deck = [c for c in parse_deck(DECKLIST) if c not in COMMANDERS]
        rng = random.Random(12345)
        last = next(m for m in range(20) if mull_size(m, free) <= min_hand)
        sizes = sorted({mull_size(m, free) for m in range(last + 1)}, reverse=True)
        samples = 2000
        vals = {size: [] for size in sizes}
        for _ in range(samples):
            draw = rng.random() < 0.75
            hand = rng.sample(deck, 7)
            kept = hand
            for size in sizes:  # bottom greedily, one card at a time
                kept = best_keep(kept, size, draw)
                vals[size].append(hand_value(kept, draw))
        v = {last: sum(vals[mull_size(last, free)]) / samples}
        for m in range(last - 1, -1, -1):
            v[m] = sum(max(x, v[m + 1]) for x in vals[mull_size(m, free)]) / samples
        _MULL[key] = {"value": v, "last": last}
    return {"w": _MULL["w"], "value_of_mulligan": _MULL[key]["value"], "last": _MULL[key]["last"]}


def hand_value(hand, on_the_draw):
    w = _MULL["w"]
    z = sum(w.get(k_, 0.0) * x for k_, x in hand_features(hand, on_the_draw).items())
    return 1 / (1 + math.exp(-z))


def best_keep(hand, size, on_the_draw):
    """Bottom cards one at a time, each time the card whose loss hurts the model least."""
    hand = list(hand)
    while len(hand) > size:
        hand.remove(max(hand, key=lambda c: hand_value([h for h in hand if h != c] + [c] * (hand.count(c) - 1),
                                                       on_the_draw)))
    return hand


def is_land(name):
    return CARDS[name]["kind"] == "land"


def is_spell(name):
    return CARDS[name]["kind"] in ("instant", "sorcery")


def parse_deck(text):
    deck = []
    for line in text.strip().splitlines():
        n, name = line.split(" ", 1)
        deck += [name.strip()] * int(n)
    missing = [n for n in deck if n not in CARDS]
    if missing:
        raise SystemExit(f"cards without simulator data: {missing}")
    return deck


# --------------------------------------------------------------------------- game


class Win(Exception):
    def __init__(self, method):
        self.method = method


class Loss(Exception):
    def __init__(self, reason):
        self.reason = reason


class Perm:
    __slots__ = ("name", "kind", "tapped", "counters", "token", "temp", "copy_of",
                 "staff", "used", "imprint", "luck", "res", "color", "sick", "ident")

    def __init__(self, name, kind, copy_of=None, token=False, temp=False):
        self.name, self.kind, self.copy_of = name, kind, copy_of
        self.ident = copy_of or name  # what it is on the battlefield (copies included)
        self.token, self.temp = token, temp
        self.tapped = self.staff = self.used = self.luck = False
        self.counters = self.res = 0
        self.imprint = self.color = None
        self.sick = kind == "creature" and not temp  # temp tokens come from Twinflame/Molten: haste


TURN_FIELDS = ["mana_potential", "mana_produced", "spells_cast", "instsorc_cast",
               "krark_triggers", "flips_won", "copies", "cards_drawn", "treasures",
               "damage", "storm", "flips_per_cast", "krark_on_bf", "two_krarks",
               "doubler", "vivi", "mana_engine", "went_off", "infinite",
               "veyran", "prodigy", "saka_krark", "staff_krark", "relic", "krarks"]


class TurnStats(dict):
    def __init__(self, turn):
        super().__init__({f: 0 for f in TURN_FIELDS})
        self["turn"] = turn


class Game:
    def __init__(self, deck, rng, cfg, verbose=False):
        self.rng, self.cfg, self.verbose = rng, cfg, verbose
        self.log_lines = []
        self.library = [c for c in deck if c not in COMMANDERS]
        self.deck_cards = list(self.library)
        self.opening_t1_krark = False
        self.seen_t3 = None
        self.hand, self.gy, self.exile, self.exile_play = [], [], [], []
        self.perms, self.treasures = [], 0
        self.casts = {KRARK: 0, SAKA: 0}
        self.cmd_zone = {KRARK, SAKA}
        self.pool = dict(R=0, U=0, C=0, A=0)
        self.life = 40
        self.opp_life, self.opp_lib, self.opp_dead = [40] * 3, [92] * 3, [None] * 3
        self.turn = self.storm = 0
        self.land_played = self.opp_lost_life = self.chain_started = False
        self.bounce_target = None
        self.virtual_power = 0
        self.last_clone = None
        self.force_clone = None
        self.my_turn = False
        self.pact_due = self.remora_age = 0
        self.opp_island = rng.random() < cfg.p_opp_island
        self.opp_forest = rng.random() < cfg.p_opp_forest
        self.seat = rng.randrange(4)
        self.ts = TurnStats(0)
        self.turns = []
        self.dmg_by = Counter()
        self.mulligans = 0
        self.protection_used = 0
        self.interaction_hits = 0
        self.flags = Counter()
        self.plan = "greedy"
        self.flash_turn = False
        self.in_fodder = False
        self.bf_self = False
        self.main = False
        self._cache = None
        self.in_rollout = False
        self.plan_counts = Counter()
        self.prot_stats = Counter()

    # ------------------------------------------------------------- utilities
    def log(self, msg):
        if self.verbose:
            self.log_lines.append(f"T{self.turn} | {msg}")

    def short(self, name):
        return name.split(" // ")[0].split(",")[0]

    def creatures(self):
        return [p for p in self.perms if p.kind == "creature"]

    def count(self, ident):
        if self._cache is not None:
            key = ("count", ident)
            if key not in self._cache:
                self._cache[key] = sum(1 for p in self.perms if p.ident == ident)
            return self._cache[key]
        return sum(1 for p in self.perms if p.ident == ident)

    def on_bf(self, ident):
        return any(p.ident == ident for p in self.perms)

    def have(self, name):
        return name in self.hand or self.on_bf(name) or any(e[0] == name for e in self.exile_play)

    def control_commander(self):
        return any(p.name in COMMANDERS and not p.token for p in self.perms)

    def saka_on_bf(self):
        return any(p.name == SAKA for p in self.perms)

    def alive(self):
        return [i for i in range(3) if self.opp_dead[i] is None]

    def types_of(self, p):
        return CARDS[p.ident].get("types", set())

    def tapped_land_mana(self):
        return sum(self.land_amount(p) for p in self.perms if p.kind == "land" and p.tapped)

    def land_amount(self, p):
        return land_info(p)["amount"]

    # ------------------------------------------------------------- triggers
    def veyran_n(self):
        return self.count(VEYRAN)

    def prodigy_n(self):
        return self.count(PRODIGY)

    def mult(self, p, cast_caused, vey=None, prod=None):
        vey = self.veyran_n() if vey is None else vey
        prod = self.prodigy_n() if prod is None else prod
        m = 1
        if cast_caused:
            m += vey
        if self.types_of(p) & {"Shaman", "Wizard"}:
            m += prod - (1 if p.ident == PRODIGY else 0)
        if p.staff:
            m += 1
        return m

    def krarks(self):
        ks = [p for p in self.perms if p.ident == KRARK]
        if len(ks) > 1 and not self.saka_on_bf():
            ks = ks[:1]
        return ks

    def krark_flips(self):
        vey, prod = self.veyran_n(), self.prodigy_n()
        return sum(self.mult(p, True, vey, prod) for p in self.krarks())

    def sum_mult(self, ident, cast_caused=True):
        key = ("mult", ident, cast_caused)
        if self._cache is not None and key in self._cache:
            return self._cache[key]
        vey, prod = self.veyran_n(), self.prodigy_n()
        n = sum(self.mult(p, cast_caused, vey, prod) for p in self.perms if p.ident == ident)
        if self._cache is not None:
            self._cache[key] = n
        return n

    # ------------------------------------------------------------- mana
    def add(self, color, n=1):
        self.pool[color] += n
        self.ts["mana_produced"] += n

    def snapshot(self):
        return (dict(self.pool), [(p, p.tapped, p.used) for p in self.perms], list(self.perms),
                self.treasures, self.life, list(self.hand), self.ts["mana_produced"])

    def restore(self, s):
        pool, flags, perms, self.treasures, self.life, hand, self.ts["mana_produced"] = s
        self.pool = dict(pool)
        self.perms = list(perms)
        self.hand = list(hand)
        for p, t, u in flags:
            p.tapped, p.used = t, u

    def legend_colors(self):
        out = set()
        for p in self.creatures():
            if CARDS[p.ident].get("legendary"):
                out |= set(card_colors(p.ident)) or {"R"}
        return out

    def source_list(self, color):
        """Ordered (priority, perm, mode) mana sources able to make `color` ('G' = generic)."""
        out = []
        untapped_creatures = [p for p in self.creatures() if not p.tapped]
        for p in self.perms:
            if p.tapped:
                continue
            c = CARDS[p.ident]
            if p.kind == "land":
                ld = land_info(p)
                cols = p.color or ld["colors"]
                if p.luck:
                    cols = "UR"
                if color == "G":
                    pri = 0 if cols == "C" else (2 if not ld.get("pain") else 3)
                    out.append((pri, p, "land"))
                elif color in cols:
                    pri = (0 if len(cols) == 1 else 1) + (2 if ld.get("pain") or ld.get("reef") else 0)
                    out.append((pri, p, "land"))
            elif "rock" in c:
                rk = c["rock"]
                cols = rk["colors"]
                if cols == "imprint":
                    cols = p.imprint or ""
                elif cols == "amber":
                    cols = "".join(self.legend_colors())
                elif cols == "drum":
                    if not [q for q in untapped_creatures]:
                        continue
                    cols = "UR"
                if not cols:
                    continue
                if color == "G":
                    pri = 1 if cols == "C" else (8 if rk.get("sac") else 4)
                    out.append((pri, p, "rock"))
                elif color in cols:
                    out.append((8 if rk.get("sac") else 4, p, "rock"))
        if any(CARDS[p.ident].get("relic") for p in self.perms):
            for q in untapped_creatures:
                if CARDS[q.ident].get("legendary"):
                    out.append((5, q, "relic"))
        for p in self.creatures():
            if p.ident == VIVI and not p.used and self.my_turn and p.counters > 0 and color in "URG":
                out.append((6, p, "vivi"))
        return sorted(out, key=lambda t: t[0])

    def activate(self, p, mode, color):
        if mode == "land":
            ld = land_info(p)
            p.tapped = True
            amt = ld["amount"]
            cols = "UR" if p.luck else (p.color or ld["colors"])
            make = color if color in cols else (cols[0] if cols != "CUR" else "C")
            if ld.get("pain"):
                self.life -= ld["pain"]
            if ld.get("reef") and make != "C":
                self.life -= 1
            self.add(make if make in "RUC" else "C", amt)
        elif mode == "rock":
            rk = CARDS[p.ident]["rock"]
            amt = rk.get("amount", 1)
            if rk["colors"] == "drum":
                q = next(q for q in self.creatures() if not q.tapped)
                q.tapped = True
            p.tapped = True
            self.add(color if color in "RU" else ("C" if rk["colors"] == "C" else "R"), amt)
            if rk.get("sac"):
                self.perms.remove(p)
                self.gy.append(p.name)
        elif mode == "relic":
            p.tapped = True
            self.add(color if color in "RU" else "R")
        elif mode == "vivi":
            p.used = True
            x = p.counters
            self.add(color if color in "RU" else "R", 1)
            if x > 1:
                self.add("A", x - 1)

    def get_color(self, color):
        if self.pool[color] > 0:
            self.pool[color] -= 1
            return True
        if self.pool["A"] > 0:
            self.pool["A"] -= 1
            return True
        srcs = self.source_list(color)
        if srcs:
            _, p, mode = srcs[0]
            self.activate(p, mode, color)
            return self.get_color(color)
        return self.emergency(color)

    def get_any(self):
        for c in ("C", "A", "R", "U"):
            if self.pool[c] > 0:
                self.pool[c] -= 1
                return True
        srcs = self.source_list("G")
        if srcs:
            _, p, mode = srcs[0]
            self.activate(p, mode, "G")
            return self.get_any()
        return self.emergency("R")

    def emergency(self, color):
        """Consumables of last resort: Treasures, Ogre life, Simian Spirit Guide."""
        if self.treasures > 0:
            self.treasures -= 1
            self.add(color if color in "RU" else "R")
        elif color in "RG" and self.on_bf(OGRE) and self.life - 3 >= self.cfg.ogre_floor:
            self.life -= 3
            self.add("R")
        elif color in "RG" and SSG in self.hand:
            self.hand.remove(SSG)
            self.exile.append(SSG)
            self.add("R")
        else:
            return False
        return self.get_color(color) if color in "RU" else self.get_any()

    def pay(self, cost, phy=None, dry=False):
        g, r, u = cost
        snap = self.snapshot()
        ok = True
        if phy:
            if self.pool[phy] > 0 or self.life <= self.cfg.life_floor + 2:
                if phy == "R":
                    r += 1
                else:
                    u += 1
            else:
                self.life -= 2
        for color, n in (("R", r), ("U", u)):
            for _ in range(n):
                if ok and not self.get_color(color):
                    ok = False
        for _ in range(g):
            if ok and not self.get_any():
                ok = False
        if dry or not ok:
            self.restore(snap)
        return ok

    def can_pay(self, cost, phy=None):
        return self.pay(cost, phy, dry=True)

    def available_mana(self):
        n = sum(self.pool.values()) + self.treasures
        for p in self.perms:
            if p.tapped:
                continue
            c = CARDS[p.ident]
            if p.kind == "land":
                n += land_info(p)["amount"]
            elif "rock" in c:
                rk = c["rock"]
                if rk["colors"] == "imprint" and not p.imprint:
                    continue
                if rk["colors"] == "amber" and not self.legend_colors():
                    continue
                n += rk.get("amount", 1)
            if p.ident == VIVI and not p.used and self.my_turn:
                n += p.counters
        if any(CARDS[p.ident].get("relic") for p in self.perms):
            n += sum(1 for q in self.creatures() if not q.tapped and CARDS[q.ident].get("legendary"))
        n += 1 if SSG in self.hand else 0
        if self.on_bf(OGRE):
            n += max(0, (self.life - self.cfg.ogre_floor) // 3)
        return n

    def next_turn_mana(self):
        n = self.treasures
        for p in self.perms:
            c = CARDS[p.ident]
            if p.kind == "land":
                n += land_info(p)["amount"]
            elif "rock" in c and not c["rock"].get("sac") and not c["rock"].get("no_untap"):
                n += c["rock"].get("amount", 1)
        return n

    def pay_generic(self, x):
        paid = 0
        while paid < x and self.get_any():
            paid += 1
        return paid

    # ------------------------------------------------------------- costs
    def eff_cost(self, name, zone="hand"):
        c = CARDS[name]
        g, r, u = c["cost"]
        phy = c.get("phy")
        if zone == "flashback":
            g, r, u = c["flashback"]
        alt_ok = zone in ("hand", "exile")  # escape / flashback are already alternative costs
        if alt_ok and name == "Light Up the Stage" and self.opp_lost_life:
            g, r, u = 0, 1, 0
        if alt_ok and c.get("free_if") == "island" and self.opp_island and self.controls_type("Mountain"):
            return (0, 0, 0), None
        if alt_ok and c.get("free_if") == "forest" and self.opp_forest and self.controls_type("Island"):
            return (0, 0, 0), None
        if alt_ok and c.get("free_cmdr") and self.control_commander():
            return (0, 0, 0), None
        if name in self.cmd_zone and name in COMMANDERS and zone == "cmd":
            g += 2 * self.casts[name]
        if is_spell(name):
            g = max(0, g - self.count(RAL))
        return (g, r, u), phy

    def controls_type(self, t):
        for p in self.perms:
            if p.kind == "land":
                ld = land_info(p)
                if t in ld.get("types", ()) or (t == "Mountain" and p.name == "Mountain") \
                        or (t == "Island" and p.name == "Island"):
                    return True
        return False

    # ------------------------------------------------------------- zones
    def draw(self, n=1):
        for _ in range(n):
            if not self.library:
                raise Loss("drew from an empty library")
            self.hand.append(self.library.pop(0))
            self.ts["cards_drawn"] += 1

    def shuffle(self):
        self.rng.shuffle(self.library)

    def discard_worst(self, n=1):
        for _ in range(n):
            if not self.hand:
                return
            worst = min(self.hand, key=self.card_value)
            self.hand.remove(worst)
            self.gy.append(worst)

    def card_value(self, name):
        c = CARDS[name]
        lands_total = sum(1 for p in self.perms if p.kind == "land") + sum(1 for h in self.hand if is_land(h))
        if c["kind"] == "land":
            return 8.0 if lands_total < 4 else 1.5
        v = {
            VEYRAN: 9, PRODIGY: 8.5, BIRGI: 8, KILN: 8, VIVI: 8.5, ELECTRO: 7, SCOUNDREL: 6.5,
            ARCHMAGE: 6.5, ASHLING: 5.5, RAL: 5.5, DUALCASTER: 7.5, RECRUITER: 5.5, SAMUT: 3,
            OGRE: 3, METAMORPH: 4, MONK: 2.5 if lands_total >= 4 else 7, "Jeska's Will": 8.5,
            "Desperate Ritual": 6, "Pyretic Ritual": 6, "Rite of Flame": 6, "Strike It Rich": 4.5,
            "Twinflame": 6.5, "Molten Duplication": 6.5, "Fork": 5, "Reverberate": 5,
            "Return the Favor": 4.5, "Gamble": 6, "Mystical Tutor": 6.5, "Step Through": 4.5,
            BREACH: 5, "Brain Freeze": 4.5, "Gut Shot": 5, "Lightning Bolt": 3, "Sudden Shock": 2.5,
            "Into the Flood Maw": 3, "Mogg Salvage": 2.5, "Snap": 4.5, "Frantic Search": 4.5,
            "Submerge": 2, SSG: 5, REMORA: 4 if self.turn <= 3 else 1, STAFF: 4,
            "Gitaxian Probe": 4.5, "Ponder": 4.5, "Impulse": 4.5, "Crimson Wisps": 4,
            "Expedite": 4, "Might of the Meek": 4, "Overmaster": 3.5, "Borne Upon a Wind": 4,
            "Light Up the Stage": 4,
        }.get(name)
        if v is None:
            if c.get("protect"):
                cov = PROTECT_COVERAGE[c["protect"]]
                v = 3 + 3 * cov * (1.5 if self.cfg.interactive else 0.6)
            elif "rock" in c:
                v = 7.5 if self.turn <= 3 else 3
            else:
                v = 4
        if name in CLONES and self.have(DUALCASTER):
            v = 9.5
        if name == DUALCASTER and (self.have("Twinflame") or self.have("Molten Duplication")):
            v = 9.5
        if name == "Brain Freeze" and self.storm >= 12:
            v = 9
        if name == VIVI and not self.on_bf(VIVI):
            v = 9.5
        return v

    # ------------------------------------------------------------- damage / wins
    def check_deaths(self, src):
        for i in self.alive():
            if self.opp_life[i] <= 0:
                self.opp_dead[i] = src
            elif self.opp_lib[i] <= 0:
                self.opp_dead[i] = "Brain Freeze mill"
        if not self.alive():
            raise Win(src)

    def damage_each(self, n, src):
        if n <= 0:
            return
        for i in self.alive():
            self.opp_life[i] -= n
            self.ts["damage"] += n
            self.dmg_by[src] += n
        self.opp_lost_life = True
        self.check_deaths(src)

    def damage_one(self, n, src):
        a = self.alive()
        if not a or n <= 0:
            return
        killable = [i for i in a if self.opp_life[i] <= n]
        i = max(killable, key=lambda j: self.opp_life[j]) if killable else min(a, key=lambda j: self.opp_life[j])
        self.opp_life[i] -= n
        self.ts["damage"] += n
        self.dmg_by[src] += n
        self.opp_lost_life = True
        self.check_deaths(src)

    # ------------------------------------------------------------- casting
    def on_cast_triggers(self, name, is_is, is_creature):
        vey, prod = self.veyran_n(), self.prodigy_n()
        ral_wins = 0
        for p in list(self.creatures()):
            if p not in self.perms:
                continue
            ident = p.ident
            m = self.mult(p, is_is, vey, prod)
            if ident == BIRGI:
                self.add("R", m)
            elif ident == ELECTRO and is_is:
                self.add("R", m)
            elif ident == VIVI and not is_creature:
                p.counters += m
                self.damage_each(m, "Vivi pings")
            elif ident == RAL and is_is and self.my_turn:
                for _ in range(m):
                    if self.rng.random() < 0.5:
                        ral_wins += 1
                    else:
                        self.life -= 1
        if is_is:
            self.magecraft(vey, prod)
        if ral_wins:
            self.won_flips(ral_wins)

    def magecraft(self, vey=None, prod=None):
        vey = self.veyran_n() if vey is None else vey
        prod = self.prodigy_n() if prod is None else prod
        for p in list(self.creatures()):
            if p not in self.perms:
                continue
            ident = p.ident
            if ident not in (KILN, ARCHMAGE, ASHLING):
                continue
            m = self.mult(p, True, vey, prod)
            if ident == KILN:
                self.treasures += m
                self.ts["treasures"] += m
            elif ident == ARCHMAGE:
                self.draw(min(m, len(self.library)) if self.cfg.safe_draws else m)
            elif ident == ASHLING:
                for _ in range(m):
                    p.res += 1
                    if self.hand:
                        self.discard_worst()
                    if self.library:
                        self.draw()
                    if p.res == 2:
                        self.damage_each(2, "Ashling")
                    elif p.res == 3:
                        self.add("R", 4)

    def won_flips(self, n):
        self.ts["flips_won"] += n
        k = self.count(SCOUNDREL)
        if k:
            self.treasures += 2 * n * k
            self.ts["treasures"] += 2 * n * k

    def split_second(self):
        return self.on_bf(SAMUT)

    def cast(self, name, zone, target=None):
        """Cast `name` from `zone` ('hand','exile','escape','flashback','cmd'). Returns False if unaffordable."""
        present = {"hand": lambda: name in self.hand,
                   "exile": lambda: any(e[0] == name for e in self.exile_play),
                   "escape": lambda: name in self.gy, "flashback": lambda: name in self.gy,
                   "cmd": lambda: name in self.cmd_zone}[zone]
        if not present():
            return False  # e.g. Ashling looted it away while we were making mana
        cost, phy = self.eff_cost(name, zone)
        if not self.pay(cost, phy):
            return False
        if zone == "hand":
            self.hand.remove(name)
        elif zone == "exile":
            idx = next(i for i, e in enumerate(self.exile_play) if e[0] == name)
            self.exile_play.pop(idx)
        elif zone in ("escape", "flashback"):
            self.gy.remove(name)
            if zone == "escape":
                self.exile_fuel(3, keep=name)
        elif zone == "cmd":
            self.cmd_zone.discard(name)
            self.casts[name] += 1
        self.storm += 1
        self.ts["spells_cast"] += 1
        c = CARDS[name]
        is_is = is_spell(name)
        is_creature = c["kind"] == "creature"
        self.log(f"cast {self.short(name)}" + (f" ({zone})" if zone != "hand" else "")
                 + (f" -> {self.short(target)}" if target else ""))
        if is_is:
            self.ts["instsorc_cast"] += 1
            if not self.chain_started and self.go_off_ready():
                self.chain_started = True
                self.ts["went_off"] = 1
                self.stack_interaction()
        self.on_cast_triggers(name, is_is, is_creature)
        if not is_is:
            self.resolve_permanent(name)
            return True
        k = self.krark_flips()
        self.ts["krark_triggers"] += k
        if c.get("mill"):
            self.bf_self = self.brain_freeze_self()
        if c.get("storm"):
            for _ in range(self.storm - 1):
                self.make_copy(name, target)
        if not self.split_second() and not c.get("split"):
            if name in CLONES and self.dualcaster_win(name, k, flip_first=None):
                raise Win("Dualcaster Mage + " + name)
            if not c.get("copier"):
                self.respond_with_copiers(name)
            if not c.get("stack_fodder") and not self.in_fodder:
                self.respond_with_fodder(name)
        flips = [self.rng.random() < 0.5 for _ in range(k)]
        wins = sum(flips)
        if wins:
            self.won_flips(wins)
        if name in CLONES and k and flips[0] and self.on_bf(DUALCASTER):
            raise Win("Dualcaster Mage + " + name + " (Krark copy)")
        for _ in range(wins):
            self.make_copy(name, target)
        if wins < k:
            if zone == "flashback":
                self.exile.append(name)
            else:
                self.hand.append(name)
            self.log(f"  Krark x{k}: {wins} copies, {self.short(name)} back to hand")
        else:
            if k:
                self.log(f"  Krark x{k}: {wins} copies, original resolves")
            self.resolve(name, False, target)
            (self.exile if zone == "flashback" else self.gy).append(name)
        return True

    def make_copy(self, name, target=None):
        self.ts["copies"] += 1
        self.magecraft()
        self.resolve(name, True, target)

    def respond_with_copiers(self, name):
        val = self.copy_value(name)
        if val <= 0:
            return
        for _ in range(40):
            if self.over_cap():
                return
            k = self.krark_flips()
            risk = self.draw_risk(k, CARDS[name])
            if risk and risk * 2 >= len(self.library):
                return
            take = self.library_take(CARDS[name], k)
            if take and len(self.library) - 2 * take < 1 and not self.can_refill():
                return
            best = None
            for f in COPIERS:
                if f not in self.hand:
                    continue
                cost, _ = self.eff_cost(f)
                e_res = (k / 2 + 0.5 ** k) if k else 1
                net = val * e_res + self.trigger_mana(k) - sum(cost)
                # copying Twinflame / Molten: keep the mana to recast the original when Krark hands
                # it back, since that recast is what turns the Krark pile into a loop
                reserve = sum(self.eff_cost(name)[0]) if name in CLONES else 0
                need = (cost[0] + reserve, cost[1], cost[2])
                if net > 0 and self.can_pay(need):
                    best = f
                    break
            if not best:
                return
            self.cast(best, "hand", target=name)

    def respond_with_fodder(self, name):
        """Primer lines: Deflecting Swat (free with a commander, redirects nothing) and Pact of
        Negation (free; its Krark copies can retarget, so it never has to counter two spells) are
        free casts once something of ours is on the stack, so each one is a Birgi / Electro mana,
        a Vivi ping and Storm-Kiln Treasures, and Krark keeps handing them back. Flusterstorm's
        storm copies are Magecraft triggers (Treasures with Storm-Kiln, cards with Archmage)."""
        if not self.go_off_ready():
            return
        payoff = any(self.on_bf(x) for x in (BIRGI, ELECTRO, KILN, VIVI, SCOUNDREL, ARCHMAGE))
        if not payoff:
            return
        for card in ("Deflecting Swat", "Pact of Negation", "Flusterstorm"):
            for _ in range(30):
                if card not in self.hand or not self.spare_protection() or self.over_cap():
                    break
                k = self.krark_flips()
                c = CARDS[card]
                risk = self.draw_risk(k, c, self.storm if c.get("storm") else 0)
                if risk and risk >= len(self.library):
                    break
                if card == "Pact of Negation" and self.next_turn_mana() < 6 and not self.pact_due:
                    break
                if card == "Flusterstorm" and (self.storm < 4 or not (self.on_bf(KILN) or self.on_bf(ARCHMAGE))):
                    break
                cost, phy = self.eff_cost(card)
                if not self.can_pay(cost, phy):
                    break
                self.in_fodder = True
                try:
                    self.flags["fodder_" + card] += 1
                    self.cast(card, "hand", target=None)
                finally:
                    self.in_fodder = False

    def copy_value(self, name):
        c = CARDS[name]
        if c.get("ritual"):
            return c["ritual"]
        if c.get("jeska"):
            return self.opp_hand() + (3 if len(self.library) > self.cfg.exile_floor else 0)
        if c.get("untap"):
            return min(c["untap"], self.tapped_land_mana())
        if c.get("treasure"):
            return 1
        if name in CLONES and self.saka_on_bf() and self.on_bf(KRARK) \
                and self.count(KRARK) < self.cfg.krark_token_cap:
            return 6
        if c.get("tutor"):
            return 2
        return 0

    def dualcaster_win(self, name, k, flip_first):
        if DUALCASTER in self.hand:
            cost, _ = self.eff_cost(DUALCASTER)
            if self.can_pay(cost):
                self.pay(cost)
                self.hand.remove(DUALCASTER)
                self.log("flash Dualcaster Mage copying " + name + " -> infinite hasty tokens")
                return True
        if self.on_bf(DUALCASTER):
            for f in COPIERS:
                if f in self.hand and self.can_pay(self.eff_cost(f)[0]):
                    self.pay(self.eff_cost(f)[0])
                    return True
        return False

    def resolve(self, name, is_copy, target):
        c = CARDS[name]
        if c.get("ritual"):
            self.add("R", c["ritual"])
        elif c.get("jeska"):
            if self.control_commander():
                self.add("R", self.opp_hand())
                if len(self.library) > self.cfg.exile_floor:
                    self.exile_top(3, self.turn)
            elif self.available_mana() < 3:
                self.add("R", self.opp_hand())
            else:
                self.exile_top(3, self.turn)
        elif c.get("treasure"):
            self.treasures += c["treasure"]
            self.ts["treasures"] += c["treasure"]
        elif c.get("look"):
            self.look_and_draw(c["look"], ponder=name == "Ponder")
        elif c.get("bounce"):
            self.resolve_bounce(name, is_copy)
        elif c.get("exile_play"):
            self.exile_top(c["exile_play"], self.turn + 1)
        elif c.get("tutor"):
            self.tutor(c["tutor"], gamble=name == "Gamble")
        elif c.get("mill"):
            self.resolve_mill(c["mill"])
        elif c.get("burn"):
            self.damage_one(c["burn"], name)
        elif c.get("clone"):
            self.resolve_clone(name)
        elif c.get("copier") and target:
            self.make_copy(target)
        elif c.get("pact"):
            self.pact_due = self.turn + 1  # later copies fizzle: their target is already gone
        if c.get("flash_turn"):
            self.flash_turn = True
        if c.get("draw"):
            self.draw(min(c["draw"], len(self.library)))
        if c.get("discard"):
            self.discard_worst(c["discard"])
        if c.get("untap") and not c.get("bounce"):
            self.untap_lands(c["untap"])

    def resolve_bounce(self, name, is_copy):
        c = CARDS[name]
        tgt = self.bounce_target
        if tgt and self.on_bf(tgt):
            e = next(p for p in self.perms if p.ident == tgt)
            self.leave_battlefield(e, "library" if name == "Submerge" else "hand")
            if c.get("untap"):
                self.untap_lands(c["untap"])
            return
        if tgt and not is_copy:
            return  # original's target already gone: fizzles
        if c.get("untap"):
            self.untap_lands(c["untap"])

    def untap_lands(self, n):
        lands = sorted((p for p in self.perms if p.kind == "land" and p.tapped),
                       key=lambda p: -self.land_amount(p))
        for p in lands[:n]:
            p.tapped = False

    def mill_floor(self):
        """Cards to keep in the library: next draw step plus forced Archmage / Ashling draws."""
        per = self.sum_mult(ARCHMAGE) + self.sum_mult(ASHLING)
        return 4 + per * (self.krark_flips() + 2)

    BREACH_FUEL_TARGET = 12  # one Brain Freeze escape (3) + two Petal escapes for its mana (6) + spare

    def brain_freeze_self(self):
        """With Breach out Brain Freeze is the fuel pump. Each copy mills you only while the
        graveyard holds less than a cycle of escape fuel; every other copy goes at the opponent
        closest to an empty library."""
        return self.on_bf(BREACH) and len(self.library) > self.mill_floor()

    def mill_self_now(self):
        policy = self.cfg.bf_policy
        fuel = len(self.breach_fuel())
        if policy == "fuel":
            return fuel < self.BREACH_FUEL_TARGET
        if policy == "all":
            return True
        return fuel < self.BREACH_FUEL_TARGET or self.storm < 12  # "early": fill the yard first

    def resolve_mill(self, n):
        a = self.alive()
        if self.bf_self and self.on_bf(BREACH) and len(self.library) > self.mill_floor() \
                and self.mill_self_now():
            for _ in range(min(n, len(self.library) - self.mill_floor())):
                self.gy.append(self.library.pop(0))
            return
        if not a:
            return
        i = min(a, key=lambda j: self.opp_lib[j])
        self.opp_lib[i] -= n
        self.check_deaths("Brain Freeze mill")

    def clone_target(self, name):
        if self.force_clone and self.on_bf(self.force_clone):
            return self.force_clone
        """Primer line: alternate between a copiable source of Krark triggers and a copiable mana
        source. Molten Duplication also copies artifacts (Mana Vault, Sol Ring, Relic of Legends
        tokens tap for mana right away); Twinflame copies creatures only. Legendary targets need
        Sakashima out, otherwise the legend rule kills the token."""
        legend_ok = self.saka_on_bf()
        trig = []
        if legend_ok and self.on_bf(KRARK) and self.count(KRARK) < self.cfg.krark_token_cap:
            trig.append(KRARK)
        if self.on_bf(PRODIGY) and self.on_bf(KRARK):
            trig.append(PRODIGY)
        if legend_ok and self.on_bf(VEYRAN):
            trig.append(VEYRAN)
        mana = []
        if name == "Molten Duplication":
            mana += [t for t in ("Mana Vault", "Sol Ring", "Relic of Legends") if self.on_bf(t)]
        mana += [t for t in (SCOUNDREL, KILN) if self.on_bf(t)]
        if legend_ok:
            mana += [t for t in (BIRGI, ELECTRO) if self.on_bf(t)]
        order = (mana + trig) if self.last_clone == "trigger" else (trig + mana)
        if order:
            target = order[0]
            self.last_clone = "trigger" if target in trig else "mana"
            return target
        for t in (ARCHMAGE, VIVI if legend_ok else None):
            if t and self.on_bf(t):
                return t
        return None

    def resolve_clone(self, name):
        target = self.clone_target(name)
        if not target:
            return
        kind = "artifact" if CARDS[target]["kind"] == "artifact" else "creature"
        if kind == "creature" and ((target == KRARK and self.count(KRARK) >= self.cfg.krark_token_cap)
                                   or sum(1 for p in self.perms if p.token) >= self.cfg.token_cap):
            # past the simulator's cap: count the hasty body for combat, and with Relic of Legends
            # tap the (legendary) copy for its mana as well
            self.virtual_power += CARDS[target].get("power", 0)
            if CARDS[target].get("legendary") and self.on_bf("Relic of Legends"):
                self.add("A", 1)
            self.flags["clone_overflow"] += 1
            return
        if sum(1 for p in self.perms if p.token) >= self.cfg.token_cap + 20:
            return
        self.perms.append(Perm(name + " token", kind, copy_of=target, token=True, temp=True))
        self.flags["clone_" + self.short(target)] += 1
        self.log(f"  {self.short(name)} makes a {self.short(target)} token")

    def look_and_draw(self, n, ponder):
        top = self.library[:n]
        if not top:
            return
        best = max(top, key=self.card_value)
        if ponder and self.card_value(best) < 4.5 and len(self.library) > n:
            self.shuffle()
            self.draw()
            return
        self.library.remove(best)
        self.hand.append(best)
        self.ts["cards_drawn"] += 1
        if not ponder:
            for t in top:
                if t != best:
                    self.library.remove(t)
                    self.library.append(t)

    def exile_top(self, n, expires):
        for _ in range(min(n, len(self.library))):
            self.exile_play.append([self.library.pop(0), expires])

    def opp_hand(self):
        return {1: 7, 2: 6, 3: 6}.get(self.turn, 5)

    def want_list(self):
        w = []
        if self.go_off_ready() and not self.have(VIVI):
            w.append(VIVI)  # engine is online: find the kill first
        has_clone = self.have("Twinflame") or self.have("Molten Duplication")
        if has_clone and not self.have(DUALCASTER):
            w.append(DUALCASTER)
        if self.have(DUALCASTER) and not has_clone:
            w += list(CLONES)
        if not (self.have(VEYRAN) or self.have(PRODIGY)):
            w += [VEYRAN, PRODIGY]
        if not (self.have(BIRGI) or self.have(KILN)):
            w += [KILN, BIRGI]
        if not self.have(VIVI):
            w.append(VIVI)
        w += ["Jeska's Will", KILN, BIRGI, VEYRAN, PRODIGY, ELECTRO, SCOUNDREL, VIVI,
              "Desperate Ritual", "Pyretic Ritual", "Twinflame", ARCHMAGE, DUALCASTER,
              "Rite of Flame", "Gut Shot", "Fork"]
        return w

    def tutor(self, kind, gamble=False, to_top=None):
        filt = {"any": lambda n: True, "instsorc": is_spell,
                "wizard": lambda n: n in WIZARDS,
                "recruit": lambda n: CARDS[n]["kind"] == "creature" and CARDS[n].get("power", 9) <= 2,
                }[kind]
        pick = next((n for n in self.want_list() if n in self.library and filt(n)
                     and not self.have(n)), None)
        if pick is None:
            pool = [n for n in self.library if filt(n)]
            if not pool:
                return
            pick = max(pool, key=self.card_value)
        self.library.remove(pick)
        self.shuffle()
        self.log(f"  tutor -> {self.short(pick)}")
        if kind == "instsorc":
            self.library.insert(0, pick)
            return
        self.hand.append(pick)
        if gamble:
            lost = self.rng.choice(self.hand)
            self.hand.remove(lost)
            self.gy.append(lost)
            self.log(f"  Gamble discards {self.short(lost)}")

    BREACH_KEEP = ("Lotus Petal", "Brain Freeze", "Jeska's Will", "Desperate Ritual", "Pyretic Ritual",
                   "Rite of Flame", "Gut Shot", "Gitaxian Probe", "Strike It Rich", "Submerge",
                   "Mogg Salvage", "Twinflame", "Molten Duplication")

    def breach_fuel(self, keep=None):
        """Graveyard cards we are happy to exile to escape costs."""
        return [g for g in self.gy if g != keep and g not in self.BREACH_KEEP]

    def exile_fuel(self, n, keep):
        fuel = sorted((g for g in self.gy if g != keep),
                      key=lambda g: (g in self.BREACH_KEEP, is_spell(g), self.card_value(g)))
        for g in fuel[:n]:
            self.gy.remove(g)
            self.exile.append(g)

    # ------------------------------------------------------------- permanents
    def resolve_permanent(self, name):
        c = CARDS[name]
        kind = "creature" if c["kind"] == "creature" else ("enchantment" if c["kind"] == "enchantment" else "artifact")
        p = Perm(name, kind)
        if name == SAKA:
            krk = [q for q in self.perms if q.ident == KRARK]
            if krk:
                p.copy_of = p.ident = KRARK
        elif name == METAMORPH:
            if self.saka_on_bf() and self.on_bf(KRARK):
                p.copy_of = p.ident = KRARK
            else:
                for t in (KILN, ARCHMAGE, "Mana Vault", "Sol Ring", PRODIGY):
                    if self.on_bf(t):
                        p.copy_of = p.ident = t
                        if CARDS[t]["kind"] == "artifact":
                            p.kind = "artifact"
                        break
        elif name == "Chrome Mox":
            pick = self.imprint_choice()
            if pick:
                self.hand.remove(pick)
                self.exile.append(pick)
                p.imprint = card_colors(pick)[:2] or "R"
        self.perms.append(p)
        if p.copy_of:
            self.log(f"  {self.short(name)} enters as {self.short(p.copy_of)}")
        if name == RECRUITER:
            self.tutor("recruit")
        elif name == MONK:
            spells = [g for g in self.gy if is_spell(g)]
            if spells:
                best = max(spells, key=self.card_value)
                self.gy.remove(best)
                self.hand.append(best)
        elif name == STAFF:
            self.equip_staff()

    STAFF_TARGETS = (KRARK, VIVI, KILN, ARCHMAGE)

    def equip_staff(self):
        """Keep Wizard's Staff on the best holder: a Krark first (one more flip on every instant
        and sorcery), then Vivi, Storm-Kiln Artist, Archmage. Equip {1} onto a Wizard (Krark,
        Vivi, Archmage), {3} otherwise; sorcery speed, so only in the main phase."""
        if not self.on_bf(STAFF) or not self.main:
            return False
        holder = next((p for p in self.creatures() if p.staff), None)
        rank = {t: i for i, t in enumerate(self.STAFF_TARGETS)}
        best = min((p for p in self.creatures() if p.ident in rank), key=lambda p: rank[p.ident], default=None)
        if best is None or (holder and rank.get(holder.ident, 9) <= rank[best.ident]):
            return False
        cost = (1, 0, 0) if "Wizard" in self.types_of(best) else (3, 0, 0)
        if not self.can_pay(cost):
            return False
        self.pay(cost)
        for q in self.creatures():
            q.staff = False
        best.staff = True
        self.flags["staff_equips"] += 1
        self.log(f"  equip Wizard's Staff -> {self.short(best.ident)}")
        return True

    def imprint_choice(self):
        opts = [h for h in self.hand if not is_land(h) and CARDS[h]["kind"] != "artifact" and card_colors(h)]
        if not opts:
            return None
        # early with Krark still to cast and no red source: imprint a red card so the Mox makes {R}
        need_red = KRARK in self.cmd_zone and self.turn <= 2 and not any(
            "R" in (p.color or land_info(p)["colors"]) for p in self.perms if p.kind == "land")
        red = [h for h in opts if "R" in card_colors(h) and h != KRARK]
        if need_red and red:
            best = min(red, key=self.card_value)
            return best if self.card_value(best) <= 7 else None
        best = min(opts, key=self.card_value)
        return best if self.card_value(best) <= 5 else None

    def leave_battlefield(self, p, dest):
        if p not in self.perms:
            return
        self.perms.remove(p)
        if p.staff:
            p.staff = False
        if not p.token:
            if p.name in COMMANDERS:
                self.cmd_zone.add(p.name)
            elif dest == "hand":
                self.hand.append(p.name)
            elif dest == "library":
                self.library.insert(0, p.name)
            else:
                self.gy.append(p.name)
        if p.ident == ELECTRO:
            self.electro_ltb()
        if p.name == SAKA or not self.saka_on_bf():
            ks = [q for q in self.perms if q.ident == KRARK]
            for extra in ks[1:]:
                self.perms.remove(extra)
                if not extra.token:
                    (self.cmd_zone.add(extra.name) if extra.name in COMMANDERS else self.gy.append(extra.name))

    def electro_ltb(self):
        a = self.alive()
        if not a:
            return
        avail = self.available_mana()
        killable = [i for i in a if self.opp_life[i] <= avail]
        if killable:
            i = max(killable, key=lambda j: self.opp_life[j])
            x = self.opp_life[i]
        else:
            i = min(a, key=lambda j: self.opp_life[j])
            x = avail
        x = self.pay_generic(x)
        self.log(f"  Electro leaves: pay X={x} at opponent {i + 1}")
        self.opp_life[i] -= x
        self.ts["damage"] += x
        self.dmg_by["Electro"] += x
        self.opp_lost_life = True
        self.check_deaths("Electro")

    # ------------------------------------------------------------- policy
    def go_off_ready(self, k=None):
        """Commit the hand to a chain only with a mana engine plus a way to turn casts into a win;
        until then dig with cantrips (Krark copies of cantrips refuel) and deploy."""
        k = self.krark_flips() if k is None else k
        if self.plan == "wait":
            return False
        if self.on_bf(BREACH) and ("Brain Freeze" in self.hand or "Brain Freeze" in self.gy) and (
                any(m in self.gy for m in self.LOOP_MANA) or self.on_bf("Lotus Petal")):
            return True  # Breach + Brain Freeze + Lotus Petal is a combo on its own
        if self.plan in ("allin", "breach") and k >= 1:
            return True
        engines = self.count(BIRGI) + self.count(ELECTRO) + self.count(KILN) + self.count(SCOUNDREL)
        outlet = self.on_bf(VIVI) or self.on_bf(ELECTRO) or any(
            CARDS[h].get("burn") or CARDS[h].get("storm") for h in self.hand) or (
            self.have(DUALCASTER) and any(self.have(c) for c in CLONES))
        if not self.cfg.patient:
            return k >= 2 or (k >= 1 and (engines >= 1 or self.on_bf(VIVI)))
        return (k >= 2 and engines >= 1 and outlet) or (k >= 4 and (engines or outlet)) \
            or (k >= 1 and engines >= 2 and self.on_bf(VIVI))

    def trigger_mana(self, k):
        e_c = k / 2
        birgi = self.sum_mult(BIRGI)
        electro = self.sum_mult(ELECTRO)
        kiln = self.sum_mult(KILN)
        scoundrel = 2 * self.count(SCOUNDREL) * (e_c + self.sum_mult(RAL) / 2)
        return birgi + electro + kiln * (1 + e_c) + scoundrel

    def castable_spells(self):
        seen = set()
        for h in self.hand:
            if is_spell(h) and h not in seen:
                seen.add(h)
                yield h, "hand"
        for e in self.exile_play:
            if is_spell(e[0]):
                yield e[0], "exile"
        if "Strike It Rich" in self.gy:
            yield "Strike It Rich", "flashback"
        if self.on_bf(BREACH):
            for g in set(self.gy):
                if is_spell(g) and len(self.breach_fuel(g)) >= 3:
                    yield g, "escape"

    def score_spell(self, name, zone, k, ready):
        c = CARDS[name]
        if c.get("protect") and not (c.get("fodder") and ready and self.spare_protection()):
            return None
        if c.get("copier") or c.get("wizardcycling"):
            return None
        if c.get("exile_play") and len(self.library) <= self.cfg.exile_floor:
            return None
        if c.get("jeska") and self.hold_jeska(k):
            return None
        if name in CLONES and DUALCASTER in self.hand and not self.split_second():
            cost, _ = self.eff_cost(name, zone)
            d_cost, _ = self.eff_cost(DUALCASTER)
            if self.can_pay(tuple(a + b for a, b in zip(cost, d_cost))) \
                    and (not self.draw_risk(0, c) or self.draw_risk(0, c) < len(self.library)):
                return 1000  # Dualcaster Mage in response: infinite hasty copies
        e_c = k / 2
        e_res = e_c + 0.5 ** k
        cost, phy = self.eff_cost(name, zone)
        total = sum(cost)
        if zone == "escape":
            total += 1.5  # three exiled cards are a real resource
        trig = self.trigger_mana(k)
        eff = 0.0
        if c.get("ritual"):
            eff = c["ritual"] * e_res
        elif c.get("jeska"):
            eff = (self.opp_hand() if self.control_commander() else 0) * e_res
        elif c.get("treasure"):
            eff = e_res
        if c.get("untap"):
            eff += min(c["untap"] * e_res, self.tapped_land_mana())
        net = trig + eff - total
        draws = (c.get("draw", 0) + (1 if c.get("look") else 0)) * e_res
        archmage = self.sum_mult(ARCHMAGE) * (1 + e_c)
        storm_copies = (self.storm if c.get("storm") else 0)
        risk = self.draw_risk(k, c, storm_copies)
        if risk and risk >= len(self.library):
            return None  # mandatory draws / exiles would deck us
        if self.library_take(c, k) and len(self.library) - self.library_take(c, k) < 1 \
                and not self.can_refill():
            return None  # voluntary draws / tutors would leave nothing for the next draw step
        dmg = self.sum_mult(VIVI) * len(self.alive()) + c.get("burn", 0) * e_res
        p_ret = 1 - 0.5 ** k if k else 0
        if not ready:
            # setup turn: dig for pieces, keep rituals / burn / payoffs for the combo turn
            if draws or c.get("tutor") or c.get("exile_play"):
                if c.get("tutor") and not any(n in self.library for n in self.want_list()[:4]):
                    return None
                return 1 + draws + (2 if c.get("tutor") else 0) - total * 0.3
            if name in CLONES and self.have(DUALCASTER):
                return 100
            return None
        score = net * 2 + draws * 1.2 + archmage * 0.5 + dmg * 0.6 + p_ret
        if c.get("jeska"):
            score += 4
        if name in CLONES:
            more_krarks = self.saka_on_bf() and self.on_bf(KRARK)
            score += 50 if self.have(DUALCASTER) else (8 if more_krarks else -2)
            if more_krarks:
                # each resolution adds a Krark (more triggers on every later spell) and, with Relic of
                # Legends, an untapped legend to tap for a mana right away
                score += 2 * e_res * (1 + (1 if self.on_bf("Relic of Legends") else 0))
        if c.get("mill"):
            mill_total = 3 * (storm_copies + 1) * e_res
            need = sum(self.opp_lib[i] for i in self.alive())
            if mill_total >= need:
                score += 30
            elif self.on_bf(BREACH):
                score += 25 if len(self.breach_fuel(name)) < 9 or 3 * self.storm * 2 >= need else 2
            else:
                score -= 3
        if c.get("tutor"):
            score += 2
        return score

    def draw_risk(self, k, c, storm_copies=0):
        """Pessimistic count of library cards one more cast would consume (mandatory magecraft
        draws, Jeska's Will / Light Up the Stage exiles), plus next turn's draw."""
        hi_res = k / 2 + 1 if k else 1
        per_res = self.sum_mult(ARCHMAGE) + self.sum_mult(ASHLING)
        n = per_res * (hi_res + storm_copies)
        if c.get("exile_play"):
            n += c["exile_play"] * hi_res
        if c.get("jeska") and self.control_commander():
            n += min(3 * hi_res, max(0, len(self.library) - self.cfg.exile_floor))
        if not n:
            return 0
        # keep enough cards to Submerge the draw engine later: casting Submerge (and each Krark
        # copy of it) makes Archmage / Ashling draw before it resolves
        reserve = per_res * (self.krark_flips() + 1)
        return n + 1 + reserve

    def library_take(self, c, k):
        """Worst-case cards a spell's own resolutions pull out of the library (every flip wins)."""
        per = c.get("draw", 0) + (1 if c.get("look") or c.get("tutor") else 0) + c.get("exile_play", 0)
        return per * (k + 1)

    def hold_jeska(self, k):
        """With one Krark trigger Jeska's Will is a one-shot coin flip; with two or more it
        returns 75%+ of the time and pays for its own recast, so wait for that."""
        return k == 1 and not self.cfg.jeska_early and self.plan not in ("allin", "breach")

    def spare_protection(self):
        return (not self.cfg.interactive) or sum(1 for h in self.hand if CARDS[h].get("protect")) >= 2

    def best_spell(self):
        k = self.krark_flips()
        ready = self.go_off_ready(k)
        best = None
        self._cache = {}  # board counts are fixed while we only score and dry-run payments
        try:
            for name, zone in self.castable_spells():
                s = self.score_spell(name, zone, k, ready)
                if s is None:
                    continue
                if best is not None and s <= best[0]:
                    continue
                cost, phy = self.eff_cost(name, zone)
                if self.can_pay(cost, phy):
                    best = (s, name, zone)
        finally:
            self._cache = None
        return best

    # deploy -------------------------------------------------------------------
    def deploy_order(self, core_only=False):
        early = self.turn <= 2 and not self.on_bf(KRARK)
        rocks = ["Lotus Petal", "Mox Diamond", "Chrome Mox", "Mox Amber", "Sol Ring", "Mana Vault"]
        rocks2 = ["Arcane Signet", "Fellwar Stone"]
        core = [KRARK, SAKA, VEYRAN, PRODIGY, STAFF, BIRGI, KILN, VIVI, SCOUNDREL, ELECTRO, RECRUITER,
                OGRE, "Relic of Legends"]
        rest = [RAL, ARCHMAGE, ASHLING, "Relic of Legends", "Springleaf Drum", REMORA,
                SAMUT, METAMORPH, BREACH, MONK]
        if early:
            # turn-1/2 Krark is the plan: Krark first (rocks only when they keep him castable, see
            # deploy), then the two-mana rocks
            order = [KRARK] + rocks + core[1:] + rocks2
            return order if core_only else order + rest
        if core_only:
            return rocks + core
        return rocks + core + rocks2 + rest

    KEY = (KRARK, SAKA, VEYRAN, PRODIGY, BIRGI, KILN, VIVI, ELECTRO)

    def deploy_ok(self, name):
        if name == SAKA:
            return any(p.ident == KRARK for p in self.perms)
        if name == "Mox Diamond":
            lands = [h for h in self.hand if is_land(h)]
            return len(lands) >= 2 or (self.land_played and lands)
        if name == "Mox Amber":
            return bool(self.legend_colors()) or self.on_bf(KRARK)
        if name == "Chrome Mox":
            return self.imprint_choice() is not None
        if name == "Mana Vault":
            return True
        if name == STAFF:
            return self.on_bf(KRARK)
        if name == "Springleaf Drum":
            return bool(self.creatures())
        if name == "Relic of Legends":
            legends = sum(1 for p in self.creatures() if CARDS[p.ident].get("legendary"))
            clone_line = self.saka_on_bf() and any(self.have(c) for c in CLONES)
            return legends >= 2 or clone_line
        if name == REMORA:
            return self.turn <= 3
        if name == ASHLING:  # mandatory loot on every cast and copy burns the library
            return len(self.library) > 45 and not self.on_bf(ARCHMAGE)
        if name == ARCHMAGE:
            return len(self.library) > 30 and not self.on_bf(ASHLING)
        if name == SAMUT:
            return self.cfg.interactive and self.go_off_ready()
        if name == RECRUITER:
            return any(n in self.library and CARDS[n]["kind"] == "creature" and CARDS[n].get("power", 9) <= 2
                       and not self.have(n) for n in self.want_list()[:8])
        if name == METAMORPH:
            return (self.saka_on_bf() and self.on_bf(KRARK)) or self.on_bf(KILN) or self.turn <= 3
        if name == BREACH:
            return self.breach_ok()
        if name == MONK:
            return any(CARDS[g].get("jeska") or CARDS[g].get("ritual") or g in CLONES for g in self.gy)
        if name == SSG:
            return False
        return True

    def breach_ok(self):
        """Breach is worth it once the graveyard holds a spell that refunds its escape
        (Jeska's Will, a ritual, Strike It Rich) plus three other cards to exile."""
        if self.on_bf(BREACH):
            return False
        bf = "Brain Freeze" in self.gy or "Brain Freeze" in self.hand
        petal = "Lotus Petal" in self.gy or self.on_bf("Lotus Petal") \
            or any(r in self.gy for r in self.LOOP_MANA[1:])
        if bf and petal and len(self.gy) >= 4:
            return True  # the Brain Freeze + Lotus Petal loop needs no Krark at all
        if not self.on_bf(KRARK):
            return False
        engines = [g for g in self.gy if CARDS[g].get("jeska") or CARDS[g].get("ritual")
                   or CARDS[g].get("treasure")]
        if not engines or len(self.gy) - 1 < 3:
            return False
        if self.plan == "breach":
            return True
        best = max(engines, key=lambda g: CARDS[g].get("ritual", 9 if CARDS[g].get("jeska") else 1))
        need = 2 + sum(self.eff_cost(best)[0])
        return self.go_off_ready() and self.available_mana() >= need

    def try_breach(self):
        if BREACH in self.hand and self.breach_ok():
            cost, phy = self.eff_cost(BREACH)
            if self.can_pay(cost, phy):
                return self.cast(BREACH, "hand")
        return False

    def try_petal_loop(self):
        """Breach + Lotus Petal: escape Petal for {0} and three cards, sacrifice it for one mana.
        Each loop is +1 storm, +1 mana, a Birgi trigger and a Vivi ping, so it runs whenever
        Vivi is out or Brain Freeze is waiting for storm and mana."""
        if not self.on_bf(BREACH):
            return False
        on_bf = next((p for p in self.perms if p.ident == "Lotus Petal" and not p.tapped), None)
        if on_bf and "Lotus Petal" not in self.gy:
            self.perms.remove(on_bf)  # crack the Petal we already have to start the loop
            self.gy.append("Lotus Petal")
            self.add("A", 1)
        bf_ready = "Brain Freeze" in self.hand or "Brain Freeze" in self.gy
        # leave three cards to escape Brain Freeze itself when it is only in the graveyard
        reserve = 3 if "Brain Freeze" in self.gy and "Brain Freeze" not in self.hand else 0
        if not (self.on_bf(VIVI) or bf_ready):
            return False
        for piece in self.LOOP_MANA:  # Petal first (free), then rituals (net +1 mana each)
            if piece not in self.gy or len(self.breach_fuel(piece)) < 3 + reserve:
                continue
            if not self.can_pay(self.eff_cost(piece, "escape")[0]):
                continue
            if not self.cast(piece, "escape"):
                continue
            if piece == "Lotus Petal":
                p = next((p for p in self.perms if p.ident == "Lotus Petal" and not p.tapped), None)
                if p:
                    self.perms.remove(p)
                    self.gy.append("Lotus Petal")
                    self.add("A", 1)
            self.flags["loop_" + piece] += 1
            return True
        return False

    def breach_combo_ready(self):
        """Breach + Brain Freeze + Lotus Petal with enough graveyard and mana to start."""
        petal = "Lotus Petal" in self.gy or "Lotus Petal" in self.hand or self.on_bf("Lotus Petal") \
            or any(r in self.gy for r in self.LOOP_MANA[1:])
        bf = "Brain Freeze" in self.hand or "Brain Freeze" in self.gy
        if not (petal and bf) or len(self.gy) < 4:
            return False
        if self.on_bf(BREACH):
            return True
        if BREACH not in self.hand or not (self.main or self.flash_turn):
            return False
        need = 2 + (2 if "Brain Freeze" in self.hand else 2)  # Breach, then the first Brain Freeze
        return self.available_mana() + 1 >= need  # +1: the first Petal crack

    def breach_combo(self):
        """Run Breach + Brain Freeze + Lotus Petal: Brain Freeze mills you for escape fuel while
        storm is low, each Petal escape adds storm and a mana, and once one Brain Freeze mills
        half of what the opponents have left it turns on them."""
        if not self.breach_combo_ready():
            return False
        if not self.on_bf(BREACH):
            if "Lotus Petal" in self.hand and self.can_pay((0, 0, 0)):
                self.cast("Lotus Petal", "hand")
            if not self.can_pay(self.eff_cost(BREACH)[0]) or not self.cast(BREACH, "hand"):
                return False
            self.log("Breach combo: Breach + Brain Freeze + Lotus Petal")
            self.flags["breach_combo"] += 1
        progress = False
        for _ in range(500):
            if self.over_cap():
                break
            if self.combo_side_actions():
                progress = True
                continue
            if "Brain Freeze" in self.hand:
                bf_zone = "hand"
            elif "Brain Freeze" in self.gy and len(self.breach_fuel("Brain Freeze")) >= 3:
                bf_zone = "escape"
            else:
                bf_zone = None
            if bf_zone and self.can_pay(self.eff_cost("Brain Freeze", bf_zone)[0]) \
                    and self.draw_risk(self.krark_flips(), CARDS["Brain Freeze"], self.storm) < len(self.library):
                self.cast("Brain Freeze", bf_zone)
                progress = True
                continue
            if self.try_petal_loop():
                progress = True
                continue
            break
        return progress

    LOOP_MANA = ("Lotus Petal", "Rite of Flame", "Desperate Ritual", "Pyretic Ritual")

    def combo_side_actions(self):
        """Inside the Breach loop: cast rituals from hand (free storm and mana), and land Birgi,
        Vivi or Storm-Kiln Artist when the mana is there, since every later loop spell pays
        them off."""
        for r in ("Rite of Flame", "Desperate Ritual", "Pyretic Ritual"):
            if r in self.hand and self.can_pay(self.eff_cost(r)[0]):
                return self.cast(r, "hand")
        for engine in (BIRGI, VIVI, KILN):
            if engine in self.hand and not self.on_bf(engine):
                cost, phy = self.eff_cost(engine)
                if self.can_pay(cost, phy):
                    return self.cast(engine, "hand")
        return False

    def late_land(self):
        """Use an unused land drop mid-turn (lands drawn or exiled by Jeska's Will)."""
        if not self.land_played and (any(is_land(e[0]) for e in self.exile_play)
                                     or any(is_land(h) for h in self.hand)):
            self.play_land()
            return self.land_played
        return False

    def deploy(self, core_only=False):
        """Cast permanents in priority order. `core_only` keeps mana for the spell chain:
        only fast mana and the Krark engine pieces."""
        progress = True
        guard = 0
        cast_any = False
        while progress and guard < 40:
            guard += 1
            progress = False
            if self.equip_staff():
                progress = cast_any = True
                continue
            for name in self.deploy_order(core_only):
                zone = None
                if name in COMMANDERS:
                    if name in self.cmd_zone:
                        zone = "cmd"
                elif name in self.hand:
                    zone = "hand"
                elif any(e[0] == name for e in self.exile_play):
                    zone = "exile"
                if zone is None or not self.deploy_ok(name):
                    continue
                if name not in COMMANDERS and self.on_bf(name) and CARDS[name].get("legendary") \
                        and not self.saka_on_bf():
                    continue
                cost, phy = self.eff_cost(name, zone)
                if name != KRARK and KRARK in self.cmd_zone and self.turn <= 2 and \
                        not self.keeps_krark_castable(name, cost, phy):
                    continue
                if not self.can_pay(cost, phy) and name in self.KEY:
                    self.ritual_assist(cost, phy)
                if self.can_pay(cost, phy) and self.cast(name, zone):
                    progress = cast_any = True
                    break
            if not progress and self.cycle_step_through():
                # wizardcycling only with mana nothing better wanted; the Wizard it finds may
                # be castable right away, so go round again
                progress = cast_any = True
        return cast_any

    def keeps_krark_castable(self, name, cost, phy):
        """Early turns: don't spend the mana for a turn-1/2 Krark on something else, unless Krark
        is still castable afterwards (Sol Ring then Krark off a Lotus Petal is fine)."""
        k_cost, _ = self.eff_cost(KRARK, "cmd")
        if not self.can_pay(k_cost):
            return True  # Krark isn't castable now anyway
        snap = self.snapshot()
        ok = self.pay(cost, phy)
        if ok and "rock" in CARDS[name]:
            self.perms.append(Perm(name, "artifact"))
        ok = ok and self.can_pay(k_cost)
        self.restore(snap)
        return ok

    def ritual_assist(self, cost, phy):
        rituals = [h for h in self.hand if CARDS[h].get("ritual")]
        if "Jeska's Will" in self.hand and self.control_commander() and self.opp_hand() > 3 \
                and not self.hold_jeska(self.krark_flips()):
            rituals.append("Jeska's Will")
        if not rituals:
            return
        gain = sum(CARDS[r].get("ritual", self.opp_hand()) - sum(CARDS[r]["cost"]) for r in rituals) \
            + (self.sum_mult(BIRGI) + self.sum_mult(ELECTRO)) * len(rituals)
        if self.available_mana() + gain < sum(cost):
            return
        for r in sorted(rituals, key=lambda n: -CARDS[n].get("ritual", 9)):
            if self.can_pay(cost, phy):
                return
            if r in self.hand and self.can_pay(self.eff_cost(r)[0]):
                self.cast(r, "hand")

    def cycle_step_through(self):
        if "Step Through" not in self.hand:
            return False
        target = next((w for w in self.want_list() if w in WIZARDS and w in self.library
                       and not self.have(w)), None)
        if target and self.can_pay((2, 0, 0)):
            self.pay((2, 0, 0))
            self.hand.remove("Step Through")
            self.gy.append("Step Through")
            self.library.remove(target)
            self.hand.append(target)
            self.shuffle()
            self.flags["wizardcycle"] += 1
            self.log(f"wizardcycle Step Through -> {self.short(target)}")
            return True
        return False

    # finishers ---------------------------------------------------------------
    def can_cast_breach_now(self):
        """Breach is an enchantment: main phase with an empty stack, or flash from Borne Upon a
        Wind / Emergence Zone. The chain runs between resolutions, so its stack is empty."""
        return BREACH in self.hand and (self.main or self.flash_turn)

    def bounce_options(self):
        """(total mana, card, cost, how) ways to return one of our own creatures."""
        opts = []
        for b in ("Snap", "Submerge"):
            if b in self.hand:
                cost, phy = self.eff_cost(b)
                opts.append((sum(cost), b, cost, "hand"))
        if OTAWARA in self.hand:
            legends = sum(1 for p in self.creatures() if CARDS[p.ident].get("legendary"))
            g = max(0, 3 - legends)
            opts.append((g + 1, OTAWARA, (g, 0, 1), "hand"))
        if "Submerge" in self.gy and "Submerge" not in self.hand and len(self.gy) - 1 >= 3:
            cost, _ = self.eff_cost("Submerge", "escape")  # {4}{U}: escape replaces the free cast
            if self.on_bf(BREACH):
                opts.append((sum(cost) + 1.5, "Submerge", cost, "escape"))
            elif self.can_cast_breach_now():
                b_cost, _ = self.eff_cost(BREACH)
                both = tuple(x + y for x, y in zip(cost, b_cost))
                opts.append((sum(both) + 1.5, "Submerge", both, "breach+escape"))
        return sorted(opts, key=lambda o: o[0])

    def bounce_own(self, ident, b, cost, how="hand"):
        self.bounce_target = ident
        try:
            if how == "breach+escape":
                self.log("cast Underworld Breach to recur Submerge")
                self.cast(BREACH, "hand")
                how = "escape"
            if b == OTAWARA:
                self.pay(cost)
                self.hand.remove(OTAWARA)
                self.gy.append(OTAWARA)
                self.log(f"channel Otawara on {self.short(ident)}")
                e = next(p for p in self.perms if p.ident == ident)
                self.leave_battlefield(e, "hand")
            else:
                self.log(f"{self.short(b)} targeting own {self.short(ident)}"
                         + (" (escaped with Breach)" if how == "escape" else ""))
                self.cast(b, how)
        finally:
            self.bounce_target = None

    def guaranteed_cast_mana(self):
        """Mana every instant or sorcery cast returns whatever the coins do."""
        return self.sum_mult(BIRGI) + self.sum_mult(ELECTRO) + self.sum_mult(KILN)

    def try_krark_clone_loop(self):
        """Primer's main line: with Sakashima out, Twinflame / Molten Duplication on Krark makes more
        Krarks, so every recast has more triggers and comes back more surely (1 - 1/2^n), and with
        Relic of Legends, Storm-Kiln, Tavern Scoundrel or Birgi each copy also pays mana. Once the
        clone spell keeps returning with a dozen Krarks and the mana keeps up, the loop makes as many
        hasty Krarks as you want: combat kills through a blocker per opponent."""
        if not (self.saka_on_bf() and self.on_bf(KRARK)) or self.count(KRARK) < self.cfg.krark_token_cap:
            return False
        clone = next((c for c in CLONES if c in self.hand), None)
        if not clone or not self.cfg.combat:
            return False
        cost, _ = self.eff_cost(clone)
        k = self.krark_flips()
        per_cast = k / 2 * ((1 if self.on_bf("Relic of Legends") else 0) + self.sum_mult(KILN)
                            + 2 * self.count(SCOUNDREL)) + self.guaranteed_cast_mana()
        if per_cast < sum(cost) or not self.can_pay(cost):
            return False
        raise Win(f"{clone} Krark loop (hasty Krark army)")

    def try_monk_loop(self):
        """Primer line: if Molten Duplication (or Twinflame) pays for itself, copy Pinnacle Monk;
        the hasty token's ETB returns the clone spell to hand, so the loop makes as many hasty
        Monks as you like (and every cast pings with Vivi)."""
        clone = next((c for c in CLONES if c in self.hand), None)
        if not clone:
            return False
        cost, _ = self.eff_cost(clone)
        if self.guaranteed_cast_mana() < sum(cost):
            return False
        if not any(p.ident == MONK for p in self.creatures()):
            m_cost, _ = self.eff_cost(MONK)
            both = tuple(a + b for a, b in zip(cost, m_cost))
            if MONK not in self.hand or not self.can_pay(both):
                return False
            self.cast(MONK, "hand")
        if clone not in self.hand or not self.can_pay(cost):
            return False
        self.force_clone = MONK
        try:
            self.cast(clone, "hand")
        finally:
            self.force_clone = None
        raise Win(f"Pinnacle Monk + {clone} loop (infinite hasty Monks)")

    def try_electro(self):
        """Electro finisher: bounce him and pay X equal to an opponent's life."""
        if not self.on_bf(ELECTRO) or not self.alive():
            return False
        target = min(self.opp_life[i] for i in self.alive())
        for total, b, cost, how in self.bounce_options():
            if self.available_mana() - total >= target and self.can_pay(cost):
                self.bounce_own(ELECTRO, b, cost, how)
                return True
        return False

    def try_shed_engine(self, force=False):
        """Ashling's loot and Archmage's draw are mandatory; once they threaten to empty the
        library, put them on top with Submerge (or bounce them with Snap / Otawara).
        `force` is the end-of-turn check: an empty library next upkeep can't be refilled with
        Archmage still out, because casting Submerge makes him draw first."""
        for engine in (ASHLING, ARCHMAGE):
            if not self.on_bf(engine):
                continue
            per_cast = self.sum_mult(engine) * (1 + self.krark_flips() / 2)
            if per_cast * 4 < len(self.library) and not force:
                continue
            for total, b, cost, how in self.bounce_options():
                if self.can_pay(cost):
                    self.flags["shed_" + how] += 1
                    self.bounce_own(engine, b, cost, how)
                    return True
        return False

    def submerge_free(self):
        return "Submerge" in self.hand and sum(self.eff_cost("Submerge")[0]) == 0

    def refill_target(self):
        own = [p for p in self.creatures() if not p.token and p.name not in COMMANDERS]
        return min(own, key=lambda p: self.card_value(p.name)) if own else None

    def can_refill(self):
        if self.refill_target() is None:
            return False
        if self.submerge_free():
            return True
        if "Submerge" not in self.gy or len(self.gy) < 4:
            return False
        sub = sum(self.eff_cost("Submerge", "escape")[0])
        if self.on_bf(BREACH):
            return self.available_mana() >= sub
        return BREACH in self.hand and self.available_mana() >= sub + 2 + (0 if self.main else 1)

    def refill_library(self):
        """Empty library before a draw: Submerge one of your own creatures onto it, from hand
        (free) or from the graveyard through Breach, flashed in with Emergence Zone at upkeep.
        Borne Upon a Wind can't do it here: its own draw would hit the empty library first."""
        if self.library:
            return
        tgt = self.refill_target()
        if tgt is None:
            return
        if self.submerge_free():
            self.log(f"library empty: Submerge own {self.short(tgt.ident)} onto it")
            self.flags["refill_hand"] += 1
            self.bounce_own(tgt.ident, "Submerge", (0, 0, 0))
            return
        zone = next((p for p in self.perms if p.name == "Emergence Zone" and not p.tapped), None)
        if "Submerge" in self.gy and BREACH in self.hand and zone and len(self.gy) >= 4:
            sub, _ = self.eff_cost("Submerge", "escape")
            br, _ = self.eff_cost(BREACH)
            need = (sub[0] + br[0] + 1, sub[1] + br[1], sub[2] + br[2])  # +{1} for Emergence Zone
            snap = self.snapshot()
            self.perms.remove(zone)  # tapped and sacrificed as part of the cost
            if not self.pay((1, 0, 0)) or not self.can_pay((need[0] - 1, need[1], need[2])):
                self.restore(snap)
                return
            self.gy.append("Emergence Zone")
            self.flash_turn = True
            self.log(f"library empty: Emergence Zone flash -> Breach -> escape Submerge on {self.short(tgt.ident)}")
            self.flags["refill_breach"] += 1
            self.bounce_own(tgt.ident, "Submerge", (0, 0, 0), "breach+escape")

    def power(self, p):
        c = CARDS[p.ident]
        pw = c.get("power", 0) + p.counters
        if p.ident == KILN:
            pw += self.treasures + sum(1 for q in self.perms if q.kind == "artifact" or q.ident == METAMORPH)
        return pw

    def combat(self):
        """Attack with every untapped creature that can (goldfish: each opponent chump-blocks
        the biggest attacker it can, `blockers` times)."""
        if not self.cfg.combat:
            return
        atk = sorted((self.power(p) for p in self.creatures() if not p.tapped and not p.sick),
                     reverse=True)
        atk = [a for a in atk if a > 0]
        if self.virtual_power:
            atk += [2] * (self.virtual_power // 2)
        if not atk:
            return
        atk = atk[self.cfg.blockers * len(self.alive()):]
        total = sum(atk)
        if total <= 0:
            return
        self.log(f"combat: {len(atk)} unblocked attackers for {total}")
        for i in sorted(self.alive(), key=lambda j: self.opp_life[j]):
            hit = min(total, max(0, self.opp_life[i]))
            if hit <= 0:
                continue
            self.opp_life[i] -= hit
            total -= hit
            self.ts["damage"] += hit
            self.dmg_by["Combat"] += hit
        self.check_deaths("Combat damage")

    def cast_cap(self):
        return self.cfg.cast_cap if not self.in_rollout else min(self.cfg.cast_cap, 150)

    def over_cap(self):
        """Inner loops (Breach combo, Fork and free-spell responses) stop at the cast cap too;
        the chain loop then scores the turn as a loop."""
        return self.storm > self.cast_cap()

    def chain(self):
        cap = self.cast_cap()
        while True:
            if self.storm > cap:
                self.ts["infinite"] = 1
                if self.virtual_power and self.cfg.combat:
                    raise Win("Twinflame/Molten hasty token army (combat)")
                outlet = self.on_bf(VIVI) or self.on_bf(ELECTRO) or any(
                    CARDS[h].get("burn") for h in self.hand + self.gy) or (
                    self.on_bf(BREACH) and "Brain Freeze" in self.hand + self.gy)
                if outlet:
                    raise Win("near-infinite chain (cast cap)")
                self.flags["infinite_no_outlet"] += 1
                return
            if self.try_krark_clone_loop() or self.try_monk_loop() or self.try_electro() or self.try_shed_engine() or self.late_land() \
                    or self.breach_combo() \
                    or self.try_breach() or self.try_petal_loop():
                continue
            self.deploy(core_only=True)
            best = self.best_spell()
            if not best:
                if self.deploy():
                    continue
                return
            _, name, zone = best
            if not self.cast(name, zone):
                return

    # ------------------------------------------------------------- interaction
    def protect(self, removal=True):
        """Answer one opposing removal spell with the cheapest protection that covers it.

        Protection is an instant, so Krark flips on it like on anything else: every won flip
        makes a copy that counters the threat, but if every flip is lost the card just bounces
        back to hand having done nothing. A bounced card can be cast again if it can be paid
        for again (another blue card to pitch to Force of Will, a free Fierce Guardianship or
        Deflecting Swat while you control a commander, mana for the rest)."""
        covers = {}  # does this card answer this particular threat (Pyroblast vs blue removal ...)
        for _ in range(12):
            cands = []
            for h in set(self.hand):
                c = CARDS[h]
                if not c.get("protect"):
                    continue
                if h not in covers:
                    covers[h] = self.rng.random() < PROTECT_COVERAGE[c["protect"]]
                if not covers[h]:
                    continue
                if h == "Force of Will":
                    blue = [x for x in self.hand if x != h and "U" in card_colors(x)]
                    if blue:
                        cands.append((0, h, None, blue))
                    elif self.can_pay(CARDS[h]["cost"]):
                        cands.append((5, h, (CARDS[h]["cost"], None), None))
                    continue
                if h == "Pact of Negation":
                    if self.next_turn_mana() >= 6:
                        cands.append((3, h, None, None))
                    continue
                cost, phy = self.eff_cost(h)
                if self.can_pay(cost, phy):
                    cands.append((sum(cost), h, (cost, phy), None))
            if not cands:
                return False
            _, h, cost, pitch = min(cands, key=lambda t: t[0])
            if pitch:
                self.hand.remove(min(pitch, key=self.card_value))
                self.life -= 1
            elif cost:
                self.pay(*cost)
            self.hand.remove(h)
            self.prot_stats["cast " + h] += 1
            self.on_cast_triggers(h, True, False)
            k = self.krark_flips()
            wins = sum(self.rng.random() < 0.5 for _ in range(k))
            if k:
                self.ts["krark_triggers"] += k
            if wins:
                self.won_flips(wins)
                for _ in range(wins):
                    self.ts["copies"] += 1
                    self.magecraft()
            if k and not wins:
                self.hand.append(h)
                self.prot_stats["bounced " + h] += 1
                self.log(f"  {self.short(h)}: Krark x{k}, every flip lost, back to hand with no effect")
                continue
            # one resolution counters the threat; later copies / the original lose their target
            if h == "Pact of Negation":
                self.pact_due = self.turn + 1
            (self.gy if wins == k else self.hand).append(h)
            self.prot_stats["stopped " + h] += 1
            self.protection_used += 1
            self.log(f"  protect with {self.short(h)}" + (f" (Krark x{k}, {wins} copies"
                     + (", card back to hand)" if wins < k else ")") if k else ""))
            return True
        return False

    def stack_interaction(self):
        if self.cfg.stack_rate <= 0 or self.rng.random() >= self.cfg.stack_rate:
            return
        self.interaction_hits += 1
        target = next((p for p in self.perms if p.ident == KRARK and p.name == KRARK), None) \
            or next((p for p in self.perms if p.ident == KRARK), None)
        if not target:
            return
        if self.split_second():
            self.log("  opponent wants to answer Krark but Samut's split second blocks it")
            return
        if self.protect():
            return
        self.log("  opponent removes Krark in response to the chain")
        self.leave_battlefield(target, "gy")

    def opponents_turns(self):
        for i in self.alive():
            self.opp_lib[i] -= 1
        if self.on_bf(REMORA):
            for _ in self.alive():
                if self.rng.random() < 0.6:
                    self.draw(1) if self.library else None
        if self.cfg.removal_rate > 0 and self.rng.random() < self.cfg.removal_rate:
            prio = [KRARK, SAKA, VEYRAN, PRODIGY, KILN, BIRGI, VIVI, ELECTRO, ARCHMAGE, SCOUNDREL]
            targets = [p for t in prio for p in self.perms if p.ident == t and not p.token]
            if targets:
                self.interaction_hits += 1
                tgt = targets[0]
                if tgt.ident in (KRARK, SAKA, VEYRAN, PRODIGY) and self.protect():
                    return
                self.log(f"opponent removes {self.short(tgt.name)}")
                self.leave_battlefield(tgt, "gy")

    # ------------------------------------------------------------- turn flow
    def play_land(self):
        options = [(h, "hand") for h in self.hand if is_land(h) or CARDS[h].get("mdfc")]
        options += [(e[0], "exile") for e in self.exile_play if is_land(e[0])]
        if not options:
            return
        need_r = not any("R" in (p.color or land_info(p)["colors"]) for p in self.perms if p.kind == "land")
        need_u = not any("U" in (p.color or land_info(p)["colors"]) for p in self.perms if p.kind == "land")
        lands_in_hand = sum(1 for h, _ in options if is_land(h))

        def score(opt):
            h = opt[0]
            c = CARDS[h]
            if c.get("mdfc"):
                return 1 if lands_in_hand == 0 and self.card_value(h) < 7 or (h == MONK) else -9
            if c.get("fetch"):
                return 9
            ld = c["land"]
            s = 6 if ld.get("tapped") else 8
            cols = ld["colors"]
            if need_r and "R" in cols or need_u and "U" in cols:
                s += 2
            if ld["amount"] == 2:
                s += 1.5 if not (need_r or need_u) else -1
            if ld.get("traitors") and lands_in_hand > 1:
                s -= 4
            if len(cols) >= 2:
                s += 0.5
            return s

        h, zone = max(options, key=score)
        if score((h, zone)) < 0:
            return
        if zone == "hand":
            self.hand.remove(h)
        else:
            self.exile_play = [e for e in self.exile_play if e[0] != h]
        self.land_played = True
        for p in [p for p in self.perms if p.kind == "land" and land_info(p).get("traitors")]:
            self.perms.remove(p)
            self.gy.append(p.name)
        c = CARDS[h]
        if c.get("fetch"):
            self.gy.append(h)
            self.life -= 1
            prefs = ["Volcanic Island", "Steam Vents", "Mountain" if need_r else "Island",
                     "Island" if need_r else "Mountain", "Thundering Falls"]
            got = next((t for t in prefs if t in self.library
                        and set(CARDS[t]["land"].get("types", ())) & c["fetch"]), None)
            if not got:
                self.log(f"crack {h}: nothing left to fetch")
                return
            self.library.remove(got)
            self.shuffle()
            h = got
        if c.get("mdfc"):
            p = Perm(h, "land")
            p.color = c["mdfc"]["colors"]
            self.life -= 3
            self.perms.append(p)
            self.log(f"play {self.short(h)} as a land (pay 3 life)")
            return
        p = Perm(h, "land")
        ld = CARDS[h]["land"]
        if ld.get("pathway"):
            p.color = "R" if need_r or not need_u else "U"
        if ld.get("shock"):
            self.life -= 2
        if ld.get("tapped"):
            p.tapped = True
            if self.library and self.card_value(self.library[0]) < 3:
                self.gy.append(self.library.pop(0))
        self.perms.append(p)
        self.log(f"play {self.short(h)}")

    def keep_hand(self, hand, size):
        lands = sum(1 for h in hand if is_land(h))
        fast = sum(1 for h in hand if "rock" in CARDS[h] or h == SSG) \
            + 0.5 * sum(1 for h in hand if CARDS[h].get("ritual"))
        mdfc = sum(1 for h in hand if CARDS[h].get("mdfc"))
        action = sum(1 for h in hand if h in (VEYRAN, PRODIGY, BIRGI, KILN, VIVI, ELECTRO, SCOUNDREL,
                                              ARCHMAGE, RAL, "Jeska's Will", "Gamble", "Mystical Tutor",
                                              "Ponder", "Impulse", "Gitaxian Probe", RECRUITER, "Step Through"))
        mana = lands + fast + 0.5 * mdfc
        if size <= 5:
            return True
        if size == 6:
            return lands + mdfc >= 1 and mana >= 2
        return (lands + mdfc) >= 1 and 2 <= mana <= 5.5 and action >= 1

    def mulligan(self):
        """London mulligan, first one free, never below five cards (primer). The default 'model'
        policy keeps a hand when its predicted chance to win by turn 4 beats the value of
        mulliganing again; it rewards a turn-1 Krark, Jeska's Will, cantrips and engines."""
        free = self.cfg.free_mulligan
        if self.cfg.mulligan_policy == "model":
            model = mulligan_model(free, self.cfg.min_hand)
        else:
            model = {"w": None}
        on_draw = self.seat != 0
        for m in range(20):
            self.library += self.hand
            self.hand = []
            self.shuffle()
            self.draw(7)
            bottom = 7 - mull_size(m, free)
            if model["w"]:
                last = m >= model["last"]
                kept = best_keep(self.hand, 7 - bottom, on_draw)
                keep = last or hand_value(kept, on_draw) >= model["value_of_mulligan"][m + 1]
            else:
                last = 7 - bottom <= 5
                keep = self.keep_hand(self.hand, 7 - bottom) or last
                kept = None
            if keep:
                if kept is not None:
                    for c in list(self.hand):
                        if self.hand.count(c) > kept.count(c):
                            self.hand.remove(c)
                            self.library.append(c)
                else:
                    for _ in range(bottom):
                        worst = min(self.hand, key=self.card_value)
                        self.hand.remove(worst)
                        self.library.append(worst)
                self.mulligans = m
                self.opening_t1_krark = turn1_krark(self.hand, on_draw)
                break
        self.ts["cards_drawn"] = 0
        if "Gemstone Caverns" in self.hand and self.seat != 0:
            self.hand.remove("Gemstone Caverns")
            p = Perm("Gemstone Caverns", "land")
            p.luck = True
            self.perms.append(p)
            worst = min(self.hand, key=self.card_value)
            self.hand.remove(worst)
            self.exile.append(worst)
            self.log(f"Gemstone Caverns starts in play (exile {self.short(worst)})")

    def untap_upkeep(self):
        for p in self.perms:
            if CARDS[p.ident].get("rock", {}).get("no_untap") and p.tapped:
                self.life -= 1
                continue
            p.tapped = False
            p.used = False
            p.sick = False
            p.res = 0
        if self.pact_due and self.pact_due <= self.turn:
            if self.pay((3, 0, 2)):
                self.pact_due = 0
            else:
                raise Loss("could not pay for Pact of Negation")
        if self.on_bf(REMORA):
            self.remora_age += 1
            if self.remora_age > 3 or not self.pay((self.remora_age, 0, 0)):
                r = next(p for p in self.perms if p.ident == REMORA)
                self.perms.remove(r)
                self.gy.append(REMORA)

    def end_turn(self):
        if self.on_bf(BREACH):
            for p in [p for p in self.perms if p.ident == BREACH]:
                self.perms.remove(p)
                self.gy.append(BREACH)
        for p in [p for p in self.perms if p.temp]:
            self.perms.remove(p)
        self.virtual_power = 0
        self.flash_turn = False
        keep_red = self.on_bf(ELECTRO) or self.on_bf(ASHLING)
        self.pool = dict(R=self.pool["R"] if keep_red else 0, U=0, C=0, A=0)
        self.exile_play = [e for e in self.exile_play if e[1] > self.turn]
        if len(self.hand) > 7:
            self.discard_worst(len(self.hand) - 7)

    def record_turn(self):
        if self.turn <= 3 or self.seen_t3 is None:
            if self.turn <= 3:
                self.seen_t3 = sorted(set(self.deck_cards) - set(self.library))
        t = self.ts
        t["storm"] = self.storm
        t["flips_per_cast"] = self.krark_flips()
        t["krark_on_bf"] = int(self.on_bf(KRARK))
        t["two_krarks"] = int(len(self.krarks()) >= 2)
        t["doubler"] = int(self.on_bf(VEYRAN) or self.on_bf(PRODIGY) or any(p.staff for p in self.perms))
        t["vivi"] = int(self.on_bf(VIVI))
        t["mana_engine"] = int(any(self.on_bf(x) for x in (BIRGI, KILN, ELECTRO, SCOUNDREL)))
        t["veyran"] = int(self.on_bf(VEYRAN))
        t["prodigy"] = int(self.on_bf(PRODIGY))
        t["saka_krark"] = int(any(p.name == SAKA and p.ident == KRARK for p in self.perms))
        t["staff_krark"] = int(any(p.staff and p.ident == KRARK for p in self.perms))
        t["relic"] = int(self.on_bf("Relic of Legends"))
        t["krarks"] = max(t.get("krarks", 0), self.count(KRARK))
        self.turns.append(dict(t))

    PLANS = ("greedy", "allin", "wait", "engine_first", "breach")

    def clone(self, seed):
        saved, self.log_lines = self.log_lines, []
        try:
            c = copy.deepcopy(self)
        finally:
            self.log_lines = saved
        c.rng = random.Random(seed)
        c.verbose = False
        c.in_rollout = True
        return c

    def lookahead_worth_it(self):
        if self.cfg.lookahead <= 0 or self.in_rollout or not self.alive():
            return False
        spells = any(is_spell(h) for h in self.hand) or any(is_spell(e[0]) for e in self.exile_play)
        return spells and (self.on_bf(KRARK) or KRARK in self.cmd_zone)

    def rollout_value(self, start_turn):
        """Play out the rest of this turn and the next one; 1 = win now, 0.7 = win next turn,
        otherwise a small score for damage dealt and the board/hand left behind."""
        try:
            self.main_phase()
            self.plan = "greedy"
            if self.turn < self.cfg.turns:
                self.play_turn()
        except Win:
            return 1.0 if self.turn == start_turn else 0.7
        except Loss:
            return 0.0
        a = self.alive()
        dmg = 1 - sum(max(0, self.opp_life[i]) for i in a) / 120
        engines = sum(1 for x in (BIRGI, KILN, SCOUNDREL, ELECTRO, VIVI) if self.on_bf(x))
        return (0.25 * dmg + 0.1 * min(len(self.hand), 7) / 7
                + 0.1 * min(self.krark_flips(), 4) / 4 + 0.05 * min(engines, 2) / 2)

    def choose_plan(self):
        plans = [p for p in self.PLANS if p != "breach" or BREACH in self.hand]
        seeds = [self.rng.randrange(1 << 30) for _ in range(self.cfg.lookahead)]
        scores = {}
        for plan in plans:
            total = 0.0
            for sd in seeds:  # same seeds for every plan: common random numbers
                sim = self.clone(sd)
                sim.plan = plan
                total += sim.rollout_value(self.turn)
            scores[plan] = total / len(seeds)
        best = max(plans, key=lambda p: (scores[p], p == "greedy"))
        self.log("lookahead: " + ", ".join(f"{p} {scores[p]:.2f}" for p in plans) + f" -> {best}")
        return best

    def main_phase(self):
        self.main = True
        if self.breach_combo_ready():
            self.breach_combo()
        if self.plan == "engine_first":
            self.deploy()
        else:
            self.deploy(core_only=True)
        self.chain()
        self.combat()
        self.chain()
        if len(self.library) <= 3:
            self.try_shed_engine(force=True)
        self.main = False
        self.end_turn()

    def play_turn(self):
        self.turn += 1
        self.ts = TurnStats(self.turn)
        self.storm = 0
        self.land_played = self.opp_lost_life = self.chain_started = False
        if self.turn > 1:
            self.my_turn = False
            self.opponents_turns()
        self.my_turn = True
        self.untap_upkeep()
        self.refill_library()
        self.draw()
        self.log(f"--- turn {self.turn}: hand = {', '.join(self.short(h) for h in self.hand)}")
        self.play_land()
        self.ts["mana_potential"] = self.available_mana()
        self.plan = "greedy"
        if self.lookahead_worth_it():
            self.plan = self.choose_plan()
            self.plan_counts[self.plan] += 1
        self.ts["plan"] = self.plan
        self.main_phase()
        self.plan = "greedy"

    def run(self, max_turns):
        result = dict(win_turn=None, method=None, loss=None)
        try:
            self.mulligan()
            for _ in range(max_turns):
                self.play_turn()
                self.record_turn()
        except Win as w:
            self.ts["storm"] = self.storm
            self.record_turn()
            self.turns[-1]["won"] = 1
            result.update(win_turn=self.turn, method=w.method)
            self.log(f"*** WIN on turn {self.turn} via {w.method} (storm {self.storm})")
        except Loss as l:
            self.record_turn()
            result.update(loss=l.reason)
            self.log(f"*** LOSS on turn {self.turn}: {l.reason}")
        result.update(turns=self.turns, mulligans=self.mulligans, dmg_by=dict(self.dmg_by),
                      protection_used=self.protection_used, interaction_hits=self.interaction_hits,
                      seat=self.seat, flags=dict(self.flags), plans=dict(self.plan_counts),
                      seen_t3=self.seen_t3 or [], t1_krark_hand=self.opening_t1_krark,
                      protection=dict(self.prot_stats))
        return result


# --------------------------------------------------------------------------- runner


def run_batch(args):
    seed, n, cfg_dict = args
    cfg = argparse.Namespace(**cfg_dict)
    deck = parse_deck(DECKLIST)
    out = []
    for i in range(n):
        g = Game(deck, random.Random(seed * 1_000_003 + i), cfg)
        out.append(g.run(cfg.turns))
    return out


def pct(xs, q):
    if not xs:
        return 0
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))]


def summarize(results, cfg):
    n = len(results)
    turns = cfg.turns
    wins = [r for r in results if r["win_turn"]]
    s = {"games": n, "config": {k: v for k, v in vars(cfg).items()}}
    s["win_rate"] = len(wins) / n
    s["cumulative_win_by_turn"] = {t: sum(1 for r in wins if r["win_turn"] <= t) / n for t in range(1, turns + 1)}
    wt = [r["win_turn"] for r in wins]
    s["mean_win_turn"] = statistics.mean(wt) if wt else None
    s["median_win_turn"] = statistics.median(wt) if wt else None
    s["win_methods"] = dict(Counter(r["method"] for r in wins).most_common())
    s["losses"] = dict(Counter(r["loss"] for r in results if r["loss"]))
    s["mulligans"] = dict(sorted(Counter(r["mulligans"] for r in results).items()))
    dmg = Counter()
    for r in results:
        dmg.update(r["dmg_by"])
    s["damage_share"] = {k: v / max(1, sum(dmg.values())) for k, v in dmg.most_common()}
    per_turn = {}
    for t in range(1, turns + 1):
        rows = [r["turns"][t - 1] for r in results if len(r["turns"]) >= t]
        if not rows:
            continue
        d = {"games_reaching_turn": len(rows)}
        for f in TURN_FIELDS:
            vals = [row[f] for row in rows]
            d[f + "_mean"] = float(statistics.mean(vals))
        for f in TURN_FIELDS:
            vals = [row[f] for row in rows]
            d[f + "_p50"] = pct(vals, 0.5)
            d[f + "_p90"] = pct(vals, 0.9)
            d[f + "_max"] = max(vals)
        d["win_this_turn"] = sum(1 for r in results if r["win_turn"] == t) / len(rows)
        d["games_reaching_turn"] = len(rows)
        off = [row for row in rows if row["went_off"]]
        d["went_off_count"] = len(off)
        if off:
            d["went_off_win_rate"] = sum(1 for row in off if row.get("won")) / len(off)
            for f in ("mana_produced", "spells_cast", "krark_triggers", "copies", "treasures", "damage"):
                d["went_off_" + f + "_p50"] = pct([row[f] for row in off], 0.5)
            for f in ("veyran", "prodigy", "saka_krark", "staff_krark", "relic", "vivi"):
                d["went_off_" + f] = sum(row[f] for row in off) / len(off)
        per_turn[t] = d
    s["per_turn"] = per_turn
    win_rows = [r["turns"][-1] for r in wins]
    if win_rows:
        s["winning_turn_profile"] = {f: statistics.median(row[f] for row in win_rows)
                                     for f in ("mana_produced", "spells_cast", "krark_triggers",
                                               "flips_won", "copies", "cards_drawn", "treasures",
                                               "damage", "flips_per_cast")}
        s["winning_turn_krark_triggers_p90"] = pct([row["krark_triggers"] for row in win_rows], 0.9)
    s["went_off_but_fizzled"] = sum(1 for r in results for row in r["turns"]
                                    if row["went_off"] and not row.get("won")) / n
    plans = Counter()
    for r in results:
        plans.update(r.get("plans", {}))
    s["lookahead_plans"] = dict(plans.most_common())
    prot, flags = Counter(), Counter()
    for r in results:
        prot.update(r.get("protection", {}))
        flags.update(r.get("flags", {}))
    cards = sorted({key.split(" ", 1)[1] for key in prot}, key=lambda c: -prot["cast " + c])
    s["protection"] = {c: {"cast": prot["cast " + c], "bounced_no_effect": prot["bounced " + c],
                           "stopped": prot["stopped " + c]} for c in cards}
    s["flags"] = dict(flags)
    games_with = Counter()
    for r in results:
        for key in r.get("flags", {}):
            games_with[key] += 1
    s["flag_game_share"] = {key: v / n for key, v in games_with.items()}
    breach_wins = [r for r in wins if r.get("flags", {}).get("breach_combo")]
    s["breach_combo_games"] = games_with["breach_combo"] / n
    s["breach_combo_won_that_game"] = len(breach_wins) / max(1, games_with["breach_combo"])
    impact = []
    base_t = min(6, cfg.turns)
    for card in sorted({c for r in results for c in r.get("seen_t3", [])}):
        with_c = [r for r in results if card in r.get("seen_t3", [])]
        without = [r for r in results if card not in r.get("seen_t3", [])]
        if len(with_c) < 0.05 * n or not without:
            continue
        w1 = sum(1 for r in with_c if r["win_turn"] and r["win_turn"] <= base_t) / len(with_c)
        w0 = sum(1 for r in without if r["win_turn"] and r["win_turn"] <= base_t) / len(without)
        impact.append({"card": card, "seen_share": len(with_c) / n, "win_with": w1, "win_without": w0,
                       "lift": w1 - w0})
    s["card_impact"] = {"by_turn": base_t, "cards": sorted(impact, key=lambda d: -d["lift"])}
    s["interaction_hits_per_game"] = statistics.mean(r["interaction_hits"] for r in results)
    s["protection_used_per_game"] = statistics.mean(r["protection_used"] for r in results)
    return s


def bar(frac, width=30):
    full = int(round(frac * width))
    return "#" * full + "." * (width - full)


def print_report(s, label):
    print(f"\n{'=' * 78}\n {label}: {s['games']} games, {s['config']['turns']} turns, "
          f"stack interaction {s['config']['stack_rate']:.0%}, removal {s['config']['removal_rate']:.0%}\n{'=' * 78}")
    print(f"Win rate within {s['config']['turns']} turns: {s['win_rate']:.1%}   "
          f"mean win turn {s['mean_win_turn'] and round(s['mean_win_turn'], 2)}   median {s['median_win_turn']}")
    print("\nCumulative win % by turn")
    for t, v in s["cumulative_win_by_turn"].items():
        print(f"  T{t:<2} {bar(v)} {v:6.1%}")
    print("\nWin methods (killing blow)")
    total = sum(s["win_methods"].values()) or 1
    for m, c in s["win_methods"].items():
        print(f"  {m:<44} {c / total:6.1%}")
    print("\nDamage share across all games")
    for m, v in list(s["damage_share"].items())[:8]:
        print(f"  {m:<44} {v:6.1%}")
    hdr = ("turn", "games", "mana@start", "mana made", "p90", "casts", "p90", "krark trig", "p90",
           "flips/cast", "copies", "draws", "treasures", "dmg", "win%")
    print("\nPer-turn medians, p90 and means (games still running at the start of that turn)")
    print("  mana@start = mana available after the land drop; flips/cast, draws and dmg are means;")
    print("  near-infinite turns are capped by the simulator, so means of the other columns are in the JSON")
    print("  " + " ".join(f"{h:>10}" for h in hdr))
    for t, d in s["per_turn"].items():
        row = (t, d["games_reaching_turn"], d["mana_potential_p50"], d["mana_produced_p50"],
               d["mana_produced_p90"], d["spells_cast_p50"], d["spells_cast_p90"],
               d["krark_triggers_p50"], d["krark_triggers_p90"], d["flips_per_cast_mean"],
               d["copies_p50"], d["cards_drawn_mean"], d["treasures_p50"], d["damage_mean"],
               d["win_this_turn"] * 100)
        print("  " + " ".join(f"{v:>10.1f}" if isinstance(v, float) else f"{v:>10}" for v in row))
    print("\nTurns where the chain started (at least one instant/sorcery cast with the engine ready)")
    hdr3 = ("turn", "chains", "won it", "mana made", "casts", "krark trig", "copies", "treasures", "dmg")
    print("  " + " ".join(f"{h:>10}" for h in hdr3) + "   (medians)")
    for t, d in s["per_turn"].items():
        if not d["went_off_count"]:
            continue
        row = (t, d["went_off_count"], f"{d['went_off_win_rate']:.0%}", d["went_off_mana_produced_p50"],
               d["went_off_spells_cast_p50"], d["went_off_krark_triggers_p50"], d["went_off_copies_p50"],
               d["went_off_treasures_p50"], d["went_off_damage_p50"])
        print("  " + " ".join(f"{v:>10}" for v in row))
    print("\nBoard state at end of turn (share of running games)")
    hdr2 = ("turn", "Krark", "2+ Krarks", "doubler", "mana eng.", "Vivi", "went off", "cap hit")
    print("  " + " ".join(f"{h:>10}" for h in hdr2))
    for t, d in s["per_turn"].items():
        row = (t, d["krark_on_bf_mean"], d["two_krarks_mean"], d["doubler_mean"], d["mana_engine_mean"],
               d["vivi_mean"], d["went_off_mean"], d["infinite_mean"])
        print("  " + " ".join(f"{v:>10.1%}" if isinstance(v, float) else f"{v:>10}" for v in row))
    if "winning_turn_profile" in s:
        w = s["winning_turn_profile"]
        print("\nMedian winning turn: "
              f"{w['spells_cast']:.0f} spells, {w['krark_triggers']:.0f} Krark triggers "
              f"(p90 {s['winning_turn_krark_triggers_p90']}), {w['copies']:.0f} copies, "
              f"{w['mana_produced']:.0f} mana, {w['treasures']:.0f} treasures, {w['cards_drawn']:.0f} draws, "
              f"{w['flips_per_cast']:.1f} flips per spell at the end")
    if s["protection"]:
        print("\nProtection under Krark (cast / bounced by Krark with no effect / threat stopped)")
        for c, d in s["protection"].items():
            print(f"  {c:<40} {d['cast']:>6} {d['bounced_no_effect']:>6} {d['stopped']:>6}")
    fs = s["flag_game_share"]
    print(f"\nBreach + Brain Freeze loop started in {s['breach_combo_games']:.1%} of games "
          f"(won {s['breach_combo_won_that_game']:.0%} of those); Wizard's Staff equipped in "
          f"{fs.get('staff_equips', 0):.1%} of games; Submerge used against decking in "
          f"{fs.get('shed_hand', 0) + fs.get('shed_escape', 0) + fs.get('refill_hand', 0):.1%}")
    ci = s["card_impact"]["cards"]
    if ci:
        print(f"\nCard impact: win by T{s['card_impact']['by_turn']} when the card left the library by "
              f"end of T3, minus when it did not (correlation, not causation)")
        for d in ci[:10] + [None] + ci[-5:]:
            if d is None:
                print("  ...")
                continue
            print(f"  {d['card']:<44} {d['lift'] * 100:+6.1f} pts  (seen in {d['seen_share']:.0%} of games)")
    if s["lookahead_plans"]:
        total = sum(s["lookahead_plans"].values())
        print("\nLookahead plan picked on Krark turns: " + ", ".join(
            f"{p} {c / total:.0%}" for p, c in s["lookahead_plans"].items()))
    print(f"\nMulligans taken: {s['mulligans']}")
    if s["losses"]:
        print(f"Losses: {s['losses']}")
    print(f"Turns where the chain started but did not win: {s['went_off_but_fizzled']:.2f} per game")
    if s["config"]["stack_rate"] or s["config"]["removal_rate"]:
        print(f"Interaction events per game {s['interaction_hits_per_game']:.2f}, "
              f"protection spent per game {s['protection_used_per_game']:.2f}")


def write_csv(s, path):
    with open(path, "w", newline="") as f:
        rows = list(s["per_turn"].items())
        keys = list(rows[0][1].keys())
        w = csv.writer(f)
        w.writerow(["turn"] + keys)
        for t, d in rows:
            w.writerow([t] + [round(d[k], 4) if isinstance(d[k], float) else d[k] for k in keys])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-n", "--games", type=int, default=1000)
    ap.add_argument("--turns", type=int, default=4)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 1)
    ap.add_argument("--stack-rate", type=float, default=0.0,
                    help="chance an opponent tries to remove Krark when the chain starts")
    ap.add_argument("--removal-rate", type=float, default=0.0,
                    help="chance per round that an opponent removes your best engine creature")
    ap.add_argument("--interactive-preset", action="store_true",
                    help="also run a table with stack-rate 0.35 and removal-rate 0.25")
    ap.add_argument("--cast-cap", type=int, default=400,
                    help="spells in one turn treated as a deterministic loop")
    ap.add_argument("--life-floor", type=int, default=8,
                    help="stop paying life for Phyrexian mana below this")
    ap.add_argument("--ogre-floor", type=int, default=4,
                    help="Treasonous Ogre keeps paying 3 life while this much would remain (primer: be aggressive)")
    ap.add_argument("--p-opp-island", type=float, default=0.75)
    ap.add_argument("--p-opp-forest", type=float, default=1.0,
                    help="chance an opponent controls a Forest (free Submerge); cEDH pods nearly always do")
    ap.add_argument("--no-free-mulligan", action="store_true")
    ap.add_argument("--min-hand", type=int, default=2,
                    help="smallest hand the model mulligan will go to (default 2)")
    ap.add_argument("--mulligan", choices=("model", "rule"), default="model",
                    help="model: keep when the hand's predicted win chance beats mulliganing (default); "
                         "rule: the old lands / mana / action checklist")
    ap.add_argument("--no-combat", action="store_true", help="never attack (pure combo goldfish)")
    ap.add_argument("--lookahead", type=int, default=6,
                    help="rollouts per candidate plan at the start of each Krark turn (0 = pure greedy pilot)")
    ap.add_argument("--bf-policy", choices=("early", "fuel", "all"), default="early",
                    help="Breach loop: when Brain Freeze mills you (default: until storm 12 or while fuel < 12)")
    ap.add_argument("--jeska-early", action="store_true",
                    help="let the greedy pilot cast Jeska's Will off a single Krark trigger")
    ap.add_argument("--patient", action="store_true",
                    help="only start a chain with a mana engine plus a kill in place (default: go as soon as "
                         "two Krark triggers or Krark + an engine exist)")
    ap.add_argument("--blockers", type=int, default=1,
                    help="chump blockers each opponent has per combat (default 1)")
    ap.add_argument("--sample", type=int, default=0, help="print N verbose sample games")
    ap.add_argument("--out", default="results", help="directory for JSON/CSV output")
    a = ap.parse_args()

    deck = parse_deck(DECKLIST)
    assert len(deck) == 100, f"deck has {len(deck)} cards"

    def cfg_for(stack, removal):
        return dict(turns=a.turns, stack_rate=stack, removal_rate=removal,
                    interactive=stack > 0 or removal > 0, cast_cap=a.cast_cap,
                    life_floor=a.life_floor, ogre_floor=a.ogre_floor, p_opp_island=a.p_opp_island, p_opp_forest=a.p_opp_forest,
                    free_mulligan=not a.no_free_mulligan, safe_draws=False, krark_token_cap=12, token_cap=30, exile_floor=25, bf_policy=a.bf_policy,
                    combat=not a.no_combat, blockers=a.blockers,
                    patient=a.patient, mulligan_policy=a.mulligan, min_hand=a.min_hand, jeska_early=a.jeska_early, lookahead=a.lookahead)

    scenarios = [("goldfish" if not (a.stack_rate or a.removal_rate) else "custom",
                  cfg_for(a.stack_rate, a.removal_rate))]
    if a.interactive_preset:
        scenarios.append(("interactive", cfg_for(0.35, 0.25)))

    os.makedirs(a.out, exist_ok=True)
    sample_text = []
    for i in range(a.sample):
        cfg = argparse.Namespace(**scenarios[0][1])
        g = Game(deck, random.Random(a.seed * 7919 + i), cfg, verbose=True)
        r = g.run(a.turns)
        sample_text.append(f"\n######## sample game {i + 1} (seat {g.seat + 1}, mulligans {g.mulligans})")
        sample_text += g.log_lines
        if not r["win_turn"]:
            sample_text.append(f"*** no win by turn {a.turns}; opponents at {g.opp_life}")
    if sample_text:
        print("\n".join(sample_text))
        with open(os.path.join(a.out, "sample_games.txt"), "w") as f:
            f.write("\n".join(sample_text) + "\n")

    for label, cfgd in scenarios:
        jobs = max(1, a.jobs)
        per = [a.games // jobs + (1 if j < a.games % jobs else 0) for j in range(jobs)]
        tasks = [(a.seed * 101 + j, per[j], cfgd) for j in range(jobs) if per[j]]
        if jobs > 1:
            with Pool(jobs) as pool:
                batches = pool.map(run_batch, tasks)
        else:
            batches = [run_batch(t) for t in tasks]
        results = [r for b in batches for r in b]
        s = summarize(results, argparse.Namespace(**cfgd))
        print_report(s, label)
        with open(os.path.join(a.out, f"{label}_summary.json"), "w") as f:
            json.dump(s, f, indent=2, default=str)
        write_csv(s, os.path.join(a.out, f"{label}_per_turn.csv"))
    print(f"\nWrote JSON and CSV to {os.path.abspath(a.out)}/")


if __name__ == "__main__":
    main()
