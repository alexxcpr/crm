<script setup lang="ts">
import type { FormulaAssignment, FormulaToken } from '~/composables/useNodeTypes'
import type { DataSource } from '~/composables/useWorkflowDataRegistry'
import type { Field } from '~/types/schema'

const props = defineProps<{
  modelValue: FormulaAssignment[]
  dataSources: DataSource[]
  fetchSourceFields?: (nodeId: string) => Promise<Field[]>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FormulaAssignment[]]
}>()

const assignments = ref<FormulaAssignment[]>(props.modelValue?.length ? [...props.modelValue] : [])

watch(() => props.modelValue, (v) => {
  assignments.value = v?.length ? [...v] : []
})

function emitUpdate() {
  emit('update:modelValue', [...assignments.value])
}

// ─── Add / Remove assignments ───

function addAssignment() {
  assignments.value.push({ key: '', tokens: [] })
  emitUpdate()
}

function removeAssignment(index: number) {
  assignments.value.splice(index, 1)
  emitUpdate()
}

function updateKey(index: number, key: string) {
  if (!assignments.value[index]) return
  assignments.value[index].key = key
  emitUpdate()
}

// ─── Formula token management (per assignment) ───

function tokensFor(index: number): FormulaToken[] {
  return assignments.value[index]?.tokens ?? []
}

function setTokens(index: number, tokens: FormulaToken[]) {
  if (!assignments.value[index]) return
  assignments.value[index].tokens = tokens
  emitUpdate()
}

function addToken(index: number, token: FormulaToken) {
  const tokens = [...tokensFor(index), token]
  setTokens(index, tokens)
}

function removeLastToken(index: number) {
  const tokens = tokensFor(index)
  if (tokens.length === 0) return
  setTokens(index, tokens.slice(0, -1))
}

function clearFormula(index: number) {
  setTokens(index, [])
}

// ─── Field picker state ───

const activeIndex = ref<number | null>(null)
const pickingField = ref(false)
const typingLiteral = ref(false)
const pickSourceNodeId = ref('')
const fieldOptions = ref<Field[]>([])
const literalInput = ref('')

const sourceOptions = computed(() =>
  props.dataSources.map(ds => ({
    label: `${ds.label} (${ds.entitySlug})`,
    value: ds.nodeId
  }))
)

const fieldSelectOptions = computed(() =>
  fieldOptions.value.map(f => ({
    label: `${f.name} (${f.column_name})`,
    value: f.column_name,
    fieldLabel: f.name,
    dataType: f.data_type
  }))
)

function openFieldPicker(index: number) {
  activeIndex.value = index
  pickingField.value = true
  typingLiteral.value = false
  pickSourceNodeId.value = ''
  fieldOptions.value = []
}

function openLiteralInput(index: number) {
  activeIndex.value = index
  typingLiteral.value = true
  pickingField.value = false
  literalInput.value = ''
}

function closePickers() {
  pickingField.value = false
  typingLiteral.value = false
  activeIndex.value = null
}

async function onPickSource(nodeId: string) {
  pickSourceNodeId.value = nodeId
  fieldOptions.value = []
  if (nodeId && props.fetchSourceFields) {
    fieldOptions.value = await props.fetchSourceFields(nodeId)
  }
}

function onPickField(columnName: string, fieldLabel?: string) {
  if (activeIndex.value === null) return
  const ds = props.dataSources.find(s => s.nodeId === pickSourceNodeId.value)
  const field = fieldOptions.value.find(f => f.column_name === columnName)
  addToken(activeIndex.value, {
    type: 'field',
    sourceNodeId: pickSourceNodeId.value,
    fieldSlug: columnName,
    fieldLabel: fieldLabel ?? field?.name ?? columnName,
    sourceLabel: ds?.label ?? pickSourceNodeId.value,
    dataType: field?.data_type
  })
  closePickers()
}

function onAddLiteral() {
  if (activeIndex.value === null || !literalInput.value.trim()) return
  addToken(activeIndex.value, {
    type: 'literal',
    value: literalInput.value.trim()
  })
  closePickers()
}

function onAddOperator(index: number, op: string) {
  addToken(index, { type: 'operator', value: op })
}

function onAddGroup(index: number, kind: 'start' | 'end') {
  addToken(index, { type: kind === 'start' ? 'group_start' : 'group_end' })
}

// ─── Token display helpers ───

function tokenLabel(token: FormulaToken): string {
  if (token.type === 'field') return token.fieldLabel ?? token.fieldSlug ?? '?'
  if (token.type === 'literal') return token.value ?? ''
  if (token.type === 'operator') {
    const map: Record<string, string> = { '+': '+', '-': '-', '*': '×', '/': '÷' }
    return map[token.value ?? ''] ?? token.value ?? ''
  }
  if (token.type === 'group_start') return '('
  if (token.type === 'group_end') return ')'
  return ''
}
</script>

