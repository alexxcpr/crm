// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@sidebase/nuxt-auth'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    apiBaseInternal: process.env.NUXT_API_BASE_INTERNAL || 'http://localhost:4000/api',
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api',
      defaultTenantSlug: process.env.NUXT_PUBLIC_DEFAULT_TENANT_SLUG || 'dev'
    }
  },

  compatibilityDate: '2024-07-11',

  auth: {
    isEnabled: true,
    baseURL: process.env.NUXT_PUBLIC_API_BASE || '/api',
    globalAppMiddleware: true,
    provider: {
      type: 'local',
      endpoints: {
        signIn: { path: '/auth/signin', method: 'post' },
        signOut: { path: '/auth/signout', method: 'post' },
        signUp: { path: '/auth/signup', method: 'post' },
        getSession: { path: '/user/me', method: 'get' }
      },

      token: {
        signInResponseTokenPointer: '/accessToken',
        type: 'Bearer',
        headerName: 'Authorization',
        cookieName: 'auth.token',
        maxAgeInSeconds: 1800,
        sameSiteAttribute: 'lax',
        secureCookieAttribute: process.env.NODE_ENV === 'production',
        httpOnlyCookieAttribute: process.env.NODE_ENV === 'production'
      }
    },
    sessionRefresh: {
      enablePeriodically: false,
      enableOnWindowFocus: true
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
