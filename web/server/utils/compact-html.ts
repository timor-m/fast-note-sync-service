import { minify } from 'html-minifier-terser'

export function compactHtml(html: string) {
  return minify(html, {
    collapseWhitespace: true,
    // Keep word boundaries and whitespace-sensitive pre/code/textarea content.
    conservativeCollapse: true,
    minifyCSS: true,
    ignoreCustomFragments: [/<code\b[^>]*>[\s\S]*?<\/code>/gi, /<svg\b[^>]*>[\s\S]*?<\/svg>/gi, /<math\b[^>]*>[\s\S]*?<\/math>/gi],
    // Vue uses comments and inline payloads during hydration; leave both intact.
    removeComments: false,
    minifyJS: false,
  })
}
