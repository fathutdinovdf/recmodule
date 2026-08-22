import { describe, it, expect, afterAll } from 'vitest';
import { vmapQuery, modulePool, vmapPool, query } from './pool';

describe('vmapQuery — стенд ВМАП только на чтение', () => {
  it('отклоняет UPDATE', async () => {
    await expect(vmapQuery('UPDATE "Wells" SET "Name" = $1', ['x']))
      .rejects.toThrow('К базе ВМАП разрешены только запросы на чтение');
  });

  it('отклоняет DELETE, INSERT и голый DDL', async () => {
    await expect(vmapQuery('DELETE FROM "Wells"')).rejects.toThrow();
    await expect(vmapQuery('INSERT INTO "Wells" DEFAULT VALUES')).rejects.toThrow();
    await expect(vmapQuery('DROP TABLE "Wells"')).rejects.toThrow();
  });

  const РАЗРЕШАЮЩАЯ_ОШИБКА = 'К базе ВМАП разрешены только запросы на чтение';

  /* Позитивные случаи не проверяем через реальное подключение к стенду —
     он внешний и может быть недоступен из тестового окружения. Достаточно
     убедиться, что guard пропускает их дальше (падает не на своей проверке,
     а либо успешно выполняется, либо падает уже на сетевом уровне). */
  const доходитДоПодключения = async (sql: string) => {
    try {
      await vmapQuery(sql);
    } catch (e) {
      expect((e as Error).message).not.toBe(РАЗРЕШАЮЩАЯ_ОШИБКА);
    }
  };

  it('регистр и пробелы перед SELECT не обходят проверку — доходит до подключения, а не до guard',
    () => доходитДоПодключения('  select 1'));

  it('разрешает WITH (CTE), не только голый SELECT',
    () => доходитДоПодключения('WITH x AS (SELECT 1) SELECT * FROM x'));
});

describe('query — своя база модуля, реальный Postgres', () => {
  it('выполняет простой запрос', async () => {
    const rows = await query<{ one: number }>('SELECT 1 AS one');
    expect(rows).toEqual([{ one: 1 }]);
  });

  it('справочник статусов рекомендаций заполнен и их ровно десять (решение проекта)', async () => {
    const rows = await query<{ n: string }>('SELECT count(*)::text AS n FROM rec.statuses');
    expect(Number(rows[0].n)).toBe(10);
  });
});

afterAll(async () => {
  await modulePool.end();
  await vmapPool.end().catch(() => {});
});
