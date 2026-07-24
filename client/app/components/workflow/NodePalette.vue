<script setup lang="ts">
const { categories, getNodesByCategory } = useNodeTypes();

const emit = defineEmits<{
  dragStart: [type: string, event: DragEvent];
}>();

function onDragStart(type: string, event: DragEvent) {
  event.dataTransfer?.setData("application/workflow-node", type);
  event.dataTransfer!.effectAllowed = "move";
  emit("dragStart", type, event);
}

function nodeGroups(category: string) {
  const nodes = getNodesByCategory(category);
  if (category !== "files") return [{ key: category, label: "", nodes }];
  const packages = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const key = node.package ?? "other";
    packages.set(key, [...(packages.get(key) ?? []), node]);
  }
  const labels: Record<string, string> = {
    word: "Word",
    pdf: "PDF",
    excel: "Excel",
    image: "Imagini",
  };
  return Array.from(packages.entries()).map(([key, packageNodes]) => ({
    key,
    label: labels[key] ?? key,
    nodes: packageNodes,
  }));
}
</script>

<template>
  <div
    class="w-60 border-r border-gray-200 dark:border-gray-800 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-3"
  >
    <h3
      class="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 tracking-wider"
    >
      Noduri
    </h3>

    <div v-for="cat in categories" :key="cat.key" class="mb-4">
      <div class="flex items-center gap-1.5 mb-2">
        <UIcon :name="cat.icon" class="size-3.5 text-gray-400" />
        <span
          class="text-[11px] font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wide"
        >
          {{ cat.label }}
        </span>
      </div>

      <div class="space-y-2">
        <div v-for="group in nodeGroups(cat.key)" :key="group.key">
          <p
            v-if="group.label"
            class="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400"
          >
            {{ group.label }}
          </p>
          <div class="space-y-1">
            <div
              v-for="node in group.nodes"
              :key="node.type"
              draggable="true"
              class="flex items-center gap-2 px-2.5 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 cursor-grab hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-sm transition-all select-none"
              @dragstart="onDragStart(node.type, $event)"
            >
              <div
                class="w-6 h-6 rounded flex items-center justify-center shrink-0"
                :style="{ backgroundColor: node.color + '20' }"
              >
                <UIcon
                  :name="node.icon"
                  class="size-3.5"
                  :style="{ color: node.color }"
                />
              </div>
              <div class="min-w-0">
                <p
                  class="text-xs font-medium text-gray-700 dark:text-gray-200 truncate"
                >
                  {{ node.label }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
