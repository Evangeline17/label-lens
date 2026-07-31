import type {
  LabelImageKind,
  LabelOcrFieldSource,
  LabelOcrOutput,
  LabelRecognitionResult,
} from '../types.js'

export interface TencentTextDetection {
  DetectedText?: string
  Confidence?: number
  Polygon?: Array<{ X?: number; Y?: number }>
  ItemPolygon?: { X?: number; Y?: number; Width?: number; Height?: number }
}

interface OcrLine {
  text: string
  confidence: number | null
  x: number
  y: number
  height: number
}

const LOW_CONFIDENCE = 85

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function detectionBox(
  detection: TencentTextDetection,
  fallbackIndex: number,
): Omit<OcrLine, 'text' | 'confidence'> {
  const item = detection.ItemPolygon
  const polygon = detection.Polygon ?? []
  const xs = polygon.map((point) => finite(point.X)).filter((value): value is number => value !== null)
  const ys = polygon.map((point) => finite(point.Y)).filter((value): value is number => value !== null)
  const x = finite(item?.X) ?? (xs.length ? Math.min(...xs) : 0)
  const y = finite(item?.Y) ?? (ys.length ? Math.min(...ys) : fallbackIndex * 30)
  const height =
    finite(item?.Height) ?? (ys.length > 1 ? Math.max(...ys) - Math.min(...ys) : 20)
  return { x, y, height: Math.max(1, height) }
}

export function mergeTextDetections(
  detections: TencentTextDetection[] = [],
): OcrLine[] {
  const positioned = detections
    .map((detection, index) => {
      const text = detection.DetectedText?.trim()
      if (!text) return null
      return {
        text,
        confidence: finite(detection.Confidence),
        ...detectionBox(detection, index),
      }
    })
    .filter((line): line is OcrLine => line !== null)
    .sort((left, right) => left.y - right.y || left.x - right.x)

  const rows: OcrLine[][] = []
  for (const line of positioned) {
    const current = rows.at(-1)
    if (!current) {
      rows.push([line])
      continue
    }
    const averageY = current.reduce((sum, item) => sum + item.y, 0) / current.length
    const averageHeight = current.reduce((sum, item) => sum + item.height, 0) / current.length
    if (Math.abs(line.y - averageY) <= Math.max(6, averageHeight * 0.55)) {
      current.push(line)
    } else {
      rows.push([line])
    }
  }

  return rows.map((row) => {
    const ordered = row.sort((left, right) => left.x - right.x)
    const confidences = ordered
      .map((line) => line.confidence)
      .filter((value): value is number => value !== null)
    return {
      text: ordered.map((line) => line.text).join(' ').replace(/\s+/g, ' ').trim(),
      confidence: confidences.length ? Math.min(...confidences) : null,
      x: Math.min(...ordered.map((line) => line.x)),
      y: Math.min(...ordered.map((line) => line.y)),
      height: Math.max(...ordered.map((line) => line.height)),
    }
  })
}

function emptyResult(): LabelRecognitionResult {
  return {
    productName: null,
    ingredientsText: null,
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
  }
}

type FieldName = keyof LabelRecognitionResult

function source(
  kind: LabelImageKind,
  lines: OcrLine[],
): LabelOcrFieldSource[] {
  return lines.map((line) => ({
    imageKind: kind,
    text: line.text,
    confidence: line.confidence,
  }))
}

function numericMatch(
  lines: OcrLine[],
  label: RegExp,
  unit: RegExp,
): { value: number; unit: string; line: OcrLine } | null {
  for (const line of lines) {
    if (!label.test(line.text)) continue
    const match = line.text.match(new RegExp(`${label.source}[\\s：:]*([0-9]+(?:\\.[0-9]+)?)\\s*(${unit.source})`, 'i'))
    if (!match) continue
    const value = Number(match[1])
    if (!Number.isFinite(value) || value < 0) continue
    return { value, unit: match[2], line }
  }
  return null
}

