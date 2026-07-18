<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { StoredFileInfo } from '~/composables/useFiles'
import { MIME_BY_FILE_EXTENSION } from '~/utils/fileTypes'

const props = defineProps<{
  field: Field
  modelValue: string | null
  recordId?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const { createUploadSession, uploadToUrl, complete, metadata, remove, download } = useFiles()
const input = ref<HTMLInputElement>()
const fileInfo = ref<StoredFileInfo | null>(null)
const uploading = ref(false)
const loadingMetadata = ref(false)
const progress = ref(0)
const error = ref<string | null>(null)
const retryFile = ref<File | null>(null)

const rules = computed(() => props.field.validation_rules ?? {})
const accept = computed(() => Array.isArray(rules.value.allowed_mime_types)
  ? rules.value.allowed_mime_types.join(',')
  : undefined)
const maxBytes = computed(() => Number(rules.value.max_file_size_bytes || 100_000_000))

watch(() => props.modelValue, async (fileId) => {
  if (!fileId) {
    fileInfo.value = null
    return
  }
  if (fileInfo.value?.idFile === fileId) return
  loadingMetadata.value = true
  try {
    fileInfo.value = await metadata(fileId)
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Nu am putut incarca detaliile fisierului.'
  } finally {
    loadingMetadata.value = false
  }
}, { immediate: true })

function chooseFile() {
  input.value?.click()
}

async function onSelected(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0]
  if (!selected) return
  ;(event.target as HTMLInputElement).value = ''
  await uploadFile(selected)
}

async function uploadFile(selected: File) {
  error.value = null
  retryFile.value = selected
  if (selected.size > maxBytes.value) {
    error.value = `Fisierul poate avea maximum ${(maxBytes.value / 1_000_000).toFixed(0)} MB.`
    return
  }

  uploading.value = true
  progress.value = 0
  let stagedFileId: string | null = null
  try {
    const extension = selected.name.split('.').pop()?.toLowerCase() || ''
    const mimeType = MIME_BY_FILE_EXTENSION[extension] || selected.type || 'application/octet-stream'
    const session = await createUploadSession({
      fieldId: props.field.id_field,
      recordId: props.recordId,
      fileName: selected.name,
      mimeType,
      sizeBytes: selected.size,
      idempotencyKey: crypto.randomUUID()
    })
    stagedFileId = session.file.idFile
    if (session.uploadUrl) {
      await uploadToUrl(session.uploadUrl, selected, session.uploadHeaders, (value) => {
        progress.value = value
      })
      fileInfo.value = await complete(session.file.idFile)
    } else {
      fileInfo.value = session.file
    }
    emit('update:modelValue', session.file.idFile)
    progress.value = 100
    retryFile.value = null
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Uploadul a esuat.'
    if (stagedFileId) await remove(stagedFileId).catch(() => undefined)
  } finally {
    uploading.value = false
  }
}

async function retryUpload() {
  if (retryFile.value) await uploadFile(retryFile.value)
}

async function removeCurrent() {
  if (!fileInfo.value) return
  error.value = null
  try {
    if (!fileInfo.value.recordId) await remove(fileInfo.value.idFile)
    emit('update:modelValue', null)
    fileInfo.value = null
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Fisierul nu a putut fi eliminat.'
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
</script>

<template>
  <div class="space-y-2">
    <input
      ref="input"
      type="file"
      class="hidden"
      :accept="accept"
      :disabled="disabled || uploading"
      @change="onSelected"
    >

    <div v-if="loadingMetadata" class="flex items-center gap-2 rounded-lg border border-default p-3">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" />
      <span class="text-sm text-muted">Se incarca fisierul...</span>
    </div>

    <div v-else-if="fileInfo" class="flex items-center gap-3 rounded-lg border border-default bg-elevated/40 p-3">
      <UIcon name="i-lucide-file" class="size-5 shrink-0 text-primary" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-highlighted">
          {{ fileInfo.originalName }}
        </p>
        <p class="text-xs text-muted">
          {{ formatBytes(fileInfo.sizeBytes) }}
        </p>
      </div>
      <UButton
        icon="i-lucide-download"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Descarca fisierul"
        @click="download(fileInfo.idFile)"
      />
      <UButton
        v-if="!disabled"
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        size="xs"
        aria-label="Elimina fisierul"
        @click="removeCurrent"
      />
    </div>

    <div v-else>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-upload"
        :loading="uploading"
        :disabled="disabled"
        @click="chooseFile"
      >
        Selecteaza fisier
      </UButton>
    </div>

    <UProgress v-if="uploading" :model-value="progress" size="xs" />
    <p v-if="error" class="text-xs text-error">
      {{ error }}
    </p>
    <UButton
      v-if="error && retryFile && !uploading"
      color="neutral"
      variant="soft"
      size="xs"
      icon="i-lucide-refresh-cw"
      @click="retryUpload"
    >
      Reincearca
    </UButton>
  </div>
</template>
