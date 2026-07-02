# K2 Wiki

A fan-made companion app for [Koltera 2](https://store.steampowered.com/app/2834700/Koltera_2/) — browse the game's creatures, items, and dungeons, and plan your progression with a set of interactive planners.

**[Live Site](https://k2-wiki.pages.dev/)** · Game data current to Koltera 2 **v5.4**

> Mirror: [ardelato.github.io/k2-wiki/app](https://ardelato.github.io/k2-wiki/app/) — for anyone whose ISP blocks Cloudflare Pages.

## Features

**Reference**

- **Beastiary** — All 120 creatures with stats, proficiencies, biomes, and radar charts
- **Items** — 192 items with recipes, sources, and where to find them
- **Expeditions** — 20 expeditions with requirements and drops
- **Machines**, **Tools**, **Fabrication**, **Sanctuary**, **Garden** — the game's crafting and production systems

**Planners**

- **Creature Planner** — Summon, Awaken, and Prestige Loop tabs for planning a creature's growth
- **Crafting & Skills Planner** — Work out craft chains and skill progression
- **Expedition Planner** — Auto-build parties from your collection, scored against each expedition (runs off the main thread in a web worker)
- **Dungeon Planner** — Rate a party for combat and gathering runs across 5 tiers, with S–F grade thresholds and reward multipliers

## Tech Stack

Vue 3 · TypeScript · Vite · Tailwind CSS · Vue Router · vue-i18n

- **i18n** — UI localized in 6 languages (English, German, Spanish, French, Turkish, Traditional Chinese). Game terms stay in English by design so the wiki cross-references the in-game text — see [`src/locales/README.md`](./src/locales/README.md).
- **Web workers** — Party planning and prestige-loop simulation run off the main thread.
- **Generated data** — Everything in `src/data/*.json` is generated from the game source via `npm run generate-tables`.
- **Semantic color palette** — Tokenized theme with automated WCAG contrast tests.

## Development

Requires **Node 24+**.

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Lint with oxlint |
| `npm run format` | Format with oxfmt |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run end-to-end tests (Playwright) |
| `npm run knip` | Find unused files, exports, and dependencies |
| `npm run generate-tables` | Regenerate game data in `src/data/` |
| `npm run i18n:check` | Check locale files for missing/stale keys |

Git hooks are managed by [lefthook](https://github.com/evilmartians/lefthook) and installed automatically on `npm install`.

## Continuous Integration

Every pull request runs knip, lint, format, unit tests, a production build, and a sharded Playwright e2e suite via GitHub Actions. Merges to `main` deploy the site to GitHub Pages.

## Disclaimer

Koltera 2 and all related game content, names, images, and intellectual property belong to **Braymen**. This is an unofficial fan project and is not affiliated with or endorsed by the developer. See [LICENSE](./LICENSE) for details.
