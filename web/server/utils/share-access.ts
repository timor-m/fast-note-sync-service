import { createHash } from 'node:crypto'
import { useSession, type H3Event } from 'h3'

const shareAccessMaxAge = 24 * 60 * 60
interface ShareAccessRecord {
  password: string
  expiresAt: number
}
interface ShareAccessData {
  shares?: Record<string, ShareAccessRecord>
}

async function shareAccessSession(event: H3Event) {
  const config = fnsConfig()
  return useSession<ShareAccessData>(event, {
    name: 'fns_share_access',
    sessionHeader: false,
    password: config.sessionPassword,
    maxAge: shareAccessMaxAge,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.sessionSecure,
      path: '/',
    },
  })
}

function shareKey(token: string, id: number) {
  return createHash('sha256').update(`${token}:${id}`).digest('hex')
}

export async function getSharePassword(
  event: H3Event,
  token: string,
  id: number,
  supplied: string,
) {
  if (supplied)
    return supplied
  const session = await shareAccessSession(event)
  const record = session.data.shares?.[shareKey(token, id)]
  return record && record.expiresAt > Date.now() ? record.password : ''
}

export async function rememberSharePassword(
  event: H3Event,
  token: string,
  id: number,
  password: string,
) {
  if (!password)
    return
  const session = await shareAccessSession(event)
  const now = Date.now()
  const shares = Object.fromEntries(
    Object.entries(session.data.shares || {})
      .filter(([, record]) => record.expiresAt > now)
      .slice(-9),
  )
  shares[shareKey(token, id)] = { password, expiresAt: now + shareAccessMaxAge * 1000 }
  await session.update({ shares })
}
