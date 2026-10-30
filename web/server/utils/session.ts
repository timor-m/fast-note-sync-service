import { randomUUID } from 'node:crypto'
import { useSession, createError, getHeader, type H3Event } from 'h3'
interface SessionRecord {
  token: string
  expiresAt: number
}
const maxAge = 24 * 60 * 60
export function webSession(event: H3Event) {
  const config = fnsConfig()
  return useSession<{ key?: string }>(event, {
    name: 'fns_web_session',
    sessionHeader: false,
    password: config.sessionPassword,
    maxAge,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.sessionSecure,
      path: '/',
    },
  })
}
export async function clearWebSession(event: H3Event) {
  const session = await webSession(event)
  if (session.data.key)
    await useStorage('sessions').removeItem(session.data.key)
  await session.clear()
}
export async function saveWebSession(event: H3Event, token: string) {
  const session = await webSession(event)
  if (session.data.key)
    await useStorage('sessions').removeItem(session.data.key)
  // A fresh opaque server-store key invalidates the previous sealed cookie.
  const key = randomUUID()
  await useStorage('sessions').setItem(key, {
    token,
    expiresAt: Date.now() + maxAge * 1000,
  } satisfies SessionRecord)
  await session.update({ key })
}
export async function requireWebSession(
  event: H3Event,
): Promise<SessionRecord> {
  const session = await webSession(event)
  const key = session.data.key
  const record = key
    ? await useStorage('sessions').getItem<SessionRecord>(key)
    : null
  if (!record || record.expiresAt <= Date.now()) {
    await clearWebSession(event)
    throw createError({ statusCode: 401, message: '登录已过期，请重新登录' })
  }
  return record
}
export function assertSameOrigin(event: H3Event) {
  const origin = getHeader(event, 'origin')
  const host = getHeader(event, 'host')
  let allowed = false
  try {
    const url = new URL(origin || '')
    allowed = ['http:', 'https:'].includes(url.protocol) && url.host === host
  } catch {
    /* invalid origin */
  }
  if (!allowed)
    throw createError({
      statusCode: 403,
      message: '请求来源无效，请从本站重试',
    })
}
