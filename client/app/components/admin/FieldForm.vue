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
const { apiFetch } = useApi()

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
  options: props.field?.options ?? [] as { label: string, value: string }[],
  id_relation_entity: props.field?.id_relation_entity ?? '',
  relation_display_field: props.field?.relation_display_field ?? '',
  is_required: props.field?.is_required ?? false,
  is_unique: props.field?.is_unique ?? false,
  is_filterable: props.field?.is_filterable ?? true,
  is_sortable: props.field?.is_sortable ?? true,
  visible_in_table: props.field?.visible_in_table ?? true,
  visible_in_form: props.field?.visible_in_form ?? true,
  is_readonly: props.field?.is_readonly ?? false,
  validation_min_length: (props.field?.validation_rules?.min_length as number) ?? undefined as number | undefined,
  validation_max_length: (props.field?.validation_rules?.max_length as number) ?? undefined as number | undefined,
  validation_min: (props.field?.validation_rules?.min as number) ?? undefined as number | undefined,
  validation_max: (props.field?.validation_rules?.max as number) ?? undefined as number | undefined,
  validation_pattern: (props.field?.validation_rules?.pattern as string) ?? '',
  validation_error_message: (props.field?.validation_rules?.error_message as string) ?? '',
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

const relationFieldOptions = ref<{ label: string, value: string }[]>([])
const loadingRelationFields = ref(false)

async function fetchRelationEntityFields(entityId: string) {
  if (!entityId) {
    relationFieldOptions.value = []
    return
  }
  const targetEntity = props.entities.find(e => e.id_entity === entityId)
  if (!targetEntity) {
    relationFieldOptions.value = []
    return
  }
  loadingRelationFields.value = true
  try {
    const schema = await apiFetch<{ fields: Field[] }>(`/v1/schema/${targetEntity.slug}`)
    relationFieldOptions.value = (schema.fields ?? []).map(f => ({
      label: `${f.name} (${f.column_name})`,
      value: f.column_name
    }))
  } catch {
    relationFieldOptions.value = []
  } finally {
    loadingRelationFields.value = false
  }
}

watch(() => state.id_relation_entity, (entityId) => {
  fetchRelationEntityFields(entityId ?? '')
}, { immediate: true })

