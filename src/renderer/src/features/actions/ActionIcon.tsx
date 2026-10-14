import {
  ArrowsInLineHorizontal,
  ArrowsOutLineHorizontal,
  Checks,
  Eye,
  Feather,
  Lightning,
  MagicWand,
  Scroll,
  Sparkle,
  type IconProps
} from '@phosphor-icons/react'

const ICONS: Record<string, React.ComponentType<IconProps>> = {
  Sparkle,
  ArrowsInLineHorizontal,
  ArrowsOutLineHorizontal,
  Checks,
  Eye,
  Feather,
  Lightning,
  MagicWand,
  Scroll
}

export const ACTION_ICON_NAMES = Object.keys(ICONS)

export function ActionIcon({ name, size = 15, weight }: { name: string; size?: number; weight?: IconProps['weight'] }): React.JSX.Element {
  const Icon = ICONS[name] ?? Sparkle
  return <Icon size={size} weight={weight} />
}
