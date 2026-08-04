import type {
  LabelRecognitionQueueItem,
  LabelRecognitionQueueSnapshot,
} from '../types'
import {
  RecognitionHttpError,
  type RecognitionStatusResponse,
} from './labelRecognition'

const DEFAULT_BACKOFF_MS = [5_000, 10_000, 20_000] as const
export const RECOGNITION_BUSY_MESSAGE =
  '识别服务暂时繁忙，已保留当前图片。稍后可仅重试这款商品。'

interface RecognitionQueueDependencies {
  start: (productId: string) => Promise<RecognitionStatusResponse>
  status: (taskId: string) => Promise<RecognitionStatusResponse>
  onQueueChange: (snapshot: LabelRecognitionQueueSnapshot) => void
  onQueued: (productId: string) => void
  onStarting: (productId: string) => void
  onStatus: (productId: string, response: RecognitionStatusResponse) => void
  onRetryWait: (
    productId: string,
    item: LabelRecognitionQueueItem,
    delayMs: number,
  ) => void
  onFailure: (productId: string, message: string) => void
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => number
  pollIntervalMs?: number
}

function cloneSnapshot(
  snapshot: LabelRecognitionQueueSnapshot,
): LabelRecognitionQueueSnapshot {
  return {
    current: snapshot.current ? { ...snapshot.current } : undefined,
    pendingProductIds: [...snapshot.pendingProductIds],
  }
}

function isTerminal(status: RecognitionStatusResponse['status']): boolean {
  return status !== 'processing'
}

export class RecognitionQueueCoordinator {
  private snapshot: LabelRecognitionQueueSnapshot
  private runPromise: Promise<void> | null = null
  private stopped = false
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly now: () => number
  private readonly pollIntervalMs: number

  constructor(
    private readonly dependencies: RecognitionQueueDependencies,
    initialSnapshot: LabelRecognitionQueueSnapshot = { pendingProductIds: [] },
  ) {
    this.snapshot = cloneSnapshot(initialSnapshot)
    this.sleep =
      dependencies.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => window.setTimeout(resolve, milliseconds)))
    this.now = dependencies.now ?? Date.now
    this.pollIntervalMs = dependencies.pollIntervalMs ?? 9_000
  }

  getSnapshot(): LabelRecognitionQueueSnapshot {
    return cloneSnapshot(this.snapshot)
  }

  enqueue(productIds: string[]): Promise<void> {
    const known = new Set([
      ...(this.snapshot.current ? [this.snapshot.current.productId] : []),
      ...this.snapshot.pendingProductIds,
    ])
    for (const productId of productIds) {
      if (known.has(productId)) continue
      known.add(productId)
      this.snapshot.pendingProductIds.push(productId)
      this.dependencies.onQueued(productId)
    }
    this.publish()
    return this.resume()
  }

  cancel(productId: string): void {
    const next = this.snapshot.pendingProductIds.filter((id) => id !== productId)
    if (next.length === this.snapshot.pendingProductIds.length) return
    this.snapshot.pendingProductIds = next
    this.publish()
  }

  resume(): Promise<void> {
    if (this.runPromise) return this.runPromise
    this.stopped = false
    this.runPromise = this.run().finally(() => {
      this.runPromise = null
    })
    return this.runPromise
  }

  stop(): void {
    this.stopped = true
  }

  private publish(): void {
    this.dependencies.onQueueChange(this.getSnapshot())
  }

  private updateCurrent(patch: Partial<LabelRecognitionQueueItem>): void {
    if (!this.snapshot.current) return
    this.snapshot.current = { ...this.snapshot.current, ...patch }
    this.publish()
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      if (!this.snapshot.current) {
        const productId = this.snapshot.pendingProductIds.shift()
        if (!productId) {
          this.publish()
          return
        }
        this.snapshot.current = { productId }
        this.publish()
      }

      await this.runCurrent(this.snapshot.current)
      if (this.stopped) return
      this.snapshot.current = undefined
      this.publish()
    }
  }

  private async runCurrent(item: LabelRecognitionQueueItem): Promise<void> {
    if (item.retryAt) {
      await this.sleep(Math.max(0, Date.parse(item.retryAt) - this.now()))
      if (this.stopped) return
    }

    if (!item.taskId && item.submissionStarted) {
      await this.handleRateLimit(item, undefined)
      return
    }

    let response: RecognitionStatusResponse
    try {
      if (item.taskId) {
        response = await this.dependencies.status(item.taskId)
      } else {
        this.updateCurrent({ submissionStarted: true })
        this.dependencies.onStarting(item.productId)
        response = await this.dependencies.start(item.productId)
        this.updateCurrent({
          taskId: response.taskId,
          connId: response.connId,
          retryAt: undefined,
        })
      }
    } catch (error) {
      if (error instanceof RecognitionHttpError && error.status === 429) {
        this.updateCurrent({
          taskId: error.taskId ?? item.taskId,
          connId: error.connId ?? item.connId,
        })
        await this.handleRateLimit(this.snapshot.current!, error.retryAfterMs)
        return
      }
      this.dependencies.onFailure(
        item.productId,
        error instanceof Error ? error.message : '图片识别暂时不可用。',
      )
      return
    }

    await this.followResponse(item.productId, response)
  }

  private async followResponse(
    productId: string,
    initialResponse: RecognitionStatusResponse,
  ): Promise<void> {
    let response = initialResponse
    while (!this.stopped) {
      this.dependencies.onStatus(productId, response)
      if (isTerminal(response.status)) return
      await this.sleep(this.pollIntervalMs)
      if (this.stopped) return
      try {
        response = await this.dependencies.status(response.taskId)
      } catch (error) {
        if (error instanceof RecognitionHttpError && error.status === 429) {
          await this.handleRateLimit(this.snapshot.current!, error.retryAfterMs)
          return
        }
        this.dependencies.onStatus(productId, {
          ...response,
          error:
            error instanceof Error
              ? error.message
              : '暂时无法查询识别状态，请稍后再检查。',
        })
      }
    }
  }

  private async handleRateLimit(
    item: LabelRecognitionQueueItem,
    retryAfterMs: number | undefined,
  ): Promise<void> {
    let current = item
    while (!this.stopped) {
      const retryCount = current.retryCount ?? 0
      if (retryCount >= DEFAULT_BACKOFF_MS.length) {
        this.dependencies.onFailure(current.productId, RECOGNITION_BUSY_MESSAGE)
        return
      }
      const delayMs = retryAfterMs ?? DEFAULT_BACKOFF_MS[retryCount]
      const retryAt = new Date(this.now() + delayMs).toISOString()
      this.updateCurrent({ retryCount: retryCount + 1, retryAt })
      current = this.snapshot.current!
      this.dependencies.onRetryWait(current.productId, current, delayMs)
      await this.sleep(delayMs)
      if (this.stopped) return

      if (!current.taskId) {
        retryAfterMs = undefined
        continue
      }
      try {
        const response = await this.dependencies.status(current.taskId)
        if (response.status === 'not_found' || response.status === 'unknown') {
          retryAfterMs = undefined
          continue
        }
        this.updateCurrent({ retryAt: undefined })
        await this.followResponse(current.productId, response)
        return
      } catch (error) {
        if (error instanceof RecognitionHttpError && error.status === 429) {
          retryAfterMs = error.retryAfterMs
          continue
        }
        this.dependencies.onFailure(
          current.productId,
          error instanceof Error ? error.message : '暂时无法恢复识别任务。',
        )
        return
      }
    }
  }
}
