import { z } from 'zod'
import type { Note } from '~~/shared/types/fns'

export default defineEventHandler(async (event) => {
  const session = await requireWebSession(event)
  const parsed = z.object({
    vault: z.string().min(1).max(255),
    path: z.string().min(1).max(2048),
  }).safeParse(getQuery(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, message: '笔记参数无效' })
  return await fnsRequest<Note>(event, '/api/note', {
    token: session.token,
    query: parsed.data,
  })
})
