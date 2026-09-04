import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    // Gera automaticamente o routeTree a partir dos arquivos em src/routes
    TanStackRouterVite({ routesDirectory: "./src/routes" }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    // Gera dist/ plana com index.html + assets/ — pronto para servir estático
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    // Proxy para a API Node em dev — evita CORS sem precisar mudar nada no backend
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});