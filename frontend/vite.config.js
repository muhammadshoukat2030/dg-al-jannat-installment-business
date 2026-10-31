import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

/**
 * Custom Vite plugin to inject generated production bundle assets
 * (JS, CSS chunks, fonts, icons) into the Service Worker precache list.
 */
function swPrecachePlugin() {
  return {
    name: 'sw-precache-plugin',
    closeBundle() {
      try {
        const distDir = path.resolve(__dirname, 'dist');
        const swPath = path.join(distDir, 'sw.js');
        const assetsDir = path.join(distDir, 'assets');

        if (!fs.existsSync(swPath) || !fs.existsSync(assetsDir)) {
          return;
        }

        // Collect all hashed bundle files generated in dist/assets
        const assetFiles = fs.readdirSync(assetsDir);
        const assetUrls = assetFiles
          .filter((file) => !file.endsWith('.map'))
          .map((file) => `/assets/${file}`);

        // Read sw.js from dist
        let swContent = fs.readFileSync(swPath, 'utf-8');

        // Generate build version hash
        const buildVersion = `ims-static-v${Date.now()}`;

        // Update CACHE_NAME
        swContent = swContent.replace(
          /const CACHE_NAME = ['"][^'"]+['"];/,
          `const CACHE_NAME = '${buildVersion}';`
        );

        // Inject asset URLs into PRECACHE_ASSETS array
        const formattedAssets = assetUrls.map((u) => `  '${u}',`).join('\n');
        swContent = swContent.replace(
          /const PRECACHE_ASSETS = \[([\s\S]*?)\];/,
          (match, existing) => {
            const baseAssets = existing
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => Boolean(line) && !line.includes('/assets/'))
              .map((line) => `  ${line.endsWith(',') ? line : line + ','}`);

            return `const PRECACHE_ASSETS = [\n${baseAssets.join('\n')}\n${formattedAssets}\n];`;
          }
        );

        fs.writeFileSync(swPath, swContent, 'utf-8');
        console.log(
          `[sw-precache-plugin] Successfully injected ${assetUrls.length} assets into dist/sw.js (${buildVersion})`
        );
      } catch (err) {
        console.error('[sw-precache-plugin] Failed to inject assets into sw.js:', err);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), swPrecachePlugin()],
  server: {
    port: 5173,
  },
});
