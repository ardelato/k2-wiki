export type UpgradeCategory = 'Gathering Skills' | 'Workstation Skills' | 'Gold'

export type UpgradeEffectData =
  | { type: 'skill_xp'; skill: string; value: number }
  | { type: 'skill_yield'; skill: string; value: number }
  | { type: 'skill_duration'; skill: string; value: number }
  | { type: 'workstation_xp'; workstation: string; value: number }
  | { type: 'workstation_speed'; workstation: string; value: number }
  | { type: 'workstation_recovery'; workstation: string; value: number }
  | { type: 'awaken_gold'; value: number }
  | { type: 'merchant_discount'; value: number }
  | { type: 'sellable_gold_bonus'; value: number }

export interface Upgrade {
  id: string
  name: string
  description: string
  image: string
  category: UpgradeCategory
  cost: number
  effectData: UpgradeEffectData
  x: number
  y: number
  prerequisites: string[]
}

const GATHERING_SKILLS = {
  xpGain: 10,
  durationReduction: 5,
}

const WORKSTATION_SKILLS = {
  xpGain: 10,
  speedGain: 15,
}

const GOLD_SKILLS = {
  discount: 3,
  sellBonus: 3,
  awakenGold: 1,
}

const RECOVERY_TEXT = '+15% chance to fully recover crafting material inputs'

/**
 * Table builder
 *
 * Every node in the awaken tree follows one of three rigid per-block templates.
 * The templates fix the node order, the id/tier suffixes, the prerequisite
 * wiring and the effect text; only the icon and the per-node (x, y) coordinates
 * change between blocks of the same kind. The specs below carry exactly that
 * varying data, and the builders re-expand the full `Upgrade[]` from them.
 */

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi'] as const

/** One node within a block: which tiered slot it is and where it sits in the tree. */
type NodeSpec = { kind: string; tier: number; x: number; y: number; prereq: string | null }

/**
 * Gathering blocks (Chopping/Mining/Digging/Exploring/Fishing/Farming).
 * 12 nodes in this exact order, identical prerequisite wiring across every skill.
 * `kind` selects the effect template; `prereq` is the id suffix of the prerequisite.
 */
const GATHERING_NODES: NodeSpec[] = [
  { kind: 'xp', tier: 1, x: 0, y: 0, prereq: null },
  { kind: 'xp', tier: 2, x: 0, y: 0, prereq: 'xp-i' },
  { kind: 'duration', tier: 1, x: 0, y: 0, prereq: 'xp-ii' },
  { kind: 'yield', tier: 1, x: 0, y: 0, prereq: 'xp-ii' },
  { kind: 'xp', tier: 3, x: 0, y: 0, prereq: 'xp-ii' },
  { kind: 'duration', tier: 2, x: 0, y: 0, prereq: 'xp-iii' },
  { kind: 'xp', tier: 4, x: 0, y: 0, prereq: 'xp-iii' },
  { kind: 'duration', tier: 3, x: 0, y: 0, prereq: 'xp-iv' },
  { kind: 'yield', tier: 2, x: 0, y: 0, prereq: 'xp-v' },
  { kind: 'xp', tier: 5, x: 0, y: 0, prereq: 'xp-iv' },
  { kind: 'xp', tier: 6, x: 0, y: 0, prereq: 'xp-v' },
  { kind: 'duration', tier: 4, x: 0, y: 0, prereq: 'xp-v' },
]

/**
 * Workstation blocks (Furnace/Workbench/Stove). 11 nodes in this exact order,
 * identical prerequisite wiring across every workstation.
 */
