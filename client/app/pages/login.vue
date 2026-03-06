<template>
    <div class="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <UCard class="w-full max-w-sm">
        <template #header>
          <h2 class="text-2xl font-bold text-center">Login la CRM</h2>
        </template>
  
        <form @submit.prevent="handleLogin" class="flex flex-col items-center w-full">
          <UFormGroup label="Email" name="email" class="w-full text-center mb-2">
            <UInput 
              v-model="email" 
              type="email" 
              placeholder="admin@exemplu.com" 
              icon="i-heroicons-envelope" 
              input-class="text-center"
              class="w-full"
              required 
            />
          </UFormGroup>
  
          <UFormGroup label="Parolă" name="password" class="w-full text-center mb-3">
            <UInput 
              v-model="password" 
              type="password" 
              placeholder="********" 
              icon="i-heroicons-lock-closed" 
              input-class="text-center"
              class="w-full"
              required 
            />
          </UFormGroup>
  
          <UButton 
            type="submit" 
            color="primary" 
            block 
            :loading="isLoading"
            class=""
          >
            Autentificare
          </UButton>
          
          <p v-if="errorMessage" class="text-red-500 text-sm text-center mt-2">
            {{ errorMessage }}
          </p>
        </form>
        
        <template #footer>
          <div class="text-center text-sm">
            Nu ai cont? <NuxtLink to="/register" class="text-primary-500 hover:underline">Creează unul</NuxtLink>
          </div>
        </template>
      </UCard>
    </div>
  </template>
  
  <script setup lang="ts">
  // Importam metoda signIn din pachetul de auth
  const { signIn } = useAuth()
  
  // State-ul formularului
  const email = ref('')
  const password = ref('')
  const isLoading = ref(false)
  const errorMessage = ref('')
  
  // Functia care se executa la apasarea butonului Submit
  async function handleLogin() {
    isLoading.value = true
    errorMessage.value = ''
    
    try {
      // Apelam metoda signIn (astfel, Nuxt face automat un POST spre http://localhost:4000/api/auth/signin)
      await signIn(
        { email: email.value, password: password.value },
        { callbackUrl: '/' } // Unde sa ne redirectioneze daca login-ul are succes
      )
    } catch (error: any) {
      console.error('Eroare la login:', error)
      // Afisam un mesaj daca ceva merge prost (parola gresita etc.)
      errorMessage.value = 'Email sau parolă incorecte!'
    } finally {
      isLoading.value = false
    }
  }
  
  // Folosim guest middleware - daca userul e deja logat, si intra pe /login, il trimitem in dashboard
  definePageMeta({
    layout: false,
    auth: {
      unauthenticatedOnly: true,
      navigateAuthenticatedTo: '/dashboard',
    }
  })
  </script>