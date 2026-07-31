import { describe, expect, it } from 'vitest'
import { buildLabelRecognitionPrompt } from './labelRecognition'

describe('buildLabelRecognitionPrompt', () => {
  it('uses pre-attached files and requires a strict workspace JSON artifact', () => {
    const prompt = buildLabelRecognitionPrompt([
      { kind: 'ingredients', filename: 'ingredients-label.jpg' },
      { kind: 'nutrition', filename: 'nutrition-label.jpg' },
    ])

    expect(prompt).toContain('files[] 附件')
    expect(prompt).toContain('直接读取 files[]')
    expect(prompt).toContain('不得再次要求用户上传文件')
    expect(prompt).toContain('不得返回 followup')
    expect(prompt).toContain('只有一张图片也必须继续识别')
    expect(prompt).not.toContain('upload_file_to_sandbox')
    expect(prompt).toContain('final/label-extraction.json')
    expect(prompt).toContain('不得使用 Markdown 代码块')
    expect(prompt).toContain('"nutritionBasis"')
    expect(prompt).toContain('"per100ml"')
    expect(prompt).toContain('"energyUnit"')
    expect(prompt).toContain('严格区分 kJ 与 kcal、g 与 mg')
    expect(prompt).toContain('不得换算')
    expect(prompt).toContain('不识别价格')
    expect(prompt).toContain('不要生成长报告')
    expect(prompt).toContain('两个独立任务')
    expect(prompt).not.toContain('"servingSize"')
  })
})
