import type { Field } from '~/types/schema'

const GRID_COLUMNS = 3

export interface PlacedField {
  field: Field
  rowStart: number
  colStart: number
  colSpan: number
}

interface SortableField {
  field: Field
  index: number
  rank: number
  gridCol: number
  colSpan: number
}

function toPositiveInt(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function normalizeField(field: Field, index: number): SortableField {
  const gridCol = Math.min(toPositiveInt(field.grid_col, 1), GRID_COLUMNS)
  const requestedSpan = Math.min(toPositiveInt(field.col_span, 1), GRID_COLUMNS)
  const colSpan = Math.min(requestedSpan, GRID_COLUMNS - gridCol + 1)

  return {
    field,
    index,
    rank: toPositiveInt(field.rank, 1),
    gridCol,
    colSpan
  }
}

function isRowSlotFree(row: boolean[], colStart: number, colSpan: number): boolean {
  const startIndex = colStart - 1
  const endIndex = startIndex + colSpan

  for (let index = startIndex; index < endIndex; index += 1) {
    if (row[index]) return false
  }

  return true
}

function markRowSlot(row: boolean[], colStart: number, colSpan: number) {
  const startIndex = colStart - 1
  const endIndex = startIndex + colSpan

  for (let index = startIndex; index < endIndex; index += 1) {
    row[index] = true
  }
}

export function computeFieldLayout(fields: Field[]): PlacedField[] {
  const rows: boolean[][] = []

  return fields
    .map((field, index) => normalizeField(field, index))
    .sort((a, b) =>
      a.rank - b.rank
      || a.gridCol - b.gridCol
      || a.index - b.index
    )
    .map((entry) => {
      let rowStart = 1

      while (true) {
        const row = rows[rowStart - 1] ?? Array.from({ length: GRID_COLUMNS }, () => false)
        rows[rowStart - 1] = row

        if (isRowSlotFree(row, entry.gridCol, entry.colSpan)) {
          markRowSlot(row, entry.gridCol, entry.colSpan)

          return {
            field: entry.field,
            rowStart,
            colStart: entry.gridCol,
            colSpan: entry.colSpan
          }
        }

        rowStart += 1
      }
    })
}
