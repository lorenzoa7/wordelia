// The icons of the planning categories: in the Plan sidebar, on the map and in mentions.
// The writer picks the icon of a category in its menu (PlanSidebar.tsx).

import {
  Boat,
  Clock,
  Crown,
  Flag,
  Folder,
  GlobeHemisphereWest,
  Heart,
  House,
  Key,
  Lightbulb,
  MapPin,
  Notebook,
  Path,
  Scroll,
  Star,
  Sword,
  Tree,
  UserCircle,
  Users,
  type IconProps
} from '@phosphor-icons/react'
import { topFolder } from '@shared/planning/notes'
import { useBook } from '@/stores/book'

const CATEGORY_ICONS: Record<string, React.ComponentType<IconProps>> = {
  UserCircle,
  Users,
  MapPin,
  House,
  GlobeHemisphereWest,
  Tree,
  Boat,
  Path,
  Clock,
  Scroll,
  Notebook,
  Lightbulb,
  Key,
  Sword,
  Crown,
  Flag,
  Heart,
  Star,
  Folder
}

/** The names of the icons that a category can have, in the order of the menu */
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS)

/** The icon of a category (`CategoryDef.icon`); an unknown name gets the folder. */
export function categoryIcon(name: string): React.ComponentType<IconProps> {
  return CATEGORY_ICONS[name] ?? Folder
}

/** The icon of the category of an entry, or null when the entry is not in the book. */
export function useEntryIcon(entryId: string | undefined): React.ComponentType<IconProps> | null {
  const name = useBook((s) => {
    const e = entryId ? s.entries.find((x) => x.id === entryId) : undefined
    if (!e) return null
    return s.manifest?.planning.categories.find((c) => c.folder === topFolder(e.category))?.icon ?? 'Folder'
  })
  return name ? categoryIcon(name) : null
}
