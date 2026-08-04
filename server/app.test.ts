import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppHandler } from './app'
import { validAnalyzeInput } from './validation.test'

const cleanupDirectories: string[] = []
const cleanupServers: Server[] = []
const TASK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(
    cleanupServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        }),
    ),
  )
  await Promise.all(
    cleanupDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

async function fixtureDist(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'label-lens-dist-'))
  cleanupDirectories.push(directory)
  await mkdir(join(directory, 'assets'))
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>LabelLens</title>')
  await writeFile(join(directory, 'assets', 'app.js'), 'console.log("ok")')
  return directory
}

async function listen(
  distDir: string,
  getApiKey: () => string | undefined,
  fetchImpl?: typeof fetch,
): Promise<string> {
  const server = createServer(
    createAppHandler({
      distDir,
      getApiKey,
      fetchImpl,
    }),
  )
  cleanupServers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('测试服务启动失败')
  return `http://127.0.0.1:${address.port}`
}

describe('production app handler', () => {
  it('serves the frontend, assets, and SPA fallback from the same service', async () => {
    const baseUrl = await listen(await fixtureDist(), () => undefined)

    const home = await fetch(`${baseUrl}/`)
    const asset = await fetch(`${baseUrl}/assets/app.js`)
    const fallback = await fetch(`${baseUrl}/results/restored`)

    expect(home.status).toBe(200)
    expect(await home.text()).toContain('LabelLens')
    expect(asset.headers.get('content-type')).toContain('text/javascript')
    expect(await asset.text()).toContain('console.log')
    expect(fallback.status).toBe(200)
    expect(await fallback.text()).toContain('LabelLens')
  })

  it('exposes a boolean-only health check and a safe missing-key analyze error', async () => {
    const baseUrl = await listen(await fixtureDist(), () => undefined)

    const health = await fetch(`${baseUrl}/api/health`)
    const analyze = await fetch(`${baseUrl}/api/analyze`, { method: 'POST' })
    const recognize = await fetch(`${baseUrl}/api/ocr/label`, { method: 'POST' })

    expect(await health.json()).toEqual({
      status: 'ok',
      service: 'label-lens',
      apiKeyConfigured: false,
    })
    expect(analyze.status).toBe(503)
    expect(await analyze.json()).toEqual({
      error: '未配置 INFINISYNAPSE_API_KEY。请设置服务端环境变量后重启服务。',
    })
    expect(recognize.status).toBe(503)
    expect(await recognize.json()).toEqual({
      error: '未配置 INFINISYNAPSE_API_KEY。图片识别不可用，请继续手动录入。',
    })
  })

  it('rejects malformed multipart without crashing the service', async () => {
    const baseUrl = await listen(
      await fixtureDist(),
      () => 'test-key',
      undefined,
      () => true,
    )

    const malformed = await fetch(`${baseUrl}/api/ocr/label`, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data' },
      body: new Uint8Array([1, 2, 3]),
    })
    const healthAfter = await fetch(`${baseUrl}/api/health`)

    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({
      error: '请求必须使用合法的multipart/form-data',
    })
    expect(healthAfter.status).toBe(200)
    expect(await healthAfter.json()).toMatchObject({ status: 'ok' })
  })

  it('does not gate recognition when the legacy Beta environment value is false', async () => {
    vi.stubEnv('VITE_ENABLE_LABEL_RECOGNITION_BETA', 'false')
    let upstreamCalls = 0
    const fetchImpl = async () => {
      upstreamCalls += 1
      throw new Error('malformed multipart must not contact upstream')
    }
    const baseUrl = await listen(
      await fixtureDist(),
      () => 'test-key',
      fetchImpl as typeof fetch,
    )

    const response = await fetch(`${baseUrl}/api/ocr/label`, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data' },
      body: new Uint8Array([1, 2, 3]),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: '请求必须使用合法的multipart/form-data',
    })
    expect(upstreamCalls).toBe(0)
  })

  it('does not return a taskId when upstream does not accept newTask', async () => {
    let streamCancelled = false
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/ai/events')) {
        return new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              streamCancelled = true
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {}
      if (url.endsWith('/api/ai/message') && body.type === 'newTask') {
        return new Response(
          JSON.stringify({ success: false, error: 'submission rejected' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      throw new Error(`unexpected request ${url}`)
    }
    const baseUrl = await listen(
      await fixtureDist(),
      () => 'test-key',
      fetchImpl as typeof fetch,
    )

    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validAnalyzeInput()),
    })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(502)
    expect(body.error).toBe('submission rejected')
    expect(body).not.toHaveProperty('taskId')
    expect(streamCancelled).toBe(true)
  })

  it('does not return a recognition taskId when the attachment newTask is rejected', async () => {
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/tools/taskUpload/')) {
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              name: 'ingredients-label.jpg',
              size: 4,
              logicalPath: 'label_inputs/ingredients-label.jpg',
              assetId: 'asset-a',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/api/ai/events')) {
        return new Response(new ReadableStream<Uint8Array>({}), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {}
      if (url.endsWith('/api/ai/message') && body.type === 'newTask') {
        return new Response(
          JSON.stringify({ success: false, error: 'recognition submission rejected' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      throw new Error(`unexpected request ${url}`)
    }
    const baseUrl = await listen(
      await fixtureDist(),
      () => 'test-key',
      fetchImpl as typeof fetch,
    )
    const form = new FormData()
    form.append(
      'ingredientImage',
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])], { type: 'image/jpeg' }),
      'ingredients-label.jpg',
    )

    const response = await fetch(`${baseUrl}/api/ocr/label`, {
      method: 'POST',
      body: form,
    })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(502)
    expect(body.error).toBe('recognition submission rejected')
    expect(body).not.toHaveProperty('taskId')
  })

  it('returns recoverable identifiers and Retry-After when recognition newTask is rate limited', async () => {
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/tools/taskUpload/')) {
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              name: 'ingredients-label.jpg',
              size: 4,
              logicalPath: 'label_inputs/ingredients-label.jpg',
              assetId: 'asset-a',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/api/ai/events')) {
        return new Response(new ReadableStream<Uint8Array>({}), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {}
      if (url.endsWith('/api/ai/message') && body.type === 'newTask') {
        return new Response(JSON.stringify({ message: 'rate limited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '13' },
        })
      }
      throw new Error(`unexpected request ${url}`)
    }
    const baseUrl = await listen(
      await fixtureDist(),
      () => 'test-key',
      fetchImpl as typeof fetch,
    )
    const form = new FormData()
    form.append(
      'ingredientImage',
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])], { type: 'image/jpeg' }),
      'ingredients-label.jpg',
    )

    const response = await fetch(`${baseUrl}/api/ocr/label`, {
      method: 'POST',
      body: form,
    })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('13')
    expect(body.taskId).toMatch(TASK_ID_PATTERN)
    expect(body.connId).toMatch(TASK_ID_PATTERN)
  })
})
