import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // Use relative paths for assets to support deployment to any subpath
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});
