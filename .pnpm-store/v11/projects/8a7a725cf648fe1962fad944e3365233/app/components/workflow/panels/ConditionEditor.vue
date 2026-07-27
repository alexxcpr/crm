<script setup lang="ts">
import type { Condition, ConditionOperand, OperatorDef } from '~/composables/useNodeTypes'
import { OPERATOR_DEFS, getOperatorsForType } from '~/composables/useNodeTypes'
import type { DataSource } from '~/composables/useWorkflowDataRegistry'
import type { Field } from '~/types/schema'

const props = defineProps<{
  modelValue: Condition[]
  combinator: 'and' | 'or'
  dataSources: DataSource[]
  fetchSourceFields?: (nodeId: string) => Promise<Field[]>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Condition[]]
  'update:combinator': [value: 'and' | 'or']
}>()

const conditions = ref<Condition[]>([...props.modelValue])

watch(() => props.modelValue, (v) => {
  conditions.value = v?.length ? [...v] : []
})

function emitConditions() {
  emit('update:modelValue', [...conditions.value])
}

// ─── Row management ───

function addCondition() {
  conditions.value.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `cond_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    leftOperand: { sourceType: 'static', value: '' },
    operator: 'equals',
    rightOperand: { sourceType: 'static', value: '' }
  })
  emitConditions()
}

function removeCondition(index: number) {
  conditions.value.splice(index, 1)
  emitConditions()
}

// ─── Operand updates ───

function updateLeftOperand(index: number, operand: ConditionOperand) {
  const cond = conditions.value[index]
  if (!cond) return
  cond.leftOperand = operand

  // Refilter operators — reset if current operator no longer valid
  const available = availableOperators(operand)
  if (!available.find(o => o.moduvisValue === cond.operator)) {
    cond.operator = available[0]?.moduvisValue ?? 'equals'
  }

  emitConditions()
}

function updateRightOperand(index: number, operand: ConditionOperand) {
  if (!conditions.value[index]) return
  conditions.value[index].rightOperand = operand
  emitConditions()
}

function updateOperator(index: number, op: string) {
  if (!conditions.value[index]) return
  conditions.value[index].operator = op
  emitConditions()
}

// ─── Operator filtering ───

function availableOperators(operand: ConditionOperand): OperatorDef[] {
  return getOperatorsForType(operand.dataType)
}

function operatorOptions(index: number) {
  const cond = conditions.value[index]
  if (!cond) return []
  const ops = availableOperators(cond.leftOperand)
  return ops.map(o => ({ label: o.label, value: o.moduvisValue }))
}

function currentOperatorDef(index: number): OperatorDef | undefined {
  const cond = conditions.value[index]
  if (!cond) return undefined
  return OPERATOR_DEFS.find(o => o.moduvisValue === cond.operator)
}

// ─── Type mismatch detection ───

function hasTypeMismatch(index: number): boolean {
  const cond = conditions.value[index]
  if (!cond) return false
  const leftType = cond.leftOperand?.dataType
  const rightType = cond.rightOperand?.dataType
  if (!leftType || !rightType) return false
  return leftType !== rightType
}

// ─── Combinator toggle ───

const combinatorOptions = [
  { label: 'ȘI (AND)', value: 'and' },
  { label: 'SAU (OR)', value: 'or' }
]
</script>

<template>
  <div class="space-y-3">
    <!-- Combinator toggle -->
    <div v-if="conditions.length > 1" class="flex items-center gap-1">
      <span class="text-[11px] text-gray-500 dark:text-gray-400 mr-1">Combină cu:</span>
      <UButton
        v-for="opt in combinatorOptions"
        :key="opt.value"
        :label="opt.label"
        :variant="combinator === opt.value ? 'solid' : 'outline'"
        :color="combinator === opt.value ? 'primary' : 'neutral'"
        size="xs"
        @click="emit('update:combinator', opt.value as 'and' | 'or')"
      />
    </div>

    <!-- Condition rows -->
    <div
      v-for="(cond, idx) in conditions"
      :key="cond.id"
      class="border border-gray-200 dark:border-gray-700 rounded-md p-2.5 space-y-2 relative"
    >
      <!-- Stânga -->
      <div>
        <label class="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5 block">
          Câmp
        </label>
        <WorkflowPanelsConditionOperandPicker
          :model-value="cond.leftOperand"
          :data-sources="dataSources"
          :fetch-source-fields="fetchSourceFields"
          @update:model-value="updateLeftOperand(idx, $event)"
        />
      </div>

      <!-- Operator -->
      <div>
        <label class="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5 block">
          Operator
        </label>
        <USelect
          :model-value="cond.operator"
          :items="operatorOptions(idx)"
          value-key="value"
          label-key="label"
          size="xs"
          class="w-full"
          @update:model-value="updateOperator(idx, $event)"
        />
      </div>

      <!-- Dreapta (hidden for unary operators) -->
      <div v-if="!currentOperatorDef(idx)?.unary">
        <label class="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5 block">
          Valoare
        </label>
        <WorkflowPanelsConditionOperandPicker
          :model-value="cond.rightOperand"
          :data-sources="dataSources"
          :fetch-source-fields="fetchSourceFields"
          @update:model-value="updateRightOperand(idx, $event)"
        />
      </div>

      <!-- Type mismatch warning -->
      <p
        v-if="hasTypeMismatch(idx)"
        class="text-[10px] text-amber-600 dark:text-amber-400"
      >
        Tipuri diferite între operanzi
      </p>

      <!-- Remove button -->
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="xs"
        class="absolute top-2 right-2"
        @click="removeCondition(idx)"
      />
    </div>

    <!-- Empty state -->
    <div
      v-if="conditions.length === 0"
      class="text-xs text-gray-400 dark:text-gray-500 text-center py-3"
    >
      Nicio condiție definită. Adaugă cel puțin o condiție.
    </div>

    <!-- Add button -->
    <UButton
      label="Adaugă condiție"
      icon="i-lucide-plus"
      variant="outline"
      color="neutral"
      size="xs"
      block
      @click="addCondition"
    />
  </div>
</template>
