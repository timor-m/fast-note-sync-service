import test from 'node:test'
import assert from 'node:assert/strict'
import { renderShareMarkdown, sharedFileId, resolveArticleAnchor } from '../app/utils/share-markdown.ts'

test('headings, duplicate anchors, Chinese wiki links and fenced code stay consistent', () => {
  const result = renderShareMarkdown('# 标题\n\n## 阅读 目录\n\n[[#阅读 目录|跳转]]\n\n## 阅读 目录\n\n```js\nconst name = "[[原文]]";\n```')
  assert.deepEqual(result.headings.map(({ id, level }) => [id, level]), [['share-heading-1', 1], ['share-heading-2', 2], ['share-heading-3', 2]])
  assert.match(result.html, /href="#share-heading-2"/)
  assert.match(result.html, /hljs-keyword/)
  assert.match(result.html, /\[\[原文\]\]/)
  assert.match(result.html, /data-copy-code="true"/)
})
test('tables, lists, readonly tasks, callouts and frontmatter render as article content', () => {
  const result = renderShareMarkdown('---\ntitle: private property\n---\n# 正文\n\n| 列一 | 列二 |\n| --- | --- |\n| A | B |\n\n- [x] 完成\n- [ ] 待办\n\n> [!NOTE] 提示\n> 内容\n\n**重点** ~~删除~~')
  assert.doesNotMatch(result.html, /private property/)
  for (const html of ['<table>', '<strong>重点</strong>', '<s>删除</s>', 'type="checkbox"', 'disabled', 'checked', 'note-callout']) assert.ok(result.html.includes(html), html)
})
test('HTML cannot run scripts, spoof DOM IDs, submit forms or inject unsafe URLs', () => {
  const result = renderShareMarkdown('<script>alert(1)</script><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input name="password"></form>\n\n<img src="x" onerror="alert(2)"><a href="javascript:alert(3)">bad</a><h2 id="location">安全标题</h2><img src="data:text/html,x"><video src="javascript:alert(4)" autoplay></video>')
  assert.doesNotMatch(result.html, /<script|<iframe|<form|onerror|javascript:|data:text|autoplay|name="password"|id="location"/)
  assert.match(result.html, /id="share-heading-1"/)
})
test('authorized attachment IDs use BFF-fetched blobs without leaking tokens or passwords', () => {
  const content = '![]( /api/share/file?id=42&share_token=secret-token&password=secret-password )\n\n<video src="/api/share/file?id=43&amp;password=secret-password" controls></video>\n\n<a href="/api/share/file?id=44&share_token=secret-token">文档</a>'
  const pending = renderShareMarkdown(content)
  assert.deepEqual(pending.attachments, ['42', '43', '44'])
  assert.doesNotMatch(pending.html, /secret-token|secret-password|\/api\/share\/file/)
  const ready = renderShareMarkdown(content, {42:'blob:http://localhost/test-image',43:'blob:http://localhost/test-video',44:'blob:http://localhost/test-file'})
  assert.match(ready.html, /src="blob:http:\/\/localhost\/test-image"/)
  assert.match(ready.html, /<video[^>]+controls/)
  assert.match(ready.html, /download/)
  assert.equal(sharedFileId('https://evil.test/api/share/file?id=42'), undefined)
  assert.equal(sharedFileId('/api/share/file?id=-1'), undefined)
  assert.doesNotMatch(renderShareMarkdown('[x](blob:https://evil.test/payload)').html, /href="blob:/)
})
test('math, footnotes and Mermaid source keep their rendering and navigation contracts', () => {
  const result = renderShareMarkdown('行内公式 $E=mc^2$，脚注[^1]。\n\n$$\n\\frac{a}{b}+\\sqrt{x}\n$$\n\n[^1]: 补充说明。\n\n```mermaid\nflowchart LR\n A[记录] --> B[分享]\n```')
  assert.match(result.html, /class="katex"/)
  assert.match(result.html, /<math/)
  assert.match(result.html, /style="/)
  assert.match(result.html, /href="#user-content-fn1"/)
  assert.match(result.html, /id="user-content-fn1"/)
  assert.deepEqual(result.diagrams, ['flowchart LR\n A[记录] --> B[分享]\n'])
  assert.match(result.html, /data-diagram-index="0"/)
  const attack = renderShareMarkdown('<span data-math-index="0"><script>alert(1)</script></span>\n\n$\\href{javascript:alert(1)}{bad}$')
  assert.doesNotMatch(attack.html, /<script|href="javascript:/)
})
test('Obsidian callouts preserve formatted titles, types, body and folding without exposing marker syntax', () => {
  const result = renderShareMarkdown('> [!NOTE] **阅读提示**\n> 第一行。\n>\n> 第二段。\n\n> [!warning]- 可折叠提醒\n> 保留正文。\n\n> [!TIP]+ 默认展开\n> 提示内容。')
  assert.match(result.html, /class="note-callout callout-blue"/)
  assert.match(result.html, /class="callout-title"[^>]*>[\s\S]*<strong>阅读提示<\/strong>/)
  assert.match(result.html, /第一行。/)
  assert.match(result.html, /第二段。/)
  assert.match(result.html, /<details class="note-callout callout-orange">/)
  assert.match(result.html, /<details class="note-callout callout-teal" open>/)
  assert.doesNotMatch(result.html, /\[!NOTE\]|\[!warning\]|NOTE ·/)
})
test('code controls expose accessible icon actions and line counts without changing copied content', () => {
  const result = renderShareMarkdown('```js\nconst answer = 42;\n\nconsole.log(answer);\n```')
  assert.match(result.html, /aria-label="显示行号" aria-pressed="false"/)
  assert.match(result.html, /aria-label="复制代码"/)
  assert.match(result.html, /class="code-lines" aria-hidden="true"><span>1<\/span><span>2<\/span><span>3<\/span>/)
  assert.match(result.html, /data-copy-code="true"[^>]*><svg/)
  assert.doesNotMatch(result.html, /code-toolbar/)
})
test('tables retain Markdown column alignment inside their own scrolling container', () => {
  const result = renderShareMarkdown('| 左 | 中 | 右 |\n| :--- | :---: | ---: |\n| 内容 | 123 | 456 |')
  assert.match(result.html, /class="table-scroll"><table>/)
  assert.match(result.html, /<th align="center">中<\/th>/)
  assert.match(result.html, /<td align="right">456<\/td>/)
})

test('old Chinese heading fragments and duplicate headings resolve to the Nuxt outline', () => {
  const { headings } = renderShareMarkdown('# 阅读提示\n\n## 再连接起来\n\n## 再连接起来')
  assert.equal(resolveArticleAnchor(headings, '#'+encodeURIComponent('再连接起来')), 'share-heading-2')
  assert.equal(resolveArticleAnchor(headings, '#再连接起来-1'), 'share-heading-3')
  assert.equal(resolveArticleAnchor(headings, '#share-heading-1'), 'share-heading-1')
  assert.equal(resolveArticleAnchor(headings, '#不存在'), undefined)
})


test('Markdown and embedded HTML tables share exactly one scroll wrapper and preserve merged cells', () => {
  const sources = [
    '| 名称 | 状态 |\n| --- | --- |\n| Markdown | 正常 |',
    '<table><tr><th colspan="2">HTML 表格</th></tr><tr><td rowspan="2">合并单元格</td><td>内容</td></tr><tr><td>更多内容</td></tr></table>',
    '<div class="table-scroll"><table><tr><td>已有滚动容器</td></tr></table></div>',
  ]
  for (const source of sources) {
    const { html } = renderShareMarkdown(source)
    assert.equal((html.match(/class="table-scroll"/g) || []).length, 1)
    assert.match(html, /class="table-scroll"><table>/)
  }
  const { html } = renderShareMarkdown(sources[1])
  assert.match(html, /colspan="2"/)
  assert.match(html, /rowspan="2"/)
  assert.match(html, /更多内容/)
})
