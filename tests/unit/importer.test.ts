import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deckNames, deckSize, parseDecklist } from "../../src/importer/parse";
import { coverage, isDataOnly } from "../../src/importer/coverage";
import { buildPrompt } from "../../src/importer/prompt";
import { lookupCards, trimCard, type CardData } from "../../src/importer/scryfall";
import { applyCommander, commanderCandidates, guessCommander } from "../../src/importer/commander";
import { playDeck, shortCost, stubCard } from "../../src/importer/deck";

const fixture = (f: string) => readFileSync(resolve(__dirname, "../fixtures", f), "utf8");
const kefkaText = fixture("kefka.txt");
const kefkaData: CardData[] = JSON.parse(fixture("kefka.scryfall.json")).data;
const byName = (n: string) => kefkaData.find(c => c.name === n)!;
const FOREST: CardData = { name: "Forest", layout: "normal", type_line: "Basic Land — Forest", oracle_text: "({T}: Add {G}.)", color_identity: ["G"], produced_mana: ["G"] };
const ELVES: CardData = { name: "Arbor Elf", layout: "normal", mana_cost: "{G}", cmc: 1, type_line: "Creature — Elf Druid", oracle_text: "{T}: Untap target Forest.", power: "1", toughness: "1", color_identity: ["G"], produced_mana: ["G"] };

/** A fetch stand-in that answers /cards/collection from the fixture. */
const fakeFetch = (async (_url: string, init: { body: string }) => {
  const ids: { name: string }[] = JSON.parse(init.body).identifiers;
  const data = ids.map(i => kefkaData.find(c => c.name.split(" // ")[0] === i.name)).filter(Boolean);
  const not_found = ids.filter(i => !kefkaData.some(c => c.name.split(" // ")[0] === i.name));
  return { ok: true, status: 200, json: async () => ({ data, not_found }) };
}) as unknown as typeof fetch;

describe("parseDecklist", () => {
  it("reads the Kefka list with its commander set apart by a blank line", () => {
    const d = parseDecklist(kefkaText);
    expect(d.commanders).toEqual(["Kefka, Court Mage // Kefka, Ruler of Ruin"]);
    expect(d.cards).toHaveLength(99);
    expect(deckSize(d)).toBe(100);
    expect(d.warnings).toEqual([]);
  });

  it("understands Moxfield and Arena details", () => {
    const d = parseDecklist(`Commander\n1 Krark, the Thumbless (CMR) 189 *F*\n\nDeck\n1x Sol Ring (C21) 263\n4 Island\nLightning Bolt\n// a comment\n\nSideboard\n1 Pyroblast`);
    expect(d.commanders).toEqual(["Krark, the Thumbless"]);
    expect(d.cards.map(c => [c.name, c.qty])).toEqual([["Sol Ring", 1], ["Island", 4], ["Lightning Bolt", 1]]);
  });

  it("reads Moxfield category tags and their Commander category", () => {
    const d = parseDecklist(`1 Ancestors' Aid (lci) [Inky pacakge]\n1 Nephilim Epochal (mbc) [Commander{top}]\n1 Leap (plst) 12 *F* [Inky pacakge,Draw]\n1 Sol Ring\n1 Lightning Bolt [Maybeboard{noDeck}{noPrice}]`);
    expect(d.commanders).toEqual(["Nephilim Epochal"]);
    expect(d.cards.map(c => c.name)).toEqual(["Ancestors' Aid", "Leap", "Sol Ring"]);
    expect(d.warnings).toEqual([]);
  });

  it("takes a *CMDR* marker as the commander", () => {
    const d = parseDecklist(`1 Sol Ring\n1 Kefka, Court Mage *CMDR*\n1 Island`);
    expect(d.commanders).toEqual(["Kefka, Court Mage"]);
    expect(deckNames(d)[0]).toBe("Kefka, Court Mage");
  });

  it("does not invent a commander for a list without one", () => {
    expect(parseDecklist(`1 Sol Ring\n1 Island\n1 Lotus Petal`).commanders).toEqual([]);
  });
});

describe("coverage", () => {
  it("recognises data-only lands and rocks", () => {
    expect(isDataOnly(byName("Underground Sea"))).toBe("mana land");
    expect(isDataOnly(byName("Marsh Flats"))).toBe("fetch land");
    expect(isDataOnly(byName("Talisman of Dominance"))).toBe("mana rock");
    expect(isDataOnly(byName("Morphic Pool"))).toBe("mana land");
    expect(isDataOnly(byName("Cavern of Souls"))).toBeNull();
    expect(isDataOnly(byName("Spire of Industry"))).toBeNull();
    expect(isDataOnly(byName("Mox Opal"))).toBeNull();
    expect(isDataOnly(byName("Grim Monolith"))).toBeNull();
  });

  it("finds every card of the Kefka deck modeled, with no engine gaps", async () => {
    const d = parseDecklist(kefkaText);
    const { cards, notFound } = await lookupCards(deckNames(d), undefined, fakeFetch);
    expect(notFound).toEqual([]);
    const cov = coverage(deckNames(d), cards);
    expect(cov.counts).toEqual({ modeled: 100, data: 0, script: 0 });
    expect(cov.colors).toEqual(["U", "B", "R"]);
    expect(cov.gaps).toEqual([]);
  });

  it("sorts cards the engine doesn't know into data only and needs scripting", () => {
    const cov = coverage(["Forest", "Arbor Elf", "Sol Ring"], new Map([["Forest", FOREST], ["Arbor Elf", ELVES], ["Sol Ring", byName("Sol Ring")]]));
    expect(cov.cards.map(c => c.status)).toEqual(["data", "script", "modeled"]);
    expect(cov.colors).toEqual(["G"]);
  });
});

