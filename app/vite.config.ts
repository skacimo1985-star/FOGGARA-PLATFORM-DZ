import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: { output: { manualChunks: { react: ["react", "react-dom", "react-router"], i18n: ["i18next", "react-i18next"] } } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

