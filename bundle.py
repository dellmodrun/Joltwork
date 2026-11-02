"""Bundle index.html into a single self-contained file by inlining all
external assets (fonts, images, favicon) as base64 data: URIs."""
import base64
import os
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
DIST = ROOT / "dist"
DIST.mkdir(exist_ok=True)

def b64(path: pathlib.Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")

assets = {
    "./fonts/eb-garamond-regular.woff2":   ("font/woff2",     ROOT / "fonts/eb-garamond-regular.woff2"),
    "./fonts/eb-garamond-italic.woff2":    ("font/woff2",     ROOT / "fonts/eb-garamond-italic.woff2"),
    "./fonts/jetbrains-mono-regular.woff2":("font/woff2",     ROOT / "fonts/jetbrains-mono-regular.woff2"),
    "./joltwork.png":                      ("image/png",      ROOT / "joltwork.png"),
    "./favicon.svg":                       ("image/svg+xml",  ROOT / "favicon.svg"),
}

app = (ROOT / "app.js").read_text(encoding="utf-8")
wallet_icons = (ROOT / "wallet-icons.js").read_text(encoding="utf-8")
launch_client = (ROOT / "launch-client.js").read_text(encoding="utf-8")
intent_client = (ROOT / "intent-client.js").read_text(encoding="utf-8")
markets_client = (ROOT / "markets.js").read_text(encoding="utf-8")
styles = (ROOT / "styles.css").read_text(encoding="utf-8")
enhancements = (ROOT / "enhancements.css").read_text(encoding="utf-8")
sources = [ROOT / "index.html"] + [ROOT / name / "index.html" for name in ("launch", "markets", "intent", "protocol", "code", "research")]

for src in sources:
    html = src.read_text(encoding="utf-8")
    html = re.sub(r'<script src="\./app\.js">\s*</script>', lambda _: "<script>" + app + "</script>", html)
    html = re.sub(r'<script src="\./wallet-icons\.js">\s*</script>', lambda _: "<script>" + wallet_icons + "</script>", html)
    html = re.sub(r'<script src="\./launch-client\.js">\s*</script>', lambda _: "<script>" + launch_client + "</script>", html)
    html = re.sub(r'<script src="\./intent-client\.js">\s*</script>', lambda _: "<script>" + intent_client + "</script>", html)
    html = re.sub(r'<script src="\./markets\.js">\s*</script>', lambda _: "<script>" + markets_client + "</script>", html)
    html = html.replace('<link rel="stylesheet" href="./styles.css">', "<style>" + styles + "</style>")
    html = html.replace('<link rel="stylesheet" href="./enhancements.css">', "<style>" + enhancements + "</style>")
    replacements = 0
    for url, (mime, path) in assets.items():
        if not path.exists():
            print(f"WARN missing asset: {path}")
            continue
        data_uri = f"data:{mime};base64,{b64(path)}"
        before = html.count(url)
        html = html.replace(url, data_uri)
        replacements += before - html.count(url)

    relative = src.relative_to(ROOT)
    out = DIST / relative
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"{relative!s:24s} -> {out.relative_to(ROOT)} ({replacements} URLs, {out.stat().st_size / 1024:.1f} KB)")

registry_source = ROOT / "markets" / "registry.json"
registry_output = DIST / "markets" / "registry.json"
registry_output.parent.mkdir(parents=True, exist_ok=True)
registry_output.write_text(registry_source.read_text(encoding="utf-8"), encoding="utf-8")
