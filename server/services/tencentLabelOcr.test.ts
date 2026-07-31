import { describe, expect, it, vi } from 'vitest'
import type { LabelImageUpload } from '../types'
import { TencentLabelOcrService } from './tencentLabelOcr'

function image(kind: LabelImageUpload['kind'], data: string): LabelImageUpload {
  return {
    kind,
    filename: `${kind}.jpg`,
    contentType: 'image/jpeg',
    data: Buffer.from(data),
  }
}

describe('TencentLabelOcrService', () => {
  it('calls GeneralAccurateOCR once per image with ImageBase64 and no task flow', async () => {
    const GeneralAccurateOCR = vi
      .fn()
      .mockResolvedValueOnce({
        TextDetections: [{ DetectedText: '配料表：生牛乳', Confidence: 99 }],
      })
      .mockResolvedValueOnce({
        TextDetections: [
          { DetectedText: '每100g', Confidence: 99 },
          { DetectedText: '能量 320kJ', Confidence: 99 },
        ],
      })
    const service = new TencentLabelOcrService({
      client: { GeneralAccurateOCR },
    })

    const output = await service.recognize([
      image('ingredients', 'ingredients-bytes'),
      image('nutrition', 'nutrition-bytes'),
    ])

    expect(GeneralAccurateOCR).toHaveBeenCalledTimes(2)
    expect(GeneralAccurateOCR).toHaveBeenNthCalledWith(1, {
      ImageBase64: Buffer.from('ingredients-bytes').toString('base64'),
    })
    expect(GeneralAccurateOCR).toHaveBeenNthCalledWith(2, {
      ImageBase64: Buffer.from('nutrition-bytes').toString('base64'),
    })
    expect(output).not.toHaveProperty('taskId')
    expect(JSON.stringify(GeneralAccurateOCR.mock.calls)).not.toContain('newTask')
    expect(JSON.stringify(GeneralAccurateOCR.mock.calls)).not.toContain('askResponse')
  })
})
