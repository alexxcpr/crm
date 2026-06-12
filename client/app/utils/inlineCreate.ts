import type { InjectionKey } from 'vue'

/** Cheia de injecție pentru adâncimea curentă de inline-create.
 *  DynamicForm.vue oferă 0 (root), DynamicInlineCreateForm.vue oferă parentDepth + 1. */
export const INLINE_CREATE_DEPTH_KEY: InjectionKey<number> = Symbol('inlineCreateDepth')

/** Adâncimea maximă permisă pentru inline-create (0-indexed).
 *  La depth 0 → butonul apare (formularul principal).
 *  La depth 1 → butonul apare (primul modal inline).
 *  La depth 2 → butonul NU apare (previne nesting infinit). */
export const MAX_INLINE_CREATE_DEPTH = 1
