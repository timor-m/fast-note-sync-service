import { shareSchema } from '~~/shared/schemas/auth'
import type { Note } from '~~/shared/types/fns'
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const parsed = shareSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      message: '分享链接缺少有效资源 ID，请使用完整链接',
    })
  const { token, id, password } = parsed.data
  const accessPassword = await getSharePassword(event, token, id, password)
  const note = await fnsRequest<Note>(event, '/api/share/note', {
    shareToken: token,
    query: { id, password: accessPassword },
  })
  await rememberSharePassword(event, token, id, accessPassword)
  return note
})
