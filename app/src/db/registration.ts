/* Справочники и проверка аналогов для мастера регистрации. Запись вынесена
 * в server action: этот модуль остаётся обычным слоем чтения базы. */

import { query } from './pool';

export interface RegistrationDirection {
  id: number;
  name: string;
}

export interface RegistrationPriority {
  code: string;
  name: string;
  responseHours: number;
}

export interface RegistrationExecutor {
  id: number;
  fullName: string;
  position: string | null;
}

export interface RegistrationAnalog {
  id: number;
  number: string;
  statusName: string;
  wellNumber: string;
  problem: string;
  registeredAt: Date;
}

export async function registrationReferences(): Promise<{
  directions: RegistrationDirection[];
  priorities: RegistrationPriority[];
  executors: RegistrationExecutor[];
}> {
  const [directions, priorities, executors] = await Promise.all([
    query<{ id: number; name: string }>(`
      SELECT id, name FROM rec.directions
      WHERE archived_at IS NULL ORDER BY sort_order
    `),
    query<{ code: string; name: string; response_hours: number }>(`
      SELECT code, name, response_hours FROM rec.priorities ORDER BY sort_order
    `),
    query<{ id: number; full_name: string; position: string | null }>(`
      SELECT id, full_name, position FROM rec.users
      WHERE is_active AND side = 'executor' ORDER BY full_name
    `),
  ]);

  return {
    directions: directions.map((r) => ({ id: Number(r.id), name: r.name })),
    priorities: priorities.map((r) => ({
      code: r.code, name: r.name, responseHours: Number(r.response_hours),
    })),
    executors: executors.map((r) => ({
      id: Number(r.id), fullName: r.full_name, position: r.position,
    })),
  };
}

/** Аналог здесь строже карточки: та же скважина и то же направление. */
export async function registrationAnalogs(
  wellId: number,
  directionId: number,
): Promise<RegistrationAnalog[]> {
  const rows = await query<Record<string, unknown>>(`
    SELECT r.id, r.number, s.name AS status_name, r.well_number,
           r.problem, r.registered_at
    FROM rec.recommendations r
    JOIN rec.statuses s ON s.code = r.status
    WHERE r.deleted_at IS NULL
      AND r.status <> 'draft'
      AND r.number IS NOT NULL
      AND r.well_id = $1
      AND r.direction_id = $2
    ORDER BY r.registered_at DESC, r.id DESC
    LIMIT 12
  `, [wellId, directionId]);

  return rows.map((r) => ({
    id: Number(r.id),
    number: r.number as string,
    statusName: r.status_name as string,
    wellNumber: r.well_number as string,
    problem: r.problem as string,
    registeredAt: r.registered_at as Date,
  }));
}
