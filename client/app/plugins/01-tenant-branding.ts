export default defineNuxtPlugin(async () => {
  const { fetchBranding } = useTenantBranding()
  await fetchBranding()
})
