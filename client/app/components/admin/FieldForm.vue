<script setup lang="ts">
import { z } from 'zod'
import type { Field } from '~/types/schema'
import type { AdminEntity, FieldPayload, UpdateFieldPayload } from '~/types/admin'
import type { FormSubmitEvent } from '@nuxt/ui'

const props = defineProps<{
  entityId: string
  field?: Field | null
  entities: AdminEntity[]
}>()

const emit = defineEmits<{
  saved: [field: Field]
  cancel: []
}>()

const isEdit = computed(() => !!props.field)
const toast = useToast()
const { createField, updateField, error } = useAdminFields(props.entityId)

// ─── data_type → ui_type mapping ───
const dataTypeUiTypeMap: Record<string, string[]> = {
  varchar: ['text', 'select', 'radio', 'email', 'phone'],
  text: ['textarea', 'text'],
  integer: ['number'],
  numeric: ['number', 'currency'],
  boolean: ['checkbox'],
  date: ['datepicker'],
  timestamp: ['datepicker'],
  uuid: ['relation'],
  jsonb: ['multi-select']
}

const dataTypeOptions = [
  { label: 'VARCHAR (text scurt)', value: 'varchar' },
  { label: 'TEXT (text lung)', value: 'text' },
  { label: 'INTEGER (numar intreg)', value: 'integer' },
  { label: 'NUMERIC (numar decimal)', value: 'numeric' },
  { label: 'BOOLEAN (da/nu)', value: 'boolean' },
  { label: 'DATE (data)', value: 'date' },
  { label: 'TIMESTAMP (data + ora)', value: 'timestamp' },
  { label: 'UUID (relatie)', value: 'uuid' },
  { label: 'JSONB (JSON)', value: 'jsonb' }
]

const allUiTypeOptions = [
  { label: 'Text', value: 'text' },
  { label: 'Textarea', value: 'textarea' },
  { label: 'Number', value: 'number' },
  { label: 'Select', value: 'select' },
  { label: 'Multi-select', value: 'multi-select' },
  { label: 'Datepicker', value: 'datepicker' },
  { label: 'Checkbox', value: 'checkbox' },
  { label: 'Radio', value: 'radio' },
  { label: 'Relatie', value: 'relation' },
  { label: 'Email', value: 'email' },
  { label: 'Phone', value: 'phone' },
  { label: 'Currency', value: 'currency' },
  { label: 'File', value: 'file' }
]

// ─── Form State ───
const state = reactive({
  name: props.field?.name ?? '',
  slug: props.field?.slug ?? '',
  data_type: props.field?.data_type ?? 'varchar',
  ui_type: props.field?.ui_type ?? 'text',
  placeholder: props.field?.placeholder ?? '',
  help_text: props.field?.help_text ?? '',
  default_value: props.field?.default_value ?? '',
  options: props.field?.options ?? [] as { label: string; value: string }[],
  id_relation_entity: props.field?.id_relation_entity ?? '',
  relation_display_field: props.field?.relation_display_field ?? '',
  is_required: props.field?.is_required ?? false,
  is_unique: props.field?.is_unique ?? false,
  is_filterable: props.field?.is_filterable ?? true,
  is_sortable: props.field?.is_sortable ?? true,
  visible_in_table: props.field?.visible_in_table ?? true,
  visible_in_form: props.field?.visible_in_form ?? true,
  validation_min_length: (props.field?.validation_rules?.min_length as number) ?? undefined as number | undefined,
  validation_max_length: (props.field?.validation_rules?.max_length as number) ?? undefined as number | undefined,
  validation_min: (props.field?.validation_rules?.min as number) ?? undefined as number | undefined,
  validation_max: (props.field?.validation_rules?.max as number) ?? undefined as number | undefined,
  validation_pattern: (props.field?.validation_rules?.pattern as string) ?? '',
  group_name: props.field?.group_name ?? 'general',
  rank: props.field?.rank ?? 1,
  grid_col: props.field?.grid_col ?? 1,
  col_span: props.field?.col_span ?? 1
})

