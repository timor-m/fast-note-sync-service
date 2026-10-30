import fsDriver from 'unstorage/drivers/fs'
export default defineNitroPlugin(() => {
  useStorage().mount(
    'sessions',
    fsDriver({ base: process.env.FNS_SESSION_DIR || './.sessions' }),
  )
  const config = fnsConfig()
  if (config.sessionPassword.length < 32) {
    throw new Error(
      '请设置 FNS_SESSION_PASSWORD（至少 32 个字符），例如 openssl rand -hex 32',
    )
  }
  const url = new URL(config.fnsApiBaseUrl)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('FNS_API_BASE_URL 必须为 Go 服务 HTTP(S) origin')
  }
})
