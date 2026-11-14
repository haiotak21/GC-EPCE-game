import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {execSync} from 'child_process';

/**
 * A short build stamp, shown in the watermark.
 *
 * Debugging this remotely means reading screenshots, and a phone running a
 * cached old bundle looks identical to one running the newest. With the stamp
 * visible, a photo says which build it is.
 */
function buildStamp(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim();
    return sha;
  } catch {
    return 'dev';
  }
}

export default defineConfig(() => {
  return {
    define: {
      __BUILD_ID__: JSON.stringify(buildStamp()),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
