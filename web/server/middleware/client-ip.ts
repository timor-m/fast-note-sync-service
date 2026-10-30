import { isIP } from 'node:net'
import { getRequestIP } from 'h3'

export default defineEventHandler((event) => {
  const peer = event.node.req.socket?.remoteAddress
  const loopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1'
  // No socket means Nitro's internal SSR fetch. Its forwarding header comes
  // from the parent request, sanitized below at the external boundary.
  const ip = getRequestIP(event, { xForwardedFor: !peer || loopback })
  const clientIP = ip && isIP(ip) ? ip : undefined
  event.context.fnsClientIP = clientIP
  // useRequestFetch forwards headers to SSR subrequests, not arbitrary context.
  if (clientIP) event.node.req.headers['x-forwarded-for'] = clientIP
  else delete event.node.req.headers['x-forwarded-for']
})
