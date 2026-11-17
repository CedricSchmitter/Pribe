import { ERROR_MESSAGES_DE, type ApiError } from '@pribe/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.message);
  }
}

/** JSON fetch against the same-origin API; throws `ApiRequestError` with the server's error body. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    throw new ApiRequestError(res.status, (data as ApiError | null) ?? { error: 'INTERNAL', message: ERROR_MESSAGES_DE.INTERNAL });
  }
  return data as T;
}
