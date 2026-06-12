import type { Field } from '~/types/schema'

const MAX_GRID_COLUMNS = 3

export interface PlacedField {
  field: Field
  rowStart: number
  colStart: number
  colSpan: number
}

export interface FieldLayout {
  placed: PlacedField[]
  columns: number
}

// ─── Helpers ───

function toPositiveInt(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function clampGridCol(raw: number): number {
  return Math.min(toPositiveInt(raw, 1), MAX_GRID_COLUMNS)
}

function clampColSpan(raw: number, startCol: number, maxCols: number): number {
  const requested = toPositiveInt(raw, 1)
  // Nu poate depăși coloanele disponibile, nici MAX_GRID_COLUMNS
  return Math.min(requested, maxCols - startCol + 1)
}

// ─── Entry sortable ───

interface Entry {
  field: Field
  index: number
  rank: number
  origCol: number
  mappedCol: number
  colSpan: number
}

// ─── Mapare grid_col → coloană reală în funcție de coloanele disponibile ───

function mapColumn(gridCol: number, availableColumns: number): number {
  // grid_col 1 → col 1
  // grid_col 2 → col 2 (dacă există ≥2 coloane), altfel col 1
  // grid_col 3 → col 3 (dacă există 3 coloane), altfel se duce pe ultima coloană
  return Math.min(gridCol, availableColumns)
}

// ─── Algoritmul principal ───

export function computeFieldLayout(fields: Field[], availableColumns: number): FieldLayout {
  const maxCols = Math.max(1, Math.min(availableColumns, MAX_GRID_COLUMNS))

  if (!fields.length) return { placed: [], columns: maxCols }

  // 1. Construiește entry-uri normalizate
  const entries: Entry[] = fields.map((field, index) => {
    const origCol = clampGridCol(field.grid_col)
    const mappedCol = mapColumn(origCol, maxCols)
    const colSpan = clampColSpan(field.col_span, mappedCol, maxCols)

    return {
      field,
      index,
      rank: toPositiveInt(field.rank, 1),
      origCol,
      mappedCol,
      colSpan
    }
  })

  // 2. Sortare: după mappedCol, apoi rank, apoi origCol, apoi index
  entries.sort((a, b) => {
    if (a.mappedCol !== b.mappedCol) return a.mappedCol - b.mappedCol
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.origCol !== b.origCol) return a.origCol - b.origCol
    return a.index - b.index
  })

  // 3. Column-fill placement
  //    Fiecare coloană are propriul cursor de rând (1-indexed)
  const columnRows: number[] = Array.from({ length: maxCols + 1 }, () => 1)

  const placed: PlacedField[] = []

  for (const entry of entries) {
    const startCol = entry.mappedCol
    const endCol = startCol + entry.colSpan - 1

    // Găsește rândul de start: maximul cursorelor coloanelor acoperite
    let row = 1
    for (let c = startCol; c <= endCol; c++) {
      row = Math.max(row, columnRows[c]!)
    }

    placed.push({
      field: entry.field,
      rowStart: row,
      colStart: startCol,
      colSpan: entry.colSpan
    })

    // Avansează cursoarele coloanelor ocupate
    for (let c = startCol; c <= endCol; c++) {
      columnRows[c] = row + 1
    }
  }

  // 4. Calculează coloanele efectiv folosite
  let maxColUsed = 0
  for (const p of placed) {
    const colEnd = p.colStart + p.colSpan - 1
    if (colEnd > maxColUsed) maxColUsed = colEnd
  }
  const effectiveColumns = Math.max(1, Math.min(maxColUsed, maxCols))

  return { placed, columns: effectiveColumns }
}
