/* Scryfall lookups for the importer. Uses /cards/collection (75 names per request, 100 ms apart,
   as Scryfall asks), keeps only the fields the engine needs, and caches each card in localStorage
   for a week so re-checking a deck costs no requests. */

export interface CardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: { small: string; normal: string };
}

export interface CardData extends CardFace {
  layout: string;
  cmc?: number;
  colors?: string[];
  color_identity: string[];
  produced_mana?: string[];
  keywords?: string[];
  scryfall_uri?: string;
  card_faces?: CardFace[];
  legal_commander?: string;
}

const API = "https://api.scryfall.com/cards/collection";
const CACHE_KEY = "cge-scryfall-v1:";
const WEEK = 7 * 24 * 3600 * 1000;
const FACE_FIELDS = ["name", "mana_cost", "type_line", "oracle_text", "power", "toughness", "loyalty"] as const;
const CARD_FIELDS = [...FACE_FIELDS, "layout", "cmc", "colors", "color_identity", "produced_mana", "keywords", "scryfall_uri"] as const;

type Raw = Record<string, any>;

export function trimCard(c: Raw): CardData {
  const out: Raw = {};
  for (const k of CARD_FIELDS) if (c[k] !== undefined) out[k] = c[k];
  if (c.image_uris) out.image_uris = { small: c.image_uris.small, normal: c.image_uris.normal };
  if (c.card_faces) {
    out.card_faces = c.card_faces.map((f: Raw) => {
      const o: Raw = {};
      for (const k of FACE_FIELDS) if (f[k] !== undefined) o[k] = f[k];
      if (f.image_uris) o.image_uris = { small: f.image_uris.small, normal: f.image_uris.normal };
      return o;
    });
  }
  out.legal_commander = c.legal_commander ?? c.legalities?.commander;
  return out as CardData;
}

export function imageOf(c: CardData): string | undefined {
  return c.image_uris?.small ?? c.card_faces?.[0]?.image_uris?.small;
}

function cacheGet(name: string): CardData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY + name.toLowerCase());
    if (!raw) return null;
    const { at, card } = JSON.parse(raw);
    return Date.now() - at < WEEK ? card : null;
  } catch { return null; }
}
function cachePut(card: CardData, ...names: string[]) {
  try { for (const n of names) localStorage.setItem(CACHE_KEY + n.toLowerCase(), JSON.stringify({ at: Date.now(), card })); } catch { /* storage full or blocked */ }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface Lookup {
  cards: Map<string, CardData>;   // keyed by the name as written in the decklist
  notFound: string[];
}

/** Look up every name; `onProgress` gets (done, total). */
export async function lookupCards(names: string[], onProgress?: (done: number, total: number) => void, fetchImpl: typeof fetch = fetch): Promise<Lookup> {
  const cards = new Map<string, CardData>();
  const todo: string[] = [];
  for (const n of names) { const c = cacheGet(n); if (c) cards.set(n, c); else todo.push(n); }
  const notFound: string[] = [];
  onProgress?.(cards.size, names.length);
  for (let i = 0; i < todo.length; i += 75) {
    if (i) await sleep(100);
    const chunk = todo.slice(i, i + 75);
    const res = await fetchImpl(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ identifiers: chunk.map(n => ({ name: n.split(" // ")[0] })) }),
    });
    if (!res.ok) throw new Error(`Scryfall answered ${res.status}. Try again in a minute.`);
    const body = await res.json();
    for (const raw of body.data ?? []) {
      const card = trimCard(raw);
      const front = card.name.split(" // ")[0].toLowerCase();
      const asked = chunk.find(n => n.split(" // ")[0].toLowerCase() === front) ?? card.name;
      cards.set(asked, card);
      cachePut(card, asked);
    }
    for (const nf of body.not_found ?? []) notFound.push(nf.name ?? JSON.stringify(nf));
    onProgress?.(cards.size, names.length);
  }
  return { cards, notFound };
}
