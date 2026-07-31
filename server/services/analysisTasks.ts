import { randomUUID } from 'node:crypto'
import { buildCompactAnalyzePayload } from '../compactPayload.js'
import type {
  AnalyzeInput,
  AnalyzeTaskStatusResult,
  CompactPayloadStats,
  TaskInputSummary,
} from '../types.js'
import { InfiniSynapseService } from './infinisynapse.js'

interface TaskManagerOptions {
  getApiKey?: () => string | undefined
  fetchImpl?: typeof fetch
  now?: () => number
  serviceOptions?: {
    totalTimeoutMs?: number
    idleTimeoutMs?: number
    requestTimeoutMs?: number
    connectTimeoutMs?: number
  }
}

interface StartOptions {
  release?: () => void
}

interface InternalTaskRecord {
  taskId: string
  connId: string
  createdAt: string
  status:
    | 'processing'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'not_found'
    | 'format_error'
    | 'unknown'
  progress: string
  inputSummary: TaskInputSummary
  payloadStats: CompactPayloadStats
  service: InfiniSynapseService
  report?: string
  normalized?: boolean
  normalizationWarnings?: string[]
  error?: string
  localWaitEnded: boolean
  release?: () => void
  released: boolean
}

export class AnalysisTaskManager {
  private readonly records = new Map<string, InternalTaskRecord>()
  private readonly getApiKey: () => string | undefined
  private readonly fetchImpl?: typeof fetch
  private readonly now: () => number
  private readonly serviceOptions: TaskManagerOptions['serviceOptions']

  constructor(options: TaskManagerOptions = {}) {
    this.getApiKey = options.getApiKey ?? (() => process.env.INFINISYNAPSE_API_KEY)
    this.fetchImpl = options.fetchImpl
    this.now = options.now ?? Date.now
    this.serviceOptions = options.serviceOptions
  }

  async start(input: AnalyzeInput, options: StartOptions = {}): Promise<AnalyzeTaskStatusResult> {
    const apiKey = this.getApiKey()?.trim()
    if (!apiKey) throw new Error('INFINISYNAPSE_API_KEY 未配置')

    const taskId = randomUUID()
    const connId = randomUUID()
    const createdAt = new Date(this.now()).toISOString()
    const { payload, stats } = buildCompactAnalyzePayload(input)
    const service = new InfiniSynapseService({
      apiKey,
      fetchImpl: this.fetchImpl,
      ...this.serviceOptions,
    })
    const submission = await service.submitAnalysis(input, {
      taskId,
      connId,
      compactPayload: payload,
    })
    const record: InternalTaskRecord = {
      taskId: submission.taskId,
      connId: submission.connId,
      createdAt,
      status: 'processing',
      progress: '任务已提交，等待 InfiniSynapse 完成分析',
      inputSummary: {
        goal: input.goal,
        productCount: input.products.length,
        payloadStats: stats,
      },
      payloadStats: stats,
      service,
      localWaitEnded: false,
      release: options.release,
      released: false,
    }
    this.records.set(submission.taskId, record)
    return this.toStatus(record)
  }

  async status(taskId: string): Promise<AnalyzeTaskStatusResult> {
    const record = this.records.get(taskId)
    const apiKey = this.getApiKey()?.trim()
    if (!apiKey) throw new Error('INFINISYNAPSE_API_KEY 未配置')
    const service = new InfiniSynapseService({
      apiKey,
      fetchImpl: this.fetchImpl,
      ...this.serviceOptions,
    })
    const recovered = await service.recoverTask(taskId)

    if (!record) return recovered
    if (recovered.status === 'completed') {
      record.status = 'completed'
      record.report = recovered.report
      record.normalized = recovered.normalized
      record.normalizationWarnings = recovered.normalizationWarnings
      record.progress = '分析完成'
      this.release(record)
    } else if (recovered.status === 'failed') {
      record.status = recovered.status
      record.error = recovered.error
      this.release(record)
    } else if (recovered.status === 'not_found') {
      record.status = 'not_found'
      this.release(record)
    } else if (recovered.status === 'format_error') {
      record.status = 'format_error'
      record.error = recovered.error
      this.release(record)
    } else if (recovered.status === 'unknown') {
      record.status = 'unknown'
      record.error = recovered.error
      this.release(record)
    } else {
      record.status = 'processing'
      record.localWaitEnded = record.localWaitEnded || Boolean(recovered.localWaitEnded)
      record.progress = recovered.progress ?? record.progress
    }
    return this.toStatus(record)
  }

  async cancel(taskId: string): Promise<AnalyzeTaskStatusResult> {
    const record = this.records.get(taskId)
    if (!record) return { status: 'not_found', taskId }
    if (record.status !== 'processing') return this.toStatus(record)

    await record.service.cancelTask(taskId)
    record.status = 'cancelled'
    record.progress = '任务已由用户取消'
    this.release(record)
    return this.toStatus(record)
  }

  inspectTask(taskId: string):
    | {
        taskId: string
        connId: string
        createdAt: string
        status: string
        inputSummary: TaskInputSummary
        payloadStats: CompactPayloadStats
        localWaitEnded: boolean
      }
    | undefined {
    const record = this.records.get(taskId)
    if (!record) return undefined
    return {
      taskId: record.taskId,
      connId: record.connId,
      createdAt: record.createdAt,
      status: record.status,
      inputSummary: record.inputSummary,
      payloadStats: record.payloadStats,
      localWaitEnded: record.localWaitEnded,
    }
  }

  private release(record: InternalTaskRecord): void {
    if (record.released) return
    record.released = true
    record.release?.()
  }

  private toStatus(record: InternalTaskRecord): AnalyzeTaskStatusResult {
    return {
      status: record.status,
      taskId: record.taskId,
      createdAt: record.createdAt,
      progress: record.progress,
      report: record.report,
      error: record.error,
      localWaitEnded: record.localWaitEnded,
      normalized: record.normalized,
      normalizationWarnings: record.normalizationWarnings,
    }
  }
}
