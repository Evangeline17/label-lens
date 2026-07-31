import { describe, expect, it, vi } from 'vitest'
import type { LabelImageUpload } from '../types'
import { RecognitionTaskManager } from './recognitionTasks'
import { InfiniSynapseService } from './infinisynapse'

const finalResult = {
  productName: '测试酸奶',
  ingredientsText: '生牛乳、乳酸菌',
  netContent: 200,
  netContentUnit: 'g',
  nutritionBasis: 'per100g',
  servingSize: null,
  energyValue: 330,
  energyUnit: 'kJ',
  protein: 9,
  fat: 3,
  carbohydrate: 5.5,
  sodium: 65,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function openSseResponse(onCancel?: () => void): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      cancel() {
        onCancel?.()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

function image(
  kind: LabelImageUpload['kind'],
  contentType: LabelImageUpload['contentType'] = 'image/jpeg',
): LabelImageUpload {
  return {
    kind,
    filename: `${kind}-label.${contentType === 'image/png' ? 'png' : 'jpg'}`,
    contentType,
    data: Buffer.from([0xff, 0xd8, 0xff, kind === 'ingredients' ? 1 : 2]),
  }
}

describe('InfiniSynapse proactive label attachment flow', () => {
  it('uploads one image before SSE and newTask, then returns after closing the local stream', async () => {
    const calls: string[] = []
    let streamCancelled = false
    let newTaskBody: Record<string, unknown> | null = null
    let uploadedTaskId = ''
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/tools/taskUpload/')) {
        calls.push('taskUpload')
        const parsed = new URL(url)
        uploadedTaskId = parsed.pathname.split('/').at(-1) ?? ''
        expect(parsed.searchParams.get('subdir')).toBe('label_inputs')
        expect(parsed.searchParams.get('naming')).toBe('original')
        expect(init?.body).toBeInstanceOf(FormData)
        const form = init?.body as FormData
        expect(form.get('file')).toBeInstanceOf(Blob)
        expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
        return jsonResponse({
          code: 200,
          message: 'success',
          data: {
            name: 'ingredients-label.jpg',
            size: 4,
            logicalPath: 'label_inputs/ingredients-label.jpg',
            assetId: 'asset-ingredients',
          },
        })
      }
      if (url.includes('/api/ai/events')) {
        calls.push('events')
        return openSseResponse(() => {
          streamCancelled = true
        })
      }
      if (url.endsWith('/api/ai/message')) {
        newTaskBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        calls.push(String(newTaskBody.type))
        return jsonResponse({ success: true })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    const service = new InfiniSynapseService({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
      sseReadyWaitMs: 0,
    })

    const result = await service.submitLabelRecognition([image('ingredients')])

    expect(calls).toEqual(['taskUpload', 'events', 'newTask'])
    expect(result.taskId).toBe(uploadedTaskId)
    expect(newTaskBody).toMatchObject({
      type: 'newTask',
      taskId: result.taskId,
      connId: result.connId,
      images: [],
      files: [
        {
          name: 'ingredients-label.jpg',
          size: 4,
          type: 'image/jpeg',
          logicalPath: 'label_inputs/ingredients-label.jpg',
          assetId: 'asset-ingredients',
          fileType: 'reference',
        },
      ],
      chatSettings: { mode: 'act' },
      autoApprovalSettings: {
        enableReadImage: true,
        enableWebSearch: false,
        enableBrowser: false,
        enableNativeToolCalling: true,
      },
    })
    expect(String(newTaskBody?.text)).toContain('files[] 附件')
    expect(String(newTaskBody?.text)).not.toContain('upload_file_to_sandbox')
    expect(String(newTaskBody?.text)).not.toContain('请上传')
    expect(calls).not.toContain('askResponse')
    expect(streamCancelled).toBe(true)
  })

  it('uploads two images sequentially and maps both upload results into newTask.files', async () => {
    const calls: string[] = []
    const uploads = [
      {
        name: 'ingredients-upload.jpg',
        size: 41,
        logicalPath: 'label_inputs/ingredients-upload.jpg',
        assetId: 'asset-a',
      },
      {
        name: 'nutrition-upload.png',
        size: 82,
        logicalPath: 'label_inputs/nutrition-upload.png',
        assetId: 'asset-b',
      },
    ]
    let uploadIndex = 0
    let newTaskBody: Record<string, unknown> | null = null
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/tools/taskUpload/')) {
        calls.push(`taskUpload:${uploadIndex + 1}`)
        const data = uploads[uploadIndex]
        uploadIndex += 1
        return jsonResponse({ code: 200, data })
      }
      if (url.includes('/api/ai/events')) {
        calls.push('events')
        return openSseResponse()
      }
      if (url.endsWith('/api/ai/message')) {
        newTaskBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        calls.push(String(newTaskBody.type))
        return jsonResponse({ success: true })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    const service = new InfiniSynapseService({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
      sseReadyWaitMs: 0,
    })

    await service.submitLabelRecognition([
      image('ingredients'),
      image('nutrition', 'image/png'),
    ])

    expect(calls).toEqual(['taskUpload:1', 'taskUpload:2', 'events', 'newTask'])
    expect(newTaskBody?.files).toEqual([
      { ...uploads[0], type: 'image/jpeg', fileType: 'reference' },
      { ...uploads[1], type: 'image/png', fileType: 'reference' },
    ])
    expect(calls.filter((call) => call === 'askResponse')).toHaveLength(0)
  })

  it('does not connect SSE or send newTask when either proactive upload fails', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/api/tools/taskUpload/')) {
        calls.push('taskUpload')
        if (calls.length === 1) {
          return jsonResponse({
            code: 200,
            data: {
              name: 'ingredients-label.jpg',
              size: 4,
              logicalPath: 'label_inputs/ingredients-label.jpg',
              assetId: 'asset-a',
            },
          })
        }
        return jsonResponse({ code: 413, message: 'payload too large', data: null }, 413)
      }
      calls.push(url)
      throw new Error(`unexpected request: ${url}`)
    })
    const service = new InfiniSynapseService({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
      sseReadyWaitMs: 0,
    })

    await expect(
      service.submitLabelRecognition([image('ingredients'), image('nutrition')]),
    ).rejects.toThrow('营养成分表图片主动上传失败（HTTP 413）')
    expect(calls).toEqual(['taskUpload', 'taskUpload'])
  })

  it('does not return a submitted task when newTask is rejected', async () => {
    const messageTypes: string[] = []
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/tools/taskUpload/')) {
        return jsonResponse({
          code: 200,
          data: {
            name: 'ingredients-label.jpg',
            size: 4,
            logicalPath: 'label_inputs/ingredients-label.jpg',
            assetId: 'asset-a',
          },
        })
      }
      if (url.includes('/api/ai/events')) return openSseResponse()
      if (url.endsWith('/api/ai/message')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        messageTypes.push(String(body.type))
        return jsonResponse({ success: false, error: 'submission rejected' })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    const service = new InfiniSynapseService({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
      sseReadyWaitMs: 0,
    })

    await expect(
      service.submitLabelRecognition([image('ingredients')]),
    ).rejects.toThrow('submission rejected')
    expect(messageTypes).toEqual(['newTask'])
  })

  it('recovers a completed recognition after a simulated service restart using taskId only', async () => {
    let newTaskCount = 0
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/tools/taskUpload/')) {
        return jsonResponse({
          code: 200,
          data: {
            name: 'ingredients-label.jpg',
            size: 4,
            logicalPath: 'label_inputs/ingredients-label.jpg',
            assetId: 'asset-a',
          },
        })
      }
      if (url.includes('/api/ai/events')) return openSseResponse()
      if (url.endsWith('/api/ai/message')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        if (body.type === 'newTask') newTaskCount += 1
        return jsonResponse({ success: true })
      }
      if (url.includes('/getTaskInfo/')) {
        return jsonResponse({ code: 200, data: { status: 'completed' } })
      }
      if (url.includes('/getUiMessageById')) {
        return jsonResponse({ code: 200, data: { messages: [] } })
      }
      if (url.includes('/getTaskWorkspace/')) {
        return jsonResponse({
          code: 200,
          data: { cwd: '/task', files: ['final/label-extraction.json'] },
        })
      }
      if (url.endsWith('/api/ai_task/previewFile')) {
        return jsonResponse({
          code: 200,
          data: { content: JSON.stringify(finalResult), fileType: 'json' },
        })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    const manager = new RecognitionTaskManager({
      getApiKey: () => 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
      serviceOptions: { sseReadyWaitMs: 0 },
    })
    const started = await manager.start([image('ingredients')])
    const replacement = new RecognitionTaskManager({
      getApiKey: () => 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
      serviceOptions: { sseReadyWaitMs: 0 },
    })

    const recovered = await replacement.status(started.taskId)

    expect(started.status).toBe('processing')
    expect(recovered).toMatchObject({
      status: 'completed',
      taskId: started.taskId,
      result: finalResult,
    })
    expect(newTaskCount).toBe(1)
  })
})