// ─── Slug auto-gen ───
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

// ─── Filtered ui_type options ───
const filteredUiTypeOptions = computed(() => {
  const allowed = dataTypeUiTypeMap[state.data_type]
  if (!allowed) return allUiTypeOptions
  return allUiTypeOptions.filter(o => allowed.includes(o.value))
})

watch(() => state.data_type, () => {
  if (isEdit.value) return
  const allowed = filteredUiTypeOptions.value
  const first = allowed[0]
  if (first && !allowed.some(o => o.value === state.ui_type)) {
    state.ui_type = first.value as Field['ui_type']
  }
})

// ─── Computed: show sections ───
const showOptionsEditor = computed(() =>
  ['select', 'multi-select', 'radio'].includes(state.ui_type)
)

const showRelationFields = computed(() => state.ui_type === 'relation')

const showStringValidation = computed(() =>
  ['varchar', 'text'].includes(state.data_type)
)

const showNumericValidation = computed(() =>
  ['integer', 'numeric'].includes(state.data_type)
)

// ─── Options editor ───
function addOption() {
  state.options.push({ label: '', value: '' })
}

function removeOption(index: number) {
  state.options.splice(index, 1)
}

function autoFillOptionValue(index: number) {
  const opt = state.options[index]
  if (opt && opt.label && !opt.value) {
    opt.value = opt.label
      .toLowerCase()
      .replace(/[șş]/g, 's')
      .replace(/[țţ]/g, 't')
      .replace(/[ăâ]/g, 'a')
      .replace(/î/g, 'i')
      .replace(/[^a-z0-9\s_]/g, '')
      .replace(/\s+/g, '_')
  }
}

// ─── Entity options for relation ───
const entityOptions = computed(() =>
  props.entities.map(e => ({
    label: `${e.name} (${e.slug})`,
    value: e.id_entity
  }))
)

// ─── Zod validation ───
const formSchema = z.object({
  name: z.string().min(1, 'Numele este obligatoriu').max(100),
  slug: z.string()
    .min(2, 'Slug-ul trebuie sa aiba minim 2 caractere')
    .max(100)
    .regex(/^[a-z][a-z0-9_]{1,50}$/, 'Doar litere mici, cifre si _ (incepe cu litera)'),
  grid_col: z.coerce.number().int().min(1).max(3),
  col_span: z.coerce.number().int().min(1).max(3),
}).refine((data) => data.grid_col + data.col_span <= 4, {
  message: 'Pe grila cu 3 coloane, coloana de start plus latimea nu pot depasi 3 (ex.: coloana 3 = doar latime 1)',
  path: ['col_span']
})

// ─── Submit ───
const submitting = ref(false)

