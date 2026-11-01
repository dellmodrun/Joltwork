"""Bundle index.html into a single self-contained file by inlining all
external assets (fonts, images, favicon) as base64 data: URIs."""
import base64
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "index.html"
DIST = ROOT / "dist"
DIST.mkdir(exist_ok=True)
OUT = DIST / "index.html"

html = SRC.read_text(encoding="utf-8")

def b64(path: pathlib.Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")

assets = {
    "./fonts/eb-garamond-regular.woff2":   ("font/woff2",     ROOT / "fonts/eb-garamond-regular.woff2"),
    "./fonts/eb-garamond-italic.woff2":    ("font/woff2",     ROOT / "fonts/eb-garamond-italic.woff2"),
    "./fonts/jetbrains-mono-regular.woff2":("font/woff2",     ROOT / "fonts/jetbrains-mono-regular.woff2"),
    "./joltwork.png":                      ("image/png",      ROOT / "joltwork.png"),
    "./favicon.svg":                       ("image/svg+xml",  ROOT / "favicon.svg"),
}

replacements = 0
for url, (mime, path) in assets.items():
    if not path.exists():
        print(f"WARN missing asset: {path}")
        continue
    data_uri = f"data:{mime};base64,{b64(path)}"
    before = html.count(url)
    html = html.replace(url, data_uri)
    after = html.count(url)
    print(f"  {url:40s} -> inlined ({before - after} replacements, {path.stat().st_size:>7} bytes raw)")
    replacements += before - after

OUT.write_text(html, encoding="utf-8")
print()
print(f"total: {replacements} URLs inlined")
print(f"bundled file: {OUT}")
print(f"final size:   {OUT.stat().st_size:,} bytes ({OUT.stat().st_size / 1024:.1f} KB)")
