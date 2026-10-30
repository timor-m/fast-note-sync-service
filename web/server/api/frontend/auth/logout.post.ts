export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  try {
    const session = await requireWebSession(event)
    await fnsRequest(event, '/api/auth/logout', {
      method: 'POST',
      token: session.token,
    })
  } catch (error) {
    // An expired Go token is already logged out. Other failures remain visible.
    if ((error as { statusCode?: number }).statusCode !== 401) throw error
  } finally {
    await clearWebSession(event)
  }
  return { ok: true }
})
