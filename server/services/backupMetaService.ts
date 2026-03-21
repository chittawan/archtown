import fs from 'fs';

export async function readBackupVersionAndUpdatedAt(
  backupFile: string,
): Promise<{ version: number; updated_at: string | null } | null> {
  return await new Promise((resolve, reject) => {
    if (!fs.existsSync(backupFile)) return resolve(null);

    const stream = fs.createReadStream(backupFile, { encoding: 'utf8', highWaterMark: 64 * 1024 });
    let buf = '';
    let version: number | null = null;
    let updatedAtFound = false;
    let updated_at: string | null = null;

    const cleanup = () => {
      try {
        stream.destroy();
      } catch {
        /* ignore */
      }
    };

    const tryExtract = () => {
      if (version == null) {
        const m = buf.match(/"version"\s*:\s*(\d+)/);
        if (m) version = Number(m[1]);
      }
      if (!updatedAtFound) {
        const mNull = buf.match(/"updated_at"\s*:\s*null/);
        if (mNull) {
          updated_at = null;
          updatedAtFound = true;
        }
        const mStr = buf.match(/"updated_at"\s*:\s*"([^"]*)"/);
        if (mStr) {
          updated_at = mStr[1];
          updatedAtFound = true;
        }
      }
      if (version != null && updatedAtFound) {
        cleanup();
        resolve({ version: version ?? 0, updated_at });
        return true;
      }
      return false;
    };

    stream.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 300_000) buf = buf.slice(0, 150_000);
      tryExtract();
    });
    stream.on('error', (err) => reject(err));
    stream.on('end', () => {
      if (version == null) resolve(null);
      else resolve({ version: version ?? 0, updated_at: updatedAtFound ? updated_at : null });
    });
  });
}
