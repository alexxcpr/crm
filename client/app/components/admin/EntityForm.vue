<script setup lang="ts">
import { z } from 'zod'
import type { AdminEntity, AdminModule, CreateEntityPayload, UpdateEntityPayload } from '~/types/admin'
import type { FormSubmitEvent } from '@nuxt/ui'

const props = defineProps<{
  entity?: AdminEntity | null
  modules: AdminModule[]
}>()

const emit = defineEmits<{
  saved: [entity: AdminEntity]
  cancel: []
}>()

const isEdit = computed(() => !!props.entity)

const schema = z.object({
  name: z.string().min(1, 'Numele este obligatoriu').max(100),
  slug: z.string()
    .min(2, 'Slug-ul trebuie sa aiba minim 2 caractere')
    .max(100)
    .regex(/^[a-z][a-z0-9_]{1,50}$/, 'Doar litere mici, cifre si _ (incepe cu litera)'),
  id_module: z.string().uuid().optional().or(z.literal('')),
  icon: z.string().max(50).optional().or(z.literal('')),
  label_singular: z.string().max(100).optional().or(z.literal('')),
  label_plural: z.string().max(100).optional().or(z.literal('')),
  rank: z.number().int().min(0).default(0)
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: props.entity?.name ?? '',
  slug: props.entity?.slug ?? '',
  id_module: props.entity?.id_module ?? '',
  icon: props.entity?.icon ?? '',
  label_singular: props.entity?.label_singular ?? '',
  label_plural: props.entity?.label_plural ?? '',
  rank: props.entity?.rank ?? 0
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

const moduleOptions = computed(() =>
  props.modules.map(m => ({
    label: m.name,
    value: m.id_module
  }))
)

const submitting = ref(false)
const { createEntity, updateEntity, error } = useAdminEntities()
const toast = useToast()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  submitting.value = true

  try {
    let result: AdminEntity | null

    if (isEdit.value && props.entity) {
      const payload: UpdateEntityPayload = {
        name: event.data.name,
        id_module: event.data.id_module || undefined,
        icon: event.data.icon || undefined,
        label_singular: event.data.label_singular || undefined,
        label_plural: event.data.label_plural || undefined,
        rank: event.data.rank
      }
      result = await updateEntity(props.entity.id_entity, payload)
    }
    else {
      const payload: CreateEntityPayload = {
        name: event.data.name,
        slug: event.data.slug,
        id_module: event.data.id_module || undefined,
        icon: event.data.icon || undefined,
        label_singular: event.data.label_singular || undefined,
        label_plural: event.data.label_plural || undefined,
        rank: event.data.rank
      }
      result = await createEntity(payload)
    }

    if (result) {
      toast.add({
        title: isEdit.value ? 'Entitate actualizata' : 'Entitate creata',
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
      <UInput v-model="state.name" placeholder="ex: Contacte" class="w-full" />
    </UFormField>

    <UFormField label="Slug" name="slug" required>
      <UInput
        v-model="state.slug"
        placeholder="ex: contacts"
        :readonly="isEdit"
        :class="{ 'opacity-60': isEdit }"
        class="w-full"
        @input="slugManuallyEdited = true"
      />
    </UFormField>

    <UFormField label="Modul" name="id_module">
      <USelect
        v-model="state.id_module"
        :items="moduleOptions"
        placeholder="Selecteaza modul"
        value-key="value"
        class="w-full"
      />
    </UFormField>

    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Label singular" name="label_singular">
        <UInput v-model="state.label_singular" placeholder="ex: Contact" class="w-full" />
      </UFormField>

      <UFormField label="Label plural" name="label_plural">
        <UInput v-model="state.label_plural" placeholder="ex: Contacte" class="w-full" />
      </UFormField>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Icon (clasa icon Lucide)" name="icon">
        <UInput v-model="state.icon" placeholder="i-lucide-users" class="w-full" />
      </UFormField>

      <UFormField label="Ordine (rank)" name="rank">
        <UInput v-model.number="state.rank" type="number" :min="0" class="w-full" />
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
