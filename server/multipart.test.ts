import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { readRecognitionImages } from './multipart'

function requestWithParts(
  parts: Array<{ name: string; filename: string; type: string; data: Buffer }>,
) {
  const boundary = '----label-lens-test-boundary'
  const chunks: Buffer[] = []
  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.type}\r\n\r\n`,
      ),
      part.data,
      Buffer.from('\r\n'),
    )
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  const request = Readable.from([Buffer.concat(chunks)]) as Readable & {
    headers: Record<string, string>
  }
  request.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
  }
  return request
}

describe('readRecognitionImages', () => {
  it('accepts at most one ingredient image and one nutrition image', async () => {
    const request = requestWithParts([
      {
        name: 'ingredientImage',
        filename: 'a.jpg',
        type: 'image/jpeg',
        data: Buffer.from([0xff, 0xd8, 0xff, 0x01]),
      },
      {
        name: 'nutritionImage',
        filename: 'b.webp',
        type: 'image/webp',
        data: Buffer.from('RIFFxxxxWEBPpayload'),
      },
    ])

    const files = await readRecognitionImages(request as never)

    expect(files.map((file) => file.kind)).toEqual(['ingredients', 'nutrition'])
    expect(files.map((file) => file.filename)).toEqual([
      'ingredients-label.jpg',
      'nutrition-label.webp',
    ])
  })

  it('rejects files whose bytes do not match the declared image type', async () => {
    const request = requestWithParts([
      {
        name: 'ingredientImage',
        filename: 'fake.jpg',
        type: 'image/jpeg',
        data: Buffer.from('not-an-image'),
      },
    ])

    await expect(readRecognitionImages(request as never)).rejects.toThrow(
      '图片内容与文件类型不一致',
    )
  })
})
