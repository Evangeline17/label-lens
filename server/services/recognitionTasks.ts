import { randomUUID } from 'node:crypto'
import type {
  LabelImageUpload,
  LabelRecognitionTaskStatusResult,
} from '../types.js'
import { InfiniSynapseService } from './infinisynapse.js'

interface RecognitionTaskManagerOptions {
  getApiKey?: () => string | undefined
  fetchImpl?: typeof fetch
  now?: () => number
  serviceOptions?: {
    totalTimeoutMs?: number
    idleTimeoutMs?: number
    requestTimeoutMs?: number
    connectTimeoutMs?: number
    uploadTimeoutMs?: number
    uploadRequestTimeoutMs?: number
    sseReadyWaitMs?: number
  }
}

interface InternalRecognitionRecord {
  taskId: string
  connId: string
  createdAt: string
  status: LabelRecognitionTaskStatusResult['status']
  progress: string
  imageKinds: Array<LabelImageUpload['kind']>
  result?: LabelRecognitionTaskStatusResult['result']
  error?: string
  localWaitEnded: boolean
  release?: () => void
  released: boolean
}

export class RecognitionTaskManager {
  private readonly records = new Map<string, InternalRecognitionRecord>()
  private readonly getApiKey: () => string | undefined
  private readonly fetchImpl?: typeof fetch
  private readonly now: () => number
  private readonly serviceOptions: RecognitionTaskManagerOptions['serviceOptions']

  constructor(options: RecognitionTaskManagerOptions = {}) {
    this.getApiKey = options.getApiKey ?? (() => process.env.INFINISYNAPSE_API_KEY)
    this.fetchImpl = options.fetchImpl
    this.now = options.now ?? Date.now
    this.serviceOptions = options.serviceOptions
  }

  async start(
    files: LabelImageUpload[],
    options: { release?: () => void } = {},
  ): Promise<LabelRecognitionTaskStatusResult> {
    const apiKey = this.getApiKey()?.trim()
    if (!apiKey) throw new Error('INFINISYNAPSE_API_KEY 未配置')
    const taskId = randomUUID()
    const connId = randomUUID()
    const service = new InfiniSynapseService({
      apiKey,
      fetchImpl: this.fetchImpl,
      ...this.serviceOptions,
    })
    let progress = '正在准备标签图片'
    const submission = await service.submitLabelRecognition(files, {
      taskId,
      connId,
      onProgress: (message) => {
        progress = message
      },
    })
    const record: InternalRecognitionRecord = {
      taskId: submission.taskId,
      connId: submission.connId,
      createdAt: new Date(this.now()).toISOString(),
      status: 'processing',
      progress,
      imageKinds: files.map((file) => file.kind),
      localWaitEnded: false,
      release: options.release,
      released: false,
    }
    this.records.set(submission.taskId, record)
    return this.toStatus(record)
  }

  async status(taskId: string): Promise<LabelRecognitionTaskStatusResult> {
    const record = this.records.get(taskId)
    const apiKey = this.getApiKey()?.trim()
    if (!apiKey) throw new Error('INFINISYNAPSE_API_KEY 未配置')
    const service = new InfiniSynapseService({
      apiKey,
      fetchImpl: this.fetchImpl,
      ...this.serviceOptions,
    })
    const recovered = await service.recoverRecognitionTask(taskId)
    if (!record) return recovered
    if (recovered.status === 'completed') {
      record.status = 'completed'
      record.progress = '识别完成，等待人工确认'
      record.result = recovered.result
      this.release(record)
    } else if (
      ['failed', 'not_found', 'cancelled', 'unknown'].includes(recovered.status)
    ) {
      record.status = recovered.status
      record.error = recovered.error
      this.release(record)
    } else {
      record.status = 'processing'
      record.progress = recovered.progress ?? record.progress
      record.localWaitEnded =
        record.localWaitEnded || Boolean(recovered.localWaitEnded)
    }
    return this.toStatus(record)
  }

  private release(record: InternalRecognitionRecord): void {
    if (record.released) return
    record.released = true
    record.release?.()
  }

  private toStatus(
    record: InternalRecognitionRecord,
  ): LabelRecognitionTaskStatusResult {
    return {
      status: record.status,
      taskId: record.taskId,
      createdAt: record.createdAt,
      progress: record.progress,
      result: record.result,
      error: record.error,
      localWaitEnded: record.localWaitEnded,
      imageKinds: [...record.imageKinds],
    }
  }
}
