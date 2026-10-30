import { toValue, type MaybeRefOrGetter } from 'vue'

export function usePageSeo(options: {
  title: MaybeRefOrGetter<string>
  description: MaybeRefOrGetter<string>
  keywords?: string
  robots?: string
  canonicalPath?: string
  type?: 'website' | 'article'
}) {
  useSeoMeta({
    title: () => toValue(options.title),
    description: () => toValue(options.description),
    robots: options.robots || 'noindex, nofollow',
    ogTitle: () => toValue(options.title),
    ogDescription: () => toValue(options.description),
    ogSiteName: 'Fast Note Sync',
    ogType: options.type || 'website',
    ogLocale: 'zh_CN',
    twitterCard: 'summary',
    twitterTitle: () => toValue(options.title),
    twitterDescription: () => toValue(options.description),
  })
  useHead({ meta: [{ name: 'keywords', content: options.keywords || 'Fast Note Sync,Obsidian,笔记同步,知识分享' }] })
  // Only use an operator-configured origin; never build canonical URLs from Host.
  const configured = useRuntimeConfig().public.siteUrl
  if (configured && options.canonicalPath) {
    try {
      const url = new URL(configured)
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
        useHead({ link: [{ rel: 'canonical', href: new URL(options.canonicalPath, url.origin).href }] })
      }
    } catch { /* Omit canonical until a valid public URL is configured. */ }
  }
}
