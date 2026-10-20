// Images for chat messages: made small here, then saved in the book (chat:saveImage), so the
// conversation keeps them and a portrait can use the same file.

import { invoke } from '@/lib/api'
import { getT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { useChat } from './chatStore'

/** The images of one message */
export const MAX_MESSAGE_IMAGES = 6

/** The long side of an image that the AI gets. The AIs make larger images smaller anyway, and pixels cost tokens. */
export const MAX_SIDE = 1568

/** An image file made small: WebP, with the long side at most MAX_SIDE pixels. */
export async function shrinkImage(blob: Blob): Promise<{ data: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No canvas')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88))
    if (!out) throw new Error('No image')
    return { data: new Uint8Array(await out.arrayBuffer()), width, height }
  } finally {
    bitmap.close()
  }
}

/** Image files of a paste or a drop. */
export function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
}

/** Add images to the next message. Files that are not images are left out. */
export async function attachImages(files: File[]): Promise<void> {
  const root = useBook.getState().root
  if (!root) return
  const t = getT()
  const images = imageFiles(files)
  const { images: added, imagesBusy } = useChat.getState()
  const room = Math.max(0, MAX_MESSAGE_IMAGES - added.length - imagesBusy)
  if (images.length > room) toast(t.chat.tooManyImages(MAX_MESSAGE_IMAGES), { kind: 'error' })
  await Promise.all(
    images.slice(0, room).map(async (file) => {
      const name = file.name || 'image'
      useChat.setState((s) => ({ imagesBusy: s.imagesBusy + 1 }))
      try {
        const small = await shrinkImage(file)
        const rel = await invoke('chat:saveImage', root, small.data, name)
        useChat.getState().addImage({ file: rel, name, width: small.width, height: small.height })
      } catch {
        toast(t.chat.imageNotRead(name), { kind: 'error' })
      } finally {
        useChat.setState((s) => ({ imagesBusy: s.imagesBusy - 1 }))
      }
    })
  )
}
