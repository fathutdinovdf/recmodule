import { describe, it, expect } from 'vitest';
import { границаВидимости, этоИсполнитель, этоАдминистратор, этоРешающий, правитЭкономику } from './access';
import type { SessionUser } from './session';

const user = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 1, login: 'test', fullName: 'Тест', position: null,
  side: 'executor', role: 'expert', roleLabel: 'Эксперт', home: 'inbox',
  canDecide: false, canEditEconomy: false, onlyOwn: false, fields: [],
  ...over,
});

describe('границаВидимости', () => {
  it('не вошёл — не видит ничего', () => {
    expect(границаВидимости(null)).toBe('false');
  });

  it('без ограничений — видит все объекты договора', () => {
    expect(границаВидимости(user())).toBe('true');
  });

  it('зона ответственности сужает по field_id', () => {
    const sql = границаВидимости(user({ fields: [{ id: 3, name: 'А' }, { id: 7, name: 'Б' }] }));
    expect(sql).toBe('r.field_id IN (3, 7)');
  });

  it('onlyOwn сужает по исполнителю или автору', () => {
    const sql = границаВидимости(user({ id: 42, onlyOwn: true }));
    expect(sql).toBe('(r.executor_id = 42 OR r.author_id = 42)');
  });

  it('оба ограничения объединяются через AND', () => {
    const sql = границаВидимости(user({ id: 5, onlyOwn: true, fields: [{ id: 9, name: 'В' }] }));
    expect(sql).toBe('r.field_id IN (9) AND (r.executor_id = 5 OR r.author_id = 5)');
  });

  it('пустой список полей — не значит NULL IN (), а не ограничивает молча', () => {
    // fields.length === 0 не должен попадать в ветку IN (): иначе пустой массив
    // дал бы "field_id IN (NULL)", что молча скрывает все строки вместо «все объекты».
    expect(границаВидимости(user({ fields: [] }))).toBe('true');
  });

  it('другой алиас таблицы подставляется в условие', () => {
    expect(границаВидимости(user({ fields: [{ id: 1, name: 'А' }] }), 'x')).toBe('x.field_id IN (1)');
  });
});

describe('роли и полномочия', () => {
  it('исполнитель определяется по стороне договора', () => {
    expect(этоИсполнитель(user({ side: 'executor' }))).toBe(true);
    expect(этоИсполнитель(user({ side: 'customer' }))).toBe(false);
    expect(этоИсполнитель(null)).toBe(false);
  });

  it('администратор — по роли, не по стороне', () => {
    expect(этоАдминистратор(user({ role: 'admin' }))).toBe(true);
    expect(этоАдминистратор(user({ role: 'expert' }))).toBe(false);
  });

  it('решающий — Заказчик И право решения одновременно', () => {
    expect(этоРешающий(user({ side: 'customer', canDecide: true }))).toBe(true);
    expect(этоРешающий(user({ side: 'customer', canDecide: false }))).toBe(false);
    expect(этоРешающий(user({ side: 'executor', canDecide: true }))).toBe(false);
  });

  it('право на экономику — отдельное полномочие, не завязано на роль', () => {
    expect(правитЭкономику(user({ canEditEconomy: true, role: 'expert' }))).toBe(true);
    expect(правитЭкономику(user({ canEditEconomy: false, role: 'admin' }))).toBe(false);
  });
});
