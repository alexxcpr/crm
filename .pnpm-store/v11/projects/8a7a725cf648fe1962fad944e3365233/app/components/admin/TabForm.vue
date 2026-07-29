<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type {
  AdminRelatedCollection,
  AdminTab,
  CreateTabPayload,
  RelatedCollectionRelationOption,
  UpdateTabPayload
} from '~/types/admin'

const props = defineProps<{
  entityId: string
  entitySlug?: string | null
  tab?: AdminTab | null
}>()

const emit = defineEmits<{
  saved: [tab: AdminTab]
  cancel: []
}>()

const isEdit = computed(() => !!props.tab)
const existingCollection = props.tab?.related_collection

const schema = z.object({
  name: z.string().min(1, 'Numele este obligatoriu').max(100),
  slug: z.string()
    .min(2, 'Slug-ul trebuie sa aiba minim 2 caractere')
    .max(100)
    .regex(/^[a-z][a-z0-9_]{1,50}$/, 'Doar litere mici, cifre si _ (incepe cu litera)'),
  rank: z.number().int().min(0).default(0)
})

type Schema = z.output<typeof schema>

const state = reactive({
  name: props.tab?.name ?? '',
  slug: props.tab?.slug ?? '',
  rank: props.tab?.rank ?? 0,
  content_type: (props.tab?.content_type ?? 'fields') as 'fields' | 'related_collection',
  id_relation_field: existingCollection?.id_relation_field ?? '',
  default_view: (existingCollection?.default_view ?? 'table') as 'table' | 'cards',
  allow_table: existingCollection?.allow_table ?? true,
  allow_cards: existingCollection?.allow_cards ?? false,
  card_title_field_id: existingCollection?.card_title_field_id ?? '',
  card_field_ids: [...(existingCollection?.card_field_ids ?? [])],
  page_size: existingCollection?.page_size ?? 25,
  default_sort: existingCollection?.default_sort ?? '-date_created',
  allow_create: existingCollection?.allow_create ?? true,
  allow_update: existingCollection?.allow_update ?? true,
  allow_delete: existingCollection?.allow_delete ?? true,
  quick_add_mode: (existingCollection?.quick_add_mode ?? 'none') as 'none' | 'multi_file',
  id_quick_add_file_field: existingCollection?.id_quick_add_file_field ?? ''
})

const relationOptions = ref<RelatedCollectionRelationOption[]>([])
const loadingRelations = ref(false)
const slugManuallyEdited = ref(isEdit.value)
const submitting = ref(false)
const toast = useToast()
const {
  createTab,
  updateTab,
  fetchRelationOptions,
  error
} = useAdminTabs(props.entityId, computed(() => props.entitySlug))

const relationSelectOptions = computed(() =>
  relationOptions.value.map(option => ({
    label: `${option.child_entity_name} — ${option.field_name} (${option.relation_kind})`,
    value: option.id_field
  }))
)

const selectedRelation = computed(() =>
  relationOptions.value.find(option => option.id_field === state.id_relation_field)
)

const childFieldOptions = computed(() =>
  (selectedRelation.value?.fields ?? []).map(field => ({
    label: field.name,
    value: field.id_field
  }))
)

const quickFileFieldOptions = computed(() =>
  (selectedRelation.value?.fields ?? [])
    .filter(field => field.ui_type === 'file')
    .map(field => ({
      label: field.name,
      value: field.id_field
    }))
)

const missingQuickAddDefaults = computed(() => {
  const relation = selectedRelation.value
  if (!relation || state.quick_add_mode !== 'multi_file') return []
  return relation.fields.filter(field =>
    field.id_field !== relation.id_field
    && field.id_field !== state.id_quick_add_file_field
    && field.is_required
    && !field.is_readonly
    && field.default_value == null
    && field.data_type !== 'boolean'
  )
})

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

watch(() => state.id_relation_field, (next, previous) => {
  if (next === previous || isEdit.value) return
  state.card_title_field_id = ''
  state.card_field_ids = []
  state.id_quick_add_file_field = ''
})

watch(() => state.allow_table, (allowed) => {
  if (!allowed && state.default_view === 'table') state.default_view = 'cards'
})

