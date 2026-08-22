import path from 'node:path';
import { defineConfig } from 'vitest/config';

/* Юнит-тесты: чистые функции без БД и без Next. Интеграционные — в
   vitest.integration.config.ts, отдельно, потому что им нужен поднятый
   Postgres (npm run db:up). */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
});
