import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function loadLocalEnv(cwd = process.cwd()): void {
  const envPath = resolve(cwd, '.env.local')
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue
    if (process.env[key] !== undefined) continue
    process.env[key] = unquote(line.slice(separator + 1))
  }
}
