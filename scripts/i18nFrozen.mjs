// Single source of truth for "frozen" UI strings.
//
// Koltera 2 ships English-only — it has no in-game localization (no i18n
// framework, no locale files, no `language` setting; every creature, stat,
// trait, job and feature name is a hardcoded English string in the game
// source). A player therefore ALWAYS sees these terms in English on their
// screen. If the wiki translates them, a non-English player can no longer
// cross-reference the wiki with their game — which is the wiki's whole job.
//
// So game-canonical vocabulary stays in English in every locale; only genuine
// UI chrome (buttons, labels, sentences the wiki itself wrote) gets translated.
//
// This list is enforced by scripts/sync-frozen-locales.mjs (apply) and
// src/i18n/__tests__/frozen-locales.test.ts (guard). To freeze another term,
// add its path (or value) here — nothing else to change.

const FROZEN = {
  // Exact dotted key paths (a trailing ".*" freezes the whole section).
  paths: [
    // Creature stats — players read these on the creature screen in-game.
    'stats.*', // power/grit/agility/smarts/looting/luck + their abbreviations

    // Creature traits — in-game passive abilities.
    'traits.*',

    // Gathering jobs — in-game creature professions.
    'jobs.*',

    // Game feature / location names shown in the game's own navigation.
    'nav.beastiary',
    'nav.dungeons',
    'nav.expeditions',
    'nav.sanctuary',
    'nav.machines',
    'nav.fabrication',
    'nav.tools',
    'nav.garden',
    'nav.awakenTree',
    'nav.items', // wiki "Items" tab represents the in-game Item Codex — keep English


    // Page titles that are just the feature's proper noun.
    'expeditions.title',
    'sanctuaryView.title',
    'sanctuaryView.sanctuary',
    'machines.title',
    'toolsView.title',
    'fabricationView.title',

    // Redesigned Configs: in-game assignment-zone & section labels (frozen feature names).
    'configs.zones.sanctuary',
    'configs.zones.helpers',
    'configs.zones.machines',
    'configs.zones.dungeons',
    'configs.zones.expeditions',
    'configs.inventoryGrid.title',

    // "Awaken Tree" feature name (match frozen nav.awakenTree) + "★ Awakened" status badge.
    'configs.sections.awakenTree',
    'configs.creatures.awakened',

    // Awaken view: Gold currency tab label.
    'awakenView.tabs.gold',

    // Machine-type category labels — in-game terms (audit M9).
    'machines.generators',
    'machines.processors',
    'machines.generator',
    'machines.processor',

    // "Awaken Gold" composite — both Awaken and Gold are frozen game terms (audit L3).
    'configs.awaken.awakenGold',
    'plannerComponents.goldRate.awakenGold',

    // Tool-name bonus badge — "Sword" is a game tool name, keep English.
    'levelPlanner.badges.swordBonus',

    // First-run auto-switch notice: the "View in English" escape hatch must stay
    // English so a user auto-switched into a language they don't read can exit.
    'localeNotice.viewInEnglish',
  ],

  // Any key whose English value is EXACTLY one of these (case-sensitive) is
  // frozen wherever it appears. Used for game state/action vocabulary that
  // repeats across many keys. These words are game-specific, not generic UI
  // text, so an exact-value match is safe. The exact-match scope is deliberate:
  // it freezes the bare in-game term (e.g. "Party", "Party Score") while
  // leaving wiki-authored phrases that merely contain it ("Clear Party",
  // "Party Summary") free to translate.
  //
  // NOTE: the level abbreviation ("LVL"/"Lvl") is deliberately NOT frozen.
  // "Level" is a generic gameplay concept, not a proper noun, so each locale
  // uses its own abbreviation (es "Nvl", fr "Niv", tr "Svy", zh-TW "Lv",
  // de "Lvl"). Consistency of that abbreviation is guarded separately in
  // src/i18n/__tests__/frozen-locales.test.ts.
  terms: [
    'Summoned',
    'Not Summoned',
    'Awakened',
    'Not Awakened',
    'Awaken',
    'Unawaken',
    'Party', // in-game label (DungeonDetails); "Clear Party" etc. stay translatable
    'Party Score', // in-game stat label (DungeonDetails / Statistics)
    'Expedition', // feature name; phrases like "Best Expeditions" stay translatable
    'Expeditions', // feature name (filter/section labels) — must match in-game
  ],
}

/** Recursively collect every leaf "a.b.c" path from a messages object. */
function walk(obj, prefix, out) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') walk(value, path, out)
    else out.set(path, value)
  }
}

/**
 * Resolve the frozen config against the English source-of-truth messages,
 * returning the concrete set of dotted paths that must match English.
 */
export function collectFrozenPaths(enMessages) {
  const leaves = new Map()
  walk(enMessages, '', leaves)

  const exactPaths = new Set(FROZEN.paths.filter((p) => !p.endsWith('.*')))
  const sectionPrefixes = FROZEN.paths.filter((p) => p.endsWith('.*')).map((p) => p.slice(0, -2)) // strip ".*"
  const terms = new Set(FROZEN.terms)

  const frozen = new Set()
  for (const [path, value] of leaves) {
    if (exactPaths.has(path)) frozen.add(path)
    else if (sectionPrefixes.some((prefix) => path.startsWith(`${prefix}.`))) frozen.add(path)
    else if (typeof value === 'string' && terms.has(value)) frozen.add(path)
  }
  return frozen
}

/** Read the leaf value at "a.b.c" from a messages object (undefined if absent). */
export function getPath(obj, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj)
}

/** Set the leaf value at "a.b.c", creating intermediate objects as needed. */
export function setPath(obj, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  let node = obj
  for (const key of keys) {
    if (node[key] == null || typeof node[key] !== 'object') node[key] = {}
    node = node[key]
  }
  node[last] = value
}
