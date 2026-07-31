const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024
export const MAX_COMPRESSED_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_IMAGE_EDGE = 2_200

export function validateImageFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return '仅支持 JPEG、PNG 或 WebP 图片。'
  if (file.size <= 0) return '图片文件不能为空。'
  if (file.size > MAX_SOURCE_IMAGE_BYTES) return '原始图片不能超过 12MB。'
  return null
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取这张图片，请换一张重试。'))
    }
    image.src = url
  })
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('图片压缩失败，请换一张重试。'))
      },
      type,
      quality,
    )
  })
}

export async function compressLabelImage(file: File): Promise<File> {
  const validation = validateImageFile(file)
  if (validation) throw new Error(validation)
  const image = await loadImage(file)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法压缩图片，请改为手动录入。')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  let blob = await canvasBlob(canvas, outputType, 0.9)
  if (blob.size > MAX_COMPRESSED_IMAGE_BYTES && outputType !== 'image/png') {
    blob = await canvasBlob(canvas, outputType, 0.8)
  }
  if (blob.size > MAX_COMPRESSED_IMAGE_BYTES) {
    throw new Error('压缩后图片仍超过 4MB，请裁剪到标签区域后重试。')
  }
  if (file.size <= MAX_COMPRESSED_IMAGE_BYTES && file.size <= blob.size) return file
  const extension = outputType === 'image/png' ? 'png' : 'jpg'
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'label'
  return new File([blob], `${baseName}.${extension}`, {
    type: outputType,
    lastModified: Date.now(),
  })
}
