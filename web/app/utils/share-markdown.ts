import MarkdownIt from 'markdown-it'
import { readerIconHtml, type ReaderIconName } from './reader-icons.ts'
import hljs from 'highlight.js/lib/common'
import { katex } from '@mdit/plugin-katex'
import footnote from 'markdown-it-footnote'
import { fromHtml } from 'hast-util-from-html'
import { sanitize, defaultSchema, type Schema } from 'hast-util-sanitize'
import { toHtml } from 'hast-util-to-html'
import type { Element, Root, RootContent } from 'hast'

export interface ArticleHeading { id: string; text: string; level: number }
function markdownRenderer(math: string[], diagrams: string[]) {
const md = new MarkdownIt({ html: true, linkify: true, breaks: true })
md.use(footnote)
md.use(katex, { trust: false, maxExpand: 1000, maxSize: 20, delimiters: 'all', transformer: (html, display) => {
  const index = math.push(html) - 1
  const tag = display ? 'div' : 'span'
  return `<${tag} data-math-index="${index}"></${tag}>`
} })
const escape = md.utils.escapeHtml
md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]!
  const language = token.info.trim().split(/\s/)[0] || 'text'
  if (language === 'mermaid') {
    const index = diagrams.push(token.content) - 1
    return `<div class="mermaid-diagram" data-diagram-index="${index}"><pre>${escape(token.content)}</pre></div>`
  }
  const code = hljs.getLanguage(language)
    ? hljs.highlight(token.content, { language, ignoreIllegals: true }).value
    : escape(token.content)
  const count = token.content.replace(/\n$/, '').split('\n').length
  return `<div class="code-block"><div class="code-actions"><button type="button" data-toggle-lines="true" aria-label="显示行号" aria-pressed="false"></button><button type="button" data-copy-code="true" aria-label="复制代码"></button></div><div class="code-surface"><div class="code-lines" aria-hidden="true">${Array.from({ length: count }, (_, i) => `<span>${i + 1}</span>`).join('')}</div><pre><code class="hljs">${code}</code></pre></div></div>`
}
for (const rule of ['th_open', 'td_open']) {
  md.renderer.rules[rule] = (tokens, index, options, _env, renderer) => {
    const token = tokens[index]!
    const style = token.attrGet('style') || ''
    const align = /text-align:(left|center|right)/.exec(String(style))?.[1]
    if (align) token.attrSet('align', align)
    const at = token.attrIndex('style')
    if (at >= 0) token.attrs?.splice(at, 1)
    return renderer.renderToken(tokens, index, options)
  }
}
// Parse Obsidian links at the inline-token level so fenced/inline code is untouched.
md.inline.ruler.before('link', 'wiki-link', (state, silent) => {
  if (state.src.slice(state.pos, state.pos + 2) !== '[[') return false
  const end = state.src.indexOf(']]', state.pos + 2)
  if (end < 0) return false
  const parts = state.src.slice(state.pos + 2, end).split('|')
  const target = parts[0] || ''
  if (!target || target.includes('\n')) return false
  if (!silent) {
    const label = parts[1] || target
    if (target.startsWith('#')) {
      const open = state.push('link_open', 'a', 1)
      open.attrSet('href', target)
      state.push('text', '', 0).content = label.replace(/^#/, '')
      state.push('link_close', 'a', -1)
    } else {
      // A share does not authorize arbitrary vault notes: do not invent a link.
      state.push('text', '', 0).content = label
    }
  }
  state.pos = end + 2
  return true
})
md.core.ruler.after('inline', 'task-list', (state) => {
  for (let i = 2; i < state.tokens.length; i++) {
    const token = state.tokens[i]!
    const first = token.children?.[0]
    if (token.type !== 'inline' || state.tokens[i - 2]?.type !== 'list_item_open' || first?.type !== 'text') continue
    const match = /^\[([ xX])\]\s+/.exec(first.content)
    if (!match) continue
    first.content = first.content.slice(match[0].length)
    const checkbox = new state.Token('html_inline', '', 0)
    checkbox.content = `<input type="checkbox" disabled${match[1]!.toLowerCase() === 'x' ? ' checked' : ''}> `
    token.children!.unshift(checkbox)
  }
})
  return md
}
const schema: Schema = {
  ...defaultSchema,
  tagNames: [...defaultSchema.tagNames!, 'video', 'audio', 'source', 'button'],
  attributes: {
    ...defaultSchema.attributes,
    div: [['className', 'code-block', 'code-actions', 'code-surface', 'code-lines', 'table-scroll', 'mermaid-diagram'], 'dataMathIndex', 'dataDiagramIndex', 'ariaHidden'], span: [['className', /^hljs-/], 'dataMathIndex'], code: [['className', 'hljs']],
    blockquote: ['className'], button: ['type', 'dataCopyCode', 'dataToggleLines', 'ariaLabel', 'ariaPressed', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'referrerPolicy'],
    video: ['src', 'controls', 'preload', 'poster'], audio: ['src', 'controls', 'preload'], source: ['src', 'type'],
  },
}
function textOf(node: Root | RootContent): string {
  if (node.type === 'text') return node.value
  return 'children' in node ? node.children.map(textOf).join('') : ''
}
function visit(node: Root | RootContent, fn: (node: Element, parent?: Root | Element) => void, parent?: Root | Element) {
  if (node.type === 'element') fn(node, parent)
  if ('children' in node) for (const child of node.children) visit(child, fn, node)
}
function anchorKey(value: string) {
  try { value = decodeURIComponent(value) } catch { /* malformed fragments stay literal */ }
  return value.toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '')
}
// Existing links can carry the old reader's Chinese heading fragments.
export function resolveArticleAnchor(headings: ArticleHeading[], fragment: string) {
  const value = fragment.replace(/^#/, '')
  const exact = headings.find(heading => heading.id === value)
  if (exact) return exact.id
  const counts = new Map<string, number>()
  for (const heading of headings) {
    const slug = anchorKey(heading.text)
    const count = counts.get(slug) || 0
    counts.set(slug, count + 1)
    if (anchorKey(value) === (count ? `${slug}-${count}` : slug)) return heading.id
  }
}
export function sharedFileId(value: string): string | undefined {
  try {
    const url = new URL(value, 'https://share.invalid')
    if (url.origin !== 'https://share.invalid' || url.pathname !== '/api/share/file') return
    const id = url.searchParams.get('id')
    if (id && /^[1-9]\d*$/.test(id)) return id
  } catch { /* ordinary text is not an attachment URL */ }
}

const calloutKinds: Record<string, { color: string; icon: ReaderIconName }> = {
  note: { color: 'blue', icon: 'pencil' }, info: { color: 'blue', icon: 'info' }, todo: { color: 'blue', icon: 'check' },
  abstract: { color: 'cyan', icon: 'toc' }, summary: { color: 'cyan', icon: 'toc' }, tldr: { color: 'cyan', icon: 'toc' },
  tip: { color: 'teal', icon: 'bulb' }, hint: { color: 'teal', icon: 'bulb' }, important: { color: 'teal', icon: 'bulb' },
  success: { color: 'green', icon: 'check' }, check: { color: 'green', icon: 'check' }, done: { color: 'green', icon: 'check' },
  question: { color: 'yellow', icon: 'help' }, help: { color: 'yellow', icon: 'help' }, faq: { color: 'yellow', icon: 'help' },
  warning: { color: 'orange', icon: 'warning' }, caution: { color: 'orange', icon: 'warning' }, attention: { color: 'orange', icon: 'warning' },
  failure: { color: 'red', icon: 'close' }, fail: { color: 'red', icon: 'close' }, missing: { color: 'red', icon: 'close' },
  danger: { color: 'red', icon: 'warning' }, error: { color: 'red', icon: 'warning' }, bug: { color: 'red', icon: 'warning' },
  example: { color: 'purple', icon: 'toc' }, quote: { color: 'slate', icon: 'quote' }, cite: { color: 'slate', icon: 'quote' },
}
function decorateCallout(node: Element) {
  const firstIndex = node.children.findIndex(child => child.type === 'element' && child.tagName === 'p')
  const first = node.children[firstIndex]
  if (first?.type !== 'element' || first.tagName !== 'p') return
  const text = first.children[0]
  if (text?.type !== 'text') return
  const match = /^\[!([a-z]+)\]([+-])?[ \t]*/i.exec(text.value)
  if (!match) return
  const type = match[1]!.toLowerCase()
  const kind = calloutKinds[type] || calloutKinds.note!
  const breakAt = first.children.findIndex(child => child.type === 'element' && child.tagName === 'br')
  const titleNodes = first.children.slice(0, breakAt < 0 ? undefined : breakAt)
  text.value = text.value.slice(match[0].length)
  if (!titleNodes.some(child => textOf(child).trim())) titleNodes.push({ type: 'text', value: type.charAt(0).toUpperCase() + type.slice(1) })
  const rest = breakAt < 0 ? [] : first.children.slice(breakAt + 1)
  if (rest[0]?.type === 'text') rest[0].value = rest[0].value.replace(/^\s*\n/, '')
  const body = [...(rest.length ? [{ ...first, children: rest }] : []), ...node.children.slice(firstIndex + 1)] as Element['children']
  const title: Element = { type: 'element', tagName: match[2] ? 'summary' : 'div', properties: { className: ['callout-title'] }, children: [
    ...fromHtml(readerIconHtml(kind.icon), { fragment: true }).children as Element['children'], ...titleNodes,
  ] }
  node.tagName = match[2] ? 'details' : 'div'
  node.properties = { className: ['note-callout', `callout-${kind.color}`], ...(match[2] === '+' ? { open: true } : {}) }
  node.children = [title, { type: 'element', tagName: 'div', properties: { className: ['callout-body'] }, children: body }]
}

// Sanitize before adding our own IDs/URLs. Neither note HTML nor attachment
// query parameters can inject scripts, DOM IDs, or an arbitrary fetch target.
export function renderShareMarkdown(content: string, files: Record<string, string> = {}) {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
  const math: string[] = []
  const diagrams: string[] = []
  const tree = sanitize(fromHtml(markdownRenderer(math, diagrams).render(body), { fragment: true }), schema)
  visit(tree, (node, parent) => {
    // Normalize Markdown and embedded HTML tables through one scroll wrapper.
    const wrapped = parent?.type === 'element' && parent.tagName === 'div' && Array.isArray(parent.properties.className) && parent.properties.className.includes('table-scroll')
    if (node.tagName === 'table' && parent && !wrapped) {
      parent.children.splice(parent.children.indexOf(node), 1, { type: 'element', tagName: 'div', properties: { className: ['table-scroll'] }, children: [node] })
    }
    const index = Number(node.properties.dataMathIndex)
    if (node.properties.dataMathIndex !== undefined && Number.isInteger(index) && math[index]) {
      node.children = fromHtml(math[index]!, { fragment: true }).children as Element['children']
    }
    delete node.properties.dataMathIndex
  })
  const headings: ArticleHeading[] = []
  const attachments = new Set<string>()
  const anchors = new Map<string, string>()
  visit(tree, (node) => {
    if (!/^user-content-fn(?:ref)?\d+(?::\d+)?$/.test(String(node.properties.id || ''))) delete node.properties.id
    delete node.properties.name
    if (/^h[1-6]$/.test(node.tagName)) {
      const text = textOf(node).trim()
      const id = `share-heading-${headings.length + 1}`
      headings.push({ id, text, level: Number(node.tagName[1]) })
      node.properties.id = id
      if (!anchors.has(anchorKey(text))) anchors.set(anchorKey(text), id)
    }
    if (node.tagName === 'button' && (node.properties.dataCopyCode || node.properties.dataToggleLines)) {
      node.children = fromHtml(readerIconHtml(node.properties.dataCopyCode ? 'copy' : 'lines'), { fragment: true }).children as Element['children']
    }
    if (node.tagName === 'blockquote') decorateCallout(node)

  })
  visit(tree, (node) => {
    for (const property of ['href', 'src', 'poster'] as const) {
      const value = node.properties[property]
      if (typeof value !== 'string') continue
      const id = sharedFileId(value)
      if (id) {
        attachments.add(id)
        // Never leave Go's token/password-bearing URLs in rendered HTML.
        delete node.properties[property]
        if (files[id]?.startsWith('blob:')) node.properties[property] = files[id]
        if (node.tagName === 'a') node.properties.download = textOf(node).replace(/^📎\s*/, '').trim() || '附件'
        continue
      }
      if (property === 'href' && value.startsWith('#')) {
        const target = anchors.get(anchorKey(value.slice(1)))
        if (target) node.properties.href = `#${target}`
        else if (/^#fn(?:ref)?\d+(?::\d+)?$/.test(value)) node.properties.href = '#user-content-' + value.slice(1)
      } else if (/^https?:\/\//i.test(value) && node.tagName === 'a') {
        node.properties.target = '_blank'
        node.properties.rel = ['noopener', 'noreferrer']
      } else if (!/^https?:\/\//i.test(value) && !value.startsWith('#') && !(node.tagName === 'a' && /^mailto:/i.test(value))) {
        // Relative vault paths are not public resources. Keep their labels.
        delete node.properties[property]
      }
    }
    if (node.tagName === 'img') {
      node.properties.loading = 'lazy'
      node.properties.referrerPolicy = 'no-referrer'
    }
    if (['video', 'audio'].includes(node.tagName)) {
      node.properties.controls = true
      node.properties.preload = 'metadata'
    }
    if (node.tagName === 'input') node.properties.disabled = true
    if (node.tagName === 'button') node.properties.type = 'button'
  })
  return { html: toHtml(tree), headings, attachments: [...attachments], diagrams }
}
