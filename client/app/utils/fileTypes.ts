export const FILE_TYPE_OPTIONS = [
  {
    label: 'PDF (.pdf)',
    value: 'application/pdf',
    extensions: ['pdf']
  },
  {
    label: 'Microsoft Word (.docx)',
    value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx']
  },
  {
    label: 'Microsoft Excel (.xlsx)',
    value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['xlsx']
  },
  {
    label: 'Microsoft PowerPoint (.pptx)',
    value: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extensions: ['pptx']
  },
  {
    label: 'Tabel CSV (.csv)',
    value: 'text/csv',
    extensions: ['csv']
  },
  {
    label: 'Fisier text (.txt)',
    value: 'text/plain',
    extensions: ['txt']
  },
  {
    label: 'Imagine JPEG (.jpg, .jpeg)',
    value: 'image/jpeg',
    extensions: ['jpg', 'jpeg']
  },
  {
    label: 'Imagine PNG (.png)',
    value: 'image/png',
    extensions: ['png']
  },
  {
    label: 'Imagine WebP (.webp)',
    value: 'image/webp',
    extensions: ['webp']
  }
]

export const DEFAULT_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]

export const MIME_BY_FILE_EXTENSION = Object.fromEntries(
  FILE_TYPE_OPTIONS.flatMap(option =>
    option.extensions.map(extension => [extension, option.value])
  )
) as Record<string, string>
