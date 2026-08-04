import type { PhotoPreview, Product } from '../types'

const DATABASE_NAME = 'label-lens-recognition-images'
const STORE_NAME = 'photos'
const DATABASE_VERSION = 1

interface StoredRecognitionPhoto {
  key: string
  productId: string
  kind: 'ingredientPhoto' | 'nutritionPhoto'
  name: string
  type: string
  size: number
  lastModified: number
  blob: Blob
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('无法恢复标签图片预览。'))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function putPhoto(
  database: IDBDatabase,
  productId: string,
  kind: StoredRecognitionPhoto['kind'],
  preview?: PhotoPreview,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const key = `${productId}:${kind}`
    if (preview) {
      store.put({
        key,
        productId,
        kind,
        name: preview.name,
        type: preview.file.type,
        size: preview.size,
        lastModified: preview.file.lastModified,
        blob: preview.file,
      } satisfies StoredRecognitionPhoto)
    } else {
      store.delete(key)
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function saveRecognitionImages(product: Product): Promise<void> {
  if (!product.ingredientPhoto && !product.nutritionPhoto) return
  try {
    const database = await openDatabase()
    if (!database) return
    await putPhoto(database, product.id, 'ingredientPhoto', product.ingredientPhoto)
    await putPhoto(database, product.id, 'nutritionPhoto', product.nutritionPhoto)
    database.close()
  } catch {
    // Image recovery is best effort; the current in-memory upload remains usable.
  }
}

export async function clearRecognitionImages(productId: string): Promise<void> {
  try {
    const database = await openDatabase()
    if (!database) return
    await putPhoto(database, productId, 'ingredientPhoto')
    await putPhoto(database, productId, 'nutritionPhoto')
    database.close()
  } catch {
    // Cleanup failure must not affect a completed recognition result.
  }
}

async function getPhoto(
  database: IDBDatabase,
  productId: string,
  kind: StoredRecognitionPhoto['kind'],
): Promise<PhotoPreview | undefined> {
  const stored = await new Promise<StoredRecognitionPhoto | undefined>((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(`${productId}:${kind}`)
    request.onsuccess = () => resolve(request.result as StoredRecognitionPhoto | undefined)
    request.onerror = () => reject(request.error)
  })
  if (!stored) return undefined
  const file = new File([stored.blob], stored.name, {
    type: stored.type,
    lastModified: stored.lastModified,
  })
  return { name: stored.name, size: stored.size, file, dataUrl: await dataUrl(file) }
}

export async function loadRecognitionImages(
  productId: string,
): Promise<Pick<Product, 'ingredientPhoto' | 'nutritionPhoto'>> {
  try {
    const database = await openDatabase()
    if (!database) return {}
    const ingredientPhoto = await getPhoto(database, productId, 'ingredientPhoto')
    const nutritionPhoto = await getPhoto(database, productId, 'nutritionPhoto')
    database.close()
    return { ingredientPhoto, nutritionPhoto }
  } catch {
    return {}
  }
}
