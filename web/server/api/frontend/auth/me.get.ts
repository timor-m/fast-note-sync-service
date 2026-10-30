import type { LoginUser, User } from '~~/shared/types/fns'
export default defineEventHandler(async (event) => {
  const session = await requireWebSession(event)
  const data = await fnsRequest<LoginUser>(event, '/api/user/info', {
    token: session.token,
  })
  const user: User = {
    uid: data.uid,
    username: data.username,
    email: data.email,
    avatar: data.avatar,
  }
  return { user }
})
