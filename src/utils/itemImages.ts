import type { Item } from '@/types'

const itemImageModules = import.meta.glob('../assets/items/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const itemImagesById = Object.fromEntries(
  Object.entries(itemImageModules).map(([filePath, imageUrl]) => {
    const filename = filePath.split('/').pop() ?? ''
    const id = filename.replace('.png', '').toLowerCase()
    return [id, imageUrl]
  }),
)

const imageAliases: Record<string, string> = {
  'water-bucket': 'bucket-of-water',
  planks: 'plank',
  'water-vial': 'water-vials',
  shell: 'shells',
  'dungeon-dust': 'echo-dust',
}

export function getItemImage(item: Pick<Item, 'id'> & { image?: string }): string | undefined {
  if (item.image) {
    const imageId = item.image.replace('.png', '').toLowerCase()
    return itemImagesById[imageId] ?? itemImagesById[item.id.toLowerCase()]
  }
  const id = item.id.toLowerCase()
  return (
    itemImagesById[id] ??
    itemImagesById[imageAliases[id] ?? ''] ??
    itemImagesById[id.replace('raw-', '')]
  )
}
