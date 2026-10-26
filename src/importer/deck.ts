/* Hand an imported deck to the playtester. It reads decks from localStorage ("cge-decks"); cards the
   engine doesn't model travel with plain data (type, cost, power and toughness, image, and the mana a
   simple land or rock makes) so they can still be played by hand. */
import { modeledCard } from "../engine/registry";
import type { Coverage } from "./coverage";
import type { ParsedDeck } from "./parse";
import type { CardData } from "./scryfall";

export const DECKS_KEY = "cge-decks";

export interface PlayCard {
  n: string; s: string; k: string; c: string; mv?: number; leg?: 1; ty?: string[]; pt?: [number, number]; kt?: string[];
  mana?: string; amt?: number; etb_tapped?: 1; flash?: 1; manual: 1; img?: string; img2?: string;
}

export interface PlayDeck {
  id: string; name: string; commanders: string[]; cards: string[]; imported: true; extra: Record<string, PlayCard>;
}

const KINDS = ["creature", "land", "artifact", "enchantment", "planeswalker", "battle", "instant", "sorcery"];

/** "{2}{U}{B}" -> "2UB", the playtester's cost format (hybrid and Phyrexian symbols stay in braces). */
export function shortCost(cost: string | undefined): string {
  return (cost ?? "").replace(/\{(\d+|[WUBRGC])\}/g, "$1").replace(/\{X\}/g, "");
}

export function stubCard(c: CardData, dataOnly: boolean): PlayCard {
  const f = c.card_faces?.[0] ?? c;
  const type = (f.type_line ?? c.type_line ?? "").split(" // ")[0];
  const [main, sub] = type.split(" — ");
  const kinds = KINDS.filter(k => main.toLowerCase().split(/\s+/).includes(k));
  const out: PlayCard = { n: c.name, s: c.name.split(" // ")[0], k: kinds[0] ?? "artifact", c: shortCost(f.mana_cost ?? c.mana_cost), manual: 1 };
  if (out.k !== "land") out.mv = c.cmc ?? 0;
  if (kinds.length > 1) out.kt = kinds;
  if (/Legendary/.test(main)) out.leg = 1;
  if (sub && kinds.includes("creature")) out.ty = sub.split(/\s+/);
  if (f.power !== undefined && /^\d+$/.test(f.power) && /^\d+$/.test(f.toughness ?? "")) out.pt = [+f.power, +f.toughness!];
  if ((c.keywords ?? []).includes("Flash")) out.flash = 1;
  if (dataOnly && c.produced_mana?.length) {
    const m = ["W", "U", "B", "R", "G", "C"].filter(x => c.produced_mana!.includes(x)).join("");
    out.mana = m.replace("C", "").length === 5 ? "*" : m; out.amt = 1;
    if (/enters tapped\.$/m.test(c.oracle_text ?? "") && !/unless/.test(c.oracle_text ?? "")) out.etb_tapped = 1;
  }
  const img = c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal;
  if (img) out.img = img;
  if (c.card_faces?.[1]?.image_uris?.normal) out.img2 = c.card_faces[1].image_uris.normal;
  return out;
}

export function playDeck(deck: ParsedDeck, cov: Coverage, cards: Map<string, CardData>, name: string): PlayDeck {
  const full = (n: string) => cards.get(n)?.name ?? n;
  const commanders = deck.commanders.map(full);
  // cards Scryfall didn't find have no data to play with, so they stay out
  const known = (n: string) => cards.has(n) || !!modeledCard(n);
  const list = deck.cards.filter(l => known(l.name)).flatMap(l => Array.from({ length: l.qty }, () => full(l.name)));
  const extra: Record<string, PlayCard> = {};
  for (const c of cov.cards) if (c.card && c.status !== "modeled" && !modeledCard(c.card.name)) extra[c.card.name] = stubCard(c.card, c.status === "data");
  const title = name || commanders.map(n => n.split(" // ")[0]).join(" + ") || "Imported deck";
  const id = "imp-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // names the engine knows by another spelling (a front face only) use the engine's name
  const engineName = (n: string) => modeledCard(n)?.n ?? n;
  return { id, name: title, commanders: commanders.map(engineName), cards: list.map(engineName), imported: true, extra };
}

export function saveDeck(d: PlayDeck): void {
  let all: PlayDeck[] = [];
  try { all = JSON.parse(localStorage.getItem(DECKS_KEY) || "[]"); } catch { /* start fresh */ }
  all = [...all.filter(x => x.id !== d.id), d];
  localStorage.setItem(DECKS_KEY, JSON.stringify(all));
}
