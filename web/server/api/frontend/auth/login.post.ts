import { loginSchema } from '~~/shared/schemas/auth'
import type { LoginUser, User } from '~~/shared/types/fns'
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const parsed = loginSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, message: '请输入正确的账号和密码' })
  const data = await fnsRequest<LoginUser>(event, '/api/user/login', {
    method: 'POST',
    body: parsed.data,
  })
  if (!data?.token)
    throw createError({ statusCode: 502, message: '登录响应无效，请稍后重试' })
  const user: User = {
    uid: data.uid,
    username: data.username,
    email: data.email,
    avatar: data.avatar,
  }
  await saveWebSession(event, data.token)
  return { user }
})
