import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In docker-compose the API is the `backend` service; running Vite on the host,
// point VITE_API_TARGET at http://localhost:8000.
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": { target: apiTarget, changeOrigin: true } },
    watch: process.env.VITE_POLL ? { usePolling: true, interval: 300 } : undefined,
  },
});
