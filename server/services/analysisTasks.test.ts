import { describe, expect, it, vi } from 'vitest'
import { validAnalyzeInput } from '../validation.test'
import { AnalysisTaskManager } from './analysisTasks'

const validReport = `# 本次结论
A 更匹配。

## 为什么更匹配
客户端排名显示 A 更符合当前目标。

## 各款商品的主要取舍
A 与 B 各有不同取舍。

## 不同目标下排名为什么变化
不同排名使用不同的客户端指标。

## 包装宣传提醒
宣传语应与包装标签一起理解。

## 数据不足与无法判断
客户端未标记不足项。

## 最终购买建议
可按本次目标参考 A。`

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('AnalysisTaskManager CloudBase lifecycle', () => {
  it('returns only after SSE connection and accepted newTask, with no remaining timer or consumer', async () => {
    vi.useFakeTimers()
    try {
      const calls: string[] = []
      const release = vi.fn()
      let streamCancelled = false
      const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/ai/events')) {
          calls.push('events')
          return new Response(
            new ReadableStream<Uint8Array>({
              cancel() {
                streamCancelled = true
              },
            }),
            { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
          )
        }
        const body =
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : {}
        if (url.endsWith('/api/ai/message') && body.type === 'newTask') {
          calls.push('newTask')
          expect(body.taskId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          )
          expect(body.connId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          )
          return jsonResponse({ success: true })
        }
        throw new Error(`unexpected request ${url}`)
      })
      const manager = new AnalysisTaskManager({
        getApiKey: () => 'test-server-key',
        fetchImpl: fetchImpl as typeof fetch,
      })

      const started = await manager.start(validAnalyzeInput(), { release })

      expect(started.status).toBe('processing')
      expect(started.progress).toContain('任务已提交')
      expect(calls).toEqual(['events', 'newTask'])
      expect(streamCancelled).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
      expect(release).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not return or retain a successful task when newTask is rejected', async () => {
    let streamCancelled = false
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/ai/events')) {
        return new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              streamCancelled = true
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {}
      if (url.endsWith('/api/ai/message') && body.type === 'newTask') {
        return jsonResponse({ success: false, error: 'submission rejected' })
      }
      throw new Error(`unexpected request ${url}`)
    })
    const manager = new AnalysisTaskManager({
      getApiKey: () => 'test-server-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(manager.start(validAnalyzeInput())).rejects.toThrow(
      'submission rejected',
    )
    expect(streamCancelled).toBe(true)
  })

  it('recovers a completed report after the submitting instance and its memory are gone', async () => {
    const messageTypes: string[] = []
    const queryCalls: string[] = []
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/ai/events')) {
        return new Response(new ReadableStream<Uint8Array>(), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {}
      if (url.endsWith('/api/ai/message')) {
        messageTypes.push(String(body.type))
        return jsonResponse({ success: true })
      }
      queryCalls.push(url)
      if (url.includes('/api/ai_task/getTaskInfo/')) {
        return jsonResponse({ code: 200, data: { status: 'completed' } })
      }
      if (url.includes('/api/ai_task/getUiMessageById')) {
        return jsonResponse({
          code: 200,
          data: { messages: [{ type: 'ask', ask: 'completion_result', text: '' }] },
        })
      }
      if (url.includes('/api/ai_task/getTaskWorkspace/')) {
        return jsonResponse({
          code: 200,
          data: { cwd: '/tmp/task', files: ['final/report.md'] },
        })
      }
      if (url.endsWith('/api/ai_task/previewFile')) {
        return jsonResponse({ code: 200, data: { content: validReport, fileType: 'text' } })
      }
      throw new Error(`unexpected request ${url}`)
    })
    const submittingInstance = new AnalysisTaskManager({
      getApiKey: () => 'test-server-key',
      fetchImpl: fetchImpl as typeof fetch,
    })
    const started = await submittingInstance.start(validAnalyzeInput())

    const replacementInstance = new AnalysisTaskManager({
      getApiKey: () => 'test-server-key',
      fetchImpl: fetchImpl as typeof fetch,
    })
    expect(replacementInstance.inspectTask(started.taskId)).toBeUndefined()

    const status = await replacementInstance.status(started.taskId)

    expect(status).toMatchObject({
      status: 'completed',
      taskId: started.taskId,
      report: validReport,
    })
    expect(messageTypes).toEqual(['newTask'])
    expect(queryCalls.some((url) => url.includes('/getTaskInfo/'))).toBe(true)
    expect(queryCalls.some((url) => url.includes('/getUiMessageById'))).toBe(true)
    expect(queryCalls.some((url) => url.includes('/getTaskWorkspace/'))).toBe(true)
  })

  it.each([
    { providerStatus: 'running', expected: 'processing' },
    { providerStatus: 'waiting', expected: 'processing' },
    { providerStatus: 'failed', expected: 'failed' },
  ])(
    'recovers $expected from $providerStatus using taskId alone',
    async ({ providerStatus, expected }) => {
      const calls: string[] = []
      const fetchImpl = vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        calls.push(url)
        if (url.includes('/api/ai_task/getTaskInfo/')) {
          return jsonResponse({ code: 200, data: { status: providerStatus } })
        }
        if (url.includes('/api/ai_task/getUiMessageById')) {
          return jsonResponse({ code: 200, data: [] })
        }
        if (url.includes('/api/ai_task/getTaskWorkspace/')) {
          return jsonResponse({ code: 200, data: { cwd: '/tmp/task', files: [] } })
        }
        throw new Error(`unexpected request ${url}`)
      })
      const replacementInstance = new AnalysisTaskManager({
        getApiKey: () => 'test-server-key',
        fetchImpl: fetchImpl as typeof fetch,
      })

      const status = await replacementInstance.status(
        '815b6d5a-b47d-4a7e-b1b2-95d11cccf7c4',
      )

      expect(status.status).toBe(expected)
      expect(calls).toHaveLength(3)
    },
  )
})
