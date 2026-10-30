export default defineNuxtConfig({
  compatibilityDate: '2026-10-30',
  modules: ['@nuxt/ui', '@pinia/nuxt'],
  ui: { fonts: false },
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'Fast Note Sync',
      meta: [
        { name: 'description', content: '让笔记连接知识，让知识自由分享。' },
      ],
    },
  },
  runtimeConfig: {
    public: { siteUrl: '' },
    fnsApiBaseUrl: 'http://127.0.0.1:9000',
    sessionPassword: '',
    sessionSecure: true,
  },
  nitro: {
    preset: 'node-server',
  },
  routeRules: {
    '/login': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/kb/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/app': { headers: { 'cache-control': 'private, no-store' } },
    '/app/**': { headers: { 'cache-control': 'private, no-store' } },
    '/s/**': {
      headers: {
        'cache-control': 'private, no-store',
        'referrer-policy': 'no-referrer',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
    '/api/frontend/**': { headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } },
  },
})
