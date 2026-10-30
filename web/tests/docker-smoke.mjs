import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
const exec = promisify(execFile)
// Model a stable client behind the existing external reverse proxy. Docker
// Host connections in this test environment can use different source IPs.
const nativeFetch = globalThis.fetch
const fetch = (url, options = {}) =>
  nativeFetch(url, {
    ...options,
    headers: { 'x-forwarded-for': '192.0.2.10', ...options.headers },
  })
const composeFile = resolve('../docker/docker-compose.yaml')
const project = `fns-smoke-${Date.now()}`
const dir = await mkdtemp(join(tmpdir(), 'fns-smoke-'))
const reserve = createServer()
reserve.listen(0, '127.0.0.1')
await once(reserve, 'listening')
const port = reserve.address().port
await new Promise((resolve) => reserve.close(resolve))
const base = `http://127.0.0.1:${port}`
const env = {
  ...process.env,
  FNS_IMAGE: 'fast-note-sync-service:local',
  FNS_DATA_DIR: dir,
  FNS_PUBLIC_PORT: String(port),
  FNS_SESSION_PASSWORD: '',
  FNS_SESSION_SECURE: 'false',
  FNS_WEB_FRONTEND_ENABLED: 'true',
  FNS_WEB_FRONTEND_TIMEOUT: '2s',
}
const compose = (...args) =>
  exec('docker', ['compose', '-p', project, '-f', composeFile, ...args], {
    env,
    maxBuffer: 1024 * 1024,
  })
// Inspect root-owned 0600 files inside the container. Never export the key itself.
async function sessionKeyInfo() {
  const result = await compose('exec', '-T', '--user', '0', 'fast-note-sync-service',
    'node', '-e', `
      const fs = require('node:fs'), crypto = require('node:crypto');
      const path = '/fast-note-sync/config/.web-session-key';
      const key = fs.readFileSync(path);
      console.log(JSON.stringify({
        digest: crypto.createHash('sha256').update(key).digest('hex'),
        length: key.length, mode: fs.statSync(path).mode & 0o777,
      }));
    `)
  return JSON.parse(result.stdout)
}
const passed = []
function pass(name) {
  passed.push(name)
  console.log(`PASS ${name}`)
}
const hash = (value) => {
  let h = 0
  for (let i = 0; i < value.length; i++)
    h = (Math.imul(h, 31) + value.charCodeAt(i)) | 0
  return String(h)
}
let token = '',
  cookie = ''
