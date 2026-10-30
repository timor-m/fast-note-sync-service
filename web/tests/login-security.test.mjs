import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('login BFF preserves client IP, cooldown and server-only token', async (t) => {
  const requests = []
  let tokenIP
  let authError = 0
  const backend = createServer(async (req, res) => {
    let text = ''
    for await (const chunk of req) text += chunk
    requests.push({ url: req.url, ip: req.headers['x-forwarded-for'] })
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/api/user/login') {
      if (JSON.parse(text).password === 'blocked') {
        res.statusCode = 429
        res.setHeader('Retry-After', '900')
        return res.end(JSON.stringify({ code: 303, status: false, data: { retryAfter: 900 } }))
      }
      tokenIP = req.headers['x-forwarded-for']
      return res.end(JSON.stringify({ code: 1, status: true, data: { uid: 1, username: 'test', token: 'SERVER_ONLY_TOKEN' } }))
    }
    if (req.url === '/api/user/info') {
      const code = authError || (req.headers['x-forwarded-for'] !== tokenIP ? 312 : 0)
      if (code) return res.end(JSON.stringify({ code, status: false }))
    }
    if (req.url?.startsWith('/api/note?')) {
      assert.equal(req.headers.authorization, 'Bearer SERVER_ONLY_TOKEN')
      return res.end(JSON.stringify({ code: 1, status: true, data: { path: 'test.md', content: '# Private note', mtime: 1 } }))
    }
    assert.equal(req.headers.authorization, 'Bearer SERVER_ONLY_TOKEN')
    res.end(JSON.stringify({ code: 1, status: true, data: { uid: 1, username: 'test' } }))
  })
  backend.listen(0, '127.0.0.1')
  await once(backend, 'listening')
  const reserve = createServer()
  reserve.listen(0, '127.0.0.1')
  await once(reserve, 'listening')
  const port = reserve.address().port
  await new Promise(resolve => reserve.close(resolve))
  const dir = await mkdtemp(join(tmpdir(), 'fns-security-'))
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), FNS_API_BASE_URL: `http://127.0.0.1:${backend.address().port}`, FNS_SESSION_PASSWORD: 'security-test-key-with-at-least-32-characters', FNS_SESSION_DIR: dir, FNS_SESSION_SECURE: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  server.stdout.on('data', data => { log += data })
  server.stderr.on('data', data => { log += data })
  t.after(async () => {
    if (server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit') }
    await new Promise(resolve => backend.close(resolve))
    await rm(dir, { recursive: true, force: true })
  })
  let ready = false
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(base + '/api/frontend/health')).ok) { ready = true; break } } catch {}
    if (server.exitCode !== null) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, log)
  const post = password => fetch(base + '/api/frontend/auth/login', {
    method: 'POST', headers: { origin: base, 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.10' },
    body: JSON.stringify({ credentials: 'test', password }),
  })
  const blocked = await post('blocked')
  assert.equal(blocked.status, 429)
  assert.equal(blocked.headers.get('retry-after'), '900')
  assert.match(await blocked.text(), /登录尝试过多/)
  assert.equal(blocked.headers.get('set-cookie'), null)
  const login = await post('correct')
  assert.equal(login.status, 200)
  assert.doesNotMatch(await login.text(), /SERVER_ONLY_TOKEN/)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const me = await fetch(base + '/api/frontend/auth/me', { headers: { cookie, 'X-Forwarded-For': '192.0.2.10' } })
  assert.equal(me.status, 200)
  const page = await fetch(base + '/app/note?vault=Test&path=test.md', { headers: { cookie, 'X-Forwarded-For': '192.0.2.10' }, redirect: 'manual' })
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Private note/)
  assert.ok(requests.length >= 4)
  assert.ok(requests.every(req => req.ip === '192.0.2.10'), JSON.stringify(requests))
  await t.test('IP change clears the rejected session and returns a useful 401', async () => {
    const changed = await fetch(base + '/api/frontend/auth/me', { headers: { cookie, 'X-Forwarded-For': '192.0.2.11' } })
    assert.equal(changed.status, 401)
    const body = await changed.json()
    assert.equal(body.data.code, 312)
    assert.match(body.message, /登录 IP 已变化/)
    const before = requests.length
    const reused = await fetch(base + '/api/frontend/auth/me', { headers: { cookie, 'X-Forwarded-For': '192.0.2.10' } })
    assert.equal(reused.status, 401)
    assert.equal(requests.length, before, 'old cookie reached Go again')
    const page = await fetch(base + '/app', { headers: { cookie, 'X-Forwarded-For': '192.0.2.10' }, redirect: 'manual' })
    assert.equal(page.status, 302)
    assert.equal(page.headers.get('location'), '/login')
  })
  for (const code of [313, 314]) {
    await t.test(`binding error ${code} invalidates session`, async () => {
      const login = await post('correct')
      const freshCookie = login.headers.get('set-cookie').split(';')[0]
      authError = code
      const me = await fetch(base + '/api/frontend/auth/me', { headers: { cookie: freshCookie, 'X-Forwarded-For': '192.0.2.10' } })
      assert.equal(me.status, 401)
      assert.match((await me.json()).message, /登录环境已变化/)
      authError = 0
    })
  }
  await t.test('scope denial returns 403 and preserves the valid session', async () => {
    const login = await post('correct')
    const freshCookie = login.headers.get('set-cookie').split(';')[0]
    authError = 315
    const denied = await fetch(base + '/api/frontend/auth/me', { headers: { cookie: freshCookie, 'X-Forwarded-For': '192.0.2.10' } })
    assert.equal(denied.status, 403)
    assert.match((await denied.json()).message, /没有访问/)
    const page = await fetch(base + '/app', { headers: { cookie: freshCookie, 'X-Forwarded-For': '192.0.2.10' } })
    assert.equal(page.status, 200)
    assert.match(await page.text(), /<p class="error" role="alert">\s*当前登录没有访问该内容的权限\s*<\/p>/)
    authError = 0
    const allowed = await fetch(base + '/api/frontend/auth/me', { headers: { cookie: freshCookie, 'X-Forwarded-For': '192.0.2.10' } })
    assert.equal(allowed.status, 200)
  })

})
