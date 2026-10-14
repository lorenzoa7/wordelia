// A custom protocol that serves images from open book folders: wordelia-asset://local/<token>

import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { PLANNING_DIR } from '@shared/book'
import { safeJoin } from './fsutil'

const roots = new Set<string>()

export function registerBookRoot(root: string): void {
  roots.add(root)
}

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'wordelia-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** `rel` is relative to `planning/`, like the `image` field of an entry. */
export function assetUrl(root: string, rel: string): string {
  const token = Buffer.from(JSON.stringify([root, rel]), 'utf8').toString('base64url')
  return `wordelia-asset://local/${token}`
}

export function handleAssetProtocol(): void {
  protocol.handle('wordelia-asset', async (req) => {
    try {
      const token = new URL(req.url).pathname.replace(/^\//, '')
      const [root, rel] = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as [string, string]
      if (!roots.has(root)) return new Response('Not found', { status: 404 })
      const full = safeJoin(root, `${PLANNING_DIR}/${rel}`)
      return net.fetch(pathToFileURL(full).toString())
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })
}
