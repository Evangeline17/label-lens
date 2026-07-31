import { randomUUID } from 'node:crypto'
import { buildCompactAnalyzePayload } from '../compactPayload.js'
import { buildLabelRecognitionPrompt } from '../prompts/labelRecognition.js'
import { buildProductComparisonPrompt } from '../prompts/productComparison.js'
import {
  parseLabelRecognitionJson,
  RecognitionFormatError,
} from '../recognitionSchema.js'
import {
  agentMessageText,
  isCompletionMessage,
  isFinalUserVisibleMessage,
  isVisibleSayTextMessage,
  REPORT_TITLE,
  ReportFormatError,
  REQUIRED_REPORT_HEADINGS,
  validateAndNormalizeReport,
} from './reportExtraction.js'
import type { ValidatedReport } from './reportExtraction.js'
import type {
  AgentMessage,
  AnalyzeInput,
  AnalyzeTaskStatusResult,
  CompactAnalyzePayload,
  InfiniSynapseResult,
  LabelImageUpload,
  LabelRecognitionResult,
  LabelRecognitionTaskStatusResult,
  ParsedSseEvent,
} from '../types.js'

const DEFAULT_BASE_URL = 'https://app.infinisynapse.cn'
const COMPLETION_MARKER = 'completion_result'

interface ServiceOptions {
  apiKey: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  requestTimeoutMs?: number
  connectTimeoutMs?: number
  totalTimeoutMs?: number
  idleTimeoutMs?: number
  uploadTimeoutMs?: number
  uploadRequestTimeoutMs?: number
  sseReadyWaitMs?: number
}

interface RunOptions {
  signal?: AbortSignal
  onProgress?: (message: string) => void
  onDispatched?: () => void
  taskId?: string
  connId?: string
  compactPayload?: CompactAnalyzePayload
  uploadFiles?: LabelImageUpload[]
  progressStages?: string[]
}

interface Envelope<T> {
  code?: number
  message?: string
  data?: T
}

interface TaskUploadData {
  name: string
  size: number
  logicalPath: string
  assetId: string
}

interface RecognitionTaskFile extends TaskUploadData {
  type: LabelImageUpload['contentType']
  fileType: 'reference'
}

class InfiniSynapseError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly httpStatus?: number,
  ) {
    super(message)
    this.name = 'InfiniSynapseError'
  }
}

class LocalWaitTimeoutError extends Error {
  constructor() {
    super('本地等待时间已结束')
    this.name = 'LocalWaitTimeoutError'
  }
}

export class AnalysisStillProcessingError extends Error {
  constructor(message = '任务仍可能在 InfiniSynapse 后台运行，可以继续查询结果。') {
    super(message)
    this.name = 'AnalysisStillProcessingError'
  }
}

export class InfiniSynapseTaskFailedError extends Error {
  constructor(message = 'InfiniSynapse 上游任务明确失败。') {
    super(message)
    this.name = 'InfiniSynapseTaskFailedError'
  }
}

export class RecognitionUploadFlowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecognitionUploadFlowError'
  }
}

class SseParser {
  private buffer = ''
  private eventName = ''
  private dataLines: string[] = []

  push(chunk: string): ParsedSseEvent[] {
    this.buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const events: ParsedSseEvent[] = []
    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex)
      this.buffer = this.buffer.slice(newlineIndex + 1)
      const event = this.consumeLine(line)
      if (event) events.push(event)
      newlineIndex = this.buffer.indexOf('\n')
    }
    return events
  }

  flush(): ParsedSseEvent[] {
    const events: ParsedSseEvent[] = []
    if (this.buffer) {
      const event = this.consumeLine(this.buffer)
      this.buffer = ''
      if (event) events.push(event)
    }
    const tail = this.dispatch()
    if (tail) events.push(tail)
    return events
  }

  private consumeLine(line: string): ParsedSseEvent | null {
    if (line === '') return this.dispatch()
    if (line.startsWith(':')) return null
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') this.eventName = value
    if (field === 'data') this.dataLines.push(value)
    return null
  }

  private dispatch(): ParsedSseEvent | null {
    if (!this.eventName && !this.dataLines.length) return null
    const raw = this.dataLines.join('\n').trim()
    let data: unknown = raw
    if (raw && ['{', '[', '"'].includes(raw[0])) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = raw
      }
    }
    const event = { event: this.eventName || 'message', data }
    this.eventName = ''
    this.dataLines = []
    return event
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function submissionError(value: unknown): string {
  if (!isRecord(value)) return 'InfiniSynapse 未明确确认任务提交成功。'
  const notification = isRecord(value.notification) ? value.notification : null
  const candidate = value.error ?? value.message ?? notification?.message ?? notification?.title
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim().slice(0, 500)
    : 'InfiniSynapse 未明确确认任务提交成功。'
}

function assertSubmissionAccepted(value: unknown): void {
  if (isRecord(value) && value.success === true) return
  throw new InfiniSynapseError(submissionError(value))
}

function extractMessage(data: unknown): AgentMessage | null {
  if (!isRecord(data)) return null
  const candidate = isRecord(data.message) ? data.message : data
  return candidate as AgentMessage
}

function belongsToTask(data: unknown, taskId: string): boolean {
  if (!isRecord(data) || data.taskId === undefined || data.taskId === null) return true
  return String(data.taskId) === taskId
}

function isSuccessNotification(data: unknown): boolean {
  if (!isRecord(data) || data.type !== 'success') return false
  const text = `${String(data.title ?? '')} ${String(data.message ?? '')}`
  return /完成|成功|completed|success/i.test(text)
}

