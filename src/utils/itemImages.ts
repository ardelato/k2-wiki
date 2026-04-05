import type { Item } from '@/types'

const itemImageModules = import.meta.glob('../assets/items/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const itemImagesById = Object.fromEntries(
  Object.entries(itemImageModules).map(([filePath, imageUrl]) => {
    const filename = filePath.split('/').pop() ?? ''
    const id = filename.replace('.webp', '').toLowerCase()
    return [id, imageUrl]
  }),
)

const imageAliases: Record<string, string> = {
  'water-bucket': 'bucket-of-water',
  planks: 'plank',
  'water-vial': 'water-vials',
  shell: 'shells',
  'dungeon-dust': 'echo-dust',
  'burried-chest': 'treasure-chest',
  'exploring-charm': 'exploration-charm',
  'herb-pouch': 'pouch',
  'meat-stew': 'cooked-meat-stew',
  'carrot-cake': 'cake',
  'braymens-letter': 'mail',
  'dirt credits': 'dirt-credits',
  'task-board-reset-potion': 'task-board-potion',
  'awaken-tree-reset-potion': 'awaken-potion',
}

export function getItemImage(item: Pick<Item, 'id'> & { image?: string }): string | undefined {
  if (item.image) {
    const imageId = item.image.replace(/\.(png|webp)$/, '').toLowerCase()
    return itemImagesById[imageId] ?? itemImagesById[item.id.toLowerCase()]
  }
  const id = item.id.toLowerCase()
  return (
    itemImagesById[id] ??
    itemImagesById[imageAliases[id] ?? ''] ??
    itemImagesById[id.replace('raw-', '')]
  )
}
