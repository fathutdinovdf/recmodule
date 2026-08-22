import path from 'node:path';
import { defineConfig } from 'vitest/config';

/* Интеграционные тесты бьют в реальный Postgres (npm run db:up), а не в мок.
   Отдельный конфиг от юнит-тестов домена: этим нужна БД и они медленнее. */
export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
});
