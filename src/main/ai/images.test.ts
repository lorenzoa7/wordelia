import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChatImage, CompletionRequest } from '@shared/types'
import { allowRoot } from '../security'
import { MAX_REQUEST_IMAGES, anthropicContent, claudeStreamInput, codexInput, loadImages, openaiContent, type LoadedImage } from './images'

const img: LoadedImage = { mime: 'image/webp', data: 'QUJD', path: 'C:/book/planning/_assets/chat/a.webp' }

describe('the content of a message with images, for each AI', () => {
  it('Anthropic: the images, then the text', () => {
    expect(anthropicContent('Describe her', [img])).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'QUJD' } },
      { type: 'text', text: 'Describe her' }
    ])
  })

  it('OpenAI: the text, then each image as a data URL', () => {
    expect(openaiContent('Describe her', [img])).toEqual([
      { type: 'input_text', text: 'Describe her' },
      { type: 'input_image', image_url: 'data:image/webp;base64,QUJD', detail: 'auto' }
    ])
  })

  it('Claude Code: one line of JSON with a user message', () => {
    const line = claudeStreamInput('Describe her', [img])
    expect(line.endsWith('\n')).toBe(true)
    const msg = JSON.parse(line)
    expect(msg.type).toBe('user')
    expect(msg.message.role).toBe('user')
    expect(msg.message.content.map((c: { type: string }) => c.type)).toEqual(['image', 'text'])
  })

  it('Codex: the text, then each image as a file', () => {
    expect(codexInput('Describe her', [img])).toEqual([
      { type: 'text', text: 'Describe her' },
      { type: 'localImage', path: img.path }
    ])
  })

  it('the label of an image (a portrait of a note) comes right before it, for each AI', () => {
    const portrait: LoadedImage = { ...img, label: 'Portrait of Marta' }
    expect(anthropicContent('Hi', [portrait])).toEqual([
      { type: 'text', text: 'Portrait of Marta' },
      { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'QUJD' } },
      { type: 'text', text: 'Hi' }
    ])
    expect(openaiContent('Hi', [portrait])).toEqual([
      { type: 'input_text', text: 'Hi' },
      { type: 'input_text', text: 'Portrait of Marta' },
      { type: 'input_image', image_url: 'data:image/webp;base64,QUJD', detail: 'auto' }
    ])
    expect(codexInput('Hi', [portrait])).toEqual([
      { type: 'text', text: 'Hi' },
      { type: 'text', text: 'Portrait of Marta' },
      { type: 'localImage', path: img.path }
    ])
  })
})

describe('loadImages', () => {
  const setup = async (count: number): Promise<{ root: string; images: ChatImage[] }> => {
    const root = await mkdtemp(join(tmpdir(), 'wordelia-images-'))
    allowRoot(root)
    await mkdir(join(root, 'planning', '_assets', 'chat'), { recursive: true })
    const images: ChatImage[] = []
    for (let i = 0; i < count; i++) {
      const file = `_assets/chat/${i}.webp`
      await writeFile(join(root, 'planning', file), `image ${i}`)
      images.push({ file, name: `${i}.png`, width: 10, height: 10 })
    }
    return { root, images }
  }
  const request = (root: string, messages: CompletionRequest['messages']): CompletionRequest => ({
    route: { provider: 'anthropic', model: 'm' },
    system: '',
    purpose: 'chat',
    root,
    messages
  })

  it('reads the images of each message from the book, in Base64', async () => {
    const { root, images } = await setup(2)
    const req = await loadImages(request(root, [{ role: 'user', content: 'a', images: [images[0]] }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c', images: [images[1]] }]))
    expect(req.images?.map((list) => list.length)).toEqual([1, 0, 1])
    expect(Buffer.from(req.images![2][0].data, 'base64').toString()).toBe('image 1')
    expect(req.images![0][0].mime).toBe('image/webp')
  })

  it(`keeps only the ${MAX_REQUEST_IMAGES} most recent images`, async () => {
    const { root, images } = await setup(MAX_REQUEST_IMAGES + 2)
    const req = await loadImages(request(root, [{ role: 'user', content: 'old', images: images.slice(0, 4) }, { role: 'user', content: 'new', images: images.slice(4) }]))
    const loaded = req.images!.flat().map((i) => Buffer.from(i.data, 'base64').toString())
    expect(loaded).toHaveLength(MAX_REQUEST_IMAGES)
    expect(loaded[0]).toBe('image 2')
    expect(loaded[loaded.length - 1]).toBe(`image ${MAX_REQUEST_IMAGES + 1}`)
  })

  it('skips a missing file and a file that is not an image', async () => {
    const { root, images } = await setup(1)
    const req = await loadImages(
      request(root, [{ role: 'user', content: 'a', images: [{ ...images[0], file: '_assets/chat/gone.webp' }, { ...images[0], file: '_assets/chat/notes.txt' }, images[0]] }])
    )
    expect(req.images![0]).toHaveLength(1)
  })

  it('adds the portraits of the notes that the app made for a message, after the images of the author', async () => {
    const { root, images } = await setup(1)
    const sheet = { mime: 'image/webp' as const, data: Buffer.from('sheet').toString('base64'), label: 'Portraits of the notes' }
    const req = await loadImages(request(root, [{ role: 'user', content: 'a', images: [images[0]], portraits: [sheet] }]))
    const got = req.images![0]
    expect(got.map((i) => i.label ?? null)).toEqual([null, 'Portraits of the notes'])
    expect(got[1].data).toBe(sheet.data)
    // A file too, for the AIs that read images from files (Codex).
    expect(await readFile(got[1].path, 'utf8')).toBe('sheet')
  })

  it('never reads outside an open book', async () => {
    await expect(loadImages(request(join(tmpdir(), 'not-a-book'), [{ role: 'user', content: 'a', images: [{ file: 'x.webp', name: 'x', width: 1, height: 1 }] }]))).rejects.toThrow()
  })

  it('never reads outside the book folder', async () => {
    const { root } = await setup(0)
    const req = await loadImages(request(root, [{ role: 'user', content: 'a', images: [{ file: '../../secret.webp', name: 'x', width: 1, height: 1 }] }]))
    expect(req.images![0]).toHaveLength(0)
  })
})
