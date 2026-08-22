import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [stylex.vite({ useCSSLayers: true }), react()],
  server: {
    proxy: {
      "/v1": { target: "http://127.0.0.1:8787", ws: true },
      "/health": "http://127.0.0.1:8787",
    },
  },
});
