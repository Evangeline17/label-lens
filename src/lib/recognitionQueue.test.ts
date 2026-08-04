import { describe, expect, it, vi } from 'vitest'
import type { LabelRecognitionQueueSnapshot } from '../types'
import {
  RecognitionHttpError,
  type RecognitionStatusResponse,
} from './labelRecognition'
import {
  RECOGNITION_BUSY_MESSAGE,
  RecognitionQueueCoordinator,
} from './recognitionQueue'

function completed(taskId: string): RecognitionStatusResponse {
  return { status: 'completed', taskId }
}

function processing(taskId: string): RecognitionStatusResponse {
  return { status: 'processing', taskId }
}

function coordinator(options: {
  start: (productId: string) => Promise<RecognitionStatusResponse>
  status?: (taskId: string) => Promise<RecognitionStatusResponse>
  initial?: LabelRecognitionQueueSnapshot
}) {
  const events: string[] = []
  const failures: Array<[string, string]> = []
  const waits: number[] = []
  const queueChanges: LabelRecognitionQueueSnapshot[] = []
  const runner = new RecognitionQueueCoordinator(
    {
      start: options.start,
      status: options.status ?? (async (taskId) => completed(taskId)),
      onQueueChange: (snapshot) => queueChanges.push(snapshot),
      onQueued: (productId) => events.push(`queued:${productId}`),
      onStarting: (productId) => events.push(`start:${productId}`),
      onStatus: (productId, response) => events.push(`${response.status}:${productId}`),
      onRetryWait: (productId) => events.push(`retry:${productId}`),
      onFailure: (productId, message) => failures.push([productId, message]),
      sleep: async (milliseconds) => {
        waits.push(milliseconds)
      },
      now: () => 1_800_000_000_000,
      pollIntervalMs: 0,
    },
    options.initial,
  )
  return { runner, events, failures, waits, queueChanges }
}

describe('global label recognition queue', () => {
  it('allows only one newTask at a time and starts B only after A completes', async () => {
    let activeStarts = 0
    let maxActiveStarts = 0
    const starts: string[] = []
    const start = vi.fn(async (productId: string) => {
      activeStarts += 1
      maxActiveStarts = Math.max(maxActiveStarts, activeStarts)
      starts.push(productId)
      await Promise.resolve()
      activeStarts -= 1
      return processing(`task-${productId}`)
    })
    const status = vi.fn(async (taskId: string) => completed(taskId))
    const { runner, events } = coordinator({ start, status })

    await runner.enqueue(['a', 'b', 'c'])

    expect(maxActiveStarts).toBe(1)
    expect(starts).toEqual(['a', 'b', 'c'])
    expect(events.indexOf('completed:a')).toBeLessThan(events.indexOf('start:b'))
    expect(events.indexOf('completed:b')).toBeLessThan(events.indexOf('start:c'))
  })

  it('does not repeat newTask after 429 and uses Retry-After before status recovery', async () => {
    const start = vi.fn(async () => {
      throw new RecognitionHttpError('HTTP 429', 429, 7_000, 'task-a', 'conn-a')
    })
    const status = vi.fn(async (taskId: string) => completed(taskId))
    const { runner, waits } = coordinator({ start, status })

    await runner.enqueue(['a'])

    expect(start).toHaveBeenCalledTimes(1)
    expect(status).toHaveBeenCalledWith('task-a')
    expect(waits).toEqual([7_000])
  })

  it('checks an existing taskId first and never creates a duplicate task after refresh', async () => {
    const start = vi.fn(async (productId: string) => completed(`new-${productId}`))
    const status = vi.fn(async (taskId: string) => completed(taskId))
    const { runner } = coordinator({
      start,
      status,
      initial: {
        current: { productId: 'a', taskId: 'task-a', connId: 'conn-a' },
        pendingProductIds: [],
      },
    })

    await runner.resume()

    expect(status).toHaveBeenCalledWith('task-a')
    expect(start).not.toHaveBeenCalled()
  })

  it('fails only the rate-limited product after 5s, 10s and 20s, then continues the queue', async () => {
    const start = vi.fn(async (productId: string) => {
      if (productId === 'a') throw new RecognitionHttpError('HTTP 429', 429)
      return completed(`task-${productId}`)
    })
    const { runner, waits, failures, events } = coordinator({ start })

    await runner.enqueue(['a', 'b'])

    expect(waits).toEqual([5_000, 10_000, 20_000])
    expect(failures).toEqual([['a', RECOGNITION_BUSY_MESSAGE]])
    expect(events).toContain('completed:b')
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('deduplicates repeated clicks while the same product is queued or running', async () => {
    let release!: (value: RecognitionStatusResponse) => void
    const firstResponse = new Promise<RecognitionStatusResponse>((resolve) => {
      release = resolve
    })
    const start = vi.fn(() => firstResponse)
    const { runner } = coordinator({ start })

    const firstRun = runner.enqueue(['a'])
    const duplicateRun = runner.enqueue(['a'])
    release(completed('task-a'))
    await Promise.all([firstRun, duplicateRun])

    expect(start).toHaveBeenCalledTimes(1)
  })

  it('enqueues only the supplemented product while another product is running', async () => {
    let finishCurrent!: (value: RecognitionStatusResponse) => void
    const currentStatus = new Promise<RecognitionStatusResponse>((resolve) => {
      finishCurrent = resolve
    })
    const start = vi.fn(async (productId: string) => completed(`task-${productId}`))
    const status = vi.fn(() => currentStatus)
    const { runner } = coordinator({
      start,
      status,
      initial: {
        current: { productId: 'a', taskId: 'task-a' },
        pendingProductIds: [],
      },
    })

    const resumed = runner.resume()
    void runner.enqueue(['c'])
    finishCurrent(completed('task-a'))
    await resumed

    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith('c')
  })

  it('allows a pending product to be cancelled without stopping the current item', async () => {
    const start = vi.fn(async (productId: string) => completed(`task-${productId}`))
    const { runner } = coordinator({
      start,
      initial: {
        current: { productId: 'a', taskId: 'task-a' },
        pendingProductIds: ['b', 'c'],
      },
    })

    runner.cancel('b')
    await runner.resume()

    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith('c')
  })
})
