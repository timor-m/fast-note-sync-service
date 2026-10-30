import test from 'node:test'
import assert from 'node:assert/strict'
import { compactHtml } from '../server/utils/compact-html.ts'

test('compact HTML preserves reader content and Vue hydration while reducing CSS whitespace', async () => {
  const code = '\n  const x = "a  b";\n    console.log(x)\n'
  const payload = '{"text":" a  b ","value":"<tag>"}'
  const html = `<!doctype html><html><head><style>\n:root {\n  --ink: #ffffff;\n}\np { color: var(--ink); }\n</style></head><body>\n<!--v-if--><!--[--><p>你好 <strong>world</strong> again</p><!--]-->\n<pre><code>${code}</code></pre><code>a  b</code><textarea>  hello\n  there </textarea><script type="application/json">${payload}</script>\n</body></html>`
  const result = await compactHtml(html)
  assert.ok(result.length < html.length)
  assert.ok(result.includes(`<code>${code}</code>`))
  assert.ok(result.includes('<textarea>  hello\n  there </textarea>'))
  assert.ok(result.includes('<code>a  b</code>'))
  assert.ok(result.includes(payload))
  assert.ok(result.includes('你好 <strong>world</strong> again'))
  for (const marker of ['<!--v-if-->', '<!--[-->', '<!--]-->']) assert.ok(result.includes(marker))
  assert.ok(!result.includes('--ink: #ffffff;\n'))
})
