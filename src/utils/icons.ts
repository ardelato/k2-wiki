import axeIcon from '@/assets/icons/axe.webp'
import choppingIcon from '@/assets/icons/chopping.webp'
import diggingIcon from '@/assets/icons/digging.webp'
import expeditionToolIcon from '@/assets/icons/expedition.webp'
import expeditionsIcon from '@/assets/icons/expeditions.webp'
import exploringIcon from '@/assets/icons/explorering.webp'
import farminIcon from '@/assets/icons/farmin.webp'
import farmingIcon from '@/assets/icons/farming.webp'
import fishingPoleIcon from '@/assets/icons/fishing-pole.webp'
import fishingIcon from '@/assets/icons/fishing.webp'
import furnaceIcon from '@/assets/icons/furnace.webp'
import helpersIcon from '@/assets/icons/helpers.webp'
import itemGridIcon from '@/assets/icons/item-grid.webp'
import macheteIcon from '@/assets/icons/machete.webp'
import machinesIcon from '@/assets/icons/machines.webp'
import miningIcon from '@/assets/icons/mining.webp'
import pickaxeIcon from '@/assets/icons/pickaxe.webp'
import refineryIcon from '@/assets/icons/refinery.webp'
import sanctuaryIcon from '@/assets/icons/sanctuary.webp'
import shovelIcon from '@/assets/icons/shovel.webp'
import staffIcon from '@/assets/icons/staff.webp'
import stoveIcon from '@/assets/icons/stove.webp'
import upgradesIcon from '@/assets/icons/upgrades.webp'
import workbenchIcon from '@/assets/icons/workbench.webp'
import breadItemIcon from '@/assets/items/bread.webp'
import coalItemIcon from '@/assets/items/coal.webp'
import hammerItemIcon from '@/assets/items/hammer.webp'
import knifeItemIcon from '@/assets/items/knife.webp'
import sawItemIcon from '@/assets/items/saw.webp'
import stoneItemIcon from '@/assets/items/stone.webp'
import twigItemIcon from '@/assets/items/twig.webp'

export { expeditionsIcon, helpersIcon, itemGridIcon, machinesIcon, sanctuaryIcon, upgradesIcon }

export const jobIcons: Record<string, string> = {
  chopping: choppingIcon,
  mining: miningIcon,
  digging: diggingIcon,
  exploring: exploringIcon,
  fishing: fishingIcon,
  farming: farmingIcon,
}

import commonSkull from '@/assets/icons/common-skull.webp'
import legendarySkull from '@/assets/icons/legendary-skull.webp'
import rareSkull from '@/assets/icons/rare-skull.webp'
import superRareSkull from '@/assets/icons/super-rare-skull.webp'
import uncommonSkull from '@/assets/icons/uncommon-skull.webp'

export const expeditionTierIcons: Record<number, string> = {
  1: commonSkull,
  2: uncommonSkull,
  3: rareSkull,
  4: superRareSkull,
  5: legendarySkull,
}

export const sourceIcons: Record<string, string> = {
  ...jobIcons,
  // Title-cased variants (used in ItemDetail jobId)
  Chopping: choppingIcon,
  Mining: miningIcon,
  Digging: diggingIcon,
  Exploring: exploringIcon,
  Fishing: fishingIcon,
  Farming: farmingIcon,
  // Workstation source keys
  crafting_furnace: furnaceIcon,
  crafting_stove: stoveIcon,
  crafting_workbench: workbenchIcon,
  // Display label variants (for table badges)
  Furnace: furnaceIcon,
  Stove: stoveIcon,
  Workbench: workbenchIcon,
  Expeditions: expeditionsIcon,
  Helpers: helpersIcon,
  // Machine names (used in planner method titles)
  Smelter: furnaceIcon,
  Sawmill: workbenchIcon,
  Cooker: stoveIcon,
  Greenhouse: farmingIcon,
  Refinery: refineryIcon,
  Bakery: breadItemIcon,
  'Stone Quarry': stoneItemIcon,
  'Stick Finder': twigItemIcon,
  'Coal Miner': coalItemIcon,
  Fabrication: itemGridIcon,
}

export const toolIcons: Record<string, string> = {
  axe: axeIcon,
  pickaxe: pickaxeIcon,
  machete: macheteIcon,
  shovel: shovelIcon,
  'fishing-pole': fishingPoleIcon,
  pitchfork: farminIcon,
  sword: expeditionToolIcon,
  staff: staffIcon,
  hammer: hammerItemIcon,
  saw: sawItemIcon,
  knife: knifeItemIcon,
}