function extractErrorText(data: unknown): string {
  if (!isRecord(data)) return 'InfiniSynapse 任务执行失败。'
  const message = data.message ?? data.title ?? data.text
  return typeof message === 'string' && message.trim()
    ? message.trim().slice(0, 500)
    : 'InfiniSynapse 任务执行失败。'
}

function normalizeWorkspacePaths(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.files)) return []
  return value.files
    .map((file) => {
      if (typeof file === 'string') return file
      if (!isRecord(file)) return ''
      const path = file.path ?? file.name
      return typeof path === 'string' ? path : ''
    })
    .filter(Boolean)
}

function rankMarkdownPath(path: string): number {
  const normalized = path.replaceAll('\\', '/').toLowerCase()
  if (!normalized.endsWith('.md')) return -1
  if (/(^|\/)final\/(?:report|result|answer|final)\.md$/.test(normalized)) return 6
  if (/^final\/|\/final\//.test(normalized)) return 5
  if (/(^|\/)(report|result|answer|final)\.md$/.test(normalized)) return 4
  if (/(^|\/)(?:final[-_])?report[-_][^/]+\.md$/.test(normalized)) return 3
  return -1
}

function collectMessages(value: unknown, output: AgentMessage[] = []): AgentMessage[] {
  if (Array.isArray(value)) {
    for (const item of value) collectMessages(item, output)
    return output
  }
  if (!isRecord(value)) return output
  const candidate = value as AgentMessage
  if (
    agentMessageText(candidate) &&
    [candidate.type, candidate.say, candidate.ask].some(
      (kind) => typeof kind === 'string',
    )
  ) {
    output.push({ ...candidate, text: agentMessageText(candidate)! })
  } else if (
    [candidate.say, candidate.ask, candidate.type].some(
      (kind) => kind === COMPLETION_MARKER,
    )
  ) {
    output.push(candidate)
  }
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') collectMessages(nested, output)
  }
  return output
}

function collectStatusStrings(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectStatusStrings(item, output)
    return output
  }
  if (!isRecord(value)) return output
  for (const [key, nested] of Object.entries(value)) {
    if (
      ['status', 'state', 'taskStatus'].includes(key) &&
      typeof nested === 'string' &&
      nested.trim()
    ) {
      output.push(nested.trim().toLowerCase())
    } else if (nested && typeof nested === 'object') {
      collectStatusStrings(nested, output)
    }
  }
  return output
}

function explicitFailure(value: unknown): string | null {
  const messages = collectMessages(value)
  const apiFailure = messages.find((message) => message.ask === 'api_req_failed')
  if (apiFailure) {
    return /insufficient account balance/i.test(apiFailure.text ?? '')
      ? 'InfiniSynapse 账户余额或额度不足。'
      : 'InfiniSynapse 上游任务明确失败。'
  }
  const statuses = collectStatusStrings(value)
  if (statuses.some((status) => ['failed', 'failure', 'error'].includes(status))) {
    return 'InfiniSynapse 任务明确失败。'
  }
  if (statuses.some((status) => ['cancelled', 'canceled'].includes(status))) {
    return 'InfiniSynapse 任务已取消。'
  }
  return null
}

function recognitionUploadFollowup(value: unknown): string | null {
  const messages = collectMessages(value)
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (
      message.type === 'ask' &&
      message.ask === 'followup' &&
      message.partial !== true &&
      /上传|图片|文件|upload|image|file/i.test(agentMessageText(message) ?? '')
    ) {
      return 'InfiniSynapse 未返回官方 upload_file_to_sandbox 上传事件，而是进入了普通文件追问；本次识别无法继续，请放弃本次识别并改为手动录入。'
    }
  }
  return null
}

const COMPLETED_STATUSES = new Set([
  'completed',
  'complete',
  'success',
  'succeeded',
  'finished',
  'done',
])
const RUNNING_STATUSES = new Set([
  'processing',
  'running',
  'pending',
  'waiting',
  'queued',
  'created',
  'in_progress',
  'in-progress',
])

function taskStatuses(value: unknown): string[] {
  return [...new Set(collectStatusStrings(value))]
}

function hasStatus(statuses: string[], accepted: Set<string>): boolean {
  return statuses.some((status) => accepted.has(status))
}

function safeUnknownStatus(statuses: string[]): string {
  if (statuses.length) {
    return `InfiniSynapse 返回了尚未识别的任务状态：${statuses.slice(0, 3).join('、')}。`
  }
  return 'InfiniSynapse 未返回可识别的任务状态或完成标记。'
}

interface ValidReportCandidate {
  report: string
  normalized: boolean
  normalizationWarnings: string[]
  order: number
  sourceRank?: number
}

function reportSectionCount(report: string): number {
  const headings = [REPORT_TITLE, ...REQUIRED_REPORT_HEADINGS]
  const lines = new Set(report.split('\n').map((line) => line.trimEnd()))
  return headings.filter((heading) => lines.has(heading)).length
}

function bestReportCandidate(
  candidates: ValidReportCandidate[],
): ValidReportCandidate | null {
  const best = [...candidates].sort((left, right) => {
    const sourceDifference = (right.sourceRank ?? 0) - (left.sourceRank ?? 0)
    if (sourceDifference) return sourceDifference
    const sectionDifference =
      reportSectionCount(right.report) - reportSectionCount(left.report)
    if (sectionDifference) return sectionDifference
    const lengthDifference = right.report.length - left.report.length
    if (lengthDifference) return lengthDifference
    return right.order - left.order
  })[0]
  return best ?? null
}