async function onSubmit(event: FormSubmitEvent<z.output<typeof formSchema>>) {
  submitting.value = true

  try {
    const validationRules: Record<string, any> = {}
    if (showStringValidation.value) {
      if (state.validation_min_length != null) validationRules.min_length = state.validation_min_length
      if (state.validation_max_length != null) validationRules.max_length = state.validation_max_length
    }
    if (showNumericValidation.value) {
      if (state.validation_min != null) validationRules.min = state.validation_min
      if (state.validation_max != null) validationRules.max = state.validation_max
    }
    if (state.validation_pattern) {
      validationRules.pattern = state.validation_pattern
    }

    let result: Field | null

    if (isEdit.value && props.field) {
      const payload: UpdateFieldPayload = {
        name: state.name,
        ui_type: state.ui_type as Field['ui_type'],
        placeholder: state.placeholder || undefined,
        help_text: state.help_text || undefined,
        default_value: state.default_value || undefined,
        options: showOptionsEditor.value ? state.options.filter(o => o.label && o.value) : undefined,
        id_relation_entity: showRelationFields.value ? state.id_relation_entity || undefined : undefined,
        relation_display_field: showRelationFields.value ? state.relation_display_field || undefined : undefined,
        is_required: state.is_required,
        is_unique: state.is_unique,
        is_filterable: state.is_filterable,
        is_sortable: state.is_sortable,
        visible_in_table: state.visible_in_table,
        visible_in_form: state.visible_in_form,
        validation_rules: Object.keys(validationRules).length ? validationRules : undefined,
        group_name: state.group_name || 'general',
        rank: state.rank,
        grid_col: state.grid_col,
        col_span: state.col_span
      }
      result = await updateField(props.field.id_field, payload)
    }
    else {
      const payload: FieldPayload = {
        name: state.name,
        slug: state.slug,
        data_type: state.data_type as Field['data_type'],
        ui_type: state.ui_type as Field['ui_type'],
        placeholder: state.placeholder || undefined,
        help_text: state.help_text || undefined,
        default_value: state.default_value || undefined,
        options: showOptionsEditor.value ? state.options.filter(o => o.label && o.value) : undefined,
        id_relation_entity: showRelationFields.value ? state.id_relation_entity || undefined : undefined,
        relation_display_field: showRelationFields.value ? state.relation_display_field || undefined : undefined,
        is_required: state.is_required,
        is_unique: state.is_unique,
        is_filterable: state.is_filterable,
        is_sortable: state.is_sortable,
        visible_in_table: state.visible_in_table,
        visible_in_form: state.visible_in_form,
        validation_rules: Object.keys(validationRules).length ? validationRules : undefined,
        group_name: state.group_name || 'general',
        rank: state.rank,
        grid_col: state.grid_col,
        col_span: state.col_span
      }
      result = await createField(payload)
    }

    if (result) {
      toast.add({
        title: isEdit.value ? 'Camp actualizat' : 'Camp creat',
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
  <UForm :schema="formSchema" :state="state" class="space-y-6" @submit="onSubmit">
    <!-- Section 1: Identification -->
    <div class="space-y-4">
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">Identificare</h4>

      <UFormField label="Nume" name="name" required>
        <UInput v-model="state.name" placeholder="ex: Industrie" class="w-full" />
      </UFormField>

      <UFormField label="Slug" name="slug" required>
        <UInput
          v-model="state.slug"
          placeholder="ex: industry"
          :readonly="isEdit"
          :class="{ 'opacity-60': isEdit }"
          class="w-full"
          @input="slugManuallyEdited = true"
        />
      </UFormField>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Tip date" name="data_type" required>
          <USelect
            v-model="state.data_type"
            :items="dataTypeOptions"
            value-key="value"
            :disabled="isEdit"
            :class="{ 'opacity-60': isEdit }"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Tip UI" name="ui_type" required>
          <USelect
            v-model="state.ui_type"
            :items="filteredUiTypeOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>
    </div>

    <USeparator />

    <!-- Section 2: UI Config -->
    <div class="space-y-4">
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">Configurare UI</h4>

      <UFormField label="Placeholder" name="placeholder">
        <UInput v-model="state.placeholder" placeholder="Text afisat cand campul e gol" class="w-full" />
      </UFormField>

      <UFormField label="Text ajutator" name="help_text">
        <UInput v-model="state.help_text" placeholder="Descriere afisata sub camp" class="w-full" />
      </UFormField>

      <UFormField label="Valoare implicita" name="default_value">
        <UInput v-model="state.default_value" placeholder="Valoare default" class="w-full" />
      </UFormField>
    </div>

    <!-- Section 2b: Options editor -->
    <div v-if="showOptionsEditor" class="space-y-4">
      <USeparator />
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">Optiuni</h4>

      <div
        v-for="(opt, idx) in state.options"
        :key="idx"
        class="flex items-center gap-2"
      >
        <UInput
          v-model="opt.label"
          placeholder="Label"
          class="flex-1"
          @blur="autoFillOptionValue(idx)"
        />
        <UInput
          v-model="opt.value"
          placeholder="Value"
          class="flex-1"
        />
        <UButton
          icon="i-lucide-x"
          color="error"
          variant="ghost"
          size="xs"
          @click="removeOption(idx)"
        />
      </div>

      <UButton
        label="Adauga optiune"
        icon="i-lucide-plus"
        variant="outline"
        color="neutral"
        size="sm"
        @click="addOption"
      />
    </div>

    <!-- Section 3: Relation -->
    <div v-if="showRelationFields" class="space-y-4">
      <USeparator />
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">Relatie</h4>

      <UFormField label="Entitate tinta" name="id_relation_entity" required>
        <USelect
          v-model="state.id_relation_entity"
          :items="entityOptions"
          value-key="value"
          placeholder="Selecteaza entitatea"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Camp de afisat" name="relation_display_field" required description="Slug-ul campului din entitatea tinta (ex: name)">
        <UInput v-model="state.relation_display_field" placeholder="ex: name" class="w-full" />
      </UFormField>
    </div>

    <USeparator />

    <!-- Section 4: Rules -->
    <div class="space-y-4">
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">Reguli</h4>

      <div class="grid grid-cols-2 gap-x-6 gap-y-3">
        <UFormField label="Obligatoriu" name="is_required">
          <USwitch v-model="state.is_required" />
        </UFormField>

        <UFormField label="Unic" name="is_unique">
          <USwitch v-model="state.is_unique" />
        </UFormField>

        <UFormField label="Filtrabil" name="is_filterable">
          <USwitch v-model="state.is_filterable" />
        </UFormField>

        <UFormField label="Sortabil" name="is_sortable">
          <USwitch v-model="state.is_sortable" />
        </UFormField>

        <UFormField label="Vizibil in tabel" name="visible_in_table">
          <USwitch v-model="state.visible_in_table" />
        </UFormField>

        <UFormField label="Vizibil in formular" name="visible_in_form">
          <USwitch v-model="state.visible_in_form" />
        </UFormField>
      </div>
    </div>

    <!-- Section 5: Validation -->
    <div v-if="showStringValidation || showNumericValidation" class="space-y-4">
      <USeparator />
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">Validare</h4>

      <div v-if="showStringValidation" class="grid grid-cols-2 gap-4">
        <UFormField label="Lungime minima" name="validation_min_length">
          <UInput v-model.number="state.validation_min_length" type="number" :min="0" class="w-full" />
        </UFormField>
        <UFormField label="Lungime maxima" name="validation_max_length">
          <UInput v-model.number="state.validation_max_length" type="number" :min="0" class="w-full" />
        </UFormField>
      </div>

      <div v-if="showNumericValidation" class="grid grid-cols-2 gap-4">
        <UFormField label="Valoare minima" name="validation_min">
          <UInput v-model.number="state.validation_min" type="number" class="w-full" />
        </UFormField>
        <UFormField label="Valoare maxima" name="validation_max">
          <UInput v-model.number="state.validation_max" type="number" class="w-full" />
        </UFormField>
      </div>

      <UFormField label="Pattern (regex)" name="validation_pattern">
        <UInput v-model="state.validation_pattern" placeholder="^[a-zA-Z]+$" class="w-full" />
      </UFormField>
    </div>

    <USeparator />

    <!-- Section 6: Layout -->
    <div class="space-y-4">
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">Layout</h4>

      <UFormField label="Grup" name="group_name" description="Sectiunea/tab-ul in formular">
        <UInput v-model="state.group_name" placeholder="general" class="w-full" />
      </UFormField>

      <div class="grid grid-cols-3 gap-4">
        <UFormField label="Ordine" name="rank" description="in afisare">
          <UInput v-model.number="state.rank" type="number" :min="1" class="w-full" />
        </UFormField>

        <UFormField label="Coloana grid" name="grid_col" description="1-3">
          <UInput v-model.number="state.grid_col" type="number" :min="1" :max="3" class="w-full" />
        </UFormField>

        <UFormField label="Col span" name="col_span" description="1-3">
          <UInput v-model.number="state.col_span" type="number" :min="1" :max="3" class="w-full" />
        </UFormField>
      </div>
    </div>

    <!-- Actions -->
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
