import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        map3d: 'map3d.html'
      }
    }
  }
});