const WORKSTATION_NODES: NodeSpec[] = [
  { kind: 'xp', tier: 1, x: 0, y: 0, prereq: null },
  { kind: 'xp', tier: 2, x: 0, y: 0, prereq: 'xp-i' },
  { kind: 'speed', tier: 1, x: 0, y: 0, prereq: 'xp-ii' },
  { kind: 'recovery', tier: 1, x: 0, y: 0, prereq: 'xp-iii' },
  { kind: 'xp', tier: 3, x: 0, y: 0, prereq: 'xp-ii' },
  { kind: 'speed', tier: 2, x: 0, y: 0, prereq: 'xp-iii' },
  { kind: 'xp', tier: 4, x: 0, y: 0, prereq: 'xp-iii' },
  { kind: 'speed', tier: 3, x: 0, y: 0, prereq: 'xp-iv' },
  { kind: 'recovery', tier: 2, x: 0, y: 0, prereq: 'xp-v' },
  { kind: 'xp', tier: 5, x: 0, y: 0, prereq: 'xp-iv' },
  { kind: 'speed', tier: 4, x: 0, y: 0, prereq: 'xp-v' },
]

/** A gathering/workstation block: the skill name, icon, and the (x, y) per node (in template order). */
type SkillBlock = { skill: string; image: string; coords: ReadonlyArray<readonly [number, number]> }

function tierSuffix(kind: string, tier: number): string {
  return `${kind}-${ROMAN[tier - 1]}`
}

function buildGatheringBlock(block: SkillBlock): Upgrade[] {
  const slug = block.skill.toLowerCase()
  return GATHERING_NODES.map((node, i) => {
    const [x, y] = block.coords[i]
    const suffix = tierSuffix(node.kind, node.tier)
    const id = `${slug}-${suffix}`
    const roman = ROMAN[node.tier - 1].toUpperCase()
    let name: string
    let description: string
    let effectData: UpgradeEffectData
    if (node.kind === 'xp') {
      name = `${block.skill} XP ${roman}`
      description = `${block.skill} +${GATHERING_SKILLS.xpGain}% XP`
      effectData = { type: 'skill_xp', skill: block.skill, value: GATHERING_SKILLS.xpGain }
    } else if (node.kind === 'duration') {
      name = `${block.skill} Duration ${roman}`
      description = `${block.skill} -${GATHERING_SKILLS.durationReduction}% Duration`
      effectData = {
        type: 'skill_duration',
        skill: block.skill,
        value: -GATHERING_SKILLS.durationReduction,
      }
    } else {
      name = `${block.skill} Yield ${roman}`
      description = `${block.skill} +1 Yield`
      effectData = { type: 'skill_yield', skill: block.skill, value: 1 }
    }
    return {
      id,
      name,
      description,
      image: block.image,
      category: 'Gathering Skills',
      cost: 1,
      effectData,
      x,
      y,
      prerequisites: node.prereq ? [`${slug}-${node.prereq}`] : [],
    }
  })
}

function buildWorkstationBlock(block: SkillBlock): Upgrade[] {
  const slug = block.skill.toLowerCase()
  return WORKSTATION_NODES.map((node, i) => {
    const [x, y] = block.coords[i]
    const suffix = tierSuffix(node.kind, node.tier)
    const id = `${slug}-${suffix}`
    const roman = ROMAN[node.tier - 1].toUpperCase()
    let name: string
    let description: string
    let effectData: UpgradeEffectData
    if (node.kind === 'xp') {
      name = `${block.skill} XP ${roman}`
      description = `${block.skill} +${WORKSTATION_SKILLS.xpGain}% XP`
      effectData = {
        type: 'workstation_xp',
        workstation: block.skill,
        value: WORKSTATION_SKILLS.xpGain,
      }
    } else if (node.kind === 'speed') {
      name = `${block.skill} Speed ${roman}`
      description = `${block.skill} +${WORKSTATION_SKILLS.speedGain}% Speed`
      effectData = {
        type: 'workstation_speed',
        workstation: block.skill,
        value: WORKSTATION_SKILLS.speedGain,
      }
    } else {
      name = `${block.skill} Recovery ${roman}`
      description = RECOVERY_TEXT
      effectData = { type: 'workstation_recovery', workstation: block.skill, value: 15 }
    }
    return {
      id,
      name,
      description,
      image: block.image,
      category: 'Workstation Skills',
      cost: 1,
      effectData,
      x,
      y,
      prerequisites: node.prereq ? [`${slug}-${node.prereq}`] : [],
    }
  })
}

