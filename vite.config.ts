import fs from 'fs';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv} from 'vite';

const DATA_PROJECTS_DIR = path.resolve(__dirname, 'Data', 'Projects');

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'save-project-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== '/api/save-project' || req.method !== 'POST') {
              return next();
            }
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const { projectName, markdown } = JSON.parse(body);
                const name = (projectName || 'project').trim();
                const safeName = name.replace(/[^\p{L}\p{N}\s_-]/gu, '_').replace(/\s+/g, '_') || 'project';
                fs.mkdirSync(DATA_PROJECTS_DIR, { recursive: true });
                const filePath = path.join(DATA_PROJECTS_DIR, `${safeName}.md`);
                fs.writeFileSync(filePath, markdown ?? '', 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true, path: filePath }));
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: String(e) }));
              }
            });
          });
        },
      },
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
