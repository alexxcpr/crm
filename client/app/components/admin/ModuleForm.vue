<script setup lang="ts">
import { z } from 'zod'
import type { AdminModule, ModulePayload } from '~/types/admin'
import type { FormSubmitEvent } from '@nuxt/ui'

const props = defineProps<{
  module?: AdminModule | null
}>()

const emit = defineEmits<{
  saved: [mod: AdminModule]
  cancel: []
}>()

const isEdit = computed(() => !!props.module)

const schema = z.object({
  name: z.string().min(1, 'Numele este obligatoriu').max(100),
  slug: z.string()
    .min(2, 'Slug-ul trebuie sa aiba minim 2 caractere')
    .max(100)
    .regex(/^[a-z][a-z0-9_]{1,50}$/, 'Doar litere mici, cifre si _ (incepe cu litera)'),
  icon: z.string().max(50).optional().or(z.literal('')),
  rank: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true)
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: props.module?.name ?? '',
  slug: props.module?.slug ?? '',
  icon: props.module?.icon ?? '',
  rank: props.module?.rank ?? 0,
  is_active: props.module?.is_active ?? true
})

const slugManuallyEdited = ref(isEdit.value)

watch(() => state.name, (name) => {
  if (!slugManuallyEdited.value && !isEdit.value) {
    state.slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s_]/g, '')
      .replace(/\s+/g, '_')
      .replace(/^_+/, '')
      .substring(0, 50)
  }
})

const submitting = ref(false)
const { createModule, updateModule, error } = useAdminModules()
const toast = useToast()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  submitting.value = true

  try {
    const payload: ModulePayload = {
      name: event.data.name,
      slug: event.data.slug,
      icon: event.data.icon || undefined,
      rank: event.data.rank,
      is_active: event.data.is_active
    }

    let result: AdminModule | null

    if (isEdit.value && props.module) {
      result = await updateModule(props.module.id_module, payload)
    }
    else {
      result = await createModule(payload)
    }

    if (result) {
      toast.add({
        title: isEdit.value ? 'Modul actualizat' : 'Modul creat',
        color: 'success'
      })
      emit('saved', result)
    }
    else {
      toast.add({
        title: 'Eroare',
        description: error.value ?? 'A aparut o eroare.',
        color: 'error'
      })
    }
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField label="Nume" name="name" required>
      <UInput v-model="state.name" placeholder="ex: CRM" class="w-full" />
    </UFormField>

    <UFormField label="Slug" name="slug" required>
      <UInput
        v-model="state.slug"
        placeholder="ex: crm"
        :readonly="isEdit"
        :class="{ 'opacity-60': isEdit }"
        class="w-full"
        @input="slugManuallyEdited = true"
      />
    </UFormField>

    <UFormField label="Icon" name="icon" description="Clasa icon Lucide (ex: i-lucide-users)">
      <UInput v-model="state.icon" placeholder="i-lucide-boxes" class="w-full" />
    </UFormField>

    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Ordine (rank)" name="rank">
        <UInput v-model.number="state.rank" type="number" :min="0" class="w-full" />
      </UFormField>

      <UFormField label="Activ" name="is_active">
        <div class="pt-2">
          <USwitch v-model="state.is_active" />
        </div>
      </UFormField>
    </div>

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
