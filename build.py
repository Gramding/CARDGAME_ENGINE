"""Build the static site: src/playtester -> site/index.html.

The page template holds the <title>, font links and <style> first, then the body markup with a
/*APP*/ placeholder; app.js holds /*CARDS*/[] and /*IMGS*/{} placeholders for the card data and the
Scryfall image map. The result is one self-contained HTML file plus .nojekyll for GitHub Pages.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src" / "playtester"
OUT = ROOT / "site"

RESET = ("<style>:root{color-scheme:dark}body{margin:0}img{max-width:100%}"
         "[hidden]{display:none!important}</style>")


def build():
    app = (SRC / "app.js").read_text()
    app = app.replace("/*CARDS*/[]", json.dumps(json.loads((SRC / "cards.json").read_text()), separators=(",", ":")), 1)
    app = app.replace("/*IMGS*/{}", json.dumps(json.loads((SRC / "images.json").read_text()), separators=(",", ":")), 1)
    page = (SRC / "page.html").read_text().replace("/*APP*/", app, 1)
    cut = page.index("</style>") + len("</style>")
    head, body = page[:cut], page[cut:]
    html = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
            f"{RESET}\n{head}\n</head>\n<body>{body}</body>\n</html>\n")
    OUT.mkdir(exist_ok=True)
    (OUT / "index.html").write_text(html)
    (OUT / ".nojekyll").write_text("")
    print(f"site/index.html: {len(html):,} bytes")


if __name__ == "__main__":
    build()
