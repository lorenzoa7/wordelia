// The icons of the planning categories: in the Plan sidebar, on the map and in mentions.

import { Folder, GlobeHemisphereWest, MapPin, Notebook, Path, UserCircle, type IconProps } from '@phosphor-icons/react'
import { useBook } from '@/stores/book'

const CATEGORY_ICONS: Record<string, React.ComponentType<IconProps>> = {
  UserCircle,
  MapPin,
  GlobeHemisphereWest,
  Path,
  Notebook,
  Folder
}

/** The icon of a category (`CategoryDef.icon`); an unknown name gets the folder. */
export function categoryIcon(name: string): React.ComponentType<IconProps> {
  return CATEGORY_ICONS[name] ?? Folder
}

/** The icon of the category of an entry, or null when the entry is not in the book. */
export function useEntryIcon(entryId: string | undefined): React.ComponentType<IconProps> | null {
  const name = useBook((s) => {
    const e = entryId ? s.entries.find((x) => x.id === entryId) : undefined
    if (!e) return null
    return s.manifest?.planning.categories.find((c) => c.folder === e.category)?.icon ?? 'Folder'
  })
  return name ? categoryIcon(name) : null
}
