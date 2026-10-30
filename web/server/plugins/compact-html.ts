import { compactHtml } from '../utils/compact-html'

export default defineNitroPlugin((nitro) => {
  if (import.meta.dev) return
  nitro.hooks.hook('render:response', async (response) => {
    if (typeof response.body !== 'string' || !String(response.headers?.['content-type']).includes('text/html')) return
    const original = response.body
    try {
      response.body = await compactHtml(original)
    } catch {
      // An unusual embedded document must still be served unchanged.
      response.body = original
    }
  })
})
