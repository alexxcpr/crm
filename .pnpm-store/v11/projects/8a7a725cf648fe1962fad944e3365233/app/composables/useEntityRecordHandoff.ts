const ENTITY_RECORD_HANDOFF_KEY = 'entity-record-handoff'

function makeHandoffKey(entitySlug: string, recordId: string) {
  return `${entitySlug}:${recordId}`
}

export function useEntityRecordHandoff() {
  const records = useState<Record<string, Record<string, any>>>(ENTITY_RECORD_HANDOFF_KEY, () => ({}))

  function seedEntityRecordHandoff(entitySlug: string, record: Record<string, any>) {
    if (!record.id) return

    records.value = {
      ...records.value,
      [makeHandoffKey(entitySlug, String(record.id))]: record
    }
  }

  function consumeEntityRecordHandoff(entitySlug: string, recordId: string): Record<string, any> | null {
    const key = makeHandoffKey(entitySlug, recordId)
    const record = records.value[key] ?? null
    if (!record) return null

    const nextRecords = { ...records.value }
    delete nextRecords[key]
    records.value = nextRecords

    return record
  }

  return {
    seedEntityRecordHandoff,
    consumeEntityRecordHandoff
  }
}
