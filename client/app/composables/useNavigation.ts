import type { NavigationMenuItem } from '@nuxt/ui'

interface NavigationMenu {
  id_menu: string
  name: string
  icon: string | null
  rank: number
  items: {
    id_menu_item: string
    name: string
    icon: string | null
    rank: number
    open_link: string
    link_type: string
    is_external: boolean
  }[]
}

export function useNavigation() {
  const { apiFetch } = useApi()
  const { data: session } = useAuth()

  const entityLinks = useState<NavigationMenuItem[]>('navigation-menu-links', () => [])
  const navigationLoaded = useState('navigation-menu-loaded', () => false)
  const loading = useState('navigation-menu-loading', () => false)

  async function fetchNavigation() {
    loading.value = true
    try {
      const response = await apiFetch<{ data: NavigationMenu[] }>('/v1/navigation/menu')
      const menus = response.data

      const links: NavigationMenuItem[] = []

      for (const menu of menus) {
        if (!menu.items?.length) continue

        links.push({
          label: menu.name,
          icon: menu.icon ?? 'i-lucide-folder',
          type: 'trigger',
          defaultOpen: true,
          children: [...menu.items]
            .sort((a, b) => a.rank - b.rank)
            .map(item => ({
              label: item.name,
              icon: item.icon ?? 'i-lucide-database',
              to: item.open_link,
              target: item.is_external ? '_blank' : undefined,
              external: item.is_external
            }))
        })
      }

      entityLinks.value = links
      navigationLoaded.value = true
    } catch (err) {
      console.error('[useNavigation] Eroare la incarcarea meniului:', err)
      entityLinks.value = []
    } finally {
      loading.value = false
    }
  }

  const isAdmin = computed(() => {
    const user = session.value as Record<string, unknown> | null
    const roles = user?.roles as string[] | undefined
    return roles?.includes('admin') ?? false
  })

  const staticLinks: NavigationMenuItem[] = [
    {
      label: 'Home',
      icon: 'i-lucide-house',
      to: '/'
    }
  ]

  const bottomLinks = computed<NavigationMenuItem[]>(() => {
    const links: NavigationMenuItem[] = []

    if (isAdmin.value) {
      links.push({
        label: 'Admin',
        icon: 'i-lucide-shield',
        to: '/admin'
      })
    }

    links.push({
      label: 'Settings',
      icon: 'i-lucide-settings',
      to: '/settings'
    })

    return links
  })

  if (!navigationLoaded.value) {
    fetchNavigation()
  }

  watch(
    () => (session.value as { profileId?: string } | null)?.profileId,
    (newProfileId, oldProfileId) => {
      if (newProfileId && newProfileId !== oldProfileId) {
        fetchNavigation()
      }
    }
  )

  return {
    staticLinks,
    entityLinks,
    bottomLinks,
    isAdmin,
    loading,
    fetchNavigation
  }
}
