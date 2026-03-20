# 🐟 FishGlobe

Interactive 3D globe showing 35,000+ fish species worldwide.

**Live:** [fish.openglobes.com](https://fish.openglobes.com)

Part of [OpenGlobes](https://openglobes.com) — open-source 3D data globe visualizations.

## Development (local)

```bash
# Link the core engine (sibling directory)
cd ../openglobes-core && pnpm link --global
cd ../openglobes-fish && pnpm link --global @openglobes/core

# Symlink data from ETL output (do NOT copy — keeps in sync)
ln -s ../openglobes-etl/output/fish data

# Install and run
pnpm install
pnpm dev
```

## Production

Deployed automatically via GitHub Actions — the workflow clones the ETL repo at
build time and deploys to Cloudflare Pages. See `.github/workflows/deploy.yml`.

## Data sources

- [FishBase](https://www.fishbase.se) (CC-BY-NC 4.0)
- [GBIF](https://www.gbif.org) (CC0 / CC-BY 4.0)

## License

Code: MIT. Data: see attribution in each species file.
