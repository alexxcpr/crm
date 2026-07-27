<script setup lang="ts">
import { z } from 'zod'
import type { AdminMenu, MenuPayload } from '~/types/admin'
import type { FormSubmitEvent } from '@nuxt/ui'

const props = defineProps<{
  menu?: AdminMenu | null
}>()

const emit = defineEmits<{
  saved: [menu: AdminMenu]
  cancel: []
}>()

const isEdit = computed(() => !!props.menu)

const schema = z.object({
  name: z.string().min(1, 'Denumirea este obligatorie').max(100),
  icon: z.string().max(50).optional().or(z.literal('')),
  rank: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true)
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: props.menu?.name ?? '',
  icon: props.menu?.icon ?? '',
  rank: props.menu?.rank ?? 0,
  is_active: props.menu?.is_active ?? true
})

const submitting = ref(false)
const { createMenu, updateMenu, error } = useAdminMenus()
const toast = useToast()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  submitting.value = true

  try {
    const payload: MenuPayload = {
      name: event.data.name,
      icon: event.data.icon || undefined,
      rank: event.data.rank,
      is_active: event.data.is_active
    }

    const result = isEdit.value && props.menu
      ? await updateMenu(props.menu.id_menu, payload)
      : await createMenu(payload)

    if (result) {
      toast.add({ title: isEdit.value ? 'Meniu actualizat' : 'Meniu creat', color: 'success' })
      emit('saved', result)
    } else {
      toast.add({ title: 'Eroare', description: error.value ?? 'A aparut o eroare.', color: 'error' })
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
    <UFormField label="Denumire" name="name" required>
      <UInput v-model="state.name" placeholder="ex: Vanzari" class="w-full" />
    </UFormField>

    <UFormField label="Icon" name="icon" description="Clasa icon Lucide (ex: i-lucide-users)">
      <UInput v-model="state.icon" placeholder="i-lucide-folder" class="w-full" />
    </UFormField>

    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Ordine" name="rank">
        <UInput
          v-model.number="state.rank"
          type="number"
          :min="0"
          class="w-full"
        />
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
