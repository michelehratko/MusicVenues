# Manicotti display font

The preview loads Manicotti Regular (400, normal) through the Adobe Fonts stylesheet `https://use.typekit.net/tqf8qee.css` in `index.html`. The SVG text uses `font-family="manicotti"`.

Hosted web fonts are not embedded in exported images. Provide a local font below for portable outlined SVG and PNG exports.

Add your licensed font here using one of these exact filenames:

- `Manicotti.woff` (tried first)
- `Manicotti.otf`
- `Manicotti.ttf`

The generator automatically loads the first readable file and converts its glyphs to SVG paths for previews and exports. No CSS font declaration is needed for outlined lettering.

Serve the project over HTTP, for example with `python3 -m http.server 8000`, then open `http://localhost:8000`. Alternatively, use the display font upload control, which also works when opening `index.html` directly.

The font file is not included. When Adobe Fonts is unavailable and no local font loads, the display uses Rubik Mono One as a live-text fallback. Uploading another display font overrides the automatic Manicotti font.
