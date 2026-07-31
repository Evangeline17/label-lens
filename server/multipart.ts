import type { IncomingMessage } from 'node:http'
import type { LabelImageKind, LabelImageUpload } from './types.js'
import { ValidationError } from './validation.js'

const MAX_REQUEST_BYTES = 9 * 1024 * 1024
const MAX_FILE_BYTES = 4 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const FIELD_KIND: Record<string, LabelImageKind | undefined> = {
  ingredientImage: 'ingredients',
  ingredientsImage: 'ingredients',
  nutritionImage: 'nutrition',
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_REQUEST_BYTES) {
      throw new ValidationError(['图片上传请求不能超过9MB'])
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function quotedValue(header: string, name: string): string | null {
  const match = header.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return match?.[1] ?? null
}

function hasValidSignature(type: string, data: Buffer): boolean {
  if (type === 'image/jpeg') {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  }
  if (type === 'image/png') {
    return (
      data.length >= 8 &&
      data.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    )
  }
  return (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

function safeFilename(kind: LabelImageKind, type: string): string {
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  return `${kind}-label.${extension}`
}

export async function readRecognitionImages(
  request: IncomingMessage,
): Promise<LabelImageUpload[]> {
  const contentType = String(request.headers['content-type'] ?? '')
  const boundaryMatch = contentType.match(
    /^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i,
  )
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]
  if (!boundary || boundary.length > 200) {
    throw new ValidationError(['请求必须使用合法的multipart/form-data'])
  }

  const body = await readBody(request)
  const delimiter = Buffer.from(`--${boundary}`)
  const headerSeparator = Buffer.from('\r\n\r\n')
  const files: LabelImageUpload[] = []
  let cursor = body.indexOf(delimiter)

  while (cursor >= 0) {
    let partStart = cursor + delimiter.length
    if (body.subarray(partStart, partStart + 2).toString() === '--') break
    if (body.subarray(partStart, partStart + 2).toString() === '\r\n') partStart += 2
    const headersEnd = body.indexOf(headerSeparator, partStart)
    if (headersEnd < 0) break
    const nextBoundary = body.indexOf(delimiter, headersEnd + headerSeparator.length)
    if (nextBoundary < 0) break
    const headerText = body.subarray(partStart, headersEnd).toString('utf8')
    const disposition =
      headerText
        .split('\r\n')
        .find((line) => line.toLowerCase().startsWith('content-disposition:')) ?? ''
    const fieldName = quotedValue(disposition, 'name')
    const originalFilename = quotedValue(disposition, 'filename')
    let dataEnd = nextBoundary
    if (body.subarray(dataEnd - 2, dataEnd).toString() === '\r\n') dataEnd -= 2

    if (fieldName && originalFilename !== null) {
      const kind = FIELD_KIND[fieldName]
      if (!kind) throw new ValidationError(['只允许上传配料表和营养成分表图片'])
      if (files.some((file) => file.kind === kind)) {
        throw new ValidationError([`${fieldName}只能上传一张图片`])
      }
      const typeHeader =
        headerText
          .split('\r\n')
          .find((line) => line.toLowerCase().startsWith('content-type:')) ?? ''
      const fileType = typeHeader.slice(typeHeader.indexOf(':') + 1).trim().toLowerCase()
      if (!ALLOWED_TYPES.has(fileType)) {
        throw new ValidationError(['图片仅支持JPEG、PNG或WebP'])
      }
      const data = Buffer.from(body.subarray(headersEnd + headerSeparator.length, dataEnd))
      if (!data.length) throw new ValidationError(['图片文件不能为空'])
      if (data.length > MAX_FILE_BYTES) {
        throw new ValidationError(['每张压缩后的图片不能超过4MB'])
      }
      if (!hasValidSignature(fileType, data)) {
        throw new ValidationError(['图片内容与文件类型不一致'])
      }
      files.push({
        kind,
        filename: safeFilename(kind, fileType),
        contentType: fileType as LabelImageUpload['contentType'],
        data,
      })
    }
    cursor = nextBoundary
  }

  if (!files.length) throw new ValidationError(['请至少上传一张标签图片'])
  if (files.length > 2) throw new ValidationError(['每次最多上传两张标签图片'])
  return files
}