describe("buildPrompt", () => {
  it("lists the missing cards with oracle text and the done criteria", async () => {
    const d = parseDecklist(`1 Kefka, Court Mage\n\n1 Arbor Elf\n1 Forest\n1 Sol Ring`);
    const cards = new Map([["Kefka, Court Mage", byName("Kefka, Court Mage // Kefka, Ruler of Ruin")], ["Arbor Elf", ELVES], ["Forest", FOREST], ["Sol Ring", byName("Sol Ring")]]);
    const cov = coverage(deckNames(d), cards);
    const p = buildPrompt(d, cov);
    expect(p).toContain("Commander: Kefka, Court Mage");
    expect(p).toContain("### Arbor Elf");
    expect(p).toContain("> {T}: Untap target Forest.");
    expect(p).toContain("## Data only (1)");
    expect(p).toContain("## Needs scripting (1)");
    expect(p).not.toContain("### Sol Ring");
    expect(p).not.toContain("## Engine work needed first");
  });
});

describe("commander guess", () => {
  it("reads a commander set apart at the end of the list", () => {
    const lines = kefkaText.trim().split("\n");
    const d = parseDecklist([...lines.slice(2), "", lines[0]].join("\n"));
    expect(d.commanders).toEqual(["Kefka, Court Mage // Kefka, Ruler of Ruin"]);
    expect(deckSize(d)).toBe(100);
  });

  it("guesses Kefka when nothing marks the commander", async () => {
    const lines = kefkaText.trim().split("\n").filter(Boolean);
    const d = parseDecklist([...lines.slice(1, 50), lines[0], ...lines.slice(50)].join("\n"));
    expect(d.commanders).toEqual([]);
    const { cards } = await lookupCards(deckNames(d), undefined, fakeFetch);
    const g = guessCommander(d, cards);
    expect(g).toBe("Kefka, Court Mage // Kefka, Ruler of Ruin");
    const fixed = applyCommander(d, g!);
    expect(fixed.cards).toHaveLength(99);
    expect(deckSize(fixed)).toBe(100);
  });

  it("makes no guess when two legends cover the colors", () => {
    const d = parseDecklist(`1 Kefka, Court Mage // Kefka, Ruler of Ruin\n1 Kefka Clone\n1 Sol Ring`);
    const k = byName("Kefka, Court Mage // Kefka, Ruler of Ruin");
    const cards = new Map([["Kefka, Court Mage // Kefka, Ruler of Ruin", k], ["Kefka Clone", { ...k, name: "Kefka Clone" }], ["Sol Ring", byName("Sol Ring")]]);
    expect(guessCommander(d, cards)).toBeNull();
    expect(commanderCandidates(d, cards)).toEqual(["Kefka, Court Mage // Kefka, Ruler of Ruin", "Kefka Clone"]);
  });
});

describe("playDeck", () => {
  it("hands the playtester the full list, with plain data for unmodeled cards", () => {
    const d = parseDecklist(`1 Kefka, Court Mage\n\n1 Arbor Elf\n2 Forest\n1 Sol Ring`);
    const cards = new Map([["Kefka, Court Mage", byName("Kefka, Court Mage // Kefka, Ruler of Ruin")], ["Arbor Elf", ELVES], ["Forest", FOREST], ["Sol Ring", byName("Sol Ring")]]);
    const pd = playDeck(d, coverage(deckNames(d), cards), cards, "Test deck");
    expect(pd.id).toBe("imp-test-deck");
    expect(pd.commanders).toEqual(["Kefka, Court Mage // Kefka, Ruler of Ruin"]);
    expect(pd.cards).toEqual(["Arbor Elf", "Forest", "Forest", "Sol Ring"]);
    expect(Object.keys(pd.extra).sort()).toEqual(["Arbor Elf", "Forest"]);
    expect(pd.extra["Arbor Elf"]).toMatchObject({ k: "creature", c: "G", mv: 1, pt: [1, 1], ty: ["Elf", "Druid"], manual: 1 });
    expect(pd.extra["Forest"]).toMatchObject({ k: "land", mana: "G", amt: 1 });
  });

  it("writes costs the way the playtester reads them", () => {
    expect(shortCost("{2}{U}{B}{R}")).toBe("2UBR");
    expect(shortCost("{U/P}")).toBe("{U/P}");
    expect(stubCard(byName("Kefka, Court Mage // Kefka, Ruler of Ruin"), false)).toMatchObject({ k: "creature", c: "2UBR", leg: 1, pt: [4, 5] });
  });
});

describe("trimCard", () => {
  it("keeps commander legality from the full Scryfall object", () => {
    expect(trimCard({ name: "X", layout: "normal", color_identity: [], legalities: { commander: "legal" } }).legal_commander).toBe("legal");
  });
});
