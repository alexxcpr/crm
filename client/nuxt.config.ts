// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@sidebase/nuxt-auth'
  ],

  auth: {
    isEnabled: true,
    baseURL: 'BACKEND_API', //url backend /api
    provider: {
      type: 'local',
      endpoints: {
        signIn: { path: '/auth/login', method: 'post' },
        signOut: { path: '/auth/logout', method: 'post' },
        signUp: { path: '/auth/register', method: 'post'},
        getSession: { path: '/user/profile', method: 'get'} // Ruta din NestJS care returneaza datele userului curent bazat pe token
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

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

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