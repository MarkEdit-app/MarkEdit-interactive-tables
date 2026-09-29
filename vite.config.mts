import { defineConfig, mergeConfig } from 'vite';
import { defaultViteConfig } from 'markedit-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(mergeConfig(defaultViteConfig(), {
  plugins: [viteSingleFile()],
}));
