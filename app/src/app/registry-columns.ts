/* Колонки реестра — ширины и разметка из макета (COLS в app.js), плюс
 * признак, какой поповер открывает иконка в заголовке. Общий файл для
 * серверной страницы (ширины, тело таблицы) и клиентской шапки (поповеры),
 * чтобы состав колонок не разъезжался между ними. */

export type ColKind = 'search' | 'text' | 'filter' | 'period';

export interface ColDef {
  key: string;
  label: string;
  w: number;
  kind?: ColKind;
}

export const КОЛОНКИ_ВСЕ: ColDef[] = [
  { key: 'number', label: '№', w: 100, kind: 'search' },
  { key: 'regDate', label: 'Дата регистрации', w: 136, kind: 'period' },
  { key: 'formDate', label: 'Дата формирования', w: 136 },
  { key: 'field', label: 'Месторождение', w: 172, kind: 'filter' },
  { key: 'direction', label: 'Направление', w: 152, kind: 'filter' },
  { key: 'kust', label: 'Куст', w: 76, kind: 'filter' },
  { key: 'well', label: 'Скважина', w: 110, kind: 'filter' },
  { key: 'problem', label: 'Проблема / отклонение', w: 230, kind: 'text' },
  { key: 'action', label: 'Рекомендуемое мероприятие', w: 260, kind: 'text' },
  { key: 'rationale', label: 'Технологическое обоснование', w: 260, kind: 'text' },
  { key: 'priority', label: 'Приоритет', w: 114, kind: 'filter' },
  { key: 'executor', label: 'Ответственный Исполнителя', w: 94, kind: 'filter' },
  { key: 'status', label: 'Текущий статус', w: 150, kind: 'filter' },
  { key: 'sentAt', label: 'Дата/время передачи', w: 136 },
  { key: 'openedAt', label: 'Открыто Заказчиком', w: 136 },
  { key: 'dueAt', label: 'Ожидаемый срок обратной связи', w: 116 },
  { key: 'repliedAt', label: 'Дата/время обратной связи', w: 116 },
  { key: 'control', label: 'Контроль ответа', w: 148, kind: 'filter' },
  { key: 'decision', label: 'Решение Заказчика', w: 130, kind: 'filter' },
  { key: 'rejectReason', label: 'Обоснование при отклонении', w: 240, kind: 'text' },
  { key: 'customer', label: 'Ответственный Заказчика', w: 130, kind: 'filter' },
  { key: 'factDate', label: 'Дата фактической реализации', w: 128 },
  { key: 'completeness', label: 'Полнота реализации', w: 116, kind: 'filter' },
  { key: 'windowOpenAt', label: 'Дата открытия окна эффекта', w: 116 },
  { key: 'windowCloseAt', label: 'Дата закрытия окна', w: 116 },
  { key: 'commentsCount', label: 'Комментарии', w: 96 },
  { key: 'expectQzh', label: 'Ожид. Δ Qж, м³/сут', w: 104 },
  { key: 'expectQn', label: 'Ожид. Δ Qн, т/сут', w: 104 },
  { key: 'expectEe', label: 'Ожид. Δ ЭЭ, кВт·ч', w: 104 },
  { key: 'attachmentsCount', label: 'Вложения', w: 84 },
];

/* Видимые по умолчанию — состав решения 24, остальное скрыто, пока человек
 * не включит колонку сам через «Настройку колонок» (registry-columns-panel). */
export const КОЛОНКИ_ПО_УМОЛЧАНИЮ = new Set([
  'number', 'regDate', 'field', 'direction', 'well', 'problem',
  'priority', 'executor', 'status', 'control', 'decision',
]);

/* Смысловые группы для чек-листа настройки колонок — плоский список на
 * тридцать строк нечитаем без разбивки. «№» в списке нет: это единственный
 * путь на карточку рекомендации из реестра, отключать его нельзя. */
export const ГРУППЫ_КОЛОНОК: { label: string; keys: string[] }[] = [
  {
    label: 'Основное',
    keys: ['regDate', 'formDate', 'field', 'direction', 'kust', 'well',
      'problem', 'action', 'rationale', 'priority', 'executor', 'status'],
  },
  {
    label: 'Сроки и контроль ответа',
    keys: ['sentAt', 'openedAt', 'dueAt', 'repliedAt', 'control'],
  },
  {
    label: 'Решение и реализация',
    keys: ['decision', 'rejectReason', 'customer', 'factDate', 'completeness',
      'windowOpenAt', 'windowCloseAt', 'commentsCount', 'attachmentsCount'],
  },
  {
    label: 'Ожидаемый эффект',
    keys: ['expectQzh', 'expectQn', 'expectEe'],
  },
];

export function видимыеКолонки(visible: Set<string> | null): ColDef[] {
  const набор = visible ?? КОЛОНКИ_ПО_УМОЛЧАНИЮ;
  return КОЛОНКИ_ВСЕ.filter((c) => c.key === 'number' || набор.has(c.key));
}

/* Первое направление сортировки зависит от типа: у даты — с новых, у
 * остального — с начала списка / меньшего значения. Тот же смысл, что
 * firstDir в макете. */
export function firstDir(key: string): 'asc' | 'desc' {
  return key === 'regDate' ? 'desc' : 'asc';
}
