# Postcard Tool

The initial `index.html` was empty. This is a structure scaffold; app behavior has not been implemented or migrated yet.

- `index.html`: page markup, stylesheet link, and module entry point.
- `style.css`: page styles and font declarations.
- `fonts/`: licensed font assets and setup instructions.
- `src/main.js`: application wiring.
- `src/config.js`: genres, colors, limits, and mappings.
- `src/splitName.js`: pure name-fitting logic.
- `src/typography.js`: font measurement, fitting, and slab stretch.
- `src/fill.js`: gradients, bands, spread, and grain.
- `src/build.js`: SVG assembly.
- `src/ui.js`: controls, presets, and export.
- `src/grids/club.js`: club grid; add a sibling module for each additional venue type.

Serve this directory over HTTP when developing, since the page uses JavaScript modules. For example, run `python3 -m http.server 8000`, then visit `http://localhost:8000`.
 test tes 