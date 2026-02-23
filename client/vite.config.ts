import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared")
    }
  },
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (
            id.includes("react-router-dom") ||
            id.includes("react-dom") ||
            id.match(/[\\/]node_modules[\\/]react[\\/]/)
          ) {
            return "react";
          }

          if (id.includes("@tiptap")) {
            return "editor-vendor";
          }

          if (
            id.includes("yjs") ||
            id.includes("y-websocket") ||
            id.includes("y-prosemirror") ||
            id.includes("y-protocols")
          ) {
            return "editor-vendor";
          }

          return undefined;
        }
      }
    }
  }
});
