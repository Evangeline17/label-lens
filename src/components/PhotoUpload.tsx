import { ImagePlus, Trash2 } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { compressLabelImage } from '../lib/imageCompression'
import type { PhotoPreview } from '../types'

interface Props {
  id: string
  label: string
  preview?: PhotoPreview
  onChange: (preview?: PhotoPreview) => void
}

export function PhotoUpload({ id, label, preview, onChange }: Props) {
  const [error, setError] = useState('')
  const [compressing, setCompressing] = useState(false)

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    setCompressing(true)
    event.target.value = ''
    try {
      const compressed = await compressLabelImage(file)
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onChange({
            name: compressed.name,
            dataUrl: reader.result,
            file: compressed,
            size: compressed.size,
          })
        }
        setCompressing(false)
      }
      reader.onerror = () => {
        setError('无法生成图片预览，请换一张重试。')
        setCompressing(false)
      }
      reader.readAsDataURL(compressed)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '图片处理失败，请换一张重试。')
      setCompressing(false)
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/70 p-3">
      {preview ? (
        <div className="flex items-center gap-3">
          <img
            className="h-16 w-16 shrink-0 rounded-xl border border-stone-200 bg-white object-cover"
            src={preview.dataUrl}
            alt={`${label}预览`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{preview.name}</p>
            <p className="mt-1 text-xs text-stone-500">
              {(preview.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brick"
            >
              <Trash2 size={14} aria-hidden="true" />
              删除图片
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-bold text-stone-600 transition hover:bg-white hover:text-orange"
        >
          <ImagePlus size={18} aria-hidden="true" />
          {compressing ? '正在压缩图片…' : label}
        </label>
      )}
      <input
        id={id}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={compressing}
        onChange={handleFile}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold leading-5 text-brick">
          {error}
        </p>
      )}
    </div>
  )
}
