export function stringCoalesceNull (value: string | null) {
    if (value === null || value === undefined || value === ''){
      return '-'
    }
    return value;
  }