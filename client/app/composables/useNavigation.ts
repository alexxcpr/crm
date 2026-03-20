import type { NavigationMenuItem } from '@nuxt/ui'

interface ModuleWithEntities {
  id_module: string
  name: string
  slug: string
  icon: string | null
  rank: number
  entities: {
    id_entity: string
    name: string
    slug: string
    icon: string | null
    label_plural: string | null
    rank: number
  }[]
}

export function useNavigation() {
  const { apiFetch } = useApi()

  const entityLinks = shallowRef<NavigationMenuItem[]>([])
  const loading = ref(false)

  async function fetchNavigation() {
    loading.value = true
    try {
      const response = await apiFetch<{ data: ModuleWithEntities[] }>('/v1/admin/modules')
      const modules = response.data

      const links: NavigationMenuItem[] = []

      for (const mod of modules) {
        if (!mod.entities?.length) continue

        const sortedEntities = [...mod.entities].sort((a, b) => a.rank - b.rank)

        for (const entity of sortedEntities) {
          links.push({
            label: entity.label_plural ?? entity.name,
            icon: entity.icon ?? 'i-lucide-database',
            to: `/${entity.slug}`
          })
        }
      }

      entityLinks.value = links
    }
    catch (err) {
      console.error('[useNavigation] Eroare la incarcarea modulelor:', err)
      entityLinks.value = []
    }
    finally {
      loading.value = false
    }
  }

  const staticLinks: NavigationMenuItem[] = [
    {
      label: 'Home',
      icon: 'i-lucide-house',
      to: '/'
    }
  ]

  const bottomLinks: NavigationMenuItem[] = [
    {
      label: 'Settings',
      icon: 'i-lucide-settings',
      to: '/settings'
    }
  ]

  fetchNavigation()

  return {
    staticLinks,
    entityLinks,
    bottomLinks,
    loading,
    fetchNavigation
  }
}
