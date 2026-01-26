import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // No alias: keep bundler defaults; we use DeckGL directly instead of @deck.gl/mapbox
  // TODO: You need to change this to your repo name
  base: "/mars-explorer/",
});
