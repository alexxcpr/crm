<script setup lang="ts">
import type { Field } from '~/types/schema'

const props = defineProps<{
  field: Field
  modelValue: any
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const selectItems = computed(() => {
  if (!props.field.options) return []
  return props.field.options.map(o => ({ label: o.label, value: o.value }))
})
</script>

<template>
  <UFormField
    :name="field.slug"
    :label="field.name"
    :required="field.is_required"
    :help="field.help_text ?? undefined"
    :description="undefined"
  >
    <!-- text -->
    <UInput
      v-if="field.ui_type === 'text'"
      v-model="value"
      type="text"
      :placeholder="field.placeholder ?? undefined"
      class="w-full"
    />

    <!-- textarea -->
    <UTextarea
      v-else-if="field.ui_type === 'textarea'"
      v-model="value"
      :placeholder="field.placeholder ?? undefined"
      :rows="4"
      class="w-full"
    />

    <!-- number -->
    <UInput
      v-else-if="field.ui_type === 'number'"
      v-model="value"
      type="number"
      :placeholder="field.placeholder ?? undefined"
      class="w-full"
    />

    <!-- currency -->
    <UInput
      v-else-if="field.ui_type === 'currency'"
      v-model="value"
      type="number"
      :placeholder="field.placeholder ?? '0.00'"
      class="w-full"
    >
      <template #leading>
        <span class="text-dimmed text-sm">RON</span>
      </template>
    </UInput>

    <!-- email -->
    <UInput
      v-else-if="field.ui_type === 'email'"
      v-model="value"
      type="email"
      :placeholder="field.placeholder ?? 'email@exemplu.ro'"
      class="w-full"
    />

    <!-- phone -->
    <UInput
      v-else-if="field.ui_type === 'phone'"
      v-model="value"
      type="tel"
      :placeholder="field.placeholder ?? '+40 XXX XXX XXX'"
      class="w-full"
    />

    <!-- select -->
    <USelect
      v-else-if="field.ui_type === 'select'"
      v-model="value"
      :items="selectItems"
      :placeholder="field.placeholder ?? `Selecteaza ${field.name.toLowerCase()}`"
      value-key="value"
      class="w-full"
    />

    <!-- multi-select -->
    <USelectMenu
      v-else-if="field.ui_type === 'multi-select'"
      v-model="value"
      multiple
      :items="selectItems"
      value-key="value"
      :placeholder="field.placeholder ?? `Selecteaza ${field.name.toLowerCase()}`"
      class="w-full"
    />

    <!-- checkbox (boolean) -->
    <USwitch
      v-else-if="field.ui_type === 'checkbox'"
      v-model="value"
    />

    <!-- radio -->
    <URadioGroup
      v-else-if="field.ui_type === 'radio'"
      v-model="value"
      :items="selectItems"
      orientation="horizontal"
    />

    <!-- datepicker (date) -->
    <UInput
      v-else-if="field.ui_type === 'datepicker' && field.data_type === 'date'"
      v-model="value"
      type="date"
      :placeholder="field.placeholder ?? undefined"
      class="w-full"
    />

    <!-- datepicker (timestamp) -->
    <UInput
      v-else-if="field.ui_type === 'datepicker' && field.data_type === 'timestamp'"
      v-model="value"
      type="datetime-local"
      :placeholder="field.placeholder ?? undefined"
      class="w-full"
    />

    <!-- relation -->
    <DynamicRelationSelect
      v-else-if="field.ui_type === 'relation'"
      :field="field"
      :model-value="value"
      @update:model-value="value = $event"
    />

    <!-- fallback -->
    <UInput
      v-else
      v-model="value"
      type="text"
      :placeholder="field.placeholder ?? undefined"
      class="w-full"
    />
  </UFormField>
</template>
