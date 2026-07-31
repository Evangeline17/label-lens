import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyProduct } from '../data/mockProducts'
import type { LabelRecognitionResult } from '../types'
import {
  applyRecognitionDraft,
  abandonLabelRecognition,
  completedRecognitionSession,
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
  servingSize: null,
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

  it('keeps the OCR result in confirmation state until the user applies it', () => {
    const product = createEmptyProduct(0)
    const session = completedRecognitionSession({
      result: recognized,
      rawText: { ingredients: '配料表：生牛乳、乳酸菌', nutrition: '能量 330kJ' },
      fieldSources: {},
      warnings: [],
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

  it('posts images only to the synchronous local OCR endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: recognized,
          rawText: { ingredients: '配料表：生牛乳', nutrition: null },
          fieldSources: {},
          warnings: [],
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

    expect(output.result.energyUnit).toBe('kJ')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ocr/label')
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('/api/recognize')
  })

  it('abandons only the local recognition state', () => {
    expect(abandonLabelRecognition()).toEqual({ status: 'idle' })
  })
})
