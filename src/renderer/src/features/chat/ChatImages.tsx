import { useState } from 'react'
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
      <ImageViewer image={open} onClose={() => setOpen(null)} />
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

function ImageViewer({ image, onClose }: { image: ChatImage | null; onClose: () => void }): React.JSX.Element {
  const url = useAssetUrl(image?.file ?? null)
  // As wide as the image, but not wider than the window.
  const width = image ? Math.min(Math.max(image.width, 320) + 48, Math.round(window.innerWidth * 0.9)) : 520
  return (
    <Dialog open={image !== null} onOpenChange={(v) => !v && onClose()} title={image?.name ?? ''} width={width} className="image-dialog">
      {url && image && <img className="image-dialog-img" src={url} alt={image.name} />}
    </Dialog>
  )
}
