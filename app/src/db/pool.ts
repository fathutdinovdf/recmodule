/* Подключения к двум базам.
 *
 * Их именно две, и смешивать их нельзя:
 *
 *   module — своя база модуля. Рекомендации, решения, окна эффекта,
 *            справочники. Читаем и пишем.
 *
 *   vmap   — дев-стенд Заказчика. Скважины, месторождения, замеры.
 *            ТОЛЬКО ЧТЕНИЕ. Это чужой контур: сломать там что-нибудь записью
 *            мы права не имеем, поэтому отдельный пул и отдельная функция
 *            запроса, в которой нет и не будет ничего, кроме SELECT.
 */

import { Pool, type QueryResultRow } from 'pg';

/* В dev-режиме Next перезагружает модули при каждой правке файла. Пул,
   созданный на уровне модуля, при этом создавался бы заново, а старый оставался
   висеть с открытыми соединениями — через десяток правок база отказывает в
   подключении. Поэтому пул живёт в globalThis и переживает перезагрузку. */
const globalForPools = globalThis as unknown as {
  __recModulePool?: Pool;
  __recVmapPool?: Pool;
};

function createModulePool(): Pool {
  return new Pool({
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5433),
    database: process.env.PGDATABASE ?? 'recmodule',
    user: process.env.PGUSER ?? 'recmodule',
    password: process.env.PGPASSWORD ?? 'recmodule',
    max: 10,
  });
}

function createVmapPool(): Pool {
  return new Pool({
    host: process.env.VMAP_HOST,
    port: Number(process.env.VMAP_PORT ?? 5432),
    database: process.env.VMAP_DATABASE,
    user: process.env.VMAP_USER,
    password: process.env.VMAP_PASSWORD,
    /* Соединений меньше: стенд общий, и занимать его пулом на десяток
       коннектов из-за макета нехорошо. */
    max: 4,
    /* Стенд бывает недоступен, и приложение должно сказать об этом за пару
       секунд, а не держать пользователя в ожидании полминуты. */
    connectionTimeoutMillis: 5000,
    statement_timeout: 30_000,
  });
}

export const modulePool: Pool =
  globalForPools.__recModulePool ?? (globalForPools.__recModulePool = createModulePool());

export const vmapPool: Pool =
  globalForPools.__recVmapPool ?? (globalForPools.__recVmapPool = createVmapPool());

/** Запрос к базе модуля. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await modulePool.query<T>(text, params);
  return res.rows;
}

/**
 * Запрос к ВМАП. Только чтение — проверка не декоративная: один случайный
 * UPDATE в чужом контуре стоит дороже, чем эта строка кода.
 */
export async function vmapQuery<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const первое = text.trim().slice(0, 6).toUpperCase();
  if (первое !== 'SELECT' && !text.trim().toUpperCase().startsWith('WITH ')) {
    throw new Error('К базе ВМАП разрешены только запросы на чтение');
  }
  const res = await vmapPool.query<T>(text, params);
  return res.rows;
}

export const VMAP_SCHEMA = process.env.VMAP_SCHEMA ?? 'ois_vmap';
