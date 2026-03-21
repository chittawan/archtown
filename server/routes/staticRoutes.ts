import fs from 'fs';
import path from 'path';
import express from 'express';

export function mountStaticSpa(app: express.Application) {
  const distDir = path.join(process.cwd(), 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    const index = path.join(distDir, 'index.html');
    if (fs.existsSync(index)) {
      res.sendFile(index);
    } else {
      res.status(404).send('Not found');
    }
  });
}
