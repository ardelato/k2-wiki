import type { Creature } from '@/types'

const creatureImageModules = import.meta.glob('../assets/creatures/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const creatureImagesById = Object.fromEntries(
  Object.entries(creatureImageModules).map(([filePath, imageUrl]) => {
    const filename = filePath.split('/').pop() ?? ''
    const id = filename.replace('.png', '').toLowerCase()
    return [id, imageUrl]
  }),
)

function toId(value: string): string {
  return value.trim().toLowerCase()
}

export function getCreatureImage(creature: Pick<Creature, 'id' | 'image'>): string | undefined {
  const byId = creatureImagesById[toId(creature.id)]
  if (byId) return byId

  const filename = creature.image
    .split('/')
    .pop()
    ?.replace(/\.[^/.]+$/, '')
  if (!filename) return undefined
  return creatureImagesById[toId(filename)]
}
