export interface SingleFlightEntry<T> {
  promise: Promise<T>
  validUntil: number
}

export class SingleFlightCache<T> {
  private readonly entries = new Map<string, SingleFlightEntry<T>>()
  private readonly reuseMs: number

  constructor(reuseMs: number) {
    this.reuseMs = reuseMs
  }

  async run(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key)
    if (existing && existing.validUntil > Date.now()) return existing.promise

    const entry: SingleFlightEntry<T> = { validUntil: Number.POSITIVE_INFINITY, promise: factory() }
    this.entries.set(key, entry)
    try {
      const result = await entry.promise
      entry.validUntil = Date.now() + this.reuseMs
      const cleanup = setTimeout(() => {
        if (this.entries.get(key) === entry) this.entries.delete(key)
      }, this.reuseMs)
      cleanup.unref?.()
      return result
    } catch (error) {
      this.entries.delete(key)
      throw error
    }
  }
}
