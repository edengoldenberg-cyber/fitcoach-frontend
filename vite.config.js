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

      // Inject the SW registration shim into index.html automatically
      injectRegister: 'auto',

      workbox: {
        // Take control of all clients immediately on activation
        skipWaiting: true,
        clientsClaim: true,

        // The main bundle is ~3.5 MB; raise the limit so it gets precached
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB

        // Cache static assets (JS, CSS, fonts, images) with CacheFirst
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // API calls: NetworkFirst — always try network, fall back to cache
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
            },
          },
        ],

        // Glob patterns for precaching all built assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
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
