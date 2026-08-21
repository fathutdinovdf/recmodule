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

export const КОЛОНКИ: ColDef[] = [
  { key: 'number', label: '№', w: 100, kind: 'search' },
  { key: 'regDate', label: 'Дата регистрации', w: 136, kind: 'period' },
  { key: 'field', label: 'Месторождение', w: 172, kind: 'filter' },
  { key: 'direction', label: 'Направление', w: 152, kind: 'filter' },
  { key: 'well', label: 'Скважина', w: 110, kind: 'filter' },
  { key: 'problem', label: 'Проблема / отклонение', w: 230, kind: 'text' },
  { key: 'priority', label: 'Приоритет', w: 114, kind: 'filter' },
  { key: 'executor', label: 'Ответственный Исполнителя', w: 94, kind: 'filter' },
  { key: 'status', label: 'Текущий статус', w: 150, kind: 'filter' },
  { key: 'control', label: 'Контроль ответа', w: 148, kind: 'filter' },
  { key: 'decision', label: 'Решение Заказчика', w: 130, kind: 'filter' },
];

/* Первое направление сортировки зависит от типа: у даты — с новых, у
 * остального — с начала списка / меньшего значения. Тот же смысл, что
 * firstDir в макете. */
export function firstDir(key: string): 'asc' | 'desc' {
  return key === 'regDate' ? 'desc' : 'asc';
}
