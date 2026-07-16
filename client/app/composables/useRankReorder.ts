interface RankApiResponse<T> {
  data: T
}

export function moveRankedItem<T>(items: T[], oldIndex: number, newIndex: number): T[] {
  if (oldIndex === newIndex || oldIndex < 0 || newIndex < 0) return [...items]
  const next = [...items]
  const [moved] = next.splice(oldIndex, 1)
  if (moved === undefined) return [...items]
  next.splice(newIndex, 0, moved)
  return next
}

export function normalizeRankOrder<T extends { rank: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, rank: index + 1 }))
}

export function useRankReorder() {
  const { apiFetch } = useApi()
  const savingRank = ref(false)

  async function persistRankOrder<T extends { rank: number }>(
    path: string,
    items: T[],
    getId: (item: T) => string
  ): Promise<T[]> {
    savingRank.value = true
    try {
      const normalized = normalizeRankOrder(items)
      const response = await apiFetch<RankApiResponse<T[]>>(path, {
        method: 'PUT',
        body: {
          items: normalized.map(item => ({ id: getId(item), rank: item.rank }))
        }
      })
      return response.data
    } finally {
      savingRank.value = false
    }
  }

  return { savingRank, persistRankOrder }
}
