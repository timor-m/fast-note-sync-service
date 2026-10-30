import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'

// Runs the built production SSR server against the verified Go wire contract.
// Real Go integration is additionally exercised by the Docker smoke run.
test('production frontend and Go API contract', async (t) => {
  const requests = []
  let expired = false
  const go = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push({ path: req.url, headers: req.headers, body })
    const path = new URL(req.url, 'http://go.test')
    res.setHeader('content-type', 'application/json')
    const reply = (data) =>
      res.end(JSON.stringify({ code: 1, status: true, data }))
    const fail = (code) => res.end(JSON.stringify({ code, status: false }))
    if (path.pathname === '/api/user/login') {
      const data = JSON.parse(body)
      if (data.password === 'incorrect') return fail(402)
      assert.equal(req.headers['x-client'], 'webgui')
      assert.deepEqual(Object.keys(data).sort(), ['credentials', 'password'])
      return reply({
        uid: 1,
        username: '测试用户',
        email: 'test@example.com',
        token: 'SECRET_GO_TOKEN',
        tokenId: 99,
      })
    }
    if (path.pathname.startsWith('/api/share/')) {
      assert.ok(
        ['share-token', 'json-token', 'public-token'].includes(req.headers['share-token']),
      )
      assert.equal(path.searchParams.get('id'), '42')
      if (path.pathname === '/api/share/meta') {
        if (req.headers['share-token'] === 'public-token')
          return reply({ title: '公开笔记', description: '公开笔记的安全摘要' })
        return fail(483)
      }
      if (path.searchParams.get('password') !== 'test-password')
        return fail(484)
      if (
        path.pathname.endsWith('/file') &&
        req.headers['share-token'] === 'json-token'
      ) {
        res.setHeader('last-modified', 'Thu, 01 Jan 1970 00:00:01 GMT')
        return res.end(JSON.stringify({ status: false, code: 480 }))
      }
      if (path.pathname.endsWith('/file')) {
        res.setHeader('content-type', 'image/png')
        return res.end(Buffer.from([137, 80, 78, 71]))
      }
      return reply({
        id: 42,
        path: '分享.md',
        content: '<script>alert(1)</script>',
        mtime: 1,
      })
    }
    assert.equal(req.headers.authorization, 'Bearer SECRET_GO_TOKEN')
    assert.equal(req.headers['user-agent'], 'FastNoteSyncWeb/1.0')
    if (expired) return fail(310)
    if (path.pathname === '/api/user/info')
      return reply({
        uid: 1,
        username: '测试用户',
        email: 'test@example.com',
        token: 'MUST_NOT_LEAK',
      })
    if (path.pathname === '/api/vault')
      return reply([{ id: 1, vault: 'MyVault', noteCount: 1, fileCount: 0 }])
    if (path.pathname === '/api/notes')
      return reply({
        list: [{ id: 2, path: '最近笔记.md', mtime: 1700000000000 }],
        pager: { page: 1, pageSize: 8, totalRows: 1 },
      })
    if (path.pathname === '/api/auth/logout') return reply(null)
    res.statusCode = 404
    fail(304)
  })
  go.listen(0, '127.0.0.1')
  await once(go, 'listening')
  const reserve = createServer()
  reserve.listen(0, '127.0.0.1')
  await once(reserve, 'listening')
  const port = reserve.address().port
  await new Promise((resolve) => reserve.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const dir = await mkdtemp(join(tmpdir(), 'fns-web-test-'))
  let log = ''
  const server = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(port),
      FNS_API_BASE_URL: `http://127.0.0.1:${go.address().port}`,
      FNS_SESSION_PASSWORD: 'test-password-32-characters-minimum-000',
      FNS_SESSION_SECURE: 'false',
      FNS_SESSION_DIR: dir,
      NUXT_PUBLIC_SITE_URL: 'https://notes.example.com',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (data) => (log += data))
  server.stderr.on('data', (data) => (log += data))
  t.after(async () => {
    server.kill('SIGTERM')
    if (server.exitCode === null) await once(server, 'exit')
    await new Promise((resolve) => go.close(resolve))
    await rm(dir, { recursive: true, force: true })
  })
  let ready = false
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${base}/api/frontend/health`)).ok) {
        ready = true
        break
      }
    } catch {}
    if (server.exitCode !== null) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(ready, log)
  let cookie = ''
  const post = (path, body, origin = base, session = cookie) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { origin, cookie: session, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  await t.test(
    'SSR pages, Nuxt assets, demo marker and unknown knowledge base',
    async () => {
      const home = await fetch(base)
      const html = await home.text()
      assert.equal(home.status, 200)
      assert.match(html, /每一次记录/)
      const asset = html.match(/(?:src|href)="(\/_nuxt\/[^\"]+\.(?:js|css))"/)
      assert.ok(asset)
      assert.equal((await fetch(base + asset[1])).status, 200)
      assert.match(await (await fetch(base + '/login')).text(), /用户名或邮箱/)
      assert.match(await (await fetch(base + '/kb/demo')).text(), /演示数据/)
      assert.equal((await fetch(base + '/kb/missing')).status, 404)
      assert.match(
        await (await fetch(base + '/s/share-token?id=42')).text(),
        /分享密码/,
      )
    },
  )
  await t.test('anonymous session and protected SSR redirect', async () => {
    assert.equal((await fetch(base + '/api/frontend/auth/me')).status, 401)
    const res = await fetch(base + '/app', { redirect: 'manual' })
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/login')
  })
  await t.test('SSR TDK, social previews and private-share metadata isolation', async () => {
    const home = await (await fetch(base)).text()
    assert.match(home, /name="description"/)
    assert.match(home, /name="keywords"/)
    assert.match(home, /property="og:title"/)
    assert.match(home, /rel="canonical" href="https:\/\/notes.example.com\/"/)
    const before = requests.filter((r) => r.path.startsWith('/api/share/note')).length
    const publicPage = await fetch(base + '/s/public-token?id=42')
    const publicHtml = await publicPage.text()
    assert.match(publicHtml, /<title>公开笔记 · Fast Note Sync<\/title>/)
    assert.match(publicHtml, /公开笔记的安全摘要/)
    assert.equal(publicPage.headers.get('x-robots-tag'), 'noindex, nofollow')
    assert.match(publicHtml, /noindex, nofollow/)
    assert.match(publicPage.headers.get('cache-control'), /no-store/)
    const privateHtml = await (await fetch(base + '/s/share-token?id=42')).text()
    assert.match(privateHtml, /<title>笔记分享 · Fast Note Sync<\/title>/)
    assert.doesNotMatch(privateHtml, /alert\(1\)|test-password|分享\.md/)
    assert.equal(requests.filter((r) => r.path.startsWith('/api/share/note')).length, before)
    const previewWithPassword = await fetch(base + '/api/frontend/shares/meta?token=share-token&id=42&password=test-password')
    assert.equal(previewWithPassword.status, 400)
    assert.ok(requests.filter((r) => r.path.startsWith('/api/share/meta')).every((r) => !r.path.includes('password=')))
    for (const path of ['/login', '/kb/demo']) {
      const response = await fetch(base + path)
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
    }
  })
  await t.test('CSRF and input validation', async () => {
    assert.equal(
      (await post('/api/frontend/auth/login', {}, 'https://evil.example'))
        .status,
      403,
    )
    assert.equal((await post('/api/frontend/auth/login', {})).status, 400)
  })
  await t.test('Chinese login error', async () => {
    const res = await post('/api/frontend/auth/login', {
      credentials: 'test',
      password: 'incorrect',
    })
    assert.equal(res.status, 400)
    assert.match(await res.text(), /登录失败/)
  })
  await t.test(
    'login keeps Go token server side and sets HttpOnly session',
    async () => {
      const res = await post('/api/frontend/auth/login', {
        credentials: 'test',
        password: 'correct',
      })
      const body = await res.text()
      assert.equal(res.status, 200, body)
      assert.doesNotMatch(body, /SECRET_GO_TOKEN|tokenId/)
      const header = res.headers.get('set-cookie')
      assert.match(header, /HttpOnly/i)
      assert.match(header, /SameSite=Lax/i)
      assert.doesNotMatch(header, /SECRET_GO_TOKEN/)
      cookie = header.split(';')[0]
    },
  )
  await t.test(
    'authenticated me, vaults, pagination and SSR do not leak tokens',
    async () => {
      const me = await fetch(base + '/api/frontend/auth/me', {
        headers: { cookie },
      })
      const body = await me.text()
      assert.equal(me.status, 200, body)
      assert.doesNotMatch(body, /MUST_NOT_LEAK|token/)
      const vaults = await fetch(base + '/api/frontend/vaults', {
        headers: { cookie },
      })
      assert.equal(vaults.status, 200)
      const notes = await fetch(
        base + '/api/frontend/notes?vault=MyVault&page=2&pageSize=5',
        { headers: { cookie } },
      )
      assert.equal(notes.status, 200)
      assert.ok(
        requests.some(
          (r) => r.path.includes('page=2') && r.path.includes('sortBy=mtime'),
        ),
      )
      const page = await fetch(base + '/app', { headers: { cookie } })
      const html = await page.text()
      assert.equal(page.status, 200)
      assert.match(html, /测试用户/)
      assert.match(html, /最近笔记.md/)
      assert.doesNotMatch(html, /SECRET_GO_TOKEN|MUST_NOT_LEAK/)
    },
  )
  await t.test('share passwords and binary file contract', async () => {
    const body = { token: 'share-token', id: 42, password: 'wrong' }
    const bad = await post('/api/frontend/shares/note', body)
    assert.equal(bad.status, 400)
    assert.match(await bad.text(), /分享密码不正确/)
    body.password = 'test-password'
    const good = await post('/api/frontend/shares/note', body)
    assert.equal(good.status, 200)
    const file = await post('/api/frontend/shares/file', body)
    assert.equal(file.status, 200)
    assert.equal(file.headers.get('content-type'), 'image/png')
    assert.deepEqual(
      new Uint8Array(await file.arrayBuffer()),
      new Uint8Array([137, 80, 78, 71]),
    )
    const jsonFile = await post('/api/frontend/shares/file', {
      ...body,
      token: 'json-token',
    })
    assert.equal(jsonFile.status, 200)
    assert.deepEqual(await jsonFile.json(), { status: false, code: 480 })
  })
  await t.test('tampered session rejected', async () => {
    const res = await fetch(base + '/api/frontend/auth/me', {
      headers: { cookie: cookie + 'tampered' },
    })
    assert.equal(res.status, 401)
  })
  await t.test('login rotates the server store key', async () => {
    const oldCookie = cookie
    const res = await post('/api/frontend/auth/login', {
      credentials: 'test',
      password: 'correct',
    })
    cookie = res.headers.get('set-cookie').split(';')[0]
    assert.notEqual(cookie, oldCookie)
    assert.equal(
      (
        await fetch(base + '/api/frontend/auth/me', {
          headers: { cookie: oldCookie },
        })
      ).status,
      401,
    )
    assert.equal(
      (await fetch(base + '/api/frontend/auth/me', { headers: { cookie } }))
        .status,
      200,
    )
  })
  await t.test(
    'logout revokes Go token and old cookie stops working',
    async () => {
      assert.equal((await post('/api/frontend/auth/logout', {})).status, 200)
      assert.ok(requests.some((r) => r.path === '/api/auth/logout'))
      assert.equal(
        (await fetch(base + '/api/frontend/auth/me', { headers: { cookie } }))
          .status,
        401,
      )
    },
  )
  await t.test('Go token expiry clears web session', async () => {
    const res = await post('/api/frontend/auth/login', {
      credentials: 'test',
      password: 'correct',
    })
    cookie = res.headers.get('set-cookie').split(';')[0]
    expired = true
    const me = await fetch(base + '/api/frontend/auth/me', {
      headers: { cookie },
    })
    assert.equal(me.status, 401)
    assert.match(await me.text(), /登录已过期/)
    expired = false
  })
  await t.test(
    'upstream outage returns a controlled error without internal address',
    async () => {
      await new Promise((resolve) => go.close(resolve))
      const res = await post('/api/frontend/auth/login', {
        credentials: 'test',
        password: 'correct',
      })
      assert.equal(res.status, 502)
      assert.doesNotMatch(await res.text(), /ECONNREFUSED|SECRET_GO_TOKEN/)
    },
  )
})