function ingredientFields(lines: OcrLine[]) {
  const fields: Partial<LabelRecognitionResult> = {}
  const sources: Partial<Record<FieldName, LabelOcrFieldSource[]>> = {}
  const nameLine = lines.find((line) => /^(?:产品名称|商品名称|品名)\s*[：:]/.test(line.text))
  const name = nameLine?.text.replace(/^(?:产品名称|商品名称|品名)\s*[：:]\s*/, '').trim()
  if (nameLine && name) {
    fields.productName = name.slice(0, 100)
    sources.productName = source('ingredients', [nameLine])
  }

  const start = lines.findIndex((line) => /(?:^|\s)(?:配料表|配料)\s*[：:]/.test(line.text))
  if (start >= 0) {
    const selected: OcrLine[] = []
    for (let index = start; index < lines.length; index += 1) {
      const line = lines[index]
      if (index > start && /^(?:净含量|营养成分|保质期|生产日期|储存|贮存|执行标准)/.test(line.text)) break
      selected.push(line)
    }
    const text = selected
      .map((line, index) =>
        index === 0 ? line.text.replace(/^.*?(?:配料表|配料)\s*[：:]\s*/, '') : line.text,
      )
      .join(' ')
      .trim()
    if (text) {
      fields.ingredientsText = text.slice(0, 4000)
      sources.ingredientsText = source('ingredients', selected)
    }
  }

  const net = numericMatch(lines, /净含量/, /g|克|ml|mL|毫升/)
  if (net) {
    fields.netContent = net.value
    fields.netContentUnit = /ml|毫升/i.test(net.unit) ? 'mL' : 'g'
    sources.netContent = source('ingredients', [net.line])
    sources.netContentUnit = source('ingredients', [net.line])
  }
  return { fields, sources }
}

function nutritionFields(lines: OcrLine[]) {
  const fields: Partial<LabelRecognitionResult> = {}
  const sources: Partial<Record<FieldName, LabelOcrFieldSource[]>> = {}
  const basisLine = lines.find((line) => /每\s*100\s*(?:g|克|mL|ml|毫升)|每\s*份/.test(line.text))
  if (basisLine) {
    fields.nutritionBasis = /每\s*100\s*(?:mL|ml|毫升)/i.test(basisLine.text)
      ? 'per100ml'
      : /每\s*100\s*(?:g|克)/i.test(basisLine.text)
        ? 'per100g'
        : /每\s*份/.test(basisLine.text)
          ? 'perServing'
          : 'unknown'
    sources.nutritionBasis = source('nutrition', [basisLine])
  }

  const energy = numericMatch(lines, /能量/, /kJ|千焦|kcal|千卡/)
  if (energy) {
    fields.energyValue = energy.value
    fields.energyUnit = /kcal|千卡/i.test(energy.unit) ? 'kcal' : 'kJ'
    sources.energyValue = source('nutrition', [energy.line])
    sources.energyUnit = source('nutrition', [energy.line])
  }
  const nutrientDefinitions = [
    ['protein', /蛋白质/, /g|克/],
    ['fat', /脂肪/, /g|克/],
    ['carbohydrate', /碳水化合物/, /g|克/],
    ['sodium', /钠/, /mg|毫克/],
  ] as const
  for (const [field, label, unit] of nutrientDefinitions) {
    const match = numericMatch(lines, label, unit)
    if (!match) continue
    fields[field] = match.value
    sources[field] = source('nutrition', [match.line])
  }
  return { fields, sources }
}

function lowConfidenceWarnings(
  sources: Partial<Record<FieldName, LabelOcrFieldSource[]>>,
): string[] {
  const labels: Partial<Record<FieldName, string>> = {
    productName: '商品名称',
    ingredientsText: '配料表',
    netContent: '净含量',
    netContentUnit: '净含量单位',
    nutritionBasis: '营养标示基准',
    energyValue: '能量',
    energyUnit: '能量单位',
    protein: '蛋白质',
    fat: '脂肪',
    carbohydrate: '碳水化合物',
    sodium: '钠',
  }
  return Object.entries(sources)
    .filter(([, fieldSources]) =>
      fieldSources?.some(
        (fieldSource) =>
          fieldSource.confidence !== null && fieldSource.confidence < LOW_CONFIDENCE,
      ),
    )
    .map(([field]) => `${labels[field as FieldName] ?? field}来源行置信度较低，请重点核对。`)
}

export function parseLabelOcrDetections(input: {
  ingredients?: TencentTextDetection[]
  nutrition?: TencentTextDetection[]
}): LabelOcrOutput {
  const ingredientsLines = mergeTextDetections(input.ingredients)
  const nutritionLines = mergeTextDetections(input.nutrition)
  const ingredient = ingredientFields(ingredientsLines)
  const nutrition = nutritionFields(nutritionLines)
  const result = { ...emptyResult(), ...ingredient.fields, ...nutrition.fields }
  const fieldSources = { ...ingredient.sources, ...nutrition.sources }
  return {
    result,
    rawText: {
      ingredients: ingredientsLines.length
        ? ingredientsLines.map((line) => line.text).join('\n')
        : null,
      nutrition: nutritionLines.length
        ? nutritionLines.map((line) => line.text).join('\n')
        : null,
    },
    fieldSources,
    warnings: lowConfidenceWarnings(fieldSources),
    imageKinds: [
      ...(input.ingredients ? (['ingredients'] as const) : []),
      ...(input.nutrition ? (['nutrition'] as const) : []),
    ],
  }
}
