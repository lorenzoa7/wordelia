// Images of chat messages: read from the book, and put in the request of each AI.

import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { PLANNING_DIR } from '@shared/book'
import type { CompletionRequest } from '@shared/types'
import { safeJoin } from '../fsutil'
import { assertRoot } from '../security'

export interface LoadedImage {
  mime: 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif'
  /** The file, in Base64 */
  data: string
  /** The full path of the file */
  path: string
}

/** A request with the images of its messages read from the book: `images[i]` goes with `messages[i]`. */
export type AiRequest = CompletionRequest & { images?: LoadedImage[][] }

/** Not more images than this in one request: the most recent ones go. Each image costs tokens. */
export const MAX_REQUEST_IMAGES = 8

const MIME: Record<string, LoadedImage['mime']> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif'
}

export async function loadImages(req: CompletionRequest): Promise<AiRequest> {
  if (!req.root || !req.messages.some((m) => m.images?.length)) return req
  assertRoot(req.root)
  let left = MAX_REQUEST_IMAGES
  const images: LoadedImage[][] = req.messages.map(() => [])
  for (let i = req.messages.length - 1; i >= 0 && left > 0; i--) {
    const list = req.messages[i].images ?? []
    for (let k = list.length - 1; k >= 0 && left > 0; k--) {
      const mime = MIME[extname(list[k].file).toLowerCase()]
      if (!mime) continue
      try {
        const path = safeJoin(req.root, `${PLANNING_DIR}/${list[k].file}`)
        images[i].unshift({ mime, data: (await readFile(path)).toString('base64'), path })
        left--
      } catch {
        // The file is gone: the message keeps its text.
      }
    }
  }
  return { ...req, images }
}

/** The images of all the turns, in order: for the CLIs, which take the conversation as one message. */
export function allImages(req: AiRequest): LoadedImage[] {
  return (req.images ?? []).flat()
}

/** The content of a user message for the Anthropic API: the images, then the text. */
export function anthropicContent(text: string, images: LoadedImage[]): Array<
  { type: 'image'; source: { type: 'base64'; media_type: LoadedImage['mime']; data: string } } | { type: 'text'; text: string }
> {
  return [...images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mime, data: i.data } })), { type: 'text' as const, text }]
}

/** The content of a user message for the OpenAI Responses API. */
export function openaiContent(text: string, images: LoadedImage[]): Array<
  { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'auto' }
> {
  return [{ type: 'input_text', text }, ...images.map((i) => ({ type: 'input_image' as const, image_url: `data:${i.mime};base64,${i.data}`, detail: 'auto' as const }))]
}

/** One user message for `claude -p --input-format stream-json`: a line of JSON on stdin. */
export function claudeStreamInput(prompt: string, images: LoadedImage[]): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: anthropicContent(prompt, images) } }) + '\n'
}

/** The input items of a Codex turn: the text, then each image as a file. */
export function codexInput(prompt: string, images: LoadedImage[]): Array<{ type: 'text'; text: string } | { type: 'localImage'; path: string }> {
  return [{ type: 'text', text: prompt }, ...images.map((i) => ({ type: 'localImage' as const, path: i.path }))]
}
