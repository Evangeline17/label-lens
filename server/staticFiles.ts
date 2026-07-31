import { createReadStream, existsSync, statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

function safeAssetPath(distDir: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const relative = decoded.replace(/^\/+/, '')
  const candidate = resolve(distDir, relative)
  const root = resolve(distDir)
  return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : null
}

function sendFile(response: ServerResponse, path: string, headOnly: boolean): void {
  const extension = extname(path).toLowerCase()
  const cacheControl =
    extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  response.writeHead(200, {
    'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
    'Content-Length': statSync(path).size,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  })
  if (headOnly) {
    response.end()
    return
  }
  createReadStream(path).pipe(response)
}

export function serveFrontend(
  response: ServerResponse,
  pathname: string,
  distDir: string,
  method: string | undefined,
): void {
  if (method !== 'GET' && method !== 'HEAD') {
    response.writeHead(405, {
      'Content-Type': 'application/json; charset=utf-8',
      Allow: 'GET, HEAD',
      'Cache-Control': 'no-store',
    })
    response.end(JSON.stringify({ error: '静态页面仅支持 GET 或 HEAD。' }))
    return
  }

  const headOnly = method === 'HEAD'
  const requested = pathname === '/' ? resolve(distDir, 'index.html') : safeAssetPath(distDir, pathname)
  if (requested && isFile(requested)) {
    sendFile(response, requested, headOnly)
    return
  }

  const indexPath = resolve(distDir, 'index.html')
  if (isFile(indexPath)) {
    sendFile(response, indexPath, headOnly)
    return
  }

  response.writeHead(503, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify({ error: '前端构建产物不存在，请先运行 npm run build。' }))
}
