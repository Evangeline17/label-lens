import { ocr } from 'tencentcloud-sdk-nodejs-ocr'
import type {
  LabelImageUpload,
  LabelOcrOutput,
} from '../types.js'
import {
  parseLabelOcrDetections,
  type TencentTextDetection,
} from './labelOcrParser.js'

interface GeneralAccurateOcrResponse {
  TextDetections?: TencentTextDetection[]
}

export interface TencentOcrClientLike {
  GeneralAccurateOCR(request: {
    ImageBase64: string
  }): Promise<GeneralAccurateOcrResponse>
}

interface TencentLabelOcrOptions {
  secretId?: string
  secretKey?: string
  client?: TencentOcrClientLike
}

export class TencentOcrConfigurationError extends Error {
  constructor() {
    super('未配置腾讯云 OCR 服务端凭证，请继续手动录入。')
    this.name = 'TencentOcrConfigurationError'
  }
}

export class TencentOcrRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TencentOcrRequestError'
  }
}

function safeProviderError(error: unknown): string {
  if (!error || typeof error !== 'object') return '腾讯云 OCR 请求失败，请继续手动录入。'
  const candidate = error as { code?: unknown; message?: unknown }
  const code =
    typeof candidate.code === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(candidate.code)
      ? candidate.code
      : null
  const message =
    typeof candidate.message === 'string'
      ? candidate.message
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/(?:SecretId|SecretKey|Authorization)\s*[:=]\s*\S+/gi, '[已隐藏]')
          .trim()
          .slice(0, 240)
      : ''
  return `腾讯云 OCR 请求失败${code ? `（${code}）` : ''}${message ? `：${message}` : '。'}`
}

export class TencentLabelOcrService {
  private readonly client: TencentOcrClientLike

  constructor(options: TencentLabelOcrOptions) {
    if (options.client) {
      this.client = options.client
      return
    }
    const secretId = options.secretId?.trim()
    const secretKey = options.secretKey?.trim()
    if (!secretId || !secretKey) throw new TencentOcrConfigurationError()
    const OcrClient = ocr.v20181119.Client
    this.client = new OcrClient({
      credential: { secretId, secretKey },
      region: 'ap-guangzhou',
      profile: {
        httpProfile: {
          reqMethod: 'POST',
          reqTimeout: 30,
        },
      },
    })
  }

  async recognize(files: LabelImageUpload[]): Promise<LabelOcrOutput> {
    const detections: {
      ingredients?: TencentTextDetection[]
      nutrition?: TencentTextDetection[]
    } = {}
    for (const file of files) {
      try {
        const response = await this.client.GeneralAccurateOCR({
          ImageBase64: file.data.toString('base64'),
        })
        detections[file.kind] = response.TextDetections ?? []
      } catch (error) {
        throw new TencentOcrRequestError(safeProviderError(error))
      }
    }
    return parseLabelOcrDetections(detections)
  }
}
