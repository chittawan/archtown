const FULL_UPLOAD_KEY = 'archtown_pending_full_upload';

export function markFullUploadPending(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FULL_UPLOAD_KEY, 'true');
  } catch {
    /* ignore */
  }
}

export function isFullUploadPending(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(FULL_UPLOAD_KEY) === 'true';
  } catch {
    return false;
  }
}

export function clearFullUploadPending(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(FULL_UPLOAD_KEY);
  } catch {
    /* ignore */
  }
}

