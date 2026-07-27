export function useFeatures() {
  const { session } = useProfiles()

  const billingStatus = computed(() => session.value?.billing?.billingStatus ?? 'active')
  const features = computed(() => session.value?.features ?? session.value?.billing?.features ?? {})
  const isBillingBlocked = computed(() => billingStatus.value === 'blocked')

  function hasFeature(key: string) {
    return features.value[key] === true
  }

  return {
    billingStatus,
    features,
    isBillingBlocked,
    hasFeature
  }
}
