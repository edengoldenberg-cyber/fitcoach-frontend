import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: SW installs and activates immediately when a new version is deployed.
      // No user prompt, no manual reload required — behaves like WhatsApp.
      registerType: 'autoUpdate',

      // Registration is handled by the inline iOS guard in index.html.
      // 'null' stops vite-plugin-pwa from injecting its own registerSW.js,
      // so iOS never registers the SW and non-iOS registers manually.
      injectRegister: null,

      // injectManifest: use our custom src/sw.js so we can synchronously bypass
      // the Railway API before Workbox route-matching runs.
      // (generateSW cannot add arbitrary fetch event listeners.)
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',

      injectManifest: {
        // The main bundle is ~3.5 MB; raise the limit so it gets precached
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB

        // JS excluded — runtime-cached in src/sw.js (CacheFirst, content-addressed).
        // Precache only small static assets so SW updates are near-instant.
        globPatterns: ['**/*.{css,html,ico,png,svg,woff2}'],
      },

      manifest: {
        name: 'FitCoach Pro',
        short_name: 'FitCoach',
        description: 'פלטפורמת אימון כושר ותזונה מקצועית',
        theme_color: '#79DBD6',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'he',
        dir: 'rtl',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      devOptions: {
        // Enable SW in dev mode so you can test update behavior locally
        enabled: false,
      },
    }),
  ],

  define: {
    // Injected at build time — lets the UI display which version is running.
    // Changes on every deploy, so old/cached bundles show an older timestamp.
    __BUILD_TS__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
