export function authResponseStatus(error: unknown): number {
  const candidate = error as {
    statusCode?: number
    status?: number
    response?: { status?: number }
    data?: { statusCode?: number }
  }
  return candidate?.statusCode
    ?? candidate?.status
    ?? candidate?.response?.status
    ?? candidate?.data?.statusCode
    ?? 500
}

interface AuthRetryOptions<T> {
  execute: (retried: boolean) => Promise<T>
  refresh: () => Promise<unknown>
  onDefinitiveUnauthorized: () => Promise<void> | void
}

export async function withSingleAuthRetry<T>(options: AuthRetryOptions<T>): Promise<T> {
  try {
    return await options.execute(false)
  } catch (initialError) {
    if (authResponseStatus(initialError) !== 401) throw initialError
  }

  try {
    await options.refresh()
  } catch (refreshError) {
    if (authResponseStatus(refreshError) === 401) await options.onDefinitiveUnauthorized()
    throw refreshError
  }

  try {
    return await options.execute(true)
  } catch (retryError) {
    if (authResponseStatus(retryError) === 401) await options.onDefinitiveUnauthorized()
    throw retryError
  }
}
