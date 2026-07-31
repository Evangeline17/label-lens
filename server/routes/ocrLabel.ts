import type { IncomingMessage, ServerResponse } from 'node:http'
import { readRecognitionImages } from '../multipart.js'
import { AnalyzeRateLimiter } from '../rateLimit.js'
import {
  TencentLabelOcrService,
  TencentOcrConfigurationError,
  TencentOcrRequestError,
} from '../services/tencentLabelOcr.js'
import type { LabelImageUpload, LabelOcrOutput } from '../types.js'
import { ValidationError } from '../validation.js'

export interface LabelOcrServiceLike {
  recognize(files: LabelImageUpload[]): Promise<LabelOcrOutput>
}

interface OcrLabelApiOptions {
  getSecretId?: () => string | undefined
  getSecretKey?: () => string | undefined
  isEnabled?: () => boolean
  limiter?: AnalyzeRateLimiter
  service?: LabelOcrServiceLike
}

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
  if (
    error instanceof TencentOcrConfigurationError ||
    error instanceof TencentOcrRequestError
  ) {
    return error.message
  }
  return '腾讯云 OCR 暂时无法处理图片，请保留预览并继续手动录入。'
}

function rateKey(request: IncomingMessage): string {
  const clientId = request.headers['x-label-lens-client-id']
  if (typeof clientId === 'string' && /^[A-Za-z0-9-]{8,100}$/.test(clientId)) {
    return `ocr-browser:${clientId}`
  }
  return `ocr-ip:${request.socket.remoteAddress ?? 'unknown'}`
}

export function createOcrLabelApi(options: OcrLabelApiOptions = {}) {
  const limiter = options.limiter ?? new AnalyzeRateLimiter()
  const getSecretId =
    options.getSecretId ?? (() => process.env.TENCENTCLOUD_SECRET_ID)
  const getSecretKey =
    options.getSecretKey ?? (() => process.env.TENCENTCLOUD_SECRET_KEY)
  const isEnabled =
    options.isEnabled ??
    (() => process.env.VITE_ENABLE_LABEL_RECOGNITION_BETA === 'true')

  return async function ocrLabelApi(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== 'POST') {
      json(response, 405, { error: '包装标签 OCR 接口仅支持 POST。' })
      return
    }
    if (!isEnabled()) {
      json(response, 404, {
        error: '包装标签图片识别 Beta 当前未启用，请继续手动录入。',
      })
      return
    }
    const secretId = getSecretId()?.trim()
    const secretKey = getSecretKey()?.trim()
    if (!options.service && (!secretId || !secretKey)) {
      json(response, 503, {
        error: '未配置腾讯云 OCR 服务端凭证，请继续手动录入。',
      })
      return
    }
    const lease = limiter.acquire(rateKey(request))
    if (!lease) {
      json(response, 429, { error: '图片识别请求过于频繁，请稍后手动重试。' })
      return
    }
    try {
      const files = await readRecognitionImages(request)
      const service =
        options.service ?? new TencentLabelOcrService({ secretId, secretKey })
      const output = await service.recognize(files)
      json(response, 200, output)
    } catch (error) {
      json(
        response,
        error instanceof ValidationError
          ? 400
          : error instanceof TencentOcrConfigurationError
            ? 503
            : 502,
        { error: publicError(error) },
      )
    } finally {
      lease.release()
    }
  }
}
