import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppHandler } from '../app'
import type { LabelOcrServiceLike } from './ocrLabel'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        }),
    ),
  )
})

async function listen(ocrService?: LabelOcrServiceLike): Promise<string> {
  const server = createServer(
    createAppHandler({
      isRecognitionBetaEnabled: () => true,
      getTencentSecretId: () => undefined,
      getTencentSecretKey: () => undefined,
      ocrService,
    }),
  )
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('测试服务启动失败')
  return `http://127.0.0.1:${address.port}`
}

function jpegFile(name: string): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0x01])], name, {
    type: 'image/jpeg',
  })
}

describe('POST /api/ocr/label', () => {
  it('returns a synchronous structured result without taskId', async () => {
    const recognize = vi.fn().mockResolvedValue({
      result: {
        productName: null,
        ingredientsText: '生牛乳',
        netContent: null,
        netContentUnit: null,
        nutritionBasis: 'unknown',
        servingSize: null,
        energyValue: null,
        energyUnit: null,
        protein: null,
        fat: null,
        carbohydrate: null,
        sodium: null,
      },
      rawText: { ingredients: '配料表：生牛乳', nutrition: null },
      fieldSources: {},
      warnings: [],
      imageKinds: ['ingredients'],
    })
    const baseUrl = await listen({ recognize })
    const body = new FormData()
    body.append('ingredientsImage', jpegFile('ingredients.jpg'))

    const response = await fetch(`${baseUrl}/api/ocr/label`, {
      method: 'POST',
      body,
    })
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).not.toHaveProperty('taskId')
    expect(result.result.ingredientsText).toBe('生牛乳')
    expect(recognize).toHaveBeenCalledTimes(1)
    expect(recognize.mock.calls[0][0][0]).toMatchObject({ kind: 'ingredients' })
  })

  it('returns a safe missing-credential error without consuming the body', async () => {
    const baseUrl = await listen()
    const response = await fetch(`${baseUrl}/api/ocr/label`, {
      method: 'POST',
      body: new FormData(),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: '未配置腾讯云 OCR 服务端凭证，请继续手动录入。',
    })
  })
})
