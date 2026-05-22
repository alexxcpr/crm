<script setup lang="ts">
const router = useRouter()
const toast = useToast()
const { createWorkflow, loading, error } = useAdminWorkflows()

const name = ref('')
const slug = ref('')
const builderRef = ref<any>(null)
const isDirty = ref(false)

watch(name, (val) => {
  if (!slug.value || slug.value === slugify(name.value.slice(0, -1))) {
    slug.value = slugify(val)
  }
})

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
}

async function onSave(payload: { nodes: any[], connections: any[] }) {
  if (!name.value.trim()) {
    toast.add({ title: 'Numele este obligatoriu', color: 'error' })
    return
  }
  if (!slug.value.trim()) {
    toast.add({ title: 'Slug-ul este obligatoriu', color: 'error' })
    return
  }

  const result = await createWorkflow({
    name: name.value,
    slug: slug.value,
    nodes: payload.nodes,
    connections: payload.connections
  })

  if (result) {
    toast.add({ title: 'Workflow creat cu succes', color: 'success' })
    router.push(`/admin/workflows/${result.id_workflow}`)
  } else {
    toast.add({ title: 'Eroare', description: error.value ?? '', color: 'error' })
  }
}

function save() {
  builderRef.value?.save()
}
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-180px)]">
    <!-- Top Bar -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
      <div class="flex items-center gap-4">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          size="sm"
          @click="router.push('/admin/workflows')"
        />
        <div class="flex items-center gap-3">
          <UInput
            v-model="name"
            placeholder="Nume workflow"
            size="sm"
            class="w-48"
          />
          <UInput
            v-model="slug"
            placeholder="slug"
            size="sm"
            class="w-36 font-mono text-xs"
          />
        </div>
      </div>

      <div class="flex items-center gap-2">
        <UBadge
          v-if="isDirty"
          label="Nesalvat"
          color="warning"
          variant="subtle"
          size="xs"
        />
        <UButton
          label="Salveaza"
          icon="i-lucide-save"
          size="sm"
          :loading="loading"
          :disabled="!name.trim()"
          @click="save"
        />
      </div>
    </div>

    <!-- Builder -->
    <div class="flex-1 min-h-0">
      <WorkflowBuilder
        ref="builderRef"
        @save="onSave"
        @dirty="isDirty = $event"
      />
    </div>
  </div>
</template>