export class InfiniSynapseService {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly requestTimeoutMs: number
  private readonly connectTimeoutMs: number
  private readonly totalTimeoutMs: number
  private readonly idleTimeoutMs: number
  private readonly uploadTimeoutMs: number
  private readonly uploadRequestTimeoutMs: number
  private readonly sseReadyWaitMs: number

  constructor(options: ServiceOptions) {
    if (!options.apiKey.trim()) throw new Error('INFINISYNAPSE_API_KEY 未配置')
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000
    this.connectTimeoutMs = options.connectTimeoutMs ?? 30_000
    this.totalTimeoutMs = options.totalTimeoutMs ?? 720_000
    this.idleTimeoutMs = options.idleTimeoutMs ?? 60_000
    this.uploadTimeoutMs = options.uploadTimeoutMs ?? 120_000
    this.uploadRequestTimeoutMs = options.uploadRequestTimeoutMs ?? 45_000
    this.sseReadyWaitMs = options.sseReadyWaitMs ?? 250
  }

  async submitAnalysis(
    input: AnalyzeInput,
    options: RunOptions = {},
  ): Promise<{ taskId: string; connId: string }> {
    const taskId = options.taskId ?? randomUUID()
    const connId = options.connId ?? randomUUID()
    const compactPayload = options.compactPayload ?? buildCompactAnalyzePayload(input).payload
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', onExternalAbort, { once: true })
    let stream: ReadableStream<Uint8Array> | undefined
    try {
      stream = await this.openEvents(connId, controller.signal)
      const submission = await this.request('/api/ai/message', {
        method: 'POST',
        body: {
          type: 'newTask',
          text: buildProductComparisonPrompt(compactPayload),
          connId,
          taskId,
          chatSettings: { mode: 'act' },
        },
        signal: controller.signal,
      })
      assertSubmissionAccepted(submission)
      options.onDispatched?.()
      return { taskId, connId }
    } finally {
      options.signal?.removeEventListener('abort', onExternalAbort)
      if (stream) {
        try {
          await stream.cancel('analysis submission acknowledged')
        } catch {
          // The task submission result is authoritative; stream cleanup must not mask it.
        }
      }
    }
  }

  async analyze(input: AnalyzeInput, options: RunOptions = {}): Promise<InfiniSynapseResult> {
    const taskId = options.taskId ?? randomUUID()
    const connId = options.connId ?? randomUUID()
    const compactPayload = options.compactPayload ?? buildCompactAnalyzePayload(input).payload
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', onExternalAbort, { once: true })
    const totalTimer = setTimeout(
      () => controller.abort(new LocalWaitTimeoutError()),
      this.totalTimeoutMs,
    )
    try {
      options.onProgress?.('正在建立安全分析连接')
      const stream = await this.openEvents(connId, controller.signal)
      const submission = await this.request('/api/ai/message', {
        method: 'POST',
        body: {
          type: 'newTask',
          text: buildProductComparisonPrompt(compactPayload),
          connId,
          taskId,
          chatSettings: { mode: 'act' },
        },
        signal: controller.signal,
      })
      assertSubmissionAccepted(submission)
      options.onDispatched?.()
      options.onProgress?.('正在分析产品取舍')

      const finalMessageCandidates = await this.consumeEvents(
        stream,
        taskId,
        connId,
        controller.signal,
        {
        onProgress: options.onProgress,
        },
      )
      options.onProgress?.('正在读取最终报告')
      const resolved = await this.resolveReport(
        taskId,
        finalMessageCandidates,
        controller.signal,
        compactPayload,
      )
      return { taskId, ...resolved }
    } catch (error) {
      const abortReason = controller.signal.reason
      if (error instanceof AnalysisStillProcessingError) throw error
      if (abortReason instanceof LocalWaitTimeoutError) {
        throw new AnalysisStillProcessingError()
      }
      if (options.signal?.aborted) throw new InfiniSynapseError('分析请求已取消。')
      if (controller.signal.aborted) {
        throw new InfiniSynapseError(
          abortReason instanceof Error ? abortReason.message : 'InfiniSynapse 本地连接已中断。',
        )
      }
      throw error
    } finally {
      clearTimeout(totalTimer)
      options.signal?.removeEventListener('abort', onExternalAbort)
    }
  }

