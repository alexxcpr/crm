// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  devtools: {
    enabled: process.env.NODE_ENV !== 'production'
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    apiBaseInternal: process.env.NUXT_API_BASE_INTERNAL || 'http://localhost:4000/api',
    authSecureCookie: process.env.NUXT_AUTH_SECURE_COOKIE === 'true',
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api',
      defaultTenantSlug: process.env.NUXT_PUBLIC_DEFAULT_TENANT_SLUG || 'dev',
      appDomainBase: process.env.NUXT_PUBLIC_APP_DOMAIN_BASE || process.env.DOMAIN_BASE || 'stanciulescu.xyz',
      signupEnabled: process.env.NUXT_PUBLIC_SIGNUP_ENABLED === 'true'
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
  },

  icon: {
    // Avoid clash with Traefik routing /api/* to the NestJS backend
    localApiEndpoint: '/_nuxt_icon'
  }
})
