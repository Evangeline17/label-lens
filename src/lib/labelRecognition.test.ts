import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyProduct } from '../data/mockProducts'
import type { LabelRecognitionResult } from '../types'
import {
  applyRecognitionDraft,
  abandonLabelRecognition,
  canConfirmRecognition,
  markRecognitionImagesChanged,
  mergeRecognitionStatus,
  recognitionActionLabel,
  recognitionResultToDraft,
  startLabelRecognition,
} from './labelRecognition'

afterEach(() => {
  vi.unstubAllGlobals()
})

const recognized: LabelRecognitionResult = {
  productName: '识别名称',
  ingredientsText: '生牛乳、乳酸菌',
  netContent: 200,
  netContentUnit: 'g',
  nutritionBasis: 'per100g',
  energyValue: 330,
  energyUnit: 'kJ',
  protein: 9,
  fat: 3,
  carbohydrate: 5.5,
  sodium: 65,
}

describe('label recognition confirmation', () => {
  it('does not write recognized values until the edited draft is explicitly applied', () => {
    const product = {
      ...createEmptyProduct(0),
      name: '手动名称',
      price: '8.9',
    }
    const draft = recognitionResultToDraft(recognized)
    draft.productName = '用户确认后的名称'
    draft.protein = '8.8'

    expect(product.name).toBe('手动名称')
    expect(product.protein).toBe('')

    const confirmed = applyRecognitionDraft(product, draft)
    expect(confirmed.name).toBe('用户确认后的名称')
    expect(confirmed.protein).toBe('8.8')
    expect(confirmed.price).toBe('8.9')
  })

  it('keeps the InfiniSynapse result in confirmation state until the user applies it', () => {
    const product = createEmptyProduct(0)
    const session = mergeRecognitionStatus({ status: 'processing' }, {
      status: 'completed',
      taskId: '6f645da0-63b5-487e-9cc8-745b1d608001',
      result: recognized,
      imageKinds: ['ingredients', 'nutrition'],
    })

    expect(session.status).toBe('completed')
    expect(product.name).not.toBe('识别名称')
    expect(applyRecognitionDraft(product, session.draft!)).toMatchObject({
      name: '识别名称',
      energy: '330',
      energyUnit: 'kJ',
    })
  })

  it('leaves existing manual fields unchanged when recognition is unknown or blank', () => {
    const product = {
      ...createEmptyProduct(0),
      name: '手动录入商品',
      netContent: '180',
      basis: 'perServing' as const,
      energy: '270',
    }
    const draft = recognitionResultToDraft({
      ...recognized,
      productName: null,
      netContent: null,
      nutritionBasis: 'unknown',
      energyValue: null,
    })

    expect(applyRecognitionDraft(product, draft)).toMatchObject({
      name: '手动录入商品',
      netContent: '180',
      basis: 'perServing',
      energy: '270',
    })
  })

  it('turns a fetch network failure into a clear backend reachability message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'label.jpg', {
      type: 'image/jpeg',
    })

    await expect(
      startLabelRecognition({
        name: file.name,
        dataUrl: 'data:image/jpeg;base64,/9j/',
        file,
        size: file.size,
      }),
    ).rejects.toThrow('图片识别请求未到达后端')
  })

  it('includes the HTTP status and server safe error for a backend response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'multipart 图片为空' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'label.jpg', {
      type: 'image/jpeg',
    })

    await expect(
      startLabelRecognition({
        name: file.name,
        dataUrl: 'data:image/jpeg;base64,/9j/',
        file,
        size: file.size,
      }),
    ).rejects.toThrow('服务端返回 HTTP 400：multipart 图片为空')
  })

  it('posts images to the local OCR path and receives an asynchronous taskId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'processing',
          taskId: '6f645da0-63b5-487e-9cc8-745b1d608001',
          progress: '识别任务已提交',
          imageKinds: ['ingredients'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'label.jpg', {
      type: 'image/jpeg',
    })

    const output = await startLabelRecognition({
      name: file.name,
      dataUrl: 'data:image/jpeg;base64,/9j/',
      file,
      size: file.size,
    })

    expect(output.status).toBe('processing')
    expect(output.taskId).toBe('6f645da0-63b5-487e-9cc8-745b1d608001')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ocr/label')
  })

  it('abandons only the local recognition state', () => {
    expect(abandonLabelRecognition()).toEqual({ status: 'idle' })
  })

  it('marks a completed single-image result stale when a second image is added', () => {
    const stale = markRecognitionImagesChanged({
      status: 'completed',
      taskId: 'old-task',
      result: recognized,
      draft: recognitionResultToDraft(recognized),
      imageKinds: ['ingredients'],
    })

    expect(stale).toMatchObject({ status: 'completed', stale: true, result: recognized })
    expect(stale.taskId).toBeUndefined()
    expect(recognitionActionLabel(true, stale)).toBe('重新识别当前图片')
    expect(canConfirmRecognition(stale)).toBe(false)
  })

  it('marks an old result stale when an image is replaced', () => {
    const stale = markRecognitionImagesChanged({
      status: 'completed',
      taskId: 'old-task',
      result: recognized,
    })

    expect(stale.stale).toBe(true)
    expect(stale.taskId).toBeUndefined()
    expect(stale.error).toBeUndefined()
  })

  it('allows recognition after one of two images is deleted and one remains', () => {
    const stale = markRecognitionImagesChanged({
      status: 'completed',
      result: recognized,
      imageKinds: ['ingredients', 'nutrition'],
    })

    expect(recognitionActionLabel(true, stale)).toBe('重新识别当前图片')
  })

  it('does not make a network request merely because images changed', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    markRecognitionImagesChanged({ status: 'processing', taskId: 'old-task' })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not offer another recognition action while processing', () => {
    expect(
      recognitionActionLabel(true, { status: 'processing', taskId: 'active-task' }),
    ).toBeNull()
  })

  it('does not clear confirmed product fields when images change', () => {
    const product = { ...createEmptyProduct(0), name: '已确认商品', protein: '9' }
    const stale = markRecognitionImagesChanged({
      status: 'completed',
      result: recognized,
      confirmedAt: '2026-08-01T00:00:00.000Z',
    })

    expect(product).toMatchObject({ name: '已确认商品', protein: '9' })
    expect(stale.confirmedAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it.each(['idle', 'completed', 'failed', 'not_found', 'unknown'] as const)(
    'always offers an action for a photo in non-running %s state',
    (status) => {
      expect(recognitionActionLabel(true, { status })).not.toBeNull()
    },
  )
})
