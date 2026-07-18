export const STORAGE_PROVIDER = Symbol(
  'STORAGE_PROVIDER',
);

export const GB_IN_BYTES = 1_000_000_000;
export const DEFAULT_MAX_FILE_SIZE_BYTES = 100_000_000;
export const DEFAULT_UPLOAD_URL_TTL_SECONDS = 900;
export const DEFAULT_DOWNLOAD_URL_TTL_SECONDS = 300;

export const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/plain',
] as const;

export const MIME_EXTENSIONS: Record<
  string,
  string[]
> = {
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    ['xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    ['pptx'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'text/csv': ['csv'],
  'text/plain': ['txt'],
};
