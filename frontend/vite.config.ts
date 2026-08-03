import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'dictionaries/*.dic', 'dictionaries/*.aff'],
      manifest: {
        name: 'Rememly',
        short_name: 'Rememly',
        description: 'Family photo journal PWA',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,dic,aff}'],
        // The Photo Assembly layout picker has 4000+ individual layout
        // files, each its own tiny JS chunk under assets/layouts/ (see the
        // chunkFileNames override below) - loaded on demand via
        // loadLayoutsFor(count, ratio), never all at once. Precaching every
        // one of them on every SW install would mean 4000+ requests just to
        // finish updating the app, which on a flaky mobile connection can
        // make the whole precache step fail (and with it, the update
        // prompt, since needRefresh never fires for an install that never
        // completes) - excluded here, cached lazily via runtimeCaching
        // instead so repeat use still avoids re-fetching.
        globIgnores: ['**/layouts/*.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/assets\/layouts\/.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'layout-templates-cache',
              expiration: {
                maxEntries: 4500,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        // Route each Photo Assembly layout template's chunk into its own
        // assets/layouts/ subfolder so the workbox globIgnores above can
        // target them by path instead of needing to enumerate 4000+
        // unrelated-looking chunk names (they're named after the layout's
        // own id, e.g. "algo-6-59-3x4", with no shared prefix).
        chunkFileNames: (chunkInfo) => {
          if (chunkInfo.facadeModuleId && chunkInfo.facadeModuleId.includes('/photo-assembly/layouts/')) {
            return 'assets/layouts/[name]-[hash].js'
          }
          return 'assets/[name]-[hash].js'
        }
      }
    }
  },
  server: {
    port: 3000
  },
  preview: {
    port: 3000
  }
})