  async submitLabelRecognition(
    files: LabelImageUpload[],
    options: RunOptions = {},
  ): Promise<{ taskId: string; connId: string }> {
    if (!files.length || files.length > 2) {
      throw new RecognitionFormatError(['识别任务必须包含1至2张标签图片'])
    }
    const taskId = options.taskId ?? randomUUID()
    const connId = options.connId ?? randomUUID()
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', onExternalAbort, { once: true })
    const uploadFiles = files.map((file) => ({ ...file, data: Buffer.from(file.data) }))
    for (const file of files) file.data.fill(0)
    let stream: ReadableStream<Uint8Array> | undefined
    try {
      const taskFiles: RecognitionTaskFile[] = []
      for (const [index, file] of uploadFiles.entries()) {
        const label = file.kind === 'ingredients' ? '配料表图片' : '营养成分表图片'
        options.onProgress?.(`正在主动上传第 ${index + 1} 张图片（${label}）`)
        try {
          const uploaded = await this.taskUpload(taskId, file, controller.signal)
          taskFiles.push({
            name: uploaded.name,
            size: uploaded.size,
            type: file.contentType,
            logicalPath: uploaded.logicalPath,
            assetId: uploaded.assetId,
            fileType: 'reference',
          })
        } catch (error) {
          const httpStatus =
            error instanceof InfiniSynapseError ? error.httpStatus : undefined
          throw new RecognitionUploadFlowError(
            `${label}主动上传失败${httpStatus ? `（HTTP ${httpStatus}）` : ''}；未创建识别任务。`,
          )
        }
      }

      options.onProgress?.('图片主动上传完成，正在建立安全识别连接')
      stream = await this.openEvents(connId, controller.signal)
      await this.waitForSseReadyWindow(controller.signal)
      const submission = await this.request('/api/ai/message', {
        method: 'POST',
        body: {
          type: 'newTask',
          text: buildLabelRecognitionPrompt(
            uploadFiles.map(({ kind }, index) => ({
              kind,
              filename: taskFiles[index].name,
            })),
          ),
          connId,
          taskId,
          images: [],
          files: taskFiles,
          chatSettings: { mode: 'act' },
          autoApprovalSettings: {
            enableReadImage: true,
            enableWebSearch: false,
            enableBrowser: false,
            enableNativeToolCalling: true,
          },
        },
        signal: controller.signal,
      })
      assertSubmissionAccepted(submission)
      options.onDispatched?.()
      options.onProgress?.('识别任务已提交，等待 InfiniSynapse 完成识别')
      return { taskId, connId }
    } finally {
      options.signal?.removeEventListener('abort', onExternalAbort)
      if (stream) {
        try {
          await stream.cancel('label recognition submission acknowledged')
        } catch {
          // The accepted newTask result is authoritative; cleanup must not mask it.
        }
      }
      for (const file of uploadFiles) file.data.fill(0)
    }
  }

