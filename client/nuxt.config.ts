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
      defaultTenantSlug: process.env.NUXT_PUBLIC_DEFAULT_TENANT_SLUG || 'dev',
      signupEnabled: process.env.NUXT_PUBLIC_SIGNUP_ENABLED === 'true'
    }
  },

  compatibilityDate: '2024-07-11',

  icon: {
    // Avoid clash with Traefik routing /api/* to the NestJS backend
    localApiEndpoint: '/_nuxt_icon'
  },

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
        secureCookieAttribute: process.env.NUXT_AUTH_SECURE_COOKIE === 'true',
        httpOnlyCookieAttribute: process.env.NUXT_AUTH_HTTP_ONLY === 'true'
      },
      refresh: {
        isEnabled: true,
        endpoint: { path: '/auth/refresh', method: 'post' },
        refreshOnlyToken: false,
        token: {
          signInResponseRefreshTokenPointer: '/refreshToken',
          refreshRequestTokenPointer: '/refreshToken',
          refreshResponseTokenPointer: '/accessToken',
          maxAgeInSeconds: 60 * 60 * 24,      // 1 zi
          sameSiteAttribute: 'lax',
          secureCookieAttribute: process.env.NUXT_AUTH_SECURE_COOKIE === 'true',
          httpOnlyCookieAttribute: process.env.NUXT_AUTH_HTTP_ONLY === 'true'
        }
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
