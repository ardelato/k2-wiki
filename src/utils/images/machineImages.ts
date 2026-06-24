import type { Machine } from '@/types'
import { getItemImage } from '@/utils/images/itemImages'

const iconModules = import.meta.glob('../../assets/icons/*.webp', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const iconsByFilename = Object.fromEntries(
  Object.entries(iconModules).map(([filePath, imageUrl]) => {
    const filename = filePath.split('/').pop() ?? ''
    return [filename, imageUrl]
  }),
)

export function getMachineImage(
  machine: Pick<Machine, 'id' | 'image' | 'machineType' | 'outputItemId'>,
): string | undefined {
  if (machine.image) {
    return (
      iconsByFilename[machine.image] ?? getItemImage({ id: machine.image.replace('.webp', '') })
    )
  }
  if (machine.machineType === 'generator' && machine.outputItemId) {
    return getItemImage({ id: machine.outputItemId }) ?? undefined
  }
  return undefined
}
