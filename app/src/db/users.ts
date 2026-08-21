/* Чтение для экрана «Пользователи и роли».
 *
 * Экран отвечает на один вопрос: что человек увидит, открыв модуль, и что
 * сможет по увиденному сделать. Отсюда состав данных — роль, зона, полномочия
 * и журнал их выдачи, а не список галочек по каждому действию.
 */

import { query } from './pool';

export interface РольСправочник {
  key: string;
  label: string;
  side: 'executor' | 'customer';
  home: string;
  canDecide: boolean;
  onlyOwn: boolean;
  hasRecs: boolean;
  note: string;
}

export interface Месторождение {
  id: number;
  name: string;
  wells: number;
}

export interface КарточкаПользователя {
  id: number;
  login: string;
  fullName: string;
  position: string | null;
  side: 'executor' | 'customer';
  role: string;
  roleLabel: string;
  roleNote: string;
  hasRecs: boolean;
  canDecide: boolean;
  canEditEconomy: boolean;
  onlyOwn: boolean;
  isActive: boolean;
  hasPassword: boolean;
  lastLoginAt: Date | null;
  /** Месторождения зоны. Пустой список означает «все объекты договора». */
  fields: number[];
  /** Сколько рекомендаций попадает в зону сейчас — без него выбор из четырнадцати названий превращается в угадывание. */
  recCount: number;
}

export interface СобытиеДоступа {
  id: number;
  at: Date;
  actor: string;
  action: string;
  details: string | null;
}

export async function ролиСправочник(): Promise<РольСправочник[]> {
  const rows = await query<Record<string, unknown>>(
    'SELECT key, label, side, home, can_decide, only_own, has_recs, note FROM rec.roles ORDER BY sort');
  return rows.map((r) => ({
    key: r.key as string,
    label: r.label as string,
    side: r.side as 'executor' | 'customer',
    home: r.home as string,
    canDecide: r.can_decide as boolean,
    onlyOwn: r.only_own as boolean,
    hasRecs: r.has_recs as boolean,
    note: r.note as string,
  }));
}

/* Месторождения берутся из реплики справочника ВМАП, а не из рекомендаций:
   зону задают и на те объекты, по которым рекомендаций пока нет. Число
   скважин рядом — единственный способ отличить крупное месторождение от
   участка в две скважины, не выходя с экрана. */
export async function месторождения(): Promise<Месторождение[]> {
  const rows = await query<{ field_id: string; field_name: string; wells: string }>(`
    SELECT field_id, field_name, count(*)::text AS wells
      FROM rec.ref_wells GROUP BY field_id, field_name ORDER BY field_name`);
  return rows.map((r) => ({ id: Number(r.field_id), name: r.field_name, wells: Number(r.wells) }));
}

/* Счётчик рекомендаций в зоне повторяет границу видимости реестра слово в
   слово (см. lib/access.границаВидимости). Иначе экран настройки покажет одно
   число, а сам реестр — другое, и доверия не будет ни тому, ни другому. */
const В_ЗОНЕ = `
  (SELECT count(*) FROM rec.recommendations rr
    WHERE rr.deleted_at IS NULL
      AND (NOT EXISTS (SELECT 1 FROM rec.user_fields z WHERE z.user_id = u.id)
           OR rr.field_id IN (SELECT z.field_id FROM rec.user_fields z WHERE z.user_id = u.id))
      AND (NOT u.only_own OR rr.executor_id = u.id OR rr.author_id = u.id))`;

export async function пользователи(): Promise<КарточкаПользователя[]> {
  const rows = await query<Record<string, unknown>>(`
    SELECT u.id, u.login, u.full_name, u.position, u.side, u.role_key,
           r.label AS role_label, r.note AS role_note, r.has_recs,
           u.can_decide, u.can_edit_economy, u.only_own, u.is_active,
           (u.password_hash IS NOT NULL) AS has_password, u.last_login_at,
           COALESCE((SELECT array_agg(f.field_id ORDER BY f.field_name)
                       FROM rec.user_fields f WHERE f.user_id = u.id), '{}') AS fields,
           ${В_ЗОНЕ}::text AS rec_count
      FROM rec.users u JOIN rec.roles r ON r.key = u.role_key
     -- Отключённые не прячутся: «человек не входит» — это состояние, которое
     -- видно на экране прав, а не отсутствие человека.
     ORDER BY u.is_active DESC, u.side DESC, r.sort, u.full_name`);

  return rows.map((r) => ({
    id: Number(r.id),
    login: r.login as string,
    fullName: r.full_name as string,
    position: r.position as string | null,
    side: r.side as 'executor' | 'customer',
    role: r.role_key as string,
    roleLabel: r.role_label as string,
    roleNote: r.role_note as string,
    hasRecs: r.has_recs as boolean,
    canDecide: r.can_decide as boolean,
    canEditEconomy: r.can_edit_economy as boolean,
    onlyOwn: r.only_own as boolean,
    isActive: r.is_active as boolean,
    hasPassword: r.has_password as boolean,
    lastLoginAt: r.last_login_at as Date | null,
    fields: (r.fields as (string | number)[]).map(Number),
    recCount: Number(r.rec_count),
  }));
}

/** История выдачи и снятия доступа по одному человеку. */
export async function журналДоступа(userId: number, limit = 20): Promise<СобытиеДоступа[]> {
  const rows = await query<Record<string, unknown>>(`
    SELECT id, at, actor, action, details FROM rec.user_access_log
     WHERE user_id = $1 ORDER BY at DESC LIMIT $2`, [userId, limit]);
  return rows.map((r) => ({
    id: Number(r.id),
    at: r.at as Date,
    actor: r.actor as string,
    action: r.action as string,
    details: r.details as string | null,
  }));
}
