import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.ADMIN_BACKEND_URL || 'http://127.0.0.1:3000';

  const proxy = {
    '/api': {
      target: proxyTarget,
      changeOrigin: true,
    },
  };

  const plugins = [react()];

  // Sentry sourcemap upload — only in build, only when ALL THREE secrets are present.
  // Build NEVER fails on a missing/revoked token: errorHandler down-grades upload
  // failures to a console warn so admin deploys are not blocked by Sentry hiccups.
  if (
    mode === 'production' &&
    env.SENTRY_AUTH_TOKEN &&
    env.SENTRY_ORG &&
    env.SENTRY_PROJECT
  ) {
    plugins.push(
      sentryVitePlugin({
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        authToken: env.SENTRY_AUTH_TOKEN,
        sourcemaps: { assets: './dist/**' },
        telemetry: false,
        errorHandler: (err) => {
          // eslint-disable-next-line no-console
          console.warn(
            '[sentry-vite-plugin] sourcemap upload failed (build continues):',
            err.message
          );
        },
      })
    );
  }

  return {
    plugins,
    build: { sourcemap: true }, // Sentry needs sourcemaps in dist
    server: {
      port: 5173,
      proxy,
    },
    preview: {
      proxy,
    },
  };
});
