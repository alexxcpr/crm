<script setup lang="ts">
import { z } from 'zod'
import type { AdminTab, CreateTabPayload, UpdateTabPayload } from '~/types/admin'
import type { FormSubmitEvent } from '@nuxt/ui'

const props = defineProps<{
  entityId: string
  tab?: AdminTab | null
}>()

const emit = defineEmits<{
  saved: [tab: AdminTab]
  cancel: []
}>()

const isEdit = computed(() => !!props.tab)

const schema = z.object({
  name: z.string().min(1, 'Numele este obligatoriu').max(100),
  slug: z.string()
    .min(2, 'Slug-ul trebuie sa aiba minim 2 caractere')
    .max(100)
    .regex(/^[a-z][a-z0-9_]{1,50}$/, 'Doar litere mici, cifre si _ (incepe cu litera)'),
  rank: z.number().int().min(0).default(0)
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: props.tab?.name ?? '',
  slug: props.tab?.slug ?? '',
  rank: props.tab?.rank ?? 0
})

const slugManuallyEdited = ref(isEdit.value)

watch(() => state.name, (name) => {
  if (!slugManuallyEdited.value && !isEdit.value) {
    state.slug = name
      .toLowerCase()
      .replace(/[șş]/g, 's')
      .replace(/[țţ]/g, 't')
      .replace(/[ăâ]/g, 'a')
      .replace(/î/g, 'i')
      .replace(/[^a-z0-9\s_]/g, '')
      .replace(/\s+/g, '_')
      .replace(/^_+/, '')
      .substring(0, 50)
  }
})

const submitting = ref(false)
const { createTab, updateTab, error } = useAdminTabs(props.entityId)
const toast = useToast()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  submitting.value = true

  try {
    let result: AdminTab | null

    if (isEdit.value && props.tab) {
      const payload: UpdateTabPayload = {
        name: event.data.name,
        slug: event.data.slug,
        rank: event.data.rank
      }
      result = await updateTab(props.tab.id_ui_tab, payload)
    } else {
      const payload: CreateTabPayload = {
        name: event.data.name,
        slug: event.data.slug,
        rank: event.data.rank
      }
      result = await createTab(payload)
    }

    if (result) {
      toast.add({
        title: isEdit.value ? 'Tab actualizat' : 'Tab creat',
        color: 'success'
      })
      emit('saved', result)
    } else {
      toast.add({
        title: 'Eroare',
        description: error.value ?? 'A aparut o eroare.',
        color: 'error'
      })
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <UFormField label="Nume" name="name" required>
      <UInput v-model="state.name" placeholder="ex: Detalii Financiare" class="w-full" />
    </UFormField>

    <UFormField label="Slug" name="slug" required>
      <UInput
        v-model="state.slug"
        placeholder="ex: detalii_financiare"
        :readonly="isEdit"
        :class="{ 'opacity-60': isEdit }"
        class="w-full"
        @input="slugManuallyEdited = true"
      />
    </UFormField>

    <UFormField label="Ordine" name="rank" description="Ordinea de afisare a tab-ului in formular">
      <UInput
        v-model.number="state.rank"
        type="number"
        :min="0"
        class="w-full"
      />
    </UFormField>

    <div class="flex items-center gap-3 pt-4 border-t border-default">
      <UButton
        type="submit"
        :label="isEdit ? 'Salveaza' : 'Creeaza'"
        icon="i-lucide-check"
        :loading="submitting"
      />
      <UButton
        label="Anuleaza"
        color="neutral"
        variant="outline"
        @click="emit('cancel')"
      />
    </div>
  </UForm>
</template>
