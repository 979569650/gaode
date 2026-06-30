import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        map3d: 'map3d.html',
        navigation: 'navigation.html'
      }
    }
  }
});
