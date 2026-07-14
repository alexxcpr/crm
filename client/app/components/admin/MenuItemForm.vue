<script setup lang="ts">
import { z } from 'zod'
import type { AdminEntity, AdminMenuItem, MenuItemPayload, MenuLinkType } from '~/types/admin'
import type { DashboardDefinition } from '~/types/dashboard'
import type { FormSubmitEvent } from '@nuxt/ui'

const props = defineProps<{
  menuId: string
  item?: AdminMenuItem | null
  entities: AdminEntity[]
  dashboards: DashboardDefinition[]
}>()

const emit = defineEmits<{
  saved: [item: AdminMenuItem]
  cancel: []
}>()

const linkTypes = [
  { label: 'Lista entitate', value: 'entity_list' },
  { label: 'Creare inregistrare', value: 'entity_create' },
  { label: 'Inregistrare existenta', value: 'entity_record' },
  { label: 'Dashboard', value: 'dashboard' },
  { label: 'Ruta interna', value: 'internal_route' },
  { label: 'URL extern', value: 'external_url' }
] satisfies { label: string, value: MenuLinkType }[]

const schema = z.object({
  name: z.string().min(1, 'Denumirea este obligatorie').max(100),
  icon: z.string().max(50).optional().or(z.literal('')),
  rank: z.number().int().min(0).default(0),
  open_link: z.string().min(1, 'Link-ul este obligatoriu').max(500),
  link_type: z.enum(['entity_list', 'entity_create', 'entity_record', 'dashboard', 'internal_route', 'external_url']),
  id_entity: z.string().uuid().optional().or(z.literal('')),
  record_id: z.string().uuid().optional().or(z.literal('')),
  id_ui_dashboard: z.string().uuid().optional().or(z.literal('')),
  is_active: z.boolean().default(true)
})

type Schema = z.output<typeof schema>

const isEdit = computed(() => !!props.item)

const state = reactive<Schema>({
  name: props.item?.name ?? '',
  icon: props.item?.icon ?? '',
  rank: props.item?.rank ?? 0,
  open_link: props.item?.open_link ?? '',
  link_type: props.item?.link_type ?? 'entity_list',
  id_entity: props.item?.id_entity ?? '',
  record_id: props.item?.record_id ?? '',
  id_ui_dashboard: props.item?.id_ui_dashboard ?? '',
  is_active: props.item?.is_active ?? true
})

const entityOptions = computed(() =>
  props.entities.map(entity => ({
    label: entity.label_plural ?? entity.name,
    value: entity.id_entity
  }))
)

const selectedEntity = computed(() => props.entities.find(entity => entity.id_entity === state.id_entity))
const usesEntity = computed(() => state.link_type.startsWith('entity_'))
const usesRecord = computed(() => state.link_type === 'entity_record')
const usesDashboard = computed(() => state.link_type === 'dashboard')
const selectedDashboard = computed(() => props.dashboards.find(dashboard => dashboard.id_ui_dashboard === state.id_ui_dashboard))
const dashboardOptions = computed(() => props.dashboards
  .filter(dashboard => dashboard.is_active)
  .map(dashboard => ({ label: dashboard.name, value: dashboard.id_ui_dashboard! })))

const generatedLink = computed(() => {
  const slug = selectedEntity.value?.slug
  if (state.link_type === 'dashboard') return selectedDashboard.value ? `/dashboards/${selectedDashboard.value.slug}` : ''
  if (!slug) return ''
  if (state.link_type === 'entity_list') return `/${slug}`
  if (state.link_type === 'entity_create') return `/${slug}/create`
  if (state.link_type === 'entity_record' && state.record_id) return `/${slug}/${state.record_id}`
  return ''
})

const linkManuallyEdited = ref(isEdit.value)

watch(generatedLink, (link) => {
  if (link && !linkManuallyEdited.value) {
    state.open_link = link
  }
})

watch(() => state.link_type, () => {
  if (!usesEntity.value) {
    state.id_entity = ''
    state.record_id = ''
  } else if (!usesRecord.value) {
    state.record_id = ''
  }

  if (!usesDashboard.value) state.id_ui_dashboard = ''

  if (generatedLink.value && !linkManuallyEdited.value) {
    state.open_link = generatedLink.value
  }
})

function useGeneratedLink() {
  if (!generatedLink.value) return
  state.open_link = generatedLink.value
  linkManuallyEdited.value = false
}

const submitting = ref(false)
const { createMenuItem, updateMenuItem, error } = useAdminMenus()
const toast = useToast()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  submitting.value = true

  try {
    const payload: MenuItemPayload = {
      name: event.data.name,
      icon: event.data.icon || undefined,
      rank: event.data.rank,
      open_link: event.data.open_link.trim(),
      link_type: event.data.link_type,
      id_entity: event.data.id_entity || undefined,
      record_id: event.data.record_id || undefined,
      id_ui_dashboard: event.data.id_ui_dashboard || undefined,
      is_active: event.data.is_active
    }

    const result = isEdit.value && props.item
      ? await updateMenuItem(props.item.id_menu_item, payload)
      : await createMenuItem(props.menuId, payload)

    if (result) {
      toast.add({ title: isEdit.value ? 'Element actualizat' : 'Element creat', color: 'success' })
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
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Denumire" name="name" required>
        <UInput v-model="state.name" placeholder="ex: Contacte" class="w-full" />
      </UFormField>

      <UFormField label="Tip link" name="link_type" required>
        <USelect
          v-model="state.link_type"
          :items="linkTypes"
          value-key="value"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField v-if="usesEntity" label="Entitate" name="id_entity" required>
      <USelect
        v-model="state.id_entity"
        :items="entityOptions"
        placeholder="Selecteaza entitatea"
        value-key="value"
        class="w-full"
      />
    </UFormField>

    <UFormField v-if="usesRecord" label="ID inregistrare" name="record_id" required>
      <UInput
        v-model="state.record_id"
        placeholder="UUID inregistrare"
        class="w-full"
      />
    </UFormField>

    <UFormField v-if="usesDashboard" label="Dashboard" name="id_ui_dashboard" required>
      <USelect
        v-model="state.id_ui_dashboard"
        :items="dashboardOptions"
        placeholder="Selecteaza dashboard-ul"
        value-key="value"
        class="w-full"
      />
    </UFormField>

    <UFormField label="Link" name="open_link" required>
      <div class="flex gap-2">
        <UInput
          v-model="state.open_link"
          placeholder="/contacts sau https://exemplu.ro"
          class="w-full"
          @input="linkManuallyEdited = true"
        />
        <UButton
          v-if="generatedLink"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :title="generatedLink"
          @click="useGeneratedLink"
        />
      </div>
    </UFormField>

    <div class="grid grid-cols-3 gap-4">
      <UFormField label="Icon" name="icon">
        <UInput v-model="state.icon" placeholder="i-lucide-database" class="w-full" />
      </UFormField>

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
