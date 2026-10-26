/* Sort a deck's cards by how much engine work they need:
   - modeled:  the engine already plays the card
   - data:     a land or mana rock whose text is only mana abilities, enters-tapped clauses, a shock
               payment, a fetch or a pain clause; it needs a data entry, not new behaviour
   - script:   anything else; it needs its behaviour written
   It also lists what the engine itself lacks for the deck, such as mana colors. */
import { BASIC_TYPE_COLOR, COLOR_NAMES, SUPPORTED_COLORS, modeledCard, type Color } from "../engine/registry";
import type { CardData } from "./scryfall";

export type Status = "modeled" | "data" | "script";

export interface CardCoverage {
  name: string;
  card?: CardData;
  status: Status;
  why: string;
}

export interface EngineGap {
  title: string;
  detail: string;
  cards: string[];
}

export interface Coverage {
  cards: CardCoverage[];
  colors: Color[];
  gaps: EngineGap[];
  counts: Record<Status, number>;
}

const MANA_LINE = /^\(?\{T\}(?:, Pay \d+ life)?: Add (?:\{[WUBRGC]\}(?: or \{[WUBRGC]\})*|\{[WUBRGC]\}(?:\{[WUBRGC]\})+|one mana of any color(?: in your commander's color identity)?)\.(?: This (?:artifact|land) deals 1 damage to you\.)?\)?$/;
const ENTERS_TAPPED = /^This land enters tapped(?: unless you have two or more opponents)?\.$|^As this land enters, you may pay 2 life\. If you don't, it enters tapped\.$/;
const FETCH = /^\{T\}, Pay 1 life, Sacrifice this land: Search your library for an? (\w+) or (\w+) card, put it onto the battlefield, then shuffle\.$/;

function oracleLines(c: CardData): string[] {
  const text = c.oracle_text ?? c.card_faces?.map(f => f.oracle_text ?? "").join("\n") ?? "";
  return text.split("\n").map(l => l.trim()).filter(Boolean);
}

/** Lands and rocks that are nothing but mana abilities (and the plain clauses around them). */
export function isDataOnly(c: CardData): string | null {
  const type = c.type_line ?? "";
  const isLand = /\bLand\b/.test(type), isArtifact = /\bArtifact\b/.test(type) && !/Creature/.test(type);
  if (!isLand && !isArtifact) return null;
  if (isArtifact && c.mana_cost === undefined) return null;
  const lines = oracleLines(c);
  if (!lines.length) return null;
  if (isLand && lines.length === 1 && FETCH.test(lines[0])) return "fetch land";
  if (lines.every(l => MANA_LINE.test(l) || (isLand && ENTERS_TAPPED.test(l)))) return isLand ? "mana land" : "mana rock";
  return null;
}

/** Colors a card can make or fetch, for checking modeled cards against missing colors. */
function colorsTouched(c: CardData): Color[] {
  const out = new Set<Color>();
  for (const m of c.produced_mana ?? []) if ("WUBRG".includes(m)) out.add(m as Color);
  const f = oracleLines(c).join(" ").match(/Search your library for an? (\w+) or (\w+) card/);
  if (f) for (const t of [f[1], f[2]]) if (BASIC_TYPE_COLOR[t]) out.add(BASIC_TYPE_COLOR[t]);
  return [...out];
}

export function coverage(names: string[], cards: Map<string, CardData>): Coverage {
  const list: CardCoverage[] = names.map(name => {
    const card = cards.get(name);
    if (!card) return { name, status: "script", why: "not found on Scryfall" };
    if (modeledCard(card.name) || modeledCard(name)) return { name: card.name, card, status: "modeled", why: "already in the engine" };
    const data = isDataOnly(card);
    if (data) return { name: card.name, card, status: "data", why: data };
    return { name: card.name, card, status: "script", why: "needs its behaviour written" };
  });

  const colors = [...new Set(list.flatMap(c => c.card?.color_identity ?? []))].filter((x): x is Color => "WUBRG".includes(x)).sort((a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b));
  const gaps: EngineGap[] = [];
  for (const col of colors.filter(c => !SUPPORTED_COLORS.includes(c))) {
    const affected = list.filter(c => c.status === "modeled" && c.card && colorsTouched(c.card).includes(col)).map(c => c.name);
    gaps.push({
      title: `${COLOR_NAMES[col][0].toUpperCase() + COLOR_NAMES[col].slice(1)} mana ({${col}})`,
      detail: `The mana pool, cost parser and automatic payment only know ${SUPPORTED_COLORS.map(c => `{${c}}`).join(", ")}, colorless and "any color". {${col}} needs adding there, and the already-modeled cards below must learn to make or find it.`,
      cards: affected,
    });
  }
  const counts = { modeled: 0, data: 0, script: 0 } as Record<Status, number>;
  for (const c of list) counts[c.status]++;
  return { cards: list, colors, gaps, counts };
}
