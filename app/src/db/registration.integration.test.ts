import { describe, it, expect, afterAll } from 'vitest';
import { registrationReferences, registrationAnalogs } from './registration';
import { query, modulePool } from './pool';

describe('registrationReferences — справочники мастера регистрации на реальной БД', () => {
  it('отдаёт направления, приоритеты и исполнителей из живой схемы', async () => {
    const refs = await registrationReferences();
    expect(Array.isArray(refs.directions)).toBe(true);
    expect(Array.isArray(refs.priorities)).toBe(true);
    expect(Array.isArray(refs.executors)).toBe(true);
    // Справочники — часть схемы (migrations 001/002), пустыми быть не должны
    // на любой базе, где применены миграции.
    expect(refs.directions.length).toBeGreaterThan(0);
    expect(refs.priorities.length).toBeGreaterThan(0);
  });

  it('исполнители — только активные пользователи стороны Исполнителя', async () => {
    const refs = await registrationReferences();
    const rows = await query<{ id: number }>(
      `SELECT id FROM rec.users WHERE is_active AND side = 'executor'`,
    );
    expect(refs.executors.map((e) => e.id).sort()).toEqual(rows.map((r) => Number(r.id)).sort());
  });
});

describe('registrationAnalogs — аналоги строго по скважине и направлению', () => {
  it('несуществующая пара скважина/направление — пустой список, не ошибка', async () => {
    const rows = await registrationAnalogs(-1, -1);
    expect(rows).toEqual([]);
  });

  it('находит существующую рекомендацию по её собственной скважине и направлению', async () => {
    const [существующая] = await query<{ well_id: number | null; direction_id: number }>(`
      SELECT well_id, direction_id FROM rec.recommendations
      WHERE deleted_at IS NULL AND status <> 'draft' AND well_id IS NOT NULL
      LIMIT 1
    `);
    if (!существующая) {
      // На пустой (не засеянной) базе аналогам взяться неоткуда — не валим тест,
      // но и не делаем вид, что он что-то проверил.
      console.warn('registrationAnalogs: в базе нет ни одной незачерновиковой рекомендации со скважиной — пропуск');
      return;
    }
    const rows = await registrationAnalogs(Number(существующая.well_id), Number(существующая.direction_id));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.number).toBeTruthy(); // черновики (number IS NULL) в аналоги не попадают
    }
  });
});

afterAll(async () => {
  await modulePool.end();
});