  private async waitForSseReadyWindow(signal: AbortSignal): Promise<void> {
    if (this.sseReadyWaitMs <= 0) return
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(signal.reason ?? new Error('SSE 准备等待已中断'))
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, this.sseReadyWaitMs)
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  private authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'x-lang': 'zh_CN',
      ...extra,
    }
  }

  private async openEvents(connId: string, parentSignal: AbortSignal) {
    const controller = new AbortController()
    const onAbort = () => controller.abort(parentSignal.reason)
    parentSignal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => controller.abort(new Error('SSE 连接超时')), this.connectTimeoutMs)
    try {
      const url = new URL(`${this.baseUrl}/api/ai/events`)
      url.searchParams.set('connId', connId)
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: this.authHeaders({ Accept: 'text/event-stream' }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        throw new InfiniSynapseError(
          `无法建立 InfiniSynapse SSE 连接（HTTP ${response.status}）。`,
          undefined,
          response.status,
        )
      }
      return response.body
    } finally {
      clearTimeout(timer)
    }
  }

  private async request(
    path: string,
    options: { method: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal },
  ): Promise<unknown> {
    const controller = new AbortController()
    const onAbort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(
      () => controller.abort(new Error('InfiniSynapse 接口请求超时')),
      this.requestTimeoutMs,
    )
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: this.authHeaders(
          options.body === undefined ? {} : { 'Content-Type': 'application/json' },
        ),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      })
      const text = await response.text()
      let parsed: unknown = {}
      try {
        parsed = text ? JSON.parse(text) : {}
      } catch {
        throw new InfiniSynapseError(`InfiniSynapse 返回了无法解析的响应（HTTP ${response.status}）。`)
      }
      const envelope = parsed as Envelope<unknown>
      if (!response.ok) {
        throw new InfiniSynapseError(
          envelope.message || `InfiniSynapse 接口请求失败（HTTP ${response.status}）。`,
          envelope.code,
          response.status,
        )
      }
      if (typeof envelope.code === 'number' && envelope.code !== 200) {
        if (envelope.code === 1101 || envelope.code === 1105) {
          throw new InfiniSynapseError('InfiniSynapse API Key 无效或已过期。', envelope.code)
        }
        throw new InfiniSynapseError(
          envelope.message || `InfiniSynapse 返回业务错误码 ${envelope.code}。`,
          envelope.code,
          response.status,
        )
      }
      return envelope.code === 200 && 'data' in envelope ? envelope.data : parsed
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
    }
  }

  private async taskUpload(
    taskId: string,
    file: LabelImageUpload,
    signal?: AbortSignal,
  ): Promise<TaskUploadData> {
    const controller = new AbortController()
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(
      () => controller.abort(new Error('InfiniSynapse 图片主动上传超时')),
      this.uploadTimeoutMs,
    )
    try {
      const form = new FormData()
      form.append(
        'file',
        new Blob([new Uint8Array(file.data)], { type: file.contentType }),
        file.filename,
      )
      const url = new URL(
        `${this.baseUrl}/api/tools/taskUpload/${encodeURIComponent(taskId)}`,
      )
      url.searchParams.set('subdir', 'label_inputs')
      url.searchParams.set('naming', 'original')
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: this.authHeaders(),
        body: form,
        signal: controller.signal,
      })
      const text = await response.text()
      let parsed: unknown
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        throw new InfiniSynapseError(
          `InfiniSynapse 图片主动上传返回了无法解析的响应（HTTP ${response.status}）。`,
          undefined,
          response.status,
        )
      }
      const envelope = isRecord(parsed) ? parsed : null
      const code = typeof envelope?.code === 'number' ? envelope.code : undefined
      if (!response.ok) {
        throw new InfiniSynapseError(
          `InfiniSynapse 图片主动上传失败（HTTP ${response.status}）。`,
          code,
          response.status,
        )
      }
      if (code !== 200) {
        throw new InfiniSynapseError(
          code === undefined
            ? 'InfiniSynapse 图片主动上传未返回统一成功信封。'
            : `InfiniSynapse 图片主动上传返回业务错误码 ${code}。`,
          code,
          response.status,
        )
      }
      const data = isRecord(envelope?.data) ? envelope.data : null
      const name = typeof data?.name === 'string' ? data.name.trim() : ''
      const logicalPath =
        typeof data?.logicalPath === 'string' ? data.logicalPath.trim() : ''
      const assetId = typeof data?.assetId === 'string' ? data.assetId.trim() : ''
      const size = typeof data?.size === 'number' ? data.size : Number.NaN
      if (
        !name ||
        !logicalPath ||
        !assetId ||
        !Number.isFinite(size) ||
        size < 0
      ) {
        throw new InfiniSynapseError(
          'InfiniSynapse 图片主动上传响应缺少有效的 name、size、logicalPath 或 assetId。',
          code,
          response.status,
        )
      }
      return { name, size, logicalPath, assetId }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  private async uploadToSandbox(
    taskId: string,
    file: LabelImageUpload,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const controller = new AbortController()
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(
      () => controller.abort(new Error('InfiniSynapse 图片上传超时')),
      this.uploadTimeoutMs,
    )
    try {
      const form = new FormData()
      form.append(
        'file',
        new Blob([new Uint8Array(file.data)], { type: file.contentType }),
        file.filename,
      )
      const url = new URL(`${this.baseUrl}/api/ai/upload`)
      url.searchParams.set('taskId', taskId)
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: this.authHeaders(),
        body: form,
        signal: controller.signal,
      })
      const text = await response.text()
      let parsed: unknown = {}
      try {
        parsed = text ? JSON.parse(text) : {}
      } catch {
        throw new InfiniSynapseError(
          `InfiniSynapse 图片上传返回了无法解析的响应（HTTP ${response.status}）。`,
        )
      }
      const envelope = parsed as Envelope<unknown>
      if (!response.ok) {
        throw new InfiniSynapseError(
          envelope.message || `InfiniSynapse 图片上传失败（HTTP ${response.status}）。`,
          envelope.code,
          response.status,
        )
      }
      if (typeof envelope.code === 'number' && envelope.code !== 200) {
        throw new InfiniSynapseError(
          envelope.message || `InfiniSynapse 图片上传返回业务错误码 ${envelope.code}。`,
          envelope.code,
          response.status,
        )
      }
      return envelope.code === 200 && 'data' in envelope ? envelope.data : parsed
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  private async consumeEvents(
    stream: ReadableStream<Uint8Array>,
    taskId: string,
    connId: string,
    signal: AbortSignal,
    options: RunOptions,
  ): Promise<string[]> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    const parser = new SseParser()
    const finalMessageCandidates: string[] = []
    const handledUploadRequests = new Set<number | string>()
    const pendingUploads = [...(options.uploadFiles ?? [])]
    const totalUploadCount = pendingUploads.length
    let uploadedCount = 0
    let progressStage = 0
    let completed = false
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let uploadRequestTimer: ReturnType<typeof setTimeout> | undefined
    let uploadWaitError: RecognitionUploadFlowError | null = null
    const armIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        void reader.cancel('SSE idle timeout')
      }, this.idleTimeoutMs)
    }
    const armUploadRequestTimer = () => {
      if (uploadRequestTimer) clearTimeout(uploadRequestTimer)
      if (!pendingUploads.length) return
      uploadRequestTimer = setTimeout(() => {
        uploadWaitError = new RecognitionUploadFlowError(
          uploadedCount === 0
            ? '等待 InfiniSynapse 返回 upload_file_to_sandbox 上传事件超时；没有图片被上传，请放弃本次识别并改为手动录入。'
            : `第 ${uploadedCount} 张图片已上传，但等待下一张图片的 upload_file_to_sandbox 事件超时；本次识别未继续。`,
        )
        void reader.cancel('recognition upload request timeout')
      }, this.uploadRequestTimeoutMs)
    }

    const handleEvent = async (event: ParsedSseEvent): Promise<void> => {
      armIdleTimer()
      if (!belongsToTask(event.data, taskId)) return
      if (event.event === 'notification') {
        if (isRecord(event.data) && event.data.type === 'error') {
          throw new InfiniSynapseTaskFailedError(extractErrorText(event.data))
        }
        if (isSuccessNotification(event.data)) completed = true
        return
      }
      if (!['message.add', 'message.partial', 'message.update'].includes(event.event)) return
      const message = extractMessage(event.data)
      if (!message) return
      if (message.ask === 'api_req_failed') {
        throw new InfiniSynapseTaskFailedError(
          message.text?.trim() || 'InfiniSynapse 上游模型请求失败。',
        )
      }
      const messageText = agentMessageText(message)
      if (
        pendingUploads.length &&
        message.type === 'ask' &&
        message.ask === 'followup' &&
        message.partial !== true &&
        /上传|图片|文件|upload|image|file/i.test(messageText ?? '')
      ) {
        throw new RecognitionUploadFlowError(
          'InfiniSynapse 未返回官方 upload_file_to_sandbox 上传事件，而是进入了普通文件追问；本次识别无法继续，请放弃本次识别并改为手动录入。',
        )
      }
      if (messageText) {
        const stages = options.progressStages ?? [
          '正在核对不同目标下的排名',
          '正在整理包装宣传提醒',
          '正在生成最终购买建议',
        ]
        options.onProgress?.(stages[Math.min(progressStage, stages.length - 1)])
        progressStage += 1
      }
      if (message.type === 'ask' && message.ask === 'upload_file_to_sandbox') {
        const key = typeof message.ts === 'number' ? message.ts : messageText ?? 'upload'
        if (!handledUploadRequests.has(key)) {
          handledUploadRequests.add(key)
          if (uploadRequestTimer) clearTimeout(uploadRequestTimer)
          const requestedKind = /nutrition|营养/i.test(messageText ?? '')
            ? 'nutrition'
            : /ingredient|配料/i.test(messageText ?? '')
              ? 'ingredients'
              : null
          const matchedIndex =
            requestedKind === null
              ? -1
              : pendingUploads.findIndex((file) => file.kind === requestedKind)
          const requestedIndex = matchedIndex >= 0 ? matchedIndex : 0
          const file =
            requestedIndex >= 0 ? pendingUploads.splice(requestedIndex, 1)[0] : undefined
          let uploaded: unknown = {}
          if (file) {
            const uploadNumber = uploadedCount + 1
            const label = file.kind === 'ingredients' ? '配料表图片' : '营养成分表图片'
            options.onProgress?.(
              `正在上传第 ${uploadNumber} 张图片（${label}）`,
            )
            try {
              uploaded = await this.uploadToSandbox(taskId, file, signal)
              uploadedCount += 1
            } catch (error) {
              const httpStatus =
                error instanceof InfiniSynapseError ? error.httpStatus : undefined
              throw new RecognitionUploadFlowError(
                `${label}上传失败${httpStatus ? `（HTTP ${httpStatus}）` : ''}；本次识别未继续。`,
              )
            } finally {
              file.data.fill(0)
            }
          }
          await this.request('/api/ai/message', {
            method: 'POST',
            body: {
              type: 'askResponse',
              askResponse: 'messageResponse',
              taskId,
              connId,
              text: JSON.stringify(uploaded),
            },
            signal,
          })
          if (pendingUploads.length) {
            options.onProgress?.(
              `第 ${uploadedCount} 张图片上传完成，等待下一张图片上传请求`,
            )
            armUploadRequestTimer()
          } else if (uploadedCount === totalUploadCount) {
            options.onProgress?.('图片上传完成，等待识别')
          } else {
            options.onProgress?.('未提供更多图片，已告知识别任务继续')
          }
        }
      }
      if (message.say === COMPLETION_MARKER || message.ask === COMPLETION_MARKER) {
        if (isFinalUserVisibleMessage(message) && messageText) {
          finalMessageCandidates.push(messageText)
        }
        completed = true
      }
    }

    try {
      armIdleTimer()
      armUploadRequestTimer()
      while (!completed) {
        if (signal.aborted) throw signal.reason
        const { done, value } = await reader.read()
        if (done) break
        const events = parser.push(decoder.decode(value, { stream: true }))
        for (const event of events) {
          await handleEvent(event)
          if (completed) break
        }
      }
      if (uploadWaitError) throw uploadWaitError
      if (!completed) {
        for (const event of parser.flush()) await handleEvent(event)
      }
      if (!completed) {
        throw new AnalysisStillProcessingError(
          'SSE 连接已中断，但任务仍可能在 InfiniSynapse 后台运行，可以继续查询结果。',
        )
      }
      return finalMessageCandidates
    } finally {
      if (idleTimer) clearTimeout(idleTimer)
      if (uploadRequestTimer) clearTimeout(uploadRequestTimer)
      try {
        await reader.cancel()
      } catch {
        // The stream may already be closed.
      }
      reader.releaseLock()
    }
  }

  async recoverTask(taskId: string, signal?: AbortSignal): Promise<AnalyzeTaskStatusResult> {
    const notFound = new Set<string>()
    let taskInfo: unknown
    let uiMessages: unknown
    let workspace: unknown

    const read = async (key: string, path: string) => {
      try {
        return await this.request(path, { method: 'GET', signal })
      } catch (error) {
        if (
          error instanceof InfiniSynapseError &&
          (error.httpStatus === 404 || error.code === 404)
        ) {
          notFound.add(key)
          return null
        }
        return null
      }
    }

    taskInfo = await read(
      'taskInfo',
      `/api/ai_task/getTaskInfo/${encodeURIComponent(taskId)}`,
    )
    uiMessages = await read(
      'uiMessages',
      `/api/ai_task/getUiMessageById?id=${encodeURIComponent(taskId)}`,
    )
    workspace = await read(
      'workspace',
      `/api/ai_task/getTaskWorkspace/${encodeURIComponent(taskId)}`,
    )

    const formatErrors: string[] = []
    const statuses = taskStatuses(taskInfo)
    const completionMessages = collectMessages(uiMessages)
    const hasCompletionResult = completionMessages.some(isCompletionMessage)
    const hasCompletedStatus = hasStatus(statuses, COMPLETED_STATUSES)
    if (workspace) {
      const workspaceReport = await this.resolveWorkspaceReport(
        taskId,
        workspace,
        signal,
        formatErrors,
      )
      if (workspaceReport) return { status: 'completed', taskId, ...workspaceReport }
    }

    if (uiMessages) {
      const uiReport = this.resolveUiReport(
        uiMessages,
        formatErrors,
        hasCompletedStatus || hasCompletionResult,
      )
      if (uiReport) return { status: 'completed', taskId, ...uiReport }
    }

    const failure = explicitFailure([taskInfo, uiMessages])
    if (failure) return { status: 'failed', taskId, error: failure }
    if (notFound.size === 3) return { status: 'not_found', taskId }
    if (hasCompletedStatus || hasCompletionResult) {
      return {
        status: 'format_error',
        taskId,
        error: '任务已完成，但最终报告格式未通过校验。',
      }
    }
    if (hasStatus(statuses, RUNNING_STATUSES)) {
      return {
        status: 'processing',
        taskId,
        progress: 'InfiniSynapse 正在后台分析。',
        localWaitEnded: true,
      }
    }

    return {
      status: 'unknown',
      taskId,
      error: safeUnknownStatus(statuses),
    }
  }

  async recoverRecognitionTask(
    taskId: string,
    signal?: AbortSignal,
  ): Promise<LabelRecognitionTaskStatusResult> {
    const notFound = new Set<string>()
    const read = async (key: string, path: string) => {
      try {
        return await this.request(path, { method: 'GET', signal })
      } catch (error) {
        if (
          error instanceof InfiniSynapseError &&
          (error.httpStatus === 404 || error.code === 404)
        ) {
          notFound.add(key)
        }
        return null
      }
    }
    const taskInfo = await read(
      'taskInfo',
      `/api/ai_task/getTaskInfo/${encodeURIComponent(taskId)}`,
    )
    const uiMessages = await read(
      'uiMessages',
      `/api/ai_task/getUiMessageById?id=${encodeURIComponent(taskId)}`,
    )
    const workspace = await read(
      'workspace',
      `/api/ai_task/getTaskWorkspace/${encodeURIComponent(taskId)}`,
    )
    const formatErrors: string[] = []
    const statuses = taskStatuses(taskInfo)
    const hasCompletionResult = collectMessages(uiMessages).some(isCompletionMessage)
    const hasCompletedStatus = hasStatus(statuses, COMPLETED_STATUSES)

    if (workspace) {
      const result = await this.resolveWorkspaceRecognition(
        taskId,
        workspace,
        signal,
        formatErrors,
      )
      if (result) return { status: 'completed', taskId, result }
    }
    if (uiMessages) {
      const result = this.resolveUiRecognition(uiMessages, formatErrors)
      if (result) return { status: 'completed', taskId, result }
    }

    const failure = explicitFailure([taskInfo, uiMessages])
    if (failure) return { status: 'failed', taskId, error: failure }
    const blockedUpload = recognitionUploadFollowup(uiMessages)
    if (blockedUpload) return { status: 'unknown', taskId, error: blockedUpload }
    if (notFound.size === 3) return { status: 'not_found', taskId }
    if (hasCompletedStatus || hasCompletionResult) {
      return {
        status: 'unknown',
        taskId,
        error:
          formatErrors.at(-1) ??
          '识别任务已完成，但没有找到通过结构校验的JSON结果。',
      }
    }
    if (hasStatus(statuses, RUNNING_STATUSES)) {
      return {
        status: 'processing',
        taskId,
        progress: 'InfiniSynapse 正在后台识别标签。',
        localWaitEnded: true,
      }
    }
    return { status: 'unknown', taskId, error: safeUnknownStatus(statuses) }
  }

  private acceptRecognitionCandidate(
    candidate: string,
    formatErrors: string[],
  ): LabelRecognitionResult | null {
    try {
      return parseLabelRecognitionJson(candidate)
    } catch (error) {
      if (error instanceof RecognitionFormatError) formatErrors.push(error.message)
      return null
    }
  }

  private async resolveWorkspaceRecognition(
    taskId: string,
    workspace: unknown,
    signal: AbortSignal | undefined,
    formatErrors: string[],
  ): Promise<LabelRecognitionResult | null> {
    const candidates = normalizeWorkspacePaths(workspace)
      .filter((path) => {
        const normalized = path.replaceAll('\\', '/').toLowerCase()
        return (
          normalized === 'final/label-extraction.json' ||
          normalized === 'label-extraction.json'
        )
      })
      .sort((a, b) => {
        const aFinal = a.replaceAll('\\', '/').toLowerCase().startsWith('final/')
        const bFinal = b.replaceAll('\\', '/').toLowerCase().startsWith('final/')
        return Number(bFinal) - Number(aFinal)
      })
    for (const path of candidates) {
      try {
        const preview = await this.request('/api/ai_task/previewFile', {
          method: 'POST',
          body: { taskId, fileName: path },
          signal,
        })
        if (isRecord(preview) && typeof preview.content === 'string') {
          const result = this.acceptRecognitionCandidate(preview.content, formatErrors)
          if (result) return result
        }
      } catch {
        // Continue to the root artifact or final completion message.
      }
    }
    return null
  }

  private resolveUiRecognition(
    uiMessages: unknown,
    formatErrors: string[],
  ): LabelRecognitionResult | null {
    const messages = collectMessages(uiMessages)
    for (const message of [...messages].reverse()) {
      if (!isFinalUserVisibleMessage(message)) continue
      const text = agentMessageText(message)
      if (!text) continue
      const result = this.acceptRecognitionCandidate(text, formatErrors)
      if (result) return result
    }
    return null
  }

  private acceptReportCandidate(
    candidate: string,
    formatErrors: string[],
    payload?: CompactAnalyzePayload,
  ): ValidatedReport | null {
    try {
      return validateAndNormalizeReport(candidate, payload)
    } catch (error) {
      if (error instanceof ReportFormatError) formatErrors.push(error.message)
      return null
    }
  }

  private async resolveWorkspaceReport(
    taskId: string,
    workspace: unknown,
    signal: AbortSignal | undefined,
    formatErrors: string[],
    payload?: CompactAnalyzePayload,
  ): Promise<ValidatedReport | null> {
    const workspacePaths = normalizeWorkspacePaths(workspace)
    const markdownFiles = workspacePaths.filter((path) => /\.md$/i.test(path))
    const markdownPaths = markdownFiles
      .map((path) => {
        const officialRank = rankMarkdownPath(path)
        return {
          path,
          rank: officialRank >= 0 ? officialRank : markdownFiles.length === 1 ? 2 : -1,
        }
      })
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => b.rank - a.rank)

    const acceptedCandidates: ValidReportCandidate[] = []
    for (const [order, { path: markdownPath, rank }] of markdownPaths.entries()) {
      try {
        const preview = await this.request('/api/ai_task/previewFile', {
          method: 'POST',
          body: { taskId, fileName: markdownPath },
          signal,
        })
        if (isRecord(preview) && typeof preview.content === 'string' && preview.content.trim()) {
          const accepted = this.acceptReportCandidate(preview.content, formatErrors, payload)
          if (accepted) {
            acceptedCandidates.push({ ...accepted, order, sourceRank: rank })
          }
        }
      } catch {
        // Try the next canonical Markdown path or a final completion message.
      }
    }
    return bestReportCandidate(acceptedCandidates)
  }

  private resolveUiReport(
    uiMessages: unknown,
    formatErrors: string[],
    allowVisibleFallback = false,
    payload?: CompactAnalyzePayload,
  ): ValidatedReport | null {
    const messages = collectMessages(uiMessages)
    const completionCandidates: ValidReportCandidate[] = []
    messages.forEach((message, order) => {
      if (!isFinalUserVisibleMessage(message)) return
      const text = agentMessageText(message)
      if (!text) return
      const accepted = this.acceptReportCandidate(text, formatErrors, payload)
      if (accepted) completionCandidates.push({ ...accepted, order })
    })
    const completionReport = bestReportCandidate(completionCandidates)
    if (completionReport) return completionReport
    if (!allowVisibleFallback) return null
    const visibleCandidates: ValidReportCandidate[] = []
    messages.forEach((message, order) => {
      if (!isVisibleSayTextMessage(message)) return
      const text = agentMessageText(message)
      if (!text) return
      const accepted = this.acceptReportCandidate(text, formatErrors, payload)
      if (accepted) visibleCandidates.push({ ...accepted, order })
    })
    return bestReportCandidate(visibleCandidates)
  }

  private async resolveReport(
    taskId: string,
    finalMessageCandidates: string[],
    signal: AbortSignal,
    payload?: CompactAnalyzePayload,
  ): Promise<ValidatedReport> {
    const formatErrors: string[] = []

    try {
      const workspace = await this.request(
        `/api/ai_task/getTaskWorkspace/${encodeURIComponent(taskId)}`,
        { method: 'GET', signal },
      )
      const workspaceReport = await this.resolveWorkspaceReport(
        taskId,
        workspace,
        signal,
        formatErrors,
        payload,
      )
      if (workspaceReport) return workspaceReport
    } catch {
      // A validated official completion message can still be a valid result.
    }

    for (const candidate of [...finalMessageCandidates].reverse()) {
      const accepted = this.acceptReportCandidate(candidate, formatErrors, payload)
      if (accepted) return accepted
    }

    try {
      const uiMessages = await this.request(
        `/api/ai_task/getUiMessageById?id=${encodeURIComponent(taskId)}`,
        { method: 'GET', signal },
      )
      const uiReport = this.resolveUiReport(uiMessages, formatErrors, true, payload)
      if (uiReport) return uiReport
    } catch {
      // Fall through to a safe format error without returning unvalidated text.
    }

    throw new ReportFormatError([
      formatErrors.at(-1) ?? '未找到符合约定格式的最终 Markdown 结果',
    ])
  }

  private async resolveRecognitionResult(
    taskId: string,
    finalMessageCandidates: string[],
    signal: AbortSignal,
  ): Promise<LabelRecognitionResult> {
    const formatErrors: string[] = []
    try {
      const workspace = await this.request(
        `/api/ai_task/getTaskWorkspace/${encodeURIComponent(taskId)}`,
        { method: 'GET', signal },
      )
      const workspaceResult = await this.resolveWorkspaceRecognition(
        taskId,
        workspace,
        signal,
        formatErrors,
      )
      if (workspaceResult) return workspaceResult
    } catch {
      // A strict completion_result JSON body remains an allowed fallback.
    }
    for (const candidate of [...finalMessageCandidates].reverse()) {
      const result = this.acceptRecognitionCandidate(candidate, formatErrors)
      if (result) return result
    }
    try {
      const uiMessages = await this.request(
        `/api/ai_task/getUiMessageById?id=${encodeURIComponent(taskId)}`,
        { method: 'GET', signal },
      )
      const result = this.resolveUiRecognition(uiMessages, formatErrors)
      if (result) return result
    } catch {
      // Return only a schema error; never leak raw provider messages.
    }
    throw new RecognitionFormatError([
      formatErrors.at(-1) ?? '未找到符合约定schema的最终JSON结果',
    ])
  }

  async cancelTask(taskId: string): Promise<void> {
    try {
      await this.request('/api/ai/message', {
        method: 'POST',
        body: { type: 'cancelTask', taskId },
      })
    } catch {
      // Best effort only; never retry or replay the task.
    }
  }
}
