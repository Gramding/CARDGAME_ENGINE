/* A list pasted without a marked commander still needs one. The commander's color identity covers the
   whole deck, so the guess is the one legendary creature (or card that says it can be your commander)
   whose identity covers every other card's. Partners and ties are left to the player. */
import type { ParsedDeck } from "./parse";
import type { CardData } from "./scryfall";

function canLead(c: CardData): boolean {
  const type = c.type_line ?? c.card_faces?.[0]?.type_line ?? "";
  const text = c.oracle_text ?? c.card_faces?.map(f => f.oracle_text ?? "").join("\n") ?? "";
  return /Legendary.*Creature/.test(type.split(" // ")[0]) || /can be your commander/.test(text);
}

export function guessCommander(deck: ParsedDeck, cards: Map<string, CardData>): string | null {
  const all = deck.cards.map(l => cards.get(l.name)).filter((c): c is CardData => !!c);
  const ident = new Set(all.flatMap(c => c.color_identity));
  const fits = deck.cards.filter(l => {
    const c = cards.get(l.name);
    return c && l.qty === 1 && canLead(c) && [...ident].every(x => c.color_identity.includes(x));
  });
  return fits.length === 1 ? fits[0].name : null;
}

/** Move the guessed commander out of the 99 into the command zone. */
export function applyCommander(deck: ParsedDeck, name: string): ParsedDeck {
  return { ...deck, commanders: [name], cards: deck.cards.filter(l => l.name !== name) };
}