<template>
  <div class="space-y-3">
    <!-- Assignments -->
    <div
      v-for="(assignment, idx) in assignments"
      :key="idx"
      class="border border-gray-200 dark:border-gray-700 rounded-md p-2.5 space-y-2"
    >
      <!-- Header: key + remove -->
      <div class="flex items-center gap-1.5">
        <UInput
          :model-value="assignment.key"
          size="xs"
          placeholder="Nume camp iesire (ex: valoare_totala)"
          class="flex-1"
          @update:model-value="(v: string) => updateKey(idx, v)"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          class="shrink-0"
          @click="removeAssignment(idx)"
        />
      </div>

      <!-- Formula display -->
      <div
        class="min-h-[36px] px-2 py-1.5 rounded bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 flex items-center flex-wrap gap-1"
      >
        <template v-for="(token, tIdx) in tokensFor(idx)" :key="tIdx">
          <!-- Field token -->
          <span
            v-if="token.type === 'field'"
            class="inline-flex flex-col items-start px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0"
            style="background-color: #3b82f620; color: #3b82f6;"
          >
            <span>{{ token.fieldLabel ?? token.fieldSlug }}</span>
            <span class="text-[9px] opacity-60 -mt-0.5">{{ token.sourceLabel }}</span>
          </span>
          <!-- Operator token -->
          <span
            v-else-if="token.type === 'operator'"
            class="text-xs font-semibold text-gray-600 dark:text-gray-300 px-0.5"
          >
            {{ tokenLabel(token) }}
          </span>
          <!-- Parentheses -->
          <span
            v-else-if="token.type === 'group_start' || token.type === 'group_end'"
            class="text-xs font-bold text-gray-500 dark:text-gray-400"
          >
            {{ tokenLabel(token) }}
          </span>
          <!-- Literal -->
          <span
            v-else-if="token.type === 'literal'"
            class="inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shrink-0"
          >
            {{ tokenLabel(token) }}
          </span>
        </template>
        <span
          v-if="tokensFor(idx).length === 0"
          class="text-[11px] text-gray-400 italic"
        >
          Construieste formula mai jos...
        </span>
      </div>

      <!-- Toolbar -->
      <div class="flex items-center gap-1 flex-wrap">
        <UButton
          label="Camp"
          icon="i-lucide-database"
          variant="outline"
          color="neutral"
          size="xs"
          @click="openFieldPicker(idx)"
        />
        <UButton
          label="Valoare"
          icon="i-lucide-hash"
          variant="outline"
          color="neutral"
          size="xs"
          @click="openLiteralInput(idx)"
        />
        <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <UButton
          v-for="op in ['+', '-', '*', '/']"
          :key="op"
          :label="op === '*' ? '×' : op === '/' ? '÷' : op"
          variant="outline"
          color="neutral"
          size="xs"
          class="min-w-[28px]! px-1!"
          @click="onAddOperator(idx, op)"
        />
        <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <UButton
          label="("
          variant="outline"
          color="neutral"
          size="xs"
          class="min-w-[24px]! px-1!"
          @click="onAddGroup(idx, 'start')"
        />
        <UButton
          label=")"
          variant="outline"
          color="neutral"
          size="xs"
          class="min-w-[24px]! px-1!"
          @click="onAddGroup(idx, 'end')"
        />
        <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <UButton
          icon="i-lucide-undo-2"
          variant="outline"
          color="neutral"
          size="xs"
          title="Undo ultimul token"
          @click="removeLastToken(idx)"
        />
        <UButton
          icon="i-lucide-trash-2"
          variant="outline"
          color="error"
          size="xs"
          title="Sterge formula"
          @click="clearFormula(idx)"
        />

        <!-- Inline Field Picker panel -->
        <div
          v-if="pickingField && activeIndex === idx"
          class="w-full flex items-center gap-1.5 mt-1 p-2 rounded bg-gray-100 dark:bg-gray-800"
        >
          <USelect
            :model-value="pickSourceNodeId"
            :items="sourceOptions"
            value-key="value"
            label-key="label"
            size="xs"
            placeholder="Sursa..."
            class="flex-1"
            @update:model-value="(v: string) => onPickSource(v)"
          />
          <USelect
            :model-value="''"
            :items="fieldSelectOptions"
            value-key="value"
            label-key="label"
            size="xs"
            placeholder="Camp..."
            class="flex-1"
            @update:model-value="(v: string) => {
              const opt = fieldSelectOptions.find(o => o.value === v)
              onPickField(v, opt?.fieldLabel)
            }"
          />
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="closePickers"
          />
        </div>

        <!-- Inline Literal Input panel -->
        <div
          v-if="typingLiteral && activeIndex === idx"
          class="w-full flex items-center gap-1.5 mt-1 p-2 rounded bg-gray-100 dark:bg-gray-800"
        >
          <UInput
            v-model="literalInput"
            size="xs"
            placeholder="Scrie o valoare (ex: 10, Ana)..."
            class="flex-1"
            @keyup.enter="onAddLiteral"
          />
          <UButton
            label="Adauga"
            variant="solid"
            color="primary"
            size="xs"
            @click="onAddLiteral"
          />
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="closePickers"
          />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="assignments.length === 0"
      class="text-xs text-gray-400 text-center py-2"
    >
      Niciun camp de setat. Adauga campuri calculate.
    </div>

    <!-- Add button -->
    <UButton
      label="Adauga valoare"
      icon="i-lucide-plus"
      variant="outline"
      color="neutral"
      size="xs"
      block
      @click="addAssignment"
    />
  </div>
</template>
