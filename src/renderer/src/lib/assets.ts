// Images of the book (portraits, images of chat messages), shown through the wordelia-asset protocol.

import { useEffect, useState } from 'react'
import { useBook } from '@/stores/book'
import { invoke } from '@/lib/api'

/** The address of an image of the book. `rel` is relative to `planning/`, like the image of an entry. */
export function useAssetUrl(rel: string | null): string | null {
  const root = useBook((s) => s.root)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!rel || !root) {
      setUrl(null)
      return
    }
    let live = true
    void invoke('book:assetUrl', root, rel).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [rel, root])
  return url
}
