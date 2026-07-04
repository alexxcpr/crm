<script setup lang="ts">
const props = defineProps<{
  entitySlug: string
  entityLabel: string
  recordId: string
  open: boolean
}>()

const emit = defineEmits<{
  saved: [record: Record<string, any>]
  'update:open': [value: boolean]
}>()

const router = useRouter()

const isMobile = computed(() => {
  if (import.meta.server) return false
  return window.matchMedia('(max-width: 640px)').matches
})

const formComp = ref<{
  submit: () => void
  submitting: Ref<boolean>
  canSave: Ref<boolean>
  checkDirty: () => boolean
} | null>(null)
const formSubmitting = computed(() => !!unref(formComp.value?.submitting))
const formCanSave = computed(() => !!unref(formComp.value?.canSave))

const modalOpen = ref(props.open)
watch(() => props.open, (val) => {
  modalOpen.value = val
})

const intentionalClose = ref(false)
const showLeaveConfirm = ref(false)

watch(modalOpen, (val, oldVal) => {
  if (val && !oldVal) return

  if (!val && !intentionalClose.value) {
    if (formComp.value?.checkDirty()) {
      nextTick(() => {
        modalOpen.value = true
        showLeaveConfirm.value = true
      })
      return
    }
  }

  if (!val) {
    emit('update:open', false)
  }
})

function triggerSubmit() {
  formComp.value?.submit()
}

function onSaved(record: Record<string, any>) {
  emit('saved', record)
}

function onCancelRequested() {
  if (formComp.value?.checkDirty()) {
    showLeaveConfirm.value = true
  } else {
    intentionalClose.value = true
    modalOpen.value = false
  }
}

function openInNewTab() {
  if (import.meta.server) return

  const href = router.resolve(`/${props.entitySlug}/${props.recordId}`).href
  const url = new URL(href, window.location.origin).toString()
  window.open(url, '_blank')?.focus()
}

function confirmLeave() {
  showLeaveConfirm.value = false
  intentionalClose.value = true
  nextTick(() => {
    modalOpen.value = false
  })
}

function cancelLeave() {
  showLeaveConfirm.value = false
}

watch(modalOpen, (val) => {
  if (val) {
    intentionalClose.value = false
  }
})
</script>

<template>
  <UModal
    v-model:open="modalOpen"
    :title="`Deschide ${entityLabel}`"
    :fullscreen="isMobile"
    :ui="{
      content: isMobile ? '!max-w-full !rounded-none' : '!max-w-3xl'
    }"
  >
    <template #body>
      <DynamicInlineEditForm
        v-if="modalOpen"
        :key="recordId"
        ref="formComp"
        :entity-slug="entitySlug"
        :record-id="recordId"
        @saved="onSaved"
        @cancel="onCancelRequested"
      />
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <UButton
          label="Anuleaza"
          color="neutral"
          variant="outline"
          :size="isMobile ? 'sm' : 'md'"
          :disabled="formSubmitting"
          @click="onCancelRequested"
        />
        <UButton
          label="Deschide in tab nou"
          icon="i-lucide-external-link"
          color="primary"
          variant="soft"
          :size="isMobile ? 'sm' : 'md'"
          @click="openInNewTab"
        />
        <UButton
          label="Salveaza"
          color="primary"
          icon="i-lucide-check"
          :size="isMobile ? 'sm' : 'md'"
          :loading="formSubmitting"
          :disabled="!formCanSave"
          @click="triggerSubmit"
        />
      </div>
    </template>
  </UModal>

  <UModal v-model:open="showLeaveConfirm" title="Modificari nesalvate">
    <template #body>
      <div class="space-y-4">
        <div class="flex items-start gap-3">
          <div class="bg-amber-100 dark:bg-amber-900/30 rounded-full p-2 shrink-0">
            <UIcon name="i-lucide-triangle-alert" class="size-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p class="font-medium">
              Ai modificari care nu au fost salvate.
            </p>
            <p class="text-sm text-muted mt-1">
              Daca inchizi fara sa salvezi, datele completate vor fi pierdute.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3 justify-end">
          <UButton
            label="Continua editarea"
            color="primary"
            variant="solid"
            icon="i-lucide-pencil"
            @click="cancelLeave"
          />
          <UButton
            label="Inchide oricum"
            color="neutral"
            variant="outline"
            icon="i-lucide-x"
            @click="confirmLeave"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
