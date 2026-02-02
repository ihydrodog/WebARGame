import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages base path (repository name)
  base: '/WebARGame/',
  
  // Enable JSON imports
  json: {
    stringify: false
  },
  
  // Dev server configuration
  server: {
    host: true,
    port: 5173,
    // Allow serving files from project root
    fs: {
      strict: false
    }
  },
  
  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
