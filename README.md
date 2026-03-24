# 🐟 FishGlobe

Interactive 3D globe showing 170,000+ aquatic species worldwide.

**Live:** [aquatic.openglobes.com](https://aquatic.openglobes.com)

Part of [OpenGlobes](https://openglobes.com) — open-source 3D data globe visualizations.

## Development (local)

```bash
# Link the core engine (sibling directory)
cd ../openglobes-core && pnpm link --global
cd ../openglobes-aquatic && pnpm link --global @openglobes/core

# Symlink data from ETL output (do NOT copy — keeps in sync)
ln -s ../openglobes-etl/output/aquatic data

# Install and run
pnpm install
pnpm dev
```

## Production

Deployed automatically via GitHub Actions — the workflow clones the ETL repo at
build time and deploys to GitHub Pages. See `.github/workflows/deploy.yml`.

## Theming

The site supports build-time + runtime theme switching. All visual styling flows
through CSS custom properties — components never hardcode colors.

### Switching themes at runtime

A theme toggle appears in the top-right corner. Selection persists to localStorage.

### Adding a new theme

1. Create `src/themes/{name}.ts` — export a `GlobeTheme` object
2. Add `[data-theme="{name}"]` overrides in `src/styles/tokens.css`
3. Register in `src/themes/index.ts` THEMES array

The theme automatically appears in the UI toggle.

### CSS class system

All components use `og-*` prefixed CSS classes defined in `src/styles/tokens.css`.
See `../openglobes-core/docs/DESIGN_SYSTEM.md` for the full specification.

## Data sources

- [FishBase](https://www.fishbase.se) (CC-BY-NC 4.0)
- [GBIF](https://www.gbif.org) (CC0 / CC-BY 4.0)

## License

Code: AGPL-3.0. Data: inherits source licenses (FishBase CC-BY-NC, GBIF CC0/CC-BY) — see attribution in each species file.
