import { ofetch } from 'ofetch'
import { createError, type H3Event } from 'h3'
import type { FnsResponse } from '~~/shared/types/fns'

interface Options {
  method?: 'GET' | 'POST'
  body?: Record<string, unknown>
  query?: Record<string, string | number>
  token?: string
  shareToken?: string
  binary?: boolean
}
export async function fnsRequest<T>(
  event: H3Event,
  path: string,
  options: Options = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'x-client': 'webgui',
    'User-Agent': 'FastNoteSyncWeb/1.0',
    'Accept-Language': 'zh-CN',
  }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.shareToken) headers['Share-Token'] = options.shareToken
  let response
  try {
    response = await ofetch.raw(new URL(path, fnsConfig().fnsApiBaseUrl).href, {
      method: options.method || 'GET',
      body: options.body,
      query: options.query,
      headers,
      timeout: 15000,
      retry: 0,
      ignoreResponseError: true,
      responseType: options.binary ? 'arrayBuffer' : 'json',
    })
  } catch {
    throw createError({
      statusCode: 502,
      message: '暂时无法连接笔记服务，请稍后重试',
    })
  }
  // Go ServeContent adds Last-Modified to files, including JSON attachments.
  const mayBeEnvelope =
    response.headers.get('content-type')?.includes('application/json') &&
    !response.headers.has('last-modified')
  let result: FnsResponse<T> | undefined
  try {
    result = options.binary
      ? mayBeEnvelope
        ? JSON.parse(
            Buffer.from(response._data as ArrayBuffer).toString('utf8'),
          )
        : undefined
      : (response._data as FnsResponse<T>)
  } catch {
    /* upstream protocol failure */
  }
  // Go reports business errors as HTTP 200 JSON envelopes. JSON attachments
  // are valid files too, so identify an error envelope instead of rejecting all JSON.
  const envelope =
    typeof result?.code === 'number' &&
    (typeof result?.status === 'boolean' ||
      (result.status === undefined && result.code >= 100 &&
        typeof result.message === 'string'))
  if (
    options.binary &&
    response.ok &&
    (!mayBeEnvelope || !envelope || result?.status === true)
  ) {
    return {
      data: response._data,
      contentType:
        response.headers.get('content-type') || 'application/octet-stream',
    } as T
  }
  if (!envelope)
    throw createError({
      statusCode: 502,
      message: '笔记服务响应无效，请稍后重试',
    })
  if (!response.ok || result?.status !== true) {
    const code = result?.code
    if (
      options.token &&
      (response.status === 401 || [306, 307, 308, 309, 310].includes(code || 0))
    ) {
      await clearWebSession(event)
      throw createError({ statusCode: 401, message: '登录已过期，请重新登录' })
    }
    const messages: Record<number, string> = {
      401: '登录失败，请检查账号或密码',
      402: '登录失败，请检查账号或密码',
      403: '登录失败，请检查账号或密码',
      480: '分享不存在',
      481: '分享已过期',
      482: '分享已撤销',
      483: '请输入分享密码',
      484: '分享密码不正确',
    }
    throw createError({
      statusCode: response.status === 429 || code === 303 ? 429 : 400,
      message: messages[code || 0] || '笔记服务请求失败，请稍后重试',
      data: { code },
    })
  }
  return result!.data
}
