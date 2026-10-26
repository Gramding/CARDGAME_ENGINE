/* What the playtester engine can already play. Today that is the card data the playtester ships with
   (src/playtester/cards.json) and the mana colors its pool and costs understand (all five). The importer checks
   decks against this; once card behavior moves into per-card scripts, this becomes the script index. */
import playtesterCards from "../playtester/cards.json";

export type Color = "W" | "U" | "B" | "R" | "G";

export interface ModeledCard {
  n: string;
  k: string;
  c?: string;
  mana?: string;
}

const MODELED = new Map<string, ModeledCard>();
for (const c of playtesterCards as ModeledCard[]) MODELED.set(c.n, c);

/** Colors the engine's mana pool, cost parser and mana sources handle. */
export const SUPPORTED_COLORS: readonly Color[] = ["W", "U", "B", "R", "G"];

export const COLOR_NAMES: Record<Color, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green" };

/** Basic land types a fetch land can find, and the color each one makes. */
export const BASIC_TYPE_COLOR: Record<string, Color> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

export function frontName(name: string): string {
  return name.split(" // ")[0];
}

/** Look a card up by its full Scryfall name, falling back to the front face. */
export function modeledCard(name: string): ModeledCard | undefined {
  return MODELED.get(name) ?? [...MODELED.values()].find(c => frontName(c.n) === frontName(name));
}

export function modeledCount(): number {
  return MODELED.size;
}
