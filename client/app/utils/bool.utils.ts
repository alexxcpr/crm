
import { UBadge } from '#components'

export function boolReturnBadge (value: boolean | null) {
    // Dacă valoarea este null sau undefined, afișăm un simplu '-'
    if (value === null || value === undefined) {
      return '-'
    }

    // Dacă este boolean, randăm un UBadge
    return h(UBadge, {
      // Dacă e true arată verde ('success'), dacă e false arată portocaliu ('warning')
      color: value ? 'success' : 'warning',
      variant: 'subtle', // Un stil mai blând pentru tabele
      class: 'capitalize'
    }, () => value ? 'Da' : 'Nu') // Textul din interiorul badge-ului
  }