/** A 5-node linear Gold chain (i ← ii ← iii ← iv ← v). */
type GoldChain = {
  idBase: string
  name: string
  image: string
  description: string
  effectData: (tier: number) => UpgradeEffectData
  coords: ReadonlyArray<readonly [number, number]>
}

function buildGoldChain(chain: GoldChain): Upgrade[] {
  return chain.coords.map((coord, i) => {
    const tier = i + 1
    const roman = ROMAN[i]
    const [x, y] = coord
    return {
      id: `${chain.idBase}-${roman}`,
      name: `${chain.name} ${roman.toUpperCase()}`,
      description: chain.description,
      image: chain.image,
      category: 'Gold',
      cost: 1,
      effectData: chain.effectData(tier),
      x,
      y,
      prerequisites: i === 0 ? [] : [`${chain.idBase}-${ROMAN[i - 1]}`],
    }
  })
}

/**
 * Data
 *
 * The coordinate lists below mirror the original hand-written layout exactly,
 * in template/node order (see GATHERING_NODES / WORKSTATION_NODES).
 */
const GATHERING_BLOCKS: SkillBlock[] = [
  {
    skill: 'Chopping',
    image: 'items/log.png',
    coords: [
      [8, 2],
      [7, 2],
      [7, 3],
      [7, 1],
      [6, 2],
      [6, 3],
      [5, 2],
      [5, 3],
      [4, 1],
      [4, 2],
      [3, 2],
      [4, 3],
    ],
  },
  {
    skill: 'Mining',
    image: 'items/stone.png',
    coords: [
      [9, 2],
      [10, 2],
      [10, 3],
      [10, 1],
      [11, 2],
      [11, 3],
      [12, 2],
      [12, 3],
      [13, 1],
      [13, 2],
      [14, 2],
      [13, 3],
    ],
  },
  {
    skill: 'Digging',
    image: 'icons/digging.png',
    coords: [
      [8, 5],
      [7, 5],
      [7, 6],
      [7, 4],
      [6, 5],
      [6, 6],
      [5, 5],
      [5, 6],
      [4, 4],
      [4, 5],
      [3, 5],
      [4, 6],
    ],
  },
  {
    skill: 'Exploring',
    image: 'items/grass.png',
    coords: [
      [9, 5],
      [10, 5],
      [10, 6],
      [10, 4],
      [11, 5],
      [11, 6],
      [12, 5],
      [12, 6],
      [13, 4],
      [13, 5],
      [14, 5],
      [13, 6],
    ],
  },
  {
    skill: 'Fishing',
    image: 'icons/fishing.png',
    coords: [
      [8, 8],
      [7, 8],
      [7, 9],
      [7, 7],
      [6, 8],
      [6, 9],
      [5, 8],
      [5, 9],
      [4, 7],
      [4, 8],
      [3, 8],
      [4, 9],
    ],
  },
  {
    skill: 'Farming',
    image: 'icons/farming.png',
    coords: [
      [9, 8],
      [10, 8],
      [10, 9],
      [10, 7],
      [11, 8],
      [11, 9],
      [12, 8],
      [12, 9],
      [13, 7],
      [13, 8],
      [14, 8],
      [13, 9],
    ],
  },
]

const WORKSTATION_BLOCKS: SkillBlock[] = [
  {
    skill: 'Furnace',
    image: 'icons/furnace.png',
    coords: [
      [9, 5],
      [10, 5],
      [10, 6],
      [11, 4],
      [11, 5],
      [11, 6],
      [12, 5],
      [12, 6],
      [13, 4],
      [13, 5],
      [13, 6],
    ],
  },
  {
    skill: 'Workbench',
    image: 'icons/workbench.png',
    coords: [
      [8, 2],
      [7, 2],
      [7, 3],
      [6, 1],
      [6, 2],
      [6, 3],
      [5, 2],
      [5, 3],
      [4, 1],
      [4, 2],
      [4, 3],
    ],
  },
  {
    skill: 'Stove',
    image: 'icons/stove.png',
    coords: [
      [8, 8],
      [7, 8],
      [7, 9],
      [6, 7],
      [6, 8],
      [6, 9],
      [5, 8],
      [5, 9],
      [4, 7],
      [4, 8],
      [4, 9],
    ],
  },
]

