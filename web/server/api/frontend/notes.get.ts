import { z } from 'zod'
import type { Note, Page } from '~~/shared/types/fns'
export default defineEventHandler(async (event) => {
  const session = await requireWebSession(event)
  const parsed = z
    .object({
      vault: z.string().min(1).max(255),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(10),
    })
    .safeParse(getQuery(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, message: '笔记列表参数无效' })
  return await fnsRequest<Page<Note>>(event, '/api/notes', {
    token: session.token,
    query: { ...parsed.data, sortBy: 'mtime', sortOrder: 'desc' },
  })
})
