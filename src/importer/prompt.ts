/* The request to send to Claude for the cards the engine can't play yet. It carries everything needed
   to implement them without looking anything up: the deck, the engine gaps, and each missing card's
   cost, type and full oracle text (every face). */
import type { Coverage, CardCoverage } from "./coverage";
import type { CardData } from "./scryfall";
import type { ParsedDeck } from "./parse";
import { deckSize } from "./parse";

function faceBlock(c: CardData): string {
  const faces = c.card_faces?.length ? c.card_faces : [c];
  return faces.map((f, i) => {
    const head = [f.name, f.mana_cost || null, f.type_line, f.power !== undefined ? `${f.power}/${f.toughness}` : null, f.loyalty ? `loyalty ${f.loyalty}` : null].filter(Boolean).join(" · ");
    const text = (f.oracle_text || "(no rules text)").split("\n").map(l => `> ${l}`).join("\n");
    return `${faces.length > 1 ? `Face ${i + 1}: ` : ""}${head}\n${text}`;
  }).join("\n\n");
}

function cardSection(c: CardCoverage): string {
  if (!c.card) return `### ${c.name}\nNot found on Scryfall. Check the spelling in the decklist.`;
  return `### ${c.card.name}\n${faceBlock(c.card)}`;
}

export function buildPrompt(deck: ParsedDeck, cov: Coverage, deckName?: string): string {
  const commander = deck.commanders.join(" + ") || "(no commander found)";
  const missing = cov.cards.filter(c => c.status !== "modeled");
  const data = missing.filter(c => c.status === "data");
  const script = missing.filter(c => c.status === "script");
  const modeled = cov.cards.filter(c => c.status === "modeled");
  const out: string[] = [];
  out.push(`# Implement cards for the cardgame_engine playtester`);
  out.push("");
  out.push(`Repository: Gramding/cardgame_engine (engine in \`src/playtester/\`, card data in \`src/playtester/cards.json\`).`);
  out.push(`Deck: **${deckName || commander}** · Commander · ${deckSize(deck)} cards · colors ${cov.colors.join("") || "colorless"}`);
  out.push(`Commander: ${commander}`);
  out.push(`Mode: goldfish only (no opponent permanents), Commander rules.`);
  out.push("");
  out.push(`Coverage: ${cov.counts.modeled} already modeled, ${cov.counts.data} need data only, ${cov.counts.script} need scripting.`);
  if (cov.gaps.length) {
    out.push("");
    out.push(`## Engine work needed first`);
    for (const g of cov.gaps) {
      out.push(`- **${g.title}.** ${g.detail}`);
      if (g.cards.length) out.push(`  Already-modeled cards affected: ${g.cards.join(", ")}.`);
    }
  }
  if (data.length) {
    out.push("");
    out.push(`## Data only (${data.length}): lands and mana rocks with nothing but mana abilities`);
    for (const c of data) out.push(`- **${c.name}** (${c.why}) · ${c.card?.type_line ?? ""} · ${(c.card?.oracle_text ?? "").replace(/\n/g, " / ")}`);
  }
  if (script.length) {
    out.push("");
    out.push(`## Needs scripting (${script.length})`);
    for (const c of script) { out.push(""); out.push(cardSection(c)); }
  }
  out.push("");
  out.push(`## Already modeled (${modeled.length})`);
  out.push(modeled.map(c => c.name).join(", ") || "none");
  out.push("");
  out.push(`## Done when`);
  out.push(`- Every card above can be played in the playtester. Automate what the engine can resolve; where a choice or effect is impractical to automate, give the card a clear manual step instead of leaving it unplayable.`);
  out.push(`- Commander-specific rules for ${commander} work (casting from the command zone, tax, any transform or back face).`);
  out.push(`- The existing Krark deck tests still pass, and each new interaction has a browser test.`);
  return out.join("\n");
}
