import type { IncomingMessage, ServerResponse } from 'node:http'
import { readRecognitionImages } from '../multipart.js'
import { AnalyzeRateLimiter } from '../rateLimit.js'
import { RecognitionTaskManager } from '../services/recognitionTasks.js'
import { ValidationError } from '../validation.js'

interface RecognizeApiOptions {
  getApiKey?: () => string | undefined
  fetchImpl?: typeof fetch
  limiter?: AnalyzeRateLimiter
  manager?: RecognitionTaskManager
}

const TASK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(payload))
}

function publicError(error: unknown): string {
  if (error instanceof ValidationError) return error.issues.join('；')
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500)
  return '图片识别请求暂时无法处理，请改为手动录入。'
}

function rateKey(request: IncomingMessage): string {
  const clientId = request.headers['x-label-lens-client-id']
  if (typeof clientId === 'string' && /^[A-Za-z0-9-]{8,100}$/.test(clientId)) {
    return `recognize-browser:${clientId}`
  }
  return `recognize-ip:${request.socket.remoteAddress ?? 'unknown'}`
}

function statusTaskId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/recognize\/status\/([^/]+)$/)
  if (!match) return null
  const taskId = decodeURIComponent(match[1])
  return TASK_ID_PATTERN.test(taskId) ? taskId : null
}

export function createRecognizeApi(options: RecognizeApiOptions = {}) {
  const limiter = options.limiter ?? new AnalyzeRateLimiter()
  const getApiKey = options.getApiKey ?? (() => process.env.INFINISYNAPSE_API_KEY)
  const manager =
    options.manager ??
    new RecognitionTaskManager({
      getApiKey,
      fetchImpl: options.fetchImpl,
    })

  return async function recognizeApi(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void> {
    const isSubmissionPath = pathname === '/api/ocr/label'
    if (!getApiKey()?.trim()) {
      json(response, 503, {
        error:
          '未配置 INFINISYNAPSE_API_KEY。图片识别不可用，请继续手动录入。',
      })
      return
    }
    if (isSubmissionPath) {
      if (request.method !== 'POST') {
        json(response, 405, { error: '图片识别接口仅支持POST。' })
        return
      }
      const lease = limiter.acquire(rateKey(request))
      if (!lease) {
        json(response, 429, {
          error: '图片识别请求过于频繁，请先检查当前任务。',
        })
        return
      }
      try {
        const files = await readRecognitionImages(request)
        const task = await manager.start(files, { release: lease.release })
        json(response, 202, task)
      } catch (error) {
        lease.release()
        json(response, error instanceof ValidationError ? 400 : 502, {
          error: publicError(error),
        })
      }
      return
    }

    const taskId = statusTaskId(pathname)
    if (taskId) {
      if (request.method !== 'GET') {
        json(response, 405, { error: '识别任务状态接口仅支持GET。' })
        return
      }
      try {
        json(response, 200, await manager.status(taskId))
      } catch (error) {
        json(response, 502, { error: publicError(error) })
      }
      return
    }
    if (pathname.startsWith('/api/recognize/status/')) {
      json(response, 400, { error: 'taskId格式不正确。' })
      return
    }
    json(response, 404, { error: '接口不存在。' })
  }
}
