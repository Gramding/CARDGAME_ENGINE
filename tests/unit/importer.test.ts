import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deckNames, deckSize, parseDecklist } from "../../src/importer/parse";
import { coverage, isDataOnly } from "../../src/importer/coverage";
import { buildPrompt } from "../../src/importer/prompt";
import { lookupCards, trimCard, type CardData } from "../../src/importer/scryfall";

const fixture = (f: string) => readFileSync(resolve(__dirname, "../fixtures", f), "utf8");
const kefkaText = fixture("kefka.txt");
const kefkaData: CardData[] = JSON.parse(fixture("kefka.scryfall.json")).data;
const byName = (n: string) => kefkaData.find(c => c.name === n)!;

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

  it("sorts the Kefka deck and finds the black mana gap", async () => {
    const d = parseDecklist(kefkaText);
    const { cards, notFound } = await lookupCards(deckNames(d), undefined, fakeFetch);
    expect(notFound).toEqual([]);
    const cov = coverage(deckNames(d), cards);
    expect(cov.counts.modeled + cov.counts.data + cov.counts.script).toBe(100);
    expect(cov.cards.find(c => c.name === "Sol Ring")!.status).toBe("modeled");
    expect(cov.cards.find(c => c.name === "Thassa's Oracle")!.status).toBe("script");
    expect(cov.cards.find(c => c.name === "Badlands")!.status).toBe("data");
    expect(cov.colors).toEqual(["U", "B", "R"]);
    expect(cov.gaps.map(g => g.title)).toEqual(["Black mana ({B})"]);
    // modeled cards that make any color or fetch a Swamp need to learn {B}
    expect(cov.gaps[0].cards).toEqual(expect.arrayContaining(["Command Tower", "City of Brass", "Polluted Delta", "Bloodstained Mire"]));
    expect(cov.gaps[0].cards).not.toContain("Volcanic Island");
  });
});

describe("buildPrompt", () => {
  it("lists the gaps, the missing cards with oracle text and the done criteria", async () => {
    const d = parseDecklist(kefkaText);
    const { cards } = await lookupCards(deckNames(d), undefined, fakeFetch);
    const cov = coverage(deckNames(d), cards);
    const p = buildPrompt(d, cov);
    expect(p).toContain("Commander: Kefka, Court Mage // Kefka, Ruler of Ruin");
    expect(p).toContain("## Engine work needed first");
    expect(p).toContain("### Thassa's Oracle");
    expect(p).toContain("Face 2: Kefka, Ruler of Ruin");
    expect(p).toContain("> Whenever an opponent loses life during your turn, you draw that many cards.");
    expect(p).toContain(`## Needs scripting (${cov.counts.script})`);
    expect(p).not.toContain("### Sol Ring");
  });
});

describe("trimCard", () => {
  it("keeps commander legality from the full Scryfall object", () => {
    expect(trimCard({ name: "X", layout: "normal", color_identity: [], legalities: { commander: "legal" } }).legal_commander).toBe("legal");
  });
});
