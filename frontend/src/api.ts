export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ApiError(
      'The service returned an unreadable response. Please try again.',
      response.status,
    );
  }
  if (!response.ok)
    throw new ApiError(
      response.status === 401
        ? 'Your session has ended. Sign in to continue.'
        : typeof value === 'object' && value && 'error' in value && typeof value.error === 'string'
          ? value.error
          : 'We could not complete this request.',
      response.status,
    );
  return value as T;
}
export interface Runtime {
  demo: boolean;
}
export interface Identity extends Runtime {
  uid: string;
  admin: boolean;
}
export interface Overview {
  summary: { attempts: number; averageScore: number | null; sessionsLast7Days: number };
  window: { description: string };
  skills: { skill: string; latest: number; nextStep: string }[];
}
export interface Interview {
  id: string;
  title: string;
  status: string;
  answeredCount: number;
  questionCount: number;
}
export interface Resume {
  id: string;
  title: string;
  versionCount: number;
}
