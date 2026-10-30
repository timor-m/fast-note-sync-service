import { shareSchema } from '~~/shared/schemas/auth'

export default defineEventHandler(async (event) => {
  // Passwords are deliberately never accepted in the preview URL.
  const { token, id } = getQuery(event)
  const parsed = shareSchema.safeParse({ token, id })
  if (!parsed.success)
    throw createError({ statusCode: 400, message: '分享预览参数无效' })
  return await fnsRequest<{ title: string; description: string }>(
    event, '/api/share/meta', {
      shareToken: parsed.data.token,
      query: { id: parsed.data.id },
    },
  )
})
