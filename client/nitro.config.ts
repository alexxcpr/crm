import { defineNitroConfig } from 'nitropack/config'

export default defineNitroConfig({
  routeRules: {
    '/api/**': {
      cors: true
    }
  }
})
