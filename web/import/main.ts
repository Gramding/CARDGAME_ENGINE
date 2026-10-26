import { deckNames, deckSize, parseDecklist, type ParsedDeck } from "../../src/importer/parse";
import { coverage, type Coverage, type Status } from "../../src/importer/coverage";
import { buildPrompt } from "../../src/importer/prompt";
import { imageOf, lookupCards } from "../../src/importer/scryfall";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
const LABEL: Record<Status, string> = { modeled: "Modeled", data: "Data only", script: "Needs scripting" };
const DRAFT_KEY = "cge-import-draft";

let current: { deck: ParsedDeck; cov: Coverage } | null = null;
let filter: Status | "all" = "all";

function setStatus(text: string, bad = false) {
  const s = $("status"); s.textContent = text; s.className = "status" + (bad ? " bad" : "");
}

function renderGrid() {
  if (!current) return;
  const items = current.cov.cards.filter(c => filter === "all" || c.status === filter);
  $("grid").innerHTML = items.map(c => {
    const img = c.card && imageOf(c.card);
    return `<li class="card">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<div class="noimg">${esc(c.name)}</div>`}
      <span class="badge ${c.status}">${LABEL[c.status]}</span><span class="nm">${esc(c.name.split(" // ")[0])}</span><span class="why">${esc(c.why)}</span></li>`;
  }).join("") || `<li class="why">No cards in this group.</li>`;
}

function render() {
  if (!current) return;
  const { deck, cov } = current;
  const size = deckSize(deck);
  $("summary").innerHTML = [
    ["", String(size), "cards"], ["", cov.colors.join("") || "C", "colors"],
    ["modeled", String(cov.counts.modeled), "modeled"], ["data", String(cov.counts.data), "data only"], ["script", String(cov.counts.script), "need scripting"],
  ].map(([cls, v, l]) => `<div class="stat ${cls}"><b>${esc(v)}</b><span>${l}</span></div>`).join("");
  const warns = [...deck.warnings];
  if (!deck.commanders.length) warns.push("No commander found. Put it first with a blank line after it, or under a \"Commander\" heading.");
  if (size !== 100) warns.push(`The list has ${size} cards; a Commander deck has 100.`);
  $("warnings").innerHTML = warns.map(w => `<p class="warn">${esc(w)}</p>`).join("");
  $("gaps").innerHTML = cov.gaps.map(g => `<div class="gap"><b>Engine work first: ${esc(g.title)}</b><p>${esc(g.detail)}${g.cards.length ? ` Affects ${g.cards.length} modeled card${g.cards.length === 1 ? "" : "s"}: ${esc(g.cards.join(", "))}.` : ""}</p></div>`).join("");
  renderGrid();
  $("result").hidden = false;
  const missing = cov.counts.data + cov.counts.script + cov.gaps.length;
  $("promptBox").hidden = !missing;
  ($("prompt") as HTMLTextAreaElement).value = missing ? buildPrompt(deck, cov, ($("deckName") as HTMLInputElement).value.trim()) : "";
}

async function check() {
  const text = ($("deckText") as HTMLTextAreaElement).value;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, name: ($("deckName") as HTMLInputElement).value })); } catch { /* per-browser only */ }
  const deck = parseDecklist(text);
  const names = deckNames(deck);
  if (!names.length) { setStatus("Paste a decklist first.", true); return; }
  const btn = $("check") as HTMLButtonElement;
  btn.disabled = true;
  try {
    const { cards, notFound } = await lookupCards(names, (done, total) => setStatus(`Looking up cards on Scryfall: ${done} of ${total}`));
    current = { deck, cov: coverage(names, cards) };
    setStatus(notFound.length ? `Done. Not found on Scryfall: ${notFound.join(", ")}` : `Done. ${names.length} cards checked.`, notFound.length > 0);
    render();
  } catch (e) {
    setStatus(`Couldn't reach Scryfall: ${(e as Error).message}`, true);
  } finally { btn.disabled = false; }
}

$("check").addEventListener("click", check);
document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(b => b.addEventListener("click", () => {
  filter = b.dataset.filter as Status | "all";
  document.querySelectorAll("[data-filter]").forEach(x => x.classList.toggle("on", x === b));
  renderGrid();
}));
$("copy").addEventListener("click", async () => {
  const ta = $("prompt") as HTMLTextAreaElement;
  try { await navigator.clipboard.writeText(ta.value); $("copied").textContent = "Copied. Paste it into your chat with Claude."; }
  catch { ta.select(); $("copied").textContent = "Select-all and copy the text below."; }
});
$("download").addEventListener("click", () => {
  const name = (($("deckName") as HTMLInputElement).value.trim() || current?.deck.commanders[0]?.split(",")[0] || "deck").replace(/[^\w-]+/g, "-").toLowerCase();
  const url = URL.createObjectURL(new Blob([($("prompt") as HTMLTextAreaElement).value], { type: "text/markdown" }));
  const a = document.createElement("a"); a.href = url; a.download = `${name}-cards-to-implement.md`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
try {
  const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  if (draft) { ($("deckText") as HTMLTextAreaElement).value = draft.text || ""; ($("deckName") as HTMLInputElement).value = draft.name || ""; }
} catch { /* nothing saved */ }
