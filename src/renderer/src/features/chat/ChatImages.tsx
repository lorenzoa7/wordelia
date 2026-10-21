import { useEffect, useState } from 'react'
import type { ChatImage } from '@shared/types'
import { Dialog } from '@/ui'
import { useAssetUrl } from '@/lib/assets'
import { useT } from '@/lib/i18n'

/** The images of a message of the writer. A click opens an image at its size. */
export function MessageImages({ images }: { images: ChatImage[] }): React.JSX.Element {
  const [open, setOpen] = useState<ChatImage | null>(null)
  return (
    <div className="msg-images">
      {images.map((img) => (
        <MessageImage key={img.file} image={img} onOpen={() => setOpen(img)} />
      ))}
      <ImageViewer file={open?.file ?? null} name={open?.name ?? ''} width={open?.width} onClose={() => setOpen(null)} />
    </div>
  )
}

function MessageImage({ image, onOpen }: { image: ChatImage; onOpen: () => void }): React.JSX.Element {
  const t = useT()
  const url = useAssetUrl(image.file)
  // The box has the shape of the image before it loads, so the conversation does not move.
  return (
    <button className="msg-image" onClick={onOpen} aria-label={t.chat.openImage(image.name)} style={{ aspectRatio: `${image.width} / ${image.height}` }}>
      {url && <img src={url} alt={image.name} />}
    </button>
  )
}

/**
 * An image at its size, in a dialog. Without a width (a portrait), the dialog opens when the image
 * is loaded and has its width.
 */
export function ImageViewer({ file, name, width, onClose }: { file: string | null; name: string; width?: number; onClose: () => void }): React.JSX.Element {
  const url = useAssetUrl(file)
  const [loaded, setLoaded] = useState<{ url: string; width: number } | null>(null)
  useEffect(() => {
    if (!url || width) return
    const img = new Image()
    img.onload = () => setLoaded({ url, width: img.naturalWidth })
    img.src = url
    return () => {
      img.onload = null
    }
  }, [url, width])
  const w = width ?? (loaded && loaded.url === url ? loaded.width : null)
  // As wide as the image, but not wider than the window.
  const dialogWidth = w ? Math.min(Math.max(w, 320) + 48, Math.round(window.innerWidth * 0.9)) : 520
  return (
    <Dialog open={file !== null && w !== null} onOpenChange={(v) => !v && onClose()} title={name} width={dialogWidth} className="image-dialog">
      {url && <img className="image-dialog-img" src={url} alt={name} />}
    </Dialog>
  )
}