watch(() => state.allow_cards, (allowed) => {
  if (!allowed && state.default_view === 'cards') state.default_view = 'table'
  if (!allowed) {
    state.card_title_field_id = ''
    state.card_field_ids = []
  }
})

watch(() => state.quick_add_mode, (mode) => {
  if (mode === 'none') state.id_quick_add_file_field = ''
})

onMounted(async () => {
  loadingRelations.value = true
  relationOptions.value = await fetchRelationOptions()
  loadingRelations.value = false
})

function buildRelatedCollection(): AdminRelatedCollection | null {
  if (!state.id_relation_field) {
    toast.add({
      title: 'Selecteaza relatia copil → parinte',
      color: 'warning'
    })
    return null
  }
  if (!state.allow_table && !state.allow_cards) {
    toast.add({
      title: 'Permite cel putin o vizualizare',
      color: 'warning'
    })
    return null
  }
  if (
    (state.default_view === 'table' && !state.allow_table)
    || (state.default_view === 'cards' && !state.allow_cards)
  ) {
    toast.add({
      title: 'Vizualizarea implicita trebuie sa fie permisa',
      color: 'warning'
    })
    return null
  }
  if (state.allow_cards && !state.card_title_field_id) {
    toast.add({
      title: 'Selecteaza campul titlu pentru card',
      color: 'warning'
    })
    return null
  }
  if (state.quick_add_mode === 'multi_file' && !state.id_quick_add_file_field) {
    toast.add({
      title: 'Selecteaza campul de fisier pentru quick add',
      color: 'warning'
    })
    return null
  }
  if (missingQuickAddDefaults.value.length > 0) {
    toast.add({
      title: 'Quick add nu poate fi activat',
      description: `Lipsesc valori implicite pentru: ${missingQuickAddDefaults.value.map(field => field.name).join(', ')}.`,
      color: 'warning'
    })
    return null
  }

  return {
    id_relation_field: state.id_relation_field,
    default_view: state.default_view,
    allow_table: state.allow_table,
    allow_cards: state.allow_cards,
    card_title_field_id: state.allow_cards ? state.card_title_field_id || undefined : undefined,
    card_field_ids: state.allow_cards ? state.card_field_ids : [],
    page_size: Number(state.page_size),
    default_sort: state.default_sort,
    allow_create: state.allow_create,
    allow_update: state.allow_update,
    allow_delete: state.allow_delete,
    quick_add_mode: state.quick_add_mode,
    id_quick_add_file_field:
      state.quick_add_mode === 'multi_file'
        ? state.id_quick_add_file_field || undefined
        : undefined
  }
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  let relatedCollection: AdminRelatedCollection | undefined
  if (state.content_type === 'related_collection') {
    relatedCollection = buildRelatedCollection() ?? undefined
    if (!relatedCollection) return
  }

  submitting.value = true
  try {
    let result: AdminTab | null
    if (isEdit.value && props.tab) {
      const payload: UpdateTabPayload = {
        name: event.data.name,
        slug: event.data.slug,
        rank: event.data.rank,
        related_collection: relatedCollection
      }
      result = await updateTab(props.tab.id_ui_tab, payload)
    } else {
      const payload: CreateTabPayload = {
        name: event.data.name,
        slug: event.data.slug,
        rank: event.data.rank,
        content_type: state.content_type,
        related_collection: relatedCollection
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
    class="space-y-5"
    @submit="onSubmit"
  >
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Nume" name="name" required>
        <UInput v-model="state.name" placeholder="ex: Fise" class="w-full" />
      </UFormField>

      <UFormField label="Slug" name="slug" required>
        <UInput
          v-model="state.slug"
          placeholder="ex: fise"
          :readonly="isEdit"
          :class="{ 'opacity-60': isEdit }"
          class="w-full"
          @input="slugManuallyEdited = true"
        />
      </UFormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        label="Tip continut"
        name="content_type"
        description="Tipul si relatia sursa nu se pot schimba dupa creare."
      >
        <USelect
          v-model="state.content_type"
          :items="[
            { label: 'Campuri', value: 'fields' },
            { label: 'Colectie asociata', value: 'related_collection' }
          ]"
          value-key="value"
          :disabled="isEdit"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Ordine"
        name="rank"
        description="Ordinea tab-ului in formular"
      >
        <UInput
          v-model.number="state.rank"
          type="number"
          :min="0"
          class="w-full"
        />
      </UFormField>
    </div>

    <template v-if="state.content_type === 'related_collection'">
      <USeparator />

      <UFormField
        label="Relatie copil → parinte"
        name="id_relation_field"
        required
        description="FK-ul real ramane pe entitatea copil."
      >
        <USelectMenu
          v-model="state.id_relation_field"
          :items="relationSelectOptions"
          value-key="value"
          :loading="loadingRelations"
          :disabled="isEdit"
          searchable
          placeholder="Selecteaza relatia incoming"
          class="w-full"
        />
      </UFormField>

      <UAlert
        v-if="selectedRelation"
        color="neutral"
        variant="subtle"
        icon="i-lucide-git-branch"
        :title="`${selectedRelation.child_entity_name} → entitatea curenta`"
        :description="`Relatie ${selectedRelation.relation_kind}; camp ${selectedRelation.field_name}.`"
      />

      <div class="space-y-4">
        <h4 class="text-sm font-semibold uppercase tracking-wider text-muted">
          Afisare
        </h4>

        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Permite tabel">
            <USwitch v-model="state.allow_table" />
          </UFormField>
          <UFormField label="Permite carduri">
            <USwitch v-model="state.allow_cards" />
          </UFormField>
          <UFormField label="Vizualizare implicita">
            <USelect
              v-model="state.default_view"
              :items="[
                ...(state.allow_table ? [{ label: 'Tabel', value: 'table' }] : []),
                ...(state.allow_cards ? [{ label: 'Carduri', value: 'cards' }] : [])
              ]"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <div v-if="state.allow_cards" class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Titlu card" required>
            <USelectMenu
              v-model="state.card_title_field_id"
              :items="childFieldOptions"
              value-key="value"
              searchable
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Campuri card"
            description="Ordinea selectiei este folosita pe card."
          >
            <USelectMenu
              v-model="state.card_field_ids"
              :items="childFieldOptions"
              value-key="value"
              multiple
              searchable
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Dimensiune pagina">
            <UInput
              v-model.number="state.page_size"
              type="number"
              :min="1"
              :max="100"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Sortare implicita"
            description="Foloseste slug pentru ascendent sau -slug pentru descendent."
          >
            <UInput v-model="state.default_sort" placeholder="-date_created" class="w-full" />
          </UFormField>
        </div>
      </div>

      <USeparator />

      <div class="space-y-4">
        <h4 class="text-sm font-semibold uppercase tracking-wider text-muted">
          Operatii permise
        </h4>
        <p class="text-xs text-muted">
          Aceste optiuni doar restrang drepturile RBAC; nu acorda permisiuni.
        </p>
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Creare">
            <USwitch v-model="state.allow_create" />
          </UFormField>
          <UFormField label="Editare">
            <USwitch v-model="state.allow_update" />
          </UFormField>
          <UFormField label="Stergere">
            <USwitch v-model="state.allow_delete" />
          </UFormField>
        </div>
      </div>

      <USeparator />

      <div class="space-y-4">
        <h4 class="text-sm font-semibold uppercase tracking-wider text-muted">
          Adaugare rapida
        </h4>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Mod">
            <USelect
              v-model="state.quick_add_mode"
              :items="[
                { label: 'Formular normal', value: 'none' },
                { label: 'Upload multiplu automat', value: 'multi_file' }
              ]"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField v-if="state.quick_add_mode === 'multi_file'" label="Camp fisier" required>
            <USelectMenu
              v-model="state.id_quick_add_file_field"
              :items="quickFileFieldOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <UAlert
          v-if="missingQuickAddDefaults.length"
          color="warning"
          variant="subtle"
          title="Quick add necesita valori implicite"
          :description="`Configureaza default pentru: ${missingQuickAddDefaults.map(field => field.name).join(', ')}.`"
        />
      </div>
    </template>

    <div class="flex items-center gap-3 border-t border-default pt-4">
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
