# takens

a chaos-theoretic market stability protocol on solana — landing page.

## structure

```
index.html              dev version, references external assets
fonts/                  EB Garamond + JetBrains Mono (woff2, self-hosted)
takens.png              hero image
favicon.svg             tab icon
dist/index.html         single-file bundle (all assets base64-inlined)
bundle.py               script that rebuilds dist/index.html from sources
```

## local dev

```
python -m http.server 8000
```

then open http://localhost:8000

## rebuilding the standalone bundle

after editing `index.html` or any asset:

```
python bundle.py
```

this regenerates `dist/index.html` with every external resource inlined as a
base64 data uri — a single file you can drop into any static host or open
directly with `file://`.

## deploy

push to any static host. for github pages, point pages at the repo root and
the dev version works directly; for a hosted single-file deploy, serve
`dist/index.html` as the root document.
