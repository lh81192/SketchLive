export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function readLegacyUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ai_comic_uid");
}

export function syncLegacyUserCookie() {
  if (typeof window === "undefined") return;
  const userId = readLegacyUserId();
  if (!userId) return;

  const maxAge = 365 * 24 * 60 * 60;
  document.cookie = `ai_comic_uid=${userId}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  syncLegacyUserCookie();

  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.clone().json();
      if (body.error) message = body.error;
    } catch {}
    throw new ApiError(response.status, message);
  }
  return response;
}

export function isUnauthorizedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

export function isNotFoundError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 404;
}

export function redirectToLogin(locale: string) {
  if (typeof window !== "undefined") {
    window.location.href = `/${locale}/login`;
  }
}

export function handleApiProjectAccessError(error: unknown, locale: string): never {
  if (isUnauthorizedError(error) || isNotFoundError(error)) {
    redirectToLogin(locale);
  }
  throw error;
}
