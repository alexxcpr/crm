// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@sidebase/nuxt-auth'
  ],

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:4000/api'
    }
  },

  auth: {
    isEnabled: true,
    globalAppMiddleware: true,
    // baseURL: process.env.BACKEND_API, //url backend /api (setat automat in .env => NUXT_PUBLIC_AUTH_BASE_URL)
    provider: {
      type: 'local',
      endpoints: {
        signIn: { path: '/auth/signin', method: 'post' },
        signOut: { path: '/auth/signout', method: 'post' },
        signUp: { path: '/auth/signup', method: 'post'},
        getSession: { path: '/user/me', method: 'get'} // Ruta din NestJS care returneaza datele userului curent bazat pe token
      },

      token: {
        signInResponseTokenPointer: '/accessToken',
        type: 'Bearer',
        headerName: 'Authorization',
        maxAgeInSeconds: 1800
      },
    },
    sessionRefresh: {
      enablePeriodically: false,
      enableOnWindowFocus: true,
    }
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  compatibilityDate: '2024-07-11',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})