// ─── Zod validation ───
const formSchema = z.object({
  name: z.string().min(1, 'Numele este obligatoriu').max(100),
  slug: z.string()
    .min(2, 'Slug-ul trebuie sa aiba minim 2 caractere')
    .max(100)
    .regex(/^[a-z][a-z0-9_]{1,50}$/, 'Doar litere mici, cifre si _ (incepe cu litera)'),
  rank: z.coerce.number().int().min(1, 'Ordinea trebuie sa fie cel putin 1'),
  grid_col: z.coerce.number().int().min(1, 'Coloana grid trebuie sa fie intre 1 si 3').max(3, 'Coloana grid trebuie sa fie intre 1 si 3'),
  col_span: z.coerce.number().int().min(1, 'Col span trebuie sa fie intre 1 si 3').max(3, 'Col span trebuie sa fie intre 1 si 3')
}).superRefine((data, context) => {
  const endCol = data.grid_col + data.col_span - 1

  if (endCol > 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Campul nu incape in grila: coloana ${data.grid_col} cu latime ${data.col_span} depaseste cele 3 coloane puse la dispozitie.`,
      path: ['col_span']
    })
  }
})

// ─── Grid column visual picker ───
function isGridColSelected(col: number): boolean {
  const start = state.grid_col
  const end = state.grid_col + state.col_span - 1
  return col >= start && col <= end
}

function selectGridColumn(col: number) {
  const start = state.grid_col
  const end = state.grid_col + state.col_span - 1

  if (col === start - 1) {
    // click imediat in stanga → extinde la stanga
    state.grid_col = col
    state.col_span = state.col_span + 1
  } else if (col === end + 1 && end < 3) {
    // click imediat in dreapta → extinde la dreapta
    state.col_span = state.col_span + 1
  } else if (col === start && state.col_span > 1) {
    // click pe marginea stanga → elimina din stanga
    state.grid_col = start + 1
    state.col_span = state.col_span - 1
  } else if (col === end && state.col_span > 1) {
    // click pe marginea dreapta → elimina din dreapta
    state.col_span = state.col_span - 1
  } else {
    // click separat → selectie noua pe o singura coloana
    state.grid_col = col
    state.col_span = 1
  }
}

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
    if (state.validation_error_message) {
      validationRules.error_message = state.validation_error_message
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
        is_readonly: state.is_readonly,
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
        is_readonly: state.is_readonly,
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
  <UForm
    :schema="formSchema"
    :state="state"
    class="space-y-6"
    @submit="onSubmit"
  >
    <!-- Section 1: Identification -->
    <div class="space-y-4">
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">
        Identificare
      </h4>

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
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">
        Configurare UI
      </h4>

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
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">
        Optiuni
      </h4>

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
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">
        Relatie
      </h4>

      <UFormField label="Entitate tinta" name="id_relation_entity" required>
        <USelect
          v-model="state.id_relation_entity"
          :items="entityOptions"
          value-key="value"
          placeholder="Selecteaza entitatea"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Camp de afisat"
        name="relation_display_field"
        required
        description="Campul din entitatea tinta folosit pentru afisare in dropdown-uri de relatie"
      >
        <USelect
          v-model="state.relation_display_field"
          :items="relationFieldOptions"
          value-key="value"
          :placeholder="loadingRelationFields ? 'Se incarca...' : 'Selecteaza campul de afisat'"
          :loading="loadingRelationFields"
          :disabled="!state.id_relation_entity"
          class="w-full"
        />
      </UFormField>
    </div>

    <USeparator />

    <!-- Section 4: Rules -->
    <div class="space-y-4">
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">
        Reguli
      </h4>

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

        <UFormField label="Read-Only" name="is_readonly" description="Doar citire in formular.">
          <USwitch v-model="state.is_readonly" />
        </UFormField>
      </div>
    </div>

    <!-- Section 5: Validation -->
    <div v-if="showStringValidation || showNumericValidation" class="space-y-4">
      <USeparator />
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">
        Validare
      </h4>

      <div v-if="showStringValidation" class="grid grid-cols-2 gap-4">
        <UFormField label="Lungime minima" name="validation_min_length">
          <UInput
            v-model.number="state.validation_min_length"
            type="number"
            :min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Lungime maxima" name="validation_max_length">
          <UInput
            v-model.number="state.validation_max_length"
            type="number"
            :min="0"
            class="w-full"
          />
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

      <UFormField label="Mesaj de eroare (optional)" description="Afisat cand regulile de validare 'Pattern (regex)' nu sunt indeplinite">
        <UInput v-model="state.validation_error_message" placeholder="Ex: Numarul de telefon trebuie sa fie in format +40 XXX XXX XXX" class="w-full" />
      </UFormField>
    </div>

    <USeparator />

    <!-- Section 6: Layout -->
    <div class="space-y-4">
      <h4 class="text-sm font-semibold text-muted uppercase tracking-wider">
        Layout
      </h4>

      <UFormField label="Grup" name="group_name" description="Sectiunea/tab-ul in formular">
        <UInput v-model="state.group_name" placeholder="general" class="w-full" />
      </UFormField>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Ordine" name="rank" description="Ordinea in care apare campul in grup">
          <UInput
            v-model.number="state.rank"
            type="number"
            :min="1"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField label="Latime in formular" name="grid_col">
        <template #description>
          <span v-if="state.col_span === 1">Ocupa o singura coloana (pozitia {{ state.grid_col }})</span>
          <span v-else-if="state.col_span === 3">Ocupa toata latimea formularului</span>
          <span v-else>Ocupa {{ state.col_span }} coloane, incepand de la pozitia {{ state.grid_col }}</span>
        </template>
        <div class="flex gap-2">
          <button
            v-for="col in 3"
            :key="col"
            type="button"
            class="flex-1 h-16 rounded-lg border-2 transition-all cursor-pointer flex flex-col items-center justify-center gap-1"
            :class="isGridColSelected(col)
              ? 'bg-primary/10 border-primary text-primary shadow-sm'
              : 'border-dashed border-muted/50 text-muted hover:border-primary/40 hover:bg-primary/5'"
            @click="selectGridColumn(col)"
          >
            <UIcon
              :name="isGridColSelected(col) ? 'i-lucide-rectangle-horizontal' : 'i-lucide-rectangle-horizontal'"
              class="size-5"
              :class="isGridColSelected(col) ? 'text-primary' : 'text-muted/40'"
            />
            <span class="text-xs font-medium">{{ col }}</span>
          </button>
        </div>
      </UFormField>
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
