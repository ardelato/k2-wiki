# Localization guide & game-term glossary

## The one rule

**Koltera 2 is English-only — it has no in-game localization.** Every player, in
every country, sees the game's text in English. The wiki's job is to let a player
cross-reference what's on their screen with what's on the wiki. So:

> **Translate the UI chrome. Keep the game's own vocabulary in English.**

If you translate a creature name, stat, or feature name, a non-English player can
no longer match the wiki to their game — which defeats the point. A good gut-check
for any string: _"Does the player see this exact word inside the game?"_ If yes →
English. If the wiki invented it (a button, a tooltip, a planner) → translate it.

## Files

- `en/ui.json` — source of truth. Other locales mirror its key structure.
- `de|es|fr|tr|zh-TW/ui.json` — translations of the **UI chrome only**.
- Game **data** (creature/item/expedition names, etc.) is NOT here — it lives in
  `src/data/*.json` (generated from the game source) and is always shown as-is.

## Enforcement

Game-canonical strings that _do_ live in `ui.json` are frozen to English by
`scripts/i18nFrozen.mjs` and verified on every test run
(`src/i18n/__tests__/frozen-locales.test.ts`).

- `npm run i18n:check-frozen` — report any game term that drifted from English.
- `npm run i18n:sync-frozen` — reset frozen keys back to English.

To freeze a new term, add its key path or exact value to `scripts/i18nFrozen.mjs`.

---

## Glossary — keep these in English

### Stats (`stats.*`)

Power, Grit, Agility, Smarts, Looting, Luck — and the abbreviations POW, GRT,
AGI, SMT, LOT, LCK.

### Creature traits (`traits.*`)

Night Vision, Camouflage, Lucky, Hard Shell, Regeneration, Poison Resist, Water
Breathing, Cold Resist, Heat Resist, Scouting, Tracking, Gatherer, Learner
(incl. the wiki's short forms: Night Vis, Camo, Regen, Cold Res, …).

### Gathering jobs (`jobs.*`)

Chopping, Mining, Digging, Exploring, Fishing, Farming.

### Elements / creature types

Fire, Water, Wind, Earth. _(From game data — shown as-is.)_

### Biomes

Forest, Desert, Mountain, Cave, Swamp, Plains, Lake. _(From game data.)_

### Currencies

Gold, Awaken Points, Prestige Points. Keep the word **Gold** English even inside
translated phrases (e.g. de "Passive Gold-Generierung", "{n} Gold/min").

### Feature / location / section names

Beastiary, Expeditions, Dungeons, Sanctuary, Machines, Fabrication, Tools,
Summoning, Helpers, Garden, Task Board, Milestones, Awaken Tree, Item Codex,
Inventory, Merchant, Collections, Achievements, Workbench, Furnace, Stove.

### State / action vocabulary (exact-match frozen)

Summon / Summoned / Not Summoned, Awaken / Awakened / Not Awakened / Unawaken,
Party, Party Score.

### Proper names (game data — never translated)

All creature names (Moss, Scoots, Slick, …), item names, expedition names.

---

## Special cases

- **"Level"** is a generic concept, not a proper noun, so it **is** translated —
  but the _abbreviation_ is localized consistently per locale: `Lvl` (de),
  `Nvl` (es), `Niv` (fr), `Svy` (tr), `Lv` (zh-TW). Guarded by the frozen test
  (no stray English `LVL`/`Lvl` allowed in es/fr/tr/zh-TW).
- **"XP"** is universal gaming shorthand — left English everywhere.
- **Phrases that merely contain a game term** are translatable. Only the bare
  term is frozen: `Party` is English, but "Clear Party" / "Party Summary" are
  translated. Keep the embedded frozen term English (e.g. "+{n} **Gold**",
  "+{pct}% **Sword**", "Nur **Summoned**").
- **Effect / booster type labels** (Yield, Duration, Speed, Recovery, Discount,
  Bonus) are wiki-_derived_ groupings (computed from upgrade ids), not verbatim
  in-game text → **translated**. `Gold` and `XP` within them stay English.
- **Wiki-authored nav tools** (Planner, Configs) are **translated** — they don't
  exist in the game. But **Items** stays English: it represents the in-game **Item
  Codex**, so it's frozen like the other in-game screen names (Beastiary, Sanctuary,
  Awaken Tree, Machines, …). The freeze test is always: _does the player see this
  exact word (or the screen it stands for) on a Koltera 2 screen?_ Yes → English;
  no → translate.
