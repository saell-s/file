export type ApiErrorDetail = { code?: string; message?: string };

export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error && typeof error === 'object') {
    const err = error as { response?: { data?: { detail?: ApiErrorDetail | string } }; code?: string; message?: string };
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail.message === 'string') return detail.message;
    if (err.message) return err.message;
  }
  if (typeof error === 'string' && error) return error;
  return fallback;
}
