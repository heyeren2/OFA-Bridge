import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            // Proxy Circle API calls to bypass CORS restriction on localhost
            // kit.swap() calls https://api.circle.com/v1/stablecoinKits/swap
            // which is blocked by CORS in the browser.
            '/circle-api': {
                target: 'https://api.circle.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/circle-api/, ''),
                secure: true,
            }
        }
    }
})
