import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { createAnalyzeApi } from './routes/analyze.js'
import { createOcrLabelApi, type LabelOcrServiceLike } from './routes/ocrLabel.js'
import { createRecognizeApi } from './routes/recognize.js'
import { serveFrontend } from './staticFiles.js'

interface AppHandlerOptions {
  distDir?: string
  getApiKey?: () => string | undefined
  isRecognitionBetaEnabled?: () => boolean
  fetchImpl?: typeof fetch
  getTencentSecretId?: () => string | undefined
  getTencentSecretKey?: () => string | undefined
  ocrService?: LabelOcrServiceLike
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(payload))
}

export function createAppHandler(options: AppHandlerOptions = {}) {
  const distDir = options.distDir ?? resolve(process.cwd(), 'dist')
  const getApiKey = options.getApiKey ?? (() => process.env.INFINISYNAPSE_API_KEY)
  const analyzeApi = createAnalyzeApi({
    getApiKey,
    fetchImpl: options.fetchImpl,
  })
  const recognizeApi = createRecognizeApi({
    getApiKey,
    isEnabled: options.isRecognitionBetaEnabled,
    fetchImpl: options.fetchImpl,
  })
  const ocrLabelApi = createOcrLabelApi({
    getSecretId: options.getTencentSecretId,
    getSecretKey: options.getTencentSecretKey,
    isEnabled: options.isRecognitionBetaEnabled,
    service: options.ocrService,
  })

  return async function appHandler(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const pathname = new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? 'localhost'}`,
    ).pathname

    if (pathname === '/api/health') {
      if (request.method !== 'GET') {
        json(response, 405, { error: '健康检查仅支持 GET。' })
        return
      }
      json(response, 200, {
        status: 'ok',
        service: 'label-lens',
        apiKeyConfigured: Boolean(getApiKey()?.trim()),
      })
      return
    }

    if (pathname === '/api/analyze' || pathname.startsWith('/api/analyze/')) {
      await analyzeApi(request, response, pathname)
      return
    }

    if (pathname === '/api/recognize' || pathname.startsWith('/api/recognize/')) {
      await recognizeApi(request, response, pathname)
      return
    }

    if (pathname === '/api/ocr/label') {
      await ocrLabelApi(request, response)
      return
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      json(response, 404, { error: '接口不存在。' })
      return
    }

    serveFrontend(response, pathname, distDir, request.method)
  }
}
