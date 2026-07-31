import type { IncomingMessage, ServerResponse } from 'node:http'
import { AnalyzeRateLimiter } from '../rateLimit.js'
import { AnalysisTaskManager } from '../services/analysisTasks.js'
import { ValidationError, validateAnalyzeInput } from '../validation.js'

interface AnalyzeApiOptions {
  getApiKey?: () => string | undefined
  fetchImpl?: typeof fetch
  limiter?: AnalyzeRateLimiter
  manager?: AnalysisTaskManager
}

const MAX_BODY_BYTES = 200_000
const TASK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(payload))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new ValidationError(['请求体不能超过 200 KB'])
    chunks.push(buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) throw new ValidationError(['请求体不能为空'])
  try {
    return JSON.parse(raw)
  } catch {
    throw new ValidationError(['请求体必须是合法 JSON'])
  }
}

function rateKey(request: IncomingMessage): string {
  const clientId = request.headers['x-label-lens-client-id']
  if (typeof clientId === 'string' && /^[A-Za-z0-9-]{8,100}$/.test(clientId)) {
    return `browser:${clientId}`
  }
  return `ip:${request.socket.remoteAddress ?? 'unknown'}`
}

function publicError(error: unknown): string {
  if (error instanceof ValidationError) return error.issues.join('；')
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500)
  return 'InfiniSynapse 请求暂时无法处理，请稍后检查任务状态。'
}

function taskIdFromPath(pathname: string, action: 'status' | 'cancel'): string | null {
  const match = pathname.match(new RegExp(`^/api/analyze/${action}/([^/]+)$`))
  if (!match) return null
  const taskId = decodeURIComponent(match[1])
  return TASK_ID_PATTERN.test(taskId) ? taskId : null
}

export function createAnalyzeApi(options: AnalyzeApiOptions = {}) {
  const limiter = options.limiter ?? new AnalyzeRateLimiter()
  const getApiKey = options.getApiKey ?? (() => process.env.INFINISYNAPSE_API_KEY)
  const manager =
    options.manager ??
    new AnalysisTaskManager({
      getApiKey,
      fetchImpl: options.fetchImpl,
    })

  return async function analyzeApi(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void> {
    const apiKey = getApiKey()?.trim()
    if (!apiKey) {
      json(response, 503, {
        error:
          '未配置 INFINISYNAPSE_API_KEY。请设置服务端环境变量后重启服务。',
      })
      return
    }

    if (pathname === '/api/analyze') {
      if (request.method !== 'POST') {
        json(response, 405, { error: '仅支持 POST /api/analyze。' })
        return
      }
      if (
        !String(request.headers['content-type'] ?? '')
          .toLowerCase()
          .includes('application/json')
      ) {
        json(response, 415, { error: '请求必须使用 application/json。' })
        return
      }

      let input
      try {
        input = validateAnalyzeInput(await readJson(request))
      } catch (error) {
        json(response, 400, { error: publicError(error) })
        return
      }

      const rateLease = limiter.acquire(rateKey(request))
      if (!rateLease) {
        json(response, 429, {
          error: '请求过于频繁。每个浏览器同一时间只能运行一个任务，请先检查已有任务。',
        })
        return
      }

      try {
        const task = await manager.start(input, { release: rateLease.release })
        json(response, 202, task)
      } catch (error) {
        rateLease.release()
        json(response, 502, { error: publicError(error) })
      }
      return
    }

    const statusTaskId = taskIdFromPath(pathname, 'status')
    if (statusTaskId) {
      if (request.method !== 'GET') {
        json(response, 405, { error: '任务状态接口仅支持 GET。' })
        return
      }
      try {
        json(response, 200, await manager.status(statusTaskId))
      } catch (error) {
        json(response, 502, { error: publicError(error) })
      }
      return
    }

    const cancelTaskId = taskIdFromPath(pathname, 'cancel')
    if (cancelTaskId) {
      if (request.method !== 'POST') {
        json(response, 405, { error: '取消任务接口仅支持 POST。' })
        return
      }
      try {
        json(response, 200, await manager.cancel(cancelTaskId))
      } catch {
        json(response, 502, {
          error: '取消请求未成功，任务可能仍在后台运行，请继续检查状态。',
        })
      }
      return
    }

    if (pathname.startsWith('/api/analyze/status/') || pathname.startsWith('/api/analyze/cancel/')) {
      json(response, 400, { error: 'taskId 格式不正确。' })
      return
    }
    json(response, 404, { error: '接口不存在。' })
  }
}