async function api(path, method = 'GET', body) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'x-client': 'webgui',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  assert.equal(data.status, true, `${method} ${path}: ${JSON.stringify(data)}`)
  return data.data
}
const post = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: { origin: base, cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
async function ready() {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('Go did not become ready')
}
try {
  await mkdir(join(dir, 'config'))
  await mkdir(join(dir, 'storage'))
  await writeFile(
    join(dir, 'config/config.yaml'),
    `user:\n  register-is-enable: true\nserver:\n  http-port: ':9000'\nsecurity:\n  auth-token-key: '${randomBytes(24).toString('hex')}'\n  share-token-key: '${randomBytes(24).toString('hex')}'\nstorage:\n  local-fs:\n    is-enable: true\n`,
  )
  await compose('up', '-d', '--no-build')
  const running = JSON.parse(
    (await compose('ps', '--format', 'json')).stdout.trim(),
  )
  assert.equal(Array.isArray(running) ? running.length : 1, 1)
  pass('one Compose service and one running container')
  await ready()
  assert.equal((await api('/api/version')).version, '1.0.1')
  assert.equal((await readFile(join(dir, 'config/lastVersion'), 'utf8')).trim(), '3.6.1')
  pass('fork version is 1.0.1 while database migration compatibility remains 3.6.1')
  for (let i = 0; i < 100; i++) {
    if ((await fetch(base + '/api/frontend/health')).ok) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.match(await (await fetch(base)).text(), /每一次记录/)
  assert.match(await (await fetch(base)).text(), /\/_nuxt\/favicon.svg/)
  assert.equal((await fetch(base + '/_nuxt/favicon.svg')).status, 200)
  pass('Go public entry serves Nuxt SSR and favicon')
  const legacy = await fetch(base + '/webgui/')
  assert.equal(legacy.status, 200)
  const legacyHtml = await legacy.text()
  assert.match(legacyHtml, /assets\/main-/)
  const adminImports = JSON.parse(legacyHtml.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports
  assert.ok(Object.keys(adminImports).some((path) => path.includes('system-settings-')))
  for (const module of Object.values(adminImports)) {
    for (const encoding of ['identity', 'gzip', 'br']) {
      const response = await fetch(base + module, { headers: { 'accept-encoding': encoding } })
      assert.equal(response.status, 200)
      const source = await response.text()
      assert.doesNotMatch(source, /ui\.support\.|\/api\/support|ko-fi\.com|fns-support/)
      if (module.includes('system-settings-')) {
        assert.match(source, /github\.com\/timor-m\/fast-note-sync-service\/issues\/new/)
        assert.doesNotMatch(source, /t\.me\/obsidian_users|\/api\/admin\/upgrade/)
      }
    }
  }
  for (const path of ['/api/support', '/static/images/kofi.png', '/static/images/wxds.png']) {
    const missing = await (await fetch(base + path)).json()
    // Go's existing unknown-route contract is an HTTP 200 error envelope.
    assert.equal(missing.status, false)
    assert.equal(missing.code, 304)
  }
  pass('legacy admin donation module, API and images removed across all encodings')
  const legacyShare = await fetch(base + '/share/1/test')
  assert.equal(legacyShare.status, 200)
  assert.match(await legacyShare.text(), /share/)
  const home = await (await fetch(base)).text()
  const asset = home.match(/(?:src|href)="(\/_nuxt\/[^\"]+\.(?:js|css))"/)
  assert.ok(asset)
  assert.doesNotMatch(home, /href="\/webgui\/"|href="\/kb\/demo"|演示知识库/)
  assert.equal((await fetch(base + asset[1])).status, 200)
  pass('legacy React, legacy share and Nuxt assets coexist')
  const credentials = 'smokeuser',
    password = 'SmokePassword2026!'
  await api('/api/user/register', 'POST', {
    username: credentials,
    email: 'smoke@example.com',
    password,
    confirmPassword: password,
  })
  token = (await api('/api/user/login', 'POST', { credentials, password }))
    .token
  await api('/api/user/info')
  const changedIP = await fetch(base + '/api/user/info', {
    headers: {
      'x-client': 'webgui',
      Authorization: `Bearer ${token}`,
      'x-forwarded-for': '192.0.2.11',
    },
  })
  assert.equal((await changedIP.json()).code, 312)
  pass('existing login token IP binding still rejects a different client')
  await api('/api/vault', 'POST', { vault: 'SmokeVault' })
  const now = Date.now(),
    path = 'Smoke.md',
    content = '# Docker smoke\n\nHello from Go.'
  await api('/api/note', 'POST', {
    vault: 'SmokeVault',
    path,
    content,
    mtime: now,
    ctime: now,
  })
  let note = await api('/api/note?vault=SmokeVault&path=Smoke.md')
  assert.equal(note.content, content)
  await api('/api/note', 'POST', {
    vault: 'SmokeVault',
    path,
    content: content + '\nUpdated.',
    baseHash: note.contentHash,
    mtime: now + 1,
    ctime: now,
  })
  note = await api('/api/note?vault=SmokeVault&path=Smoke.md')
  assert.match(note.content, /Updated/)
  pass('original login, info, vault, note create/read/update APIs')
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKYsAAAAASUVORK5CYII=',
    'base64',
  )
  const form = new FormData()
  form.set('vault', 'SmokeVault')
  form.set('path', 'pixel.png')
  form.set('file', new Blob([png], { type: 'image/png' }), 'pixel.png')
  const upload = await fetch(base + '/api/file', {
    method: 'POST',
    headers: { 'x-client': 'webgui', Authorization: `Bearer ${token}` },
    body: form,
  })
  const uploaded = await upload.json()
  assert.equal(uploaded.status, true, JSON.stringify(uploaded))
  const file = await fetch(base + '/api/file?vault=SmokeVault&path=pixel.png', {
    headers: { 'x-client': 'webgui', Authorization: `Bearer ${token}` },
  })
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), png)
  pass('original attachment upload/download APIs')
  const invalidLogin = await post('/api/frontend/auth/login', { credentials, password: 'wrong-password' })
  assert.equal(invalidLogin.status, 400)
  assert.match(await invalidLogin.text(), /登录失败/)
  const login = await post('/api/frontend/auth/login', {
    credentials,
    password,
  })
  const loginBody = await login.text()
  assert.equal(login.status, 200, loginBody)
  assert.doesNotMatch(loginBody, /token/)
  assert.match(login.headers.get('set-cookie'), /HttpOnly/)
  cookie = login.headers.get('set-cookie').split(';')[0]
  const me = await fetch(base + '/api/frontend/auth/me', {
    headers: { cookie },
  })
  assert.equal(me.status, 200, await me.text())
  const app = await fetch(base + '/app', { headers: { cookie } })
  const appHtml = await app.text()
  assert.equal(app.status, 200, appHtml)
  assert.match(appHtml, /SmokeVault/)
  assert.match(appHtml, /Smoke.md/)
  assert.doesNotMatch(
    appHtml,
    new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  )
  pass('real Nuxt login session, server-side Go token and workspace SSR')
  const sessionKey = await sessionKeyInfo()
  assert.equal(sessionKey.length, 64)
  assert.equal(sessionKey.mode, 0o600)
  await compose('stop', '-t', '10', 'fast-note-sync-service')
  const enabledStop = JSON.parse(
    (await compose('ps', '-a', '--format', 'json')).stdout.trim(),
  )
  assert.equal(enabledStop.ExitCode, 0)
  pass('Go and Nuxt stop cleanly together via forwarded signals')
  await compose('start', 'fast-note-sync-service')
  await ready()
  assert.deepEqual(await sessionKeyInfo(), sessionKey)
  for (let i = 0; i < 100; i++) {
    if ((await fetch(base + '/api/frontend/health')).ok) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.equal(
    (await fetch(base + '/api/frontend/auth/me', { headers: { cookie } }))
      .status,
    200,
  )
  pass('container restart preserves automatic session key and server session')
  const share = await api('/api/share', 'POST', {
    vault: 'SmokeVault',
    path,
    pathHash: hash(path),
    password: 'sharepass',
  })
  assert.ok(share.token)
  assert.ok(share.id)
  const shared = await post('/api/frontend/shares/note', {
    token: share.token,
    id: share.id,
    password: 'sharepass',
  })
  const sharedBody = await shared.json()
  assert.equal(shared.status, 200, JSON.stringify(sharedBody))
  assert.match(sharedBody.content, /Updated/)
  const wrong = await post('/api/frontend/shares/note', {
    token: share.token,
    id: share.id,
    password: 'wrong',
  })
  assert.equal(wrong.status, 400)
  const fileShare = await api('/api/share', 'POST', {
    vault: 'SmokeVault',
    path: 'pixel.png',
    pathHash: hash('pixel.png'),
    password: 'sharepass',
  })
  const sharedFile = await post('/api/frontend/shares/file', {
    token: fileShare.token,
    id: fileShare.id,
    password: 'sharepass',
  })
  assert.equal(sharedFile.status, 200)
  assert.deepEqual(Buffer.from(await sharedFile.arrayBuffer()), png)
  pass(
    'real existing share authorization, passwords and binary attachments via Nuxt',
  )
  const protectedPreview = await fetch(`${base}/s/${share.token}?id=${share.id}`)
  assert.equal(protectedPreview.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.doesNotMatch(await protectedPreview.text(), /Updated|sharepass/)
  const publicShare = await api('/api/share', 'POST', {
    vault: 'SmokeVault', path, pathHash: hash(path), password: '',
  })
  const publicPreview = await fetch(`${base}/s/${publicShare.token}?id=${publicShare.id}`)
  const publicPreviewHtml = await publicPreview.text()
  assert.match(publicPreviewHtml, /<title>Smoke · Fast Note Sync<\/title>/)
  assert.match(publicPreviewHtml, /property="og:description"/)
  const publicRead = await post('/api/frontend/shares/note', {
    token: publicShare.token, id: publicShare.id,
  })
  assert.equal(publicRead.status, 200)
  // Graceful stop flushes pending increments without waiting five minutes.
  await compose('stop', '-t', '10', 'fast-note-sync-service')
  await compose('start', 'fast-note-sync-service')
  await ready()
  const shares = await api('/api/shares?page=1&pageSize=50')
  const publicStats = shares.list.find((item) => item.notePath === path && item.status === 1)
  assert.equal(publicStats?.viewCount, 1, JSON.stringify(shares))
  const fileStats = shares.list.find((item) => item.title === 'pixel.png')
  assert.equal(fileStats?.viewCount, 0)
  for (let i = 0; i < 100; i++) {
    if ((await fetch(base + '/api/frontend/health')).ok) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  pass('SSR share metadata is private and does not count; successful note view persists exactly once')
  for (const endpoint of ['/api/mcp', '/api/mcp/sse']) {
    const res = await fetch(base + endpoint)
    const body = await res.text()
    assert.doesNotMatch(body, /<!DOCTYPE|每一次记录/)
    assert.ok(res.status >= 400 || body.includes('code'))
  }
  const ws = await fetch(base + '/api/user/sync')
  const wsBody = await ws.text()
  assert.doesNotMatch(wsBody, /每一次记录/)
  pass('MCP and WebSocket routes stay on Go (unauthenticated probes)')
  const mcpToken = await api('/api/token', 'POST', {
    clientType: 'smoke',
    protocol: 'mcp',
    client: 'smoke',
    function: '*',
    expiredDays: 1,
  })
  const mcpHeaders = {
    Authorization: `Bearer ${mcpToken.token}`,
    'x-client': 'smoke',
    Accept: 'application/json, text/event-stream',
  }
  const sse = await fetch(base + '/api/mcp/sse', {
    method: 'HEAD',
    headers: mcpHeaders,
  })
  assert.equal(sse.status, 200)
  assert.match(sse.headers.get('content-type') || '', /text\/event-stream/)
  const initialize = await fetch(base + '/api/mcp', {
    method: 'POST',
    headers: { ...mcpHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'smoke', version: '0.1' },
      },
    }),
  })
  const initialized = await initialize.text()
  assert.equal(initialize.status, 200, initialized)
  assert.match(initialized, /"result"/)
  pass('authenticated MCP SSE headers and StreamableHTTP initialization')
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(
      base.replace('http:', 'ws:') +
        '/api/user/sync?client=obsidian&clientName=smoke',
    )
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error('WebSocket handshake timed out'))
    }, 5000)
    socket.onopen = () => socket.close()
    socket.onclose = () => {
      clearTimeout(timeout)
      resolve()
    }
    socket.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('WebSocket handshake failed'))
    }
  })
  pass('original WebSocket HTTP upgrade succeeds through public Go entry')

  await api('/api/note?vault=SmokeVault&path=Smoke.md', 'DELETE')
  pass('original note deletion API')
  assert.equal((await post('/api/frontend/auth/logout', {})).status, 200)
  assert.equal(
    (await fetch(base + '/api/frontend/auth/me', { headers: { cookie } }))
      .status,
    401,
  )
  pass('real logout invalidates web session')
  // Freeze Nuxt to expose a deterministic outage while Go keeps serving.
  const findNode =
    'for p in /proc/[0-9]*/comm; do if [ "$(cat "$p")" = node ]; then basename "$(dirname "$p")"; fi; done'
  const nodePid = (
    await compose(
      'exec',
      '-T',
      'fast-note-sync-service',
      'bash',
      '-c',
      findNode,
    )
  ).stdout.trim()
  assert.match(nodePid, /^\d+$/)
  await compose(
    'exec',
    '-T',
    'fast-note-sync-service',
    'bash',
    '-c',
    'kill -STOP "$1"',
    '_',
    nodePid,
  )
  assert.equal((await fetch(base)).status, 503)
  assert.equal((await fetch(base + '/api/health')).status, 200)
  assert.equal((await fetch(base + '/webgui/')).status, 200)
  await api('/api/user/info')
  pass('frozen Nuxt returns friendly error while Go remains healthy')
  await compose(
    'exec',
    '-T',
    'fast-note-sync-service',
    'bash',
    '-c',
    'kill -KILL "$1"',
    '_',
    nodePid,
  )
  for (let i = 0; i < 100; i++) {
    if ((await fetch(base + '/api/frontend/health')).ok) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.equal((await fetch(base + '/api/frontend/health')).status, 200)
  const newPid = (
    await compose(
      'exec',
      '-T',
      'fast-note-sync-service',
      'bash',
      '-c',
      findNode,
    )
  ).stdout.trim()
  assert.notEqual(newPid, nodePid)
  pass('Nuxt crash restarts only Node and restores frontend')
  const containerId = (await compose('ps', '-q')).stdout.trim()
  const inspectRestarts = async () =>
    Number(
      (
        await exec('docker', [
          'inspect',
          '--format',
          '{{.RestartCount}}',
          containerId,
        ])
      ).stdout.trim(),
    )
  assert.equal(await inspectRestarts(), 0)
  const uid = (
    await compose(
      'exec',
      '-T',
      'fast-note-sync-service',
      'bash',
      '-c',
      `while read -r line; do case "$line" in Uid:*) echo "$line";; esac; done < /proc/${newPid}/status`,
    )
  ).stdout
  assert.match(uid, /Uid:\s+1000\s/)
  pass('Nuxt runs unprivileged and its crash did not restart the container')
  const findGo =
    'for p in /proc/[0-9]*/cmdline; do mapfile -d "" -t args < "$p" 2>/dev/null || continue; if [ "${args[0]##*/}" = fast-note-sync-service ] || [ "${args[1]##*/}" = fast-note-sync-service ]; then basename "$(dirname "$p")"; fi; done'
  const goPid = (
    await compose('exec', '-T', 'fast-note-sync-service', 'bash', '-c', findGo)
  ).stdout.trim()
  assert.match(goPid, /^\d+$/)
  await compose(
    'exec',
    '-T',
    'fast-note-sync-service',
    'bash',
    '-c',
    'kill -KILL "$1"',
    '_',
    goPid,
  ).catch((error) => {
    if (![137, 143].includes(error.code)) throw error
  })
  for (let i = 0; i < 100 && (await inspectRestarts()) === 0; i++)
    await new Promise((resolve) => setTimeout(resolve, 200))
  assert.ok((await inspectRestarts()) > 0)
  await ready()
  for (let i = 0; i < 100; i++) {
    if ((await fetch(base + '/api/frontend/health')).ok) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.equal((await fetch(base + '/api/frontend/health')).status, 200)
  assert.deepEqual(await sessionKeyInfo(), sessionKey)
  pass('Go exit terminates container and Docker restarts both processes')

  env.FNS_WEB_FRONTEND_ENABLED = 'false'
  await compose(
    'up',
    '-d',
    '--no-deps',
    '--no-build',
    '--force-recreate',
    'fast-note-sync-service',
  )
  await ready()
  const rollback = await fetch(base, { redirect: 'manual' })
  assert.equal(rollback.status, 302)
  assert.equal(rollback.headers.get('location'), '/webgui')
  pass('disabled frontend restores original root and skips Node startup')
  const disabledNode = (
    await compose(
      'exec',
      '-T',
      'fast-note-sync-service',
      'bash',
      '-c',
      findNode,
    )
  ).stdout.trim()
  assert.equal(disabledNode, '')
  await compose('stop', '-t', '10', 'fast-note-sync-service')
  const stopped = JSON.parse(
    (await compose('ps', '-a', '--format', 'json')).stdout.trim(),
  )
  assert.equal(stopped.ExitCode, 0)
  pass('container stop exits cleanly with signal forwarding')
  console.log(
    `\n${passed.length} single-container smoke checks passed; only isolated temporary data used.`,
  )
} catch (error) {
  console.error(error)
  const logs = await compose('logs', '--tail', '35').catch(() => ({
    stdout: '',
  }))
  console.error(logs.stdout)
  process.exitCode = 1
} finally {
  try {
    await compose('down', '--volumes', '--remove-orphans')
    // Linux bind mounts keep container UID ownership. Clean only this mkdtemp
    // directory with container root, without changing production permissions.
    await exec('docker', ['run', '--rm', '--network', 'none', '--user', '0:0',
      '--entrypoint', 'node', '--mount', `type=bind,source=${dir},target=/smoke`,
      env.FNS_IMAGE, '-e', `
        const fs = require('node:fs');
        for (const name of fs.readdirSync('/smoke'))
          fs.rmSync('/smoke/' + name, { recursive: true, force: true });
      `])
    await rm(dir, { recursive: true, force: true })
  } catch (error) {
    console.error('Smoke cleanup failed:', error.message)
    process.exitCode = 1
  }
}
