import { shareSchema } from '~~/shared/schemas/auth'
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const parsed = shareSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, message: '分享附件参数无效' })
  const { token, id, password } = parsed.data
  const accessPassword = await getSharePassword(event, token, id, password)
  const file = await fnsRequest<{ data: ArrayBuffer; contentType: string }>(
    event,
    '/api/share/file',
    { shareToken: token, query: { id, password: accessPassword }, binary: true },
  )
  await rememberSharePassword(event, token, id, accessPassword)
  setHeader(event, 'Content-Type', file.contentType)
  setHeader(event, 'Content-Disposition', 'attachment')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return Buffer.from(file.data)
})
