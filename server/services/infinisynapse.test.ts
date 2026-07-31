import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { validAnalyzeInput } from '../validation.test'
import { InfiniSynapseService } from './infinisynapse'

const validReport = `# 本次结论
在当前目标下，A 更匹配。

## 为什么更匹配
A 的客户端排名为第一。

## 各款商品的主要取舍
A 蛋白质密度更高；B 的价格更低。

## 不同目标下排名为什么变化
各项目使用的客户端指标不同，因此排名会变化。

## 包装宣传提醒
包装文字应结合配料表和营养成分表理解。

## 数据不足与无法判断
客户端未标记不足项。

## 最终购买建议
本次目标下可优先考虑 A。`

interface FixtureEvent {
  event: string
  data: Record<string, unknown>
}

const mixedFixture = JSON.parse(
  readFileSync(new URL('../fixtures/mixed-sse-response.json', import.meta.url), 'utf8'),
) as { events: FixtureEvent[] }
const completedRecoveryFixture = JSON.parse(
  readFileSync(new URL('../fixtures/completed-task-recovery.json', import.meta.url), 'utf8'),
) as {
  taskInfo: unknown
  uiMessages: unknown
  workspace: unknown
}
const candidateSelectionFixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/completed-task-candidate-selection.json', import.meta.url),
    'utf8',
  ),
) as {
  taskInfo: unknown
  uiMessages: { code: number; message: string; data: Array<Record<string, unknown>> }
  workspace: unknown
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sseResponse(events: string): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(events))
        controller.close()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

function eventsToSse(events: FixtureEvent[], taskId: string): string {
  return events
    .map((event) => {
      const data = JSON.parse(
        JSON.stringify(event.data).replaceAll('__TASK_ID__', taskId),
      ) as Record<string, unknown>
      return `event: ${event.event}\ndata: ${JSON.stringify(data)}\n\n`
    })
    .join('')
}

