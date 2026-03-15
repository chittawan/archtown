/**
 * Clear app data on logout (for user switch).
 * Clears sessionStorage (auth), localStorage (sync + project context), and all DB tables.
 * Does NOT clear theme or UI preferences (theme, right-panel-open).
 */
import { clearAllTables } from '../db/archtownDb';

const AUTH_ID_TOKEN_KEY = 'archtown_id_token';
const AUTH_CODE_KEY = 'archtown_oauth_code';
const GOOGLE_OAUTH_NONCE_KEY = 'archtown_google_oauth_nonce';
const SYNC_LAST_UPLOADED_KEY = 'archtown_sync_last_uploaded';
const PROJECT_NAME_KEY = 'projectName';
const PROJECT_ID_KEY = 'projectId';

export async function clearAppData(): Promise<void> {
  if (typeof window === 'undefined') return;

  sessionStorage.removeItem(AUTH_ID_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_CODE_KEY);
  sessionStorage.removeItem(GOOGLE_OAUTH_NONCE_KEY);

  localStorage.removeItem(SYNC_LAST_UPLOADED_KEY);
  localStorage.removeItem(PROJECT_NAME_KEY);
  localStorage.removeItem(PROJECT_ID_KEY);

  try {
    await clearAllTables();
  } catch {
    // DB may not be initialized yet (e.g. never opened app after login)
  }
}
