import { createError, getMethod, getRouterParam, readBody } from 'h3'
import { assertSameOrigin, refreshSession, restoreSession, signIn, signOut, signUp, switchProfile } from '../../utils/authSession'

export default defineEventHandler(async (event) => {
  const action = getRouterParam(event, 'action')
  const method = getMethod(event)
  if (action === 'session' && method === 'GET') return restoreSession(event)
  if (method !== 'POST') throw createError({ statusCode: 405, message: 'Metodă nepermisă.' })
  assertSameOrigin(event)
  if (action === 'signin') return signIn(event, await readBody(event))
  if (action === 'signup') return signUp(event, await readBody(event))
  if (action === 'refresh') return refreshSession(event)
  if (action === 'signout') return signOut(event)
  if (action === 'switch-profile') {
    const body = await readBody<{ profileId?: string }>(event)
    if (!body?.profileId) throw createError({ statusCode: 400, message: 'profileId este obligatoriu.' })
    return switchProfile(event, body.profileId)
  }
  throw createError({ statusCode: 404, message: 'Rută de autentificare inexistentă.' })
})
