<template>
  <div class="relative flex items-center justify-center min-h-screen overflow-hidden" style="background: radial-gradient(ellipse at 50% 35%, #1a1028 0%, #0d0818 30%, #06040c 60%, #020204 100%);">

    <!-- Gradient corners - GTA V style -->
    <div class="absolute top-0 left-0 w-full h-full pointer-events-none" style="background: radial-gradient(circle at 0% 0%, rgba(130,50,200,0.6) 0%, rgba(60,15,110,0.38) 35%, rgba(20,8,50,0.18) 65%, transparent 95%);"></div>
    <div class="absolute top-0 right-0 w-full h-full pointer-events-none" style="background: radial-gradient(circle at 100% 0%, rgba(100,40,170,0.55) 0%, rgba(45,15,95,0.33) 35%, rgba(18,8,45,0.15) 65%, transparent 95%);"></div>
    <div class="absolute bottom-0 left-0 w-full h-full pointer-events-none" style="background: radial-gradient(circle at 0% 100%, rgba(110,40,175,0.55) 0%, rgba(45,10,85,0.33) 35%, rgba(18,8,45,0.15) 65%, transparent 95%);"></div>
    <div class="absolute bottom-0 right-0 w-full h-full pointer-events-none" style="background: radial-gradient(circle at 100% 100%, rgba(140,50,210,0.6) 0%, rgba(55,15,95,0.38) 35%, rgba(20,8,50,0.18) 65%, transparent 95%);"></div>

    <div class="w-full max-w-md px-4 relative z-10">
      <!-- Logo -->
      <div class="flex justify-center mb-8">
        <div class="relative flex items-center justify-center">
          <div class="absolute w-3xl h-192 rounded-full blur-3xl pointer-events-none" style="background: radial-gradient(circle, rgba(230,215,255,0.9) 0%, rgba(200,175,245,0.65) 25%, rgba(160,135,220,0.4) 50%, transparent 70%);"></div>
          <img
            src="/moduvis_logo_v3_no_bg.png"
            alt="Moduvis Logo"
            class="relative h-36 w-auto drop-shadow-xl"
          />
        </div>
      </div>

      <!-- Card -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
        <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-300 text-center mb-6">
          Autentificare
        </h2>

        <form class="flex flex-col gap-4" @submit.prevent="handleLogin">
          <UFormField label="Username" name="loginUsername" class="w-full">
            <UInput
              v-model="loginUsername"
              type="text"
              placeholder="username"
              icon="i-heroicons-user"
              class="w-full"
              required
            />
          </UFormField>

          <UFormField label="Parolă" name="password" class="w-full">
            <UInput
              v-model="password"
              type="password"
              placeholder="••••••••"
              icon="i-heroicons-lock-closed"
              class="w-full"
              required
            />
          </UFormField>

          <UButton
            type="submit"
            color="primary"
            block
            :loading="isLoading"
            size="lg"
            class="mt-2"
          >
            Autentificare
          </UButton>

          <p v-if="errorMessage" class="text-red-500 text-sm text-center mt-1">
            {{ errorMessage }}
          </p>
        </form>

        <div v-if="signupEnabled" class="text-center text-sm text-gray-500 dark:text-gray-400 mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
          Nu ai cont?
          <NuxtLink to="/register" class="text-primary-500 hover:text-primary-600 font-medium hover:underline">
            Creează unul
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Importam metoda signIn din pachetul de auth
const { signIn } = useAuth()

// State-ul formularului
const loginUsername = ref('')
const signupEnabled = useRuntimeConfig().public.signupEnabled
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
      { loginUsername: loginUsername.value, password: password.value },
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
    navigateAuthenticatedTo: '/dashboard'
  }
})
</script>