const GOLD_CHAINS: GoldChain[] = [
  {
    idBase: 'merchant-discount',
    name: 'Merchant Discount',
    image: 'items/gold.png',
    description: `Shop -${GOLD_SKILLS.discount}% Cost`,
    effectData: () => ({ type: 'merchant_discount', value: GOLD_SKILLS.discount }),
    coords: [
      [6, 3],
      [7, 3],
      [8, 2],
      [9, 2],
      [10, 1],
    ],
  },
  {
    idBase: 'sellable-gold-bonus',
    name: 'Sellable Gold Bonus',
    image: 'items/gold.png',
    description: `Merchant +${GOLD_SKILLS.sellBonus}% Gold`,
    effectData: () => ({ type: 'sellable_gold_bonus', value: GOLD_SKILLS.sellBonus }),
    coords: [
      [6, 5],
      [7, 5],
      [8, 6],
      [9, 6],
      [10, 7],
    ],
  },
  {
    idBase: 'awaken-gold',
    name: 'Awaken Gold',
    image: 'icons/upgrades.png',
    description: `Awaken creatures earn an additional +${GOLD_SKILLS.awakenGold} gold each minute`,
    effectData: () => ({ type: 'awaken_gold', value: GOLD_SKILLS.awakenGold }),
    coords: [
      [7, 4],
      [8, 4],
      [9, 4],
      [10, 4],
      [11, 4],
    ],
  },
]

const upgrades: Upgrade[] = [
  ...GATHERING_BLOCKS.flatMap(buildGatheringBlock),
  ...WORKSTATION_BLOCKS.flatMap(buildWorkstationBlock),
  ...GOLD_CHAINS.flatMap(buildGoldChain),
] satisfies Upgrade[]

/**
 * Lookup Function
 */
const upgradeById: Record<string, Upgrade> = {}
upgrades.forEach((upgrade: Upgrade) => {
  upgradeById[upgrade.id] = upgrade
})

const getById = (id: string) => {
  return upgradeById[id]
}

/**
 * Total awaken points needed to unlock `targetId`, counting the node itself plus
 * every prerequisite in its dependency closure that isn't already in `allocated`.
 * The tree gates nodes behind cross-type prerequisites (e.g. Duration I needs
 * XP II → XP I), so a node's true cost is rarely 1. An allocated node implies its
 * own prerequisites are allocated too, so the walk can stop there.
 */
const awakenUnlockCost = (targetId: string, allocated: ReadonlySet<string>): number => {
  const seen = new Set<string>()
  const stack = [targetId]
  let count = 0
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id) || allocated.has(id)) continue
    seen.add(id)
    count++
    const node = upgradeById[id]
    if (node) stack.push(...node.prerequisites)
  }
  return count
}

/**
 * Expand a set of owned node ids to its prerequisite closure: every node plus the
 * full chain of prerequisites it implies. Owning a node in this tree is only
 * possible after owning its prerequisites, so the closure is the *true* owned set.
 * Saves (and aggregate tier counts) often record only the leaf nodes of a branch
 * — e.g. a Speed node without the XP nodes gating it — so consumers that price or
 * display the tree must close over prerequisites to reflect the real state.
 */
const awakenPrerequisiteClosure = (ids: Iterable<string>): Set<string> => {
  const set = new Set<string>(ids)
  const stack = [...set]
  while (stack.length) {
    const id = stack.pop()!
    const node = upgradeById[id]
    if (!node) continue
    for (const p of node.prerequisites) {
      if (!set.has(p)) {
        set.add(p)
        stack.push(p)
      }
    }
  }
  return set
}

export { awakenUnlockCost, awakenPrerequisiteClosure }

/** id → display name for every awaken upgrade node. Shared by the skill planner and
 * gather-advisory builders (both previously rebuilt this map locally). */
export const awakenNodeNames = new Map<string, string>(upgrades.map((u) => [u.id, u.name]))

const UpgradesContent = {
  get: upgrades,
  getById,
}

export default UpgradesContent
