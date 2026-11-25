import { defineConfig } from 'astro/config';

// Configuration is deliberately conservative while the port is in progress:
// every URL the service worker precaches and every stylesheet the pages link to
// must keep its unhashed, root-absolute name, or returning visitors would get a
// cached shell pointing at files that no longer exist.
export default defineConfig({
  site: 'https://asarav.github.io',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // CSS stays a linked file at its own URL instead of being inlined.
    inlineStylesheets: 'never'
  },
  // Shrinks the large data-driven pages (consumption is 4.8 MB unminified).
  compressHTML: true,
  vite: {
    server: {
      watch: {
        // Half a gigabyte of Unity builds and video; the watcher does not need
        // to enumerate it on every dev-server start.
        ignored: ['**/public/assets/games/**', '**/public/assets/videos/**']
      }
    }
  }
});
