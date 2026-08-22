import { describe, it, expect, afterAll, vi } from 'vitest';
import type { SessionUser } from '@/lib/session';

/* Реестр читает currentUser() напрямую (граница видимости — не фильтр,
   решение 87), поэтому для интеграционного теста без Next-запроса подменяем
   сессию мок-модулем, а дальше всё бьёт в реальную БД. */
let текущий: SessionUser | null = null;
vi.mock('@/lib/session', () => ({
  currentUser: async () => текущий,
}));

const { listRecommendations, statusCounts, parseListFilterFromSearchParams, ПЛИТКИ_СТАТУСЫ } =
  await import('./recommendations');
const { modulePool } = await import('./pool');

const исполнитель = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 1, login: 'exec', fullName: 'Исполнитель', position: null,
  side: 'executor', role: 'expert', roleLabel: 'Эксперт', home: 'inbox',
  canDecide: false, canEditEconomy: false, onlyOwn: false, fields: [],
  ...over,
});

describe('listRecommendations — реестр на реальной схеме', () => {
  it('без сессии не видит ничего (граница видимости, а не пустой фильтр)', async () => {
    текущий = null;
    const { rows, total } = await listRecommendations({});
    expect(rows).toEqual([]);
    expect(total).toBe(0);
  });

  it('со снятыми ограничениями возвращает строки реестра', async () => {
    текущий = исполнитель();
    const { rows, total } = await listRecommendations({ limit: 5 });
    expect(total).toBeGreaterThanOrEqual(rows.length);
    for (const r of rows) {
      expect(typeof r.id).toBe('number');
      expect(typeof r.problem).toBe('string');
    }
  });

  it('onlyOwn сужает выборку до своих рекомендаций', async () => {
    текущий = исполнитель({ onlyOwn: true, id: 999999 });
    const { rows, total } = await listRecommendations({});
    expect(rows).toEqual([]);
    expect(total).toBe(0);
  });

  it('фильтр по статусу применяется', async () => {
    текущий = исполнитель();
    const все = await listRecommendations({});
    const статусы = [...new Set(все.rows.map((r) => r.status))];
    if (статусы.length === 0) return; // пустая база — фильтровать нечего
    const один = статусы[0];
    const { rows } = await listRecommendations({ statuses: [один] });
    expect(rows.every((r) => r.status === один)).toBe(true);
  });
});

describe('statusCounts', () => {
  it('сумма по статусам совпадает с total реестра без фильтров', async () => {
    текущий = исполнитель();
    const counts = await statusCounts();
    const сумма = Object.values(counts).reduce((s, n) => s + n, 0);
    const { total } = await listRecommendations({});
    expect(сумма).toBe(total);
  });
});

describe('parseListFilterFromSearchParams (чистая функция, но живёт рядом с БД-слоем)', () => {
  it('разбирает плитку в набор статусов из общего источника ПЛИТКИ_СТАТУСЫ', () => {
    const f = parseListFilterFromSearchParams({ tile: 'executor' });
    expect(f.statuses).toEqual(ПЛИТКИ_СТАТУСЫ.executor);
  });

  it('колонка-фильтр разбирается по разделителю |', () => {
    const f = parseListFilterFromSearchParams({ field: 'Ромашкинское|Самотлор' });
    expect(f.colFilters?.field).toEqual(['Ромашкинское', 'Самотлор']);
  });

  it('некорректный sort игнорируется молча, а не роняет разбор', () => {
    const f = parseListFilterFromSearchParams({ sort: 'мусор' });
    expect(f.sort).toBeUndefined();
  });
});

afterAll(async () => {
  await modulePool.end();
});