describe('InfiniSynapseService', () => {
  it('skips request echoes and chooses the later validated say=text report', async () => {
    const taskId = '5a7971a0-16b2-4ef2-ba2a-8236d5907524'
    const calls: Array<{ url: string; method: string }> = []
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? 'GET' })
      if (url.includes('/getTaskInfo/')) return jsonResponse(candidateSelectionFixture.taskInfo)
      if (url.includes('/getUiMessageById')) {
        return jsonResponse(candidateSelectionFixture.uiMessages)
      }
      if (url.includes('/getTaskWorkspace/')) {
        return jsonResponse(candidateSelectionFixture.workspace)
      }
      throw new Error(`unexpected request ${url}`)
    })
    const service = new InfiniSynapseService({
      apiKey: 'test-server-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    const result = await service.recoverTask(taskId)

    expect(result.status).toBe('completed')
    expect(result.taskId).toBe(taskId)
    expect(result.report).toContain('D 更符合本次蛋白质密度目标')
    expect(result.report).toContain('整包蛋白质高于用户目标')
    expect(result.report).not.toContain('远超')
    expect(result.normalized).toBe(true)
    expect(result.normalizationWarnings).toContain('已中和夸张措辞')
    expect(result.report).not.toContain('SYSTEM PROMPT ECHO')
    expect(result.report).not.toContain('compact payload')
    expect(calls).toHaveLength(3)
    expect(calls.every((call) => call.method === 'GET')).toBe(true)
    expect(calls.some((call) => call.url.endsWith('/api/ai/message'))).toBe(false)
    expect(calls.some((call) => /newTask|cancelTask/.test(call.url))).toBe(false)
  })

  it('returns format_error for a completed task with no valid final report', async () => {
    const taskId = '5a7971a0-16b2-4ef2-ba2a-8236d5907524'
    const calls: Array<{ url: string; method: string }> = []
    const invalidMessages = {
      ...candidateSelectionFixture.uiMessages,
      data: candidateSelectionFixture.uiMessages.data.filter(
        (_message, index) => index !== 3,
      ),
    }
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? 'GET' })
      if (url.includes('/getTaskInfo/')) return jsonResponse(candidateSelectionFixture.taskInfo)
      if (url.includes('/getUiMessageById')) return jsonResponse(invalidMessages)
      if (url.includes('/getTaskWorkspace/')) {
        return jsonResponse(candidateSelectionFixture.workspace)
      }
      throw new Error(`unexpected request ${url}`)
    })
    const service = new InfiniSynapseService({
      apiKey: 'test-server-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    const result = await service.recoverTask(taskId)

    expect(result).toEqual({
      status: 'format_error',
      taskId,
      error: '任务已完成，但最终报告格式未通过校验。',
    })
    expect(calls.every((call) => call.method === 'GET')).toBe(true)
    expect(calls.some((call) => /\/api\/ai\/message/.test(call.url))).toBe(false)
  })

  it('recovers the validated visible report preceding a real-shaped completion_result summary', async () => {
    const taskId = '5f645da0-63b5-487e-9cc8-745b1d608000'
    const calls: Array<{ url: string; method: string }> = []
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ url, method })
      if (url.includes('/api/ai_task/getTaskInfo/')) {
        return jsonResponse(completedRecoveryFixture.taskInfo)
      }
      if (url.includes('/api/ai_task/getUiMessageById')) {
        return jsonResponse(completedRecoveryFixture.uiMessages)
      }
      if (url.includes('/api/ai_task/getTaskWorkspace/')) {
        return jsonResponse(completedRecoveryFixture.workspace)
      }
      throw new Error(`unexpected request ${url}`)
    })
    const service = new InfiniSynapseService({
      apiKey: 'test-server-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    const result = await service.recoverTask(taskId)

    expect(result.status).toBe('completed')
    expect(result.taskId).toBe(taskId)
    expect(result.report?.startsWith('# 本次结论')).toBe(true)
    expect(result.report).toContain('## 最终购买建议')
    expect(result.report).not.toContain('[REDACTED REQUEST]')
    expect(result.report).not.toContain('[REDACTED REASONING]')
    expect(calls).toHaveLength(3)
    expect(calls.every((call) => call.method === 'GET')).toBe(true)
    expect(calls.some((call) => call.url.endsWith('/api/ai/message'))).toBe(false)
  })

  it('returns unknown instead of processing for an unrecognized provider status', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/api/ai_task/getTaskInfo/')) {
        return jsonResponse({ code: 200, data: { status: 'provider_new_state' } })
      }
      if (url.includes('/api/ai_task/getUiMessageById')) {
        return jsonResponse({ code: 200, data: [] })
      }
      if (url.includes('/api/ai_task/getTaskWorkspace/')) {
        return jsonResponse({ code: 200, data: { cwd: '/tmp/task', files: [] } })
      }
      throw new Error(`unexpected request ${url}`)
    })
    const service = new InfiniSynapseService({
      apiKey: 'test-server-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    const result = await service.recoverTask('5f645da0-63b5-487e-9cc8-745b1d608000')

    expect(result.status).toBe('unknown')
    expect(result.error).toContain('provider_new_state')
  })

  it('opens SSE before creating exactly one server-id task', async () => {
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
    const encoder = new TextEncoder()
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined
      calls.push({ url, body })
      if (url.includes('/api/ai/events')) {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }
      if (url.endsWith('/api/ai/message') && body?.type === 'newTask') {
        const event = [
          'event: message.add',
          `data: ${JSON.stringify({
            taskId: body.taskId,
            message: {
              type: 'say',
              say: 'completion_result',
              text: validReport,
              ts: 1,
            },
          })}`,
          '',
          '',
        ].join('\n')
        streamController?.enqueue(encoder.encode(event))
        streamController?.close()
        return jsonResponse({ success: true })
      }
      if (url.includes('/api/ai_task/getTaskWorkspace/')) {
        return jsonResponse({ code: 200, data: { cwd: '/tmp/task', files: [] } })
      }
      throw new Error(`unexpected request ${url}`)
    })

    const service = new InfiniSynapseService({
      apiKey: 'test-server-key',
      fetchImpl: fetchImpl as typeof fetch,
      totalTimeoutMs: 2_000,
      idleTimeoutMs: 1_000,
    })
    const result = await service.analyze(validAnalyzeInput())

    expect(calls[0].url).toContain('/api/ai/events?connId=')
    const newTaskCalls = calls.filter((call) => call.body?.type === 'newTask')
    expect(newTaskCalls).toHaveLength(1)
    expect(newTaskCalls[0].body?.chatSettings).toEqual({ mode: 'act' })
    expect(newTaskCalls[0].body?.taskId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(newTaskCalls[0].body?.connId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(result.taskId).toBe(newTaskCalls[0].body?.taskId)
    expect(result.report).toContain('A 更匹配')
  })

  it('returns only final Markdown from an official-shaped mixed SSE fixture', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
    const encoder = new TextEncoder()
    let dispatchedTaskId = ''
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/ai/events')) {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller
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
        dispatchedTaskId = String(body.taskId)
        streamController?.enqueue(
          encoder.encode(eventsToSse(mixedFixture.events, dispatchedTaskId)),
        )
        streamController?.close()
        return jsonResponse({ success: true })
      }
      if (url.includes('/api/ai_task/getTaskWorkspace/')) {
        return jsonResponse({ code: 200, data: { cwd: '/tmp/task', files: [] } })
      }
      throw new Error(`unexpected request ${url}`)
    })
    const service = new InfiniSynapseService({
      apiKey: 'test-server-key',
      fetchImpl: fetchImpl as typeof fetch,
      totalTimeoutMs: 2_000,
    })

    const result = await service.analyze(validAnalyzeInput())

    expect(result.taskId).toBe(dispatchedTaskId)
    expect(result.report.startsWith('# 本次结论')).toBe(true)
    expect(result.report).toContain('## 最终购买建议')
    expect(result.report).not.toContain('完整 request')
    expect(result.report).not.toContain('<analysis>')
    expect(result.report).not.toContain('<environment_details>')
    expect(result.report).not.toContain('[ERROR]')
    expect(result.report).not.toContain("The user's task is complete")
  })

  it('prioritizes a validated final workspace Markdown artifact', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
    const encoder = new TextEncoder()
    const workspaceReport = validReport.replace(
      '在当前目标下，A 更匹配。',
      'workspace 中的最终报告优先。',
    )
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {}
      if (url.includes('/api/ai/events')) {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }
      if (url.endsWith('/api/ai/message') && body.type === 'newTask') {
        const event = `event: message.add\ndata: ${JSON.stringify({
          taskId: body.taskId,
          message: {
            type: 'say',
            say: 'completion_result',
            text: validReport,
            ts: 8,
          },
        })}\n\n`
        streamController?.enqueue(encoder.encode(event))
        streamController?.close()
        return jsonResponse({ success: true })
      }
      if (url.includes('/api/ai_task/getTaskWorkspace/')) {
        return jsonResponse({
          code: 200,
          data: { cwd: '/tmp/task', files: ['working/notes.md', 'final/report.md'] },
        })
      }
      if (url.endsWith('/api/ai_task/previewFile')) {
        expect(body.fileName).toBe('final/report.md')
        return jsonResponse({ code: 200, data: { content: workspaceReport, fileType: 'text' } })
      }
      throw new Error(`unexpected request ${url}`)
    })
    const service = new InfiniSynapseService({
      apiKey: 'test-server-key',
      fetchImpl: fetchImpl as typeof fetch,
      totalTimeoutMs: 2_000,
    })

    const result = await service.analyze(validAnalyzeInput())

    expect(result.report).toContain('workspace 中的最终报告优先')
    expect(result.report).not.toContain('在当前目标下，A 更匹配')
  })

  it('treats api_req_failed as terminal without automatically cancelling upstream', async () => {
    const messageTypes: string[] = []
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/ai/events')) {
        return sseResponse(
          [
            'event: message.add',
            `data: ${JSON.stringify({
              message: {
                type: 'ask',
                ask: 'api_req_failed',
                text: 'Insufficient account balance',
                ts: 2,
              },
            })}`,
            '',
            '',
          ].join('\n'),
        )
      }
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {}
      if (url.endsWith('/api/ai/message')) {
        messageTypes.push(String(body.type))
        return jsonResponse({ success: true })
      }
      throw new Error(`unexpected request ${url}`)
    })
    const service = new InfiniSynapseService({
      apiKey: 'test-server-key',
      fetchImpl: fetchImpl as typeof fetch,
      totalTimeoutMs: 2_000,
    })

    await expect(service.analyze(validAnalyzeInput())).rejects.toThrow(
      'Insufficient account balance',
    )
    expect(messageTypes).toEqual(['newTask'])
  })
})
