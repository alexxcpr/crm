export interface StoredFileInfo {
  idFile: string
  originalName: string
  mimeType: string
  sizeBytes: number
  status: 'pending' | 'scanning' | 'active' | 'deleting' | 'deleted' | 'rejected' | 'failed'
  recordId: string | null
  createdAt: string
  updatedAt: string
}

interface UploadSession {
  file: StoredFileInfo
  uploadUrl: string | null
  uploadHeaders: Record<string, string>
  expiresAt: string | null
}

export function useFiles() {
  const { apiFetch } = useApi()

  async function createUploadSession(input: {
    fieldId: string
    recordId?: string
    fileName: string
    mimeType: string
    sizeBytes: number
    idempotencyKey: string
  }) {
    const response = await apiFetch<{ data: UploadSession }>('/v1/files/upload-sessions', {
      method: 'POST',
      body: input
    })
    return response.data
  }

  function uploadToUrl(
    url: string,
    file: File,
    headers: Record<string, string>,
    onProgress: (percentage: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else reject(new Error(`Object Storage a raspuns cu HTTP ${xhr.status}.`))
      }
      xhr.onerror = () => reject(new Error('Conexiunea cu Object Storage a esuat.'))
      xhr.onabort = () => reject(new Error('Uploadul a fost anulat.'))
      xhr.send(file)
    })
  }

  async function complete(fileId: string) {
    const response = await apiFetch<{ data: StoredFileInfo }>(`/v1/files/upload-sessions/${fileId}/complete`, {
      method: 'POST'
    })
    return response.data
  }

  async function metadata(fileId: string) {
    const response = await apiFetch<{ data: StoredFileInfo }>(`/v1/files/${fileId}`)
    return response.data
  }

  async function remove(fileId: string) {
    await apiFetch(`/v1/files/${fileId}`, { method: 'DELETE' })
  }

  async function download(fileId: string) {
    const response = await apiFetch<{ data: { url: string } }>(`/v1/files/${fileId}/download-url`)
    window.location.assign(response.data.url)
  }

  return { createUploadSession, uploadToUrl, complete, metadata, remove, download }
}
