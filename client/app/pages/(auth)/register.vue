<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h2 class="text-2xl font-bold text-center">Înregistrare CRM</h2>
      </template>

      <form @submit.prevent="handleRegister" class="flex flex-col items-center w-full">
        <UFormField label="Email" name="email" class="w-full text-center mb-2">
          <UInput 
            v-model="email" 
            type="email" 
            placeholder="Email" 
            icon="i-heroicons-envelope" 
            input-class="text-center"
            class="w-full"
            required 
          />
        </UFormField>

        <UFormField label="Parolă" name="password" class="w-full text-center mb-2">
          <UInput 
            v-model="password" 
            type="password" 
            placeholder="Parola" 
            icon="i-heroicons-lock-closed" 
            input-class="text-center"
            class="w-full"
            required 
          />
        </UFormField>

        <UFormField label="Confirmă Parola" name="confirmPassword" class="w-full text-center mb-3">
          <UInput 
            v-model="confirmPassword" 
            type="password" 
            placeholder="Repetă parola" 
            icon="i-heroicons-lock-closed" 
            input-class="text-center"
            class="w-full"
            required 
          />
        </UFormField>

        <UButton 
          type="submit" 
          color="primary" 
          block 
          :loading="isLoading"
          class=""
        >
          Creare Cont
        </UButton>
        
        <p v-if="errorMessage" class="text-red-500 text-sm text-center mt-2">
          {{ errorMessage }}
        </p>
      </form>
      
      <template #footer>
        <div class="text-center text-sm">
          Ai deja cont? <NuxtLink to="/login" class="text-primary-500 hover:underline">Autentifică-te</NuxtLink>
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const { signUp } = useAuth()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

async function handleRegister() {
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Parolele nu se potrivesc!'
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  
  try {
    await signUp(
      { email: email.value, password: password.value },
      { callbackUrl: '/' }
    )
  } catch (error: any) {
    console.error('Eroare la înregistrare:', error)
    errorMessage.value = 'Eroare la crearea contului. Posibil ca adresa de email să fie deja utilizată.'
  } finally {
    isLoading.value = false
  }
}

definePageMeta({
  layout: false,
  auth: {
    unauthenticatedOnly: true,
    navigateAuthenticatedTo: '/dashboard',
  }
})
</script>