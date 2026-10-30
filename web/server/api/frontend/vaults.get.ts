import type { Vault } from '~~/shared/types/fns'
export default defineEventHandler(async (event) => {
  const session = await requireWebSession(event)
  return await fnsRequest<Vault[]>(event, '/api/vault', {
    token: session.token,
  })
})
