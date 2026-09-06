export type AuthChannelEvent = 'signed-in' | 'signed-out' | 'profile-changed' | 'session-refreshed'

const CHANNEL_NAME = 'moduvis-auth'
let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (!import.meta.client || typeof BroadcastChannel === 'undefined') return null
  channel ??= new BroadcastChannel(CHANNEL_NAME)
  return channel
}

export function broadcastAuthEvent(type: AuthChannelEvent): void {
  getChannel()?.postMessage({ type, timestamp: Date.now() })
}

export function subscribeToAuthEvents(handler: (type: AuthChannelEvent) => void): () => void {
  const authChannel = getChannel()
  if (!authChannel) return () => {}
  const listener = (event: MessageEvent<{ type?: AuthChannelEvent }>) => {
    if (event.data?.type) handler(event.data.type)
  }
  authChannel.addEventListener('message', listener)
  return () => authChannel.removeEventListener('message', listener)
}
