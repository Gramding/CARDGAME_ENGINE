/* Decklist text -> card names and counts. Handles the usual exports: Moxfield and Arena text
   ("1 Sol Ring", "1x Sol Ring", "1 Sol Ring (C21) 263 *F*"), section headers ("Commander", "Deck",
   "Sideboard"), comments, and a commander written first and set apart by a blank line. */

export interface DeckLine {
  name: string;
  qty: number;
  line: number;
}

export interface ParsedDeck {
  commanders: string[];
  cards: DeckLine[];
  warnings: string[];
}

const SECTION = /^(commanders?|deck|main(?:board)?|side(?:board)?|maybe(?:board)?|companion|considering|tokens?)\s*:?\s*(?:\(\d+\))?$/i;
const CARD = /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+[\w★-]+)?)?((?:\s+\*[A-Z]+\*)*)\s*$/;
const SKIPPED_SECTIONS = /^(side|maybe|considering|token)/i;

export function parseDecklist(text: string): ParsedDeck {
  const commanders: string[] = [];
  const entries: { entry: DeckLine; block: number }[] = [];
  const warnings: string[] = [];
  let section = "";
  let block = 0;           // blank lines split the list into blocks
  let blockHasCards = false;

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) { if (blockHasCards) { block++; blockHasCards = false; } return; }
    if (line.startsWith("//") || line.startsWith("#")) return;
    const sec = line.match(SECTION);
    if (sec) { section = sec[1].toLowerCase(); if (blockHasCards) { block++; blockHasCards = false; } return; }
    if (SKIPPED_SECTIONS.test(section)) return;
    const m = line.match(CARD);
    if (!m) { warnings.push(`Line ${i + 1} doesn't look like a card: "${line}"`); return; }
    const entry: DeckLine = { name: m[2].trim(), qty: m[1] ? parseInt(m[1], 10) : 1, line: i + 1 };
    if (section.startsWith("commander") || /\*CMDR\*/i.test(m[4] || "")) commanders.push(entry.name);
    else { entries.push({ entry, block }); blockHasCards = true; }
  });

  // No commander marked: a first block of one or two cards set apart by a blank line is the command zone.
  const first = entries.filter(e => e.block === 0);
  if (!commanders.length && first.length >= 1 && first.length <= 2 && entries.length > first.length) {
    for (const e of first) commanders.push(e.entry.name);
  }
  const cards = entries.filter(e => !commanders.includes(e.entry.name)).map(e => e.entry);
  return { commanders, cards, warnings };
}

export function deckSize(deck: ParsedDeck): number {
  return deck.commanders.length + deck.cards.reduce((s, c) => s + c.qty, 0);
}

/** Every distinct card name in the deck, commanders first. */
export function deckNames(deck: ParsedDeck): string[] {
  return [...new Set([...deck.commanders, ...deck.cards.map(c => c.name)])];
}
