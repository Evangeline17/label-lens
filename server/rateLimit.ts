interface RateEntry {
  startedAt: number[]
  active: boolean
}

export class AnalyzeRateLimiter {
  private readonly entries = new Map<string, RateEntry>()

  constructor(
    private readonly windowMs = 60_000,
    private readonly maxStarts = 2,
  ) {}

  acquire(key: string, now = Date.now()): { release: () => void } | null {
    const existing = this.entries.get(key) ?? { startedAt: [], active: false }
    existing.startedAt = existing.startedAt.filter((startedAt) => now - startedAt < this.windowMs)
    if (existing.active || existing.startedAt.length >= this.maxStarts) return null
    existing.active = true
    existing.startedAt.push(now)
    this.entries.set(key, existing)
    let released = false
    return {
      release: () => {
        if (released) return
        released = true
        const current = this.entries.get(key)
        if (current) current.active = false
      },
    }
  }
}
