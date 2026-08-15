/* Превращение записи базы в строку ленты.
 *
 * Модуль общий для сервера и браузера намеренно: страница рисует историю на
 * сервере, а живая лента дописывает в неё реплики, пришедшие по SSE. Считай
 * они время по-разному — соседние строки одной ленты показывали бы час в
 * разных форматах.
 *
 * Даты форматируются вручную, без Intl: у сервера и браузера могут не совпасть
 * ни локаль, ни часовой пояс, и первая же гидрация выдала бы расхождение.
 */

export interface FeedAttachment {
  id: number;
  fileName: string;
  sizeBytes: number | null;
}

export interface FeedItem {
  key: string;
  /** Реплика человека или событие процесса: от этого зависит вся отрисовка. */
  talk: boolean;
  kind: string;
  /** Код целевого статуса — по нему подбирается иконка события. */
  toStatus: string | null;
  time: string;
  dayKey: string;
  dayLabel: string;
  text: string;
  actorName: string;
  sideLabel: string;
  initials: string;
  /** Своя запись. */
  own: boolean;
  attachments: FeedAttachment[];
  mentions: string[];
  /** Отправлена, но сервером ещё не подтверждена. */
  pending?: boolean;
  /** Сервер отказал — строка остаётся в ленте с возможностью повторить. */
  failed?: string;
  /** Доля залитого при отправке файлов, 0…1. Показывается полосой, а не
   *  спиннером: на десятимегабайтной выгрузке важно видеть, что идёт. */
  progress?: number;
}

/** Запись ленты как её отдают `db/log.ts` и поток SSE (там дата — строка). */
export interface RawEntry {
  key: string;
  at: string | Date;
  kind: string;
  actorName: string;
  side: 'executor' | 'customer' | 'system';
  text: string | null;
  toStatus: string | null;
  toStatusName: string | null;
  own: boolean;
  attachments: FeedAttachment[];
  mentions: string[];
}

const СТОРОНА: Record<string, string> = {
  executor: 'Исполнитель',
  customer: 'Заказчик',
  system: 'Система',
};

/* Событие без собственного текста. В базе текст есть почти всегда, но история
   копится годами, и строка без подписи выглядела бы потерей данных. */
const ПО_УМОЛЧАНИЮ: Record<string, string> = {
  decision: 'Решение Заказчика',
  fact: 'Зафиксирована реализация',
  dispute: 'Разбирательство',
  link: 'Связь с другой рекомендацией',
  opened: 'Открыто окно подтверждения эффекта',
};

const два = (n: number) => String(n).padStart(2, '0');

export const времяДня = (d: Date) => `${два(d.getHours())}:${два(d.getMinutes())}`;
export const ключДня = (d: Date) => `${d.getFullYear()}-${два(d.getMonth() + 1)}-${два(d.getDate())}`;

/* «Сегодня» и «Вчера» словами: в ленте свежесть записи важнее её календарной
   даты, а дата остаётся у более старых суток. */
export function подписьДня(d: Date, сегодня: Date): string {
  const вчера = new Date(сегодня);
  вчера.setDate(вчера.getDate() - 1);
  if (ключДня(d) === ключДня(сегодня)) return 'Сегодня';
  if (ключДня(d) === ключДня(вчера)) return 'Вчера';
  return `${два(d.getDate())}.${два(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/* Инициалы для аватара. Отчество отбрасывается: две буквы читаются, три
   сливаются в пятно на круге в 24 пиксела. */
export function инициалы(имя: string): string {
  const части = имя.trim().split(/\s+/).filter(Boolean);
  if (!части.length) return '—';
  return (части[0][0] + (части[1]?.[0] ?? '')).toUpperCase();
}

export function вЛенту(e: RawEntry, сегодня: Date): FeedItem {
  const at = e.at instanceof Date ? e.at : new Date(e.at);
  const сторона = СТОРОНА[e.side] ?? '';
  return {
    key: e.key,
    talk: e.kind === 'talk',
    kind: e.kind,
    toStatus: e.toStatus,
    time: времяДня(at),
    dayKey: ключДня(at),
    dayLabel: подписьДня(at, сегодня),
    text: e.text ?? (e.toStatusName ? `Статус: ${e.toStatusName}` : ПО_УМОЛЧАНИЮ[e.kind] ?? 'Событие'),
    actorName: e.actorName,
    /* «Система · Система» — не подпись. Сторону дописываем только к человеку. */
    sideLabel: e.actorName === сторона ? '' : сторона,
    initials: инициалы(e.actorName),
    own: e.own,
    attachments: e.attachments ?? [],
    mentions: e.mentions ?? [],
  };
}

/** Размер файла человеку. Килобайт хватает: предел вложения — 10 МБ. */
export function размер(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}
