"""Compare the playtester's card data (src/playtester/cards.json) with Scryfall.

Prints every card whose cost, type, mana value, legendary status, creature types, power and
toughness, land types, keywords or mana differs from the real card, so mistakes typed into the
data show up before they reach a game. Run it after adding cards:

    python3 tools/audit_cards.py

Needs network access to api.scryfall.com. Differences the engine handles on purpose are listed in
KNOWN and skipped.
"""
import json
import pathlib
import re
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
KNOWN = {
    "Blood Crypt": "shock land: pays 2 life or enters tapped", "Steam Vents": "shock land", "Watery Grave": "shock land",
    "Chrome Mox": "colour comes from the imprinted card", "Mox Amber": "colour comes from your legends",
    "Return the Favor": "cost includes the {1} spree mode for copying",
    "Kefka, Court Mage // Kefka, Ruler of Ruin": "flying is on the back face",
}
KO = ["creature", "land", "artifact", "enchantment", "planeswalker", "instant", "sorcery"]
BT = {"Island": "I", "Mountain": "M", "Swamp": "S", "Plains": "P", "Forest": "F"}


def cost(s):
    if not s:
        return ""
    return "".join(sym if re.fullmatch(r"\d+|[WUBRGCX]", sym) else "{" + sym + "}" for sym in re.findall(r"\{([^}]+)\}", s))


def fetch(names):
    out = []
    for i in range(0, len(names), 75):
        body = json.dumps({"identifiers": [{"name": n.split(" // ")[0]} for n in names[i:i + 75]]}).encode()
        req = urllib.request.Request("https://api.scryfall.com/cards/collection", data=body,
                                     headers={"Content-Type": "application/json", "User-Agent": "cardgame-engine/0.1", "Accept": "application/json"})
        out += json.load(urllib.request.urlopen(req))["data"]
        time.sleep(0.1)
    return {c["name"]: c for c in out}


def main():
    cards = json.loads((ROOT / "src/playtester/cards.json").read_text())
    sf = fetch([c["n"] for c in cards])
    probs = []
    for c in cards:
        n=c['n']; s=sf.get(n) or next(v for k,v in sf.items() if k.split(' // ')[0]==n.split(' // ')[0])
        f=s.get('card_faces',[s])[0]
        tl=f.get('type_line',s['type_line']).split(' // ')[0]
        main,_,sub=tl.partition(' — ')
        kinds=[k for k in KO if k in main.lower().split()]
        P=lambda m: probs.append(f"{n}: {m}")
        if cost(f.get('mana_cost',s.get('mana_cost')))!=c.get('c','') and not (c.get('c')=='0' and cost(f.get('mana_cost'))=='0'):
            if not (c['k']=='land' and not c.get('c')): P(f"cost {c.get('c')!r} vs {cost(f.get('mana_cost'))!r}")
        if kinds and c['k']!=kinds[0]: P(f"kind {c['k']} vs {kinds}")
        if len(kinds)>1 and sorted(c.get('kt',[]))!=sorted(kinds): P(f"kt {c.get('kt')} vs {kinds}")
        if c['k']!='land' and 'mv' in c and int(s.get('cmc',0))!=c['mv'] and 'X' not in c.get('c',''): P(f"mv {c['mv']} vs {s.get('cmc')}")
        if c['k']!='land' and 'mv' not in c: P("no mv")
        if ('Legendary' in main) != bool(c.get('leg')): P(f"legendary {bool(c.get('leg'))} vs {'Legendary' in main}")
        if 'creature' in kinds:
            ty=sub.split()
            if c.get('ty') and c['ty']!=ty: P(f"types {c.get('ty')} vs {ty}")
            if not c.get('ty'): P(f"no creature types (should be {ty})")
            if 'pt' in c and c['pt']!=[int(f['power']),int(f['toughness'])]: P(f"pt {c['pt']} vs {f['power']}/{f['toughness']}")
            if 'pt' not in c: P(f"no pt in data (printed {f['power']}/{f['toughness']})")
        if c['k']=='land':
            lt="".join(BT[t] for t in sub.split() if t in BT)
            if lt!=c.get('lt',"") and n not in BT: P(f"land types {c.get('lt')!r} vs {lt!r}")
            txt=s.get('oracle_text') or ''
            if re.search(r'enters tapped\.$',txt,re.M) and 'unless' not in txt and not c.get('etb_tapped'): P("enters tapped but no etb_tapped")
        kw=[k.lower() for k in s.get('keywords',[])]
        for k,fld in [("flash","flash"),("haste","haste"),("prowess","prowess"),("vigilance","vig"),("exalted","exalted"),("flying","flying")]:
            if k in kw and not c.get(fld): P(f"keyword {k} not in data")
        pm=s.get('produced_mana')
        if c.get('mana') and pm and c['mana'] not in ('*','ID','vivid','C*') :
            want=set(pm); have=set(c['mana'])
            if have!=want and not (c['mana']=='C' and n in ('Gemstone Caverns','Cavern of Souls','Spire of Industry','Delighted Halfling')): P(f"mana {c['mana']} vs produced {''.join(sorted(pm))}")

    probs = [p for p in probs if p.split(":")[0] not in KNOWN]
    print(f"{len(cards)} cards checked, {len(probs)} differences")
    print("\n".join(probs))


if __name__ == "__main__":
    main()
