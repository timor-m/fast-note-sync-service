export default defineNuxtConfig({
  compatibilityDate: '2026-10-30',
  modules: ['@nuxt/ui', '@pinia/nuxt'],
  ui: { fonts: false },
  css: ['~/assets/css/main.css', '~/assets/css/share.css', 'katex/dist/katex.min.css'],
  devtools: { enabled: false },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'Fast Note Sync',
      link: [
        { rel: 'icon', type: 'image/x-icon', sizes: '16x16 32x32 48x48 64x64', href: '/_nuxt/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', sizes: 'any', href: '/_nuxt/favicon.svg' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/_nuxt/apple-touch-icon.png' },
      ],
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
    '/share/**': {
      headers: {
        'cache-control': 'private, no-store',
        'referrer-policy': 'no-referrer',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
    '/api/frontend/**': { headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } },
  },
})
