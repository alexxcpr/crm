<script setup lang="ts">
const props = defineProps<{
  entitySlug: string
  entityLabel: string
  open: boolean
}>()

const emit = defineEmits<{
  'created': [record: Record<string, any>]
  'update:open': [value: boolean]
}>()

// ─── Detectare mobil ───
const isMobile = computed(() => {
  if (import.meta.server) return false
  return window.matchMedia('(max-width: 640px)').matches
})

// ─── Referință la formular ───
const formComp = ref<{
  submit: () => void
  submitting: Ref<boolean>
  checkDirty: () => boolean
} | null>(null)

// ─── Control modal ───
const modalOpen = ref(props.open)
watch(() => props.open, (val) => {
  modalOpen.value = val
})

const intentionalClose = ref(false)
const showLeaveConfirm = ref(false)

// Interceptează încercarea de închidere
watch(modalOpen, (val, oldVal) => {
  // Se redeschide (ex. după leave confirm anulat) — ignoră
  if (val && !oldVal) return

  if (!val && !intentionalClose.value) {
    // Utilizatorul a dat click afară / Escape / Cancel
    if (formComp.value?.checkDirty()) {
      // Reține modalul deschis și arată confirmarea
      nextTick(() => {
        modalOpen.value = true
        showLeaveConfirm.value = true
      })
      return
    }
  }

  if (!val) {
    // Închidere reală — propagă la părinte
    emit('update:open', false)
  }
})

// ─── Submit din footer ───
function triggerSubmit() {
  formComp.value?.submit()
}

// ─── Evenimente de la formular ───
function onCreated(record: Record<string, any>) {
  intentionalClose.value = true
  nextTick(() => {
    modalOpen.value = false
    emit('created', record)
  })
}

function onCancelRequested() {
  if (formComp.value?.checkDirty()) {
    showLeaveConfirm.value = true
  } else {
    intentionalClose.value = true
    modalOpen.value = false
  }
}

// ─── Confirmare leave ───
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

// Resetează flag-ul când modalul se deschide
watch(modalOpen, (val) => {
  if (val) {
    intentionalClose.value = false
  }
})
</script>

<template>
  <UModal
    v-model:open="modalOpen"
    :title="`Crează ${entityLabel}`"
    :fullscreen="isMobile"
    :ui="{
      content: isMobile ? '!max-w-full !rounded-none' : '!max-w-2xl'
    }"
  >
    <template #body>
      <DynamicInlineCreateForm
        v-if="modalOpen"
        ref="formComp"
        :entity-slug="entitySlug"
        @created="onCreated"
        @cancel="onCancelRequested"
      />
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <UButton
          label="Anulează"
          color="neutral"
          variant="outline"
          :size="isMobile ? 'sm' : 'md'"
          :disabled="formComp?.submitting"
          @click="onCancelRequested"
        />
        <UButton
          label="Crează"
          color="primary"
          icon="i-lucide-check"
          :size="isMobile ? 'sm' : 'md'"
          :loading="formComp?.submitting"
          @click="triggerSubmit"
        />
      </div>
    </template>
  </UModal>

  <!-- Confirmare modificări nesalvate -->
  <UModal v-model:open="showLeaveConfirm" title="Modificări nesalvate">
    <template #body>
      <div class="space-y-4">
        <div class="flex items-start gap-3">
          <div class="bg-amber-100 dark:bg-amber-900/30 rounded-full p-2 shrink-0">
            <UIcon name="i-lucide-triangle-alert" class="size-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p class="font-medium">
              Ai modificări care nu au fost salvate.
            </p>
            <p class="text-sm text-muted mt-1">
              Dacă închizi fără să salvezi, datele completate vor fi pierdute.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3 justify-end">
          <UButton
            label="Continuă editarea"
            color="primary"
            variant="solid"
            icon="i-lucide-pencil"
            @click="cancelLeave"
          />
          <UButton
            label="Închide oricum"
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
