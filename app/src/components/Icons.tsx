/* Спрайт иконок — тот же, что в макете, один в один.
 *
 * Иконки объявлены как <symbol> в скрытом <svg> и подключаются через <use>.
 * Так же, как в макете: файл иконок не заводится, внешних зависимостей нет,
 * а разметка использования остаётся прежней — <svg class="ic16"><use href="#i-plus"/></svg>. */

export function IconSprite() {
  return (
    <svg style={{ display: 'none' }} aria-hidden="true">
      <symbol id="i-sort" viewBox="0 0 12 12"><path d="M6 2.5v7M6 9.5 3.8 7.3M6 9.5l2.2-2.2" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-funnel" viewBox="0 0 12 12"><path d="M1.5 2.5h9L7 6.4v3.1L5 10.5V6.4z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></symbol>
      <symbol id="i-search" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="m10.2 10.2 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></symbol>
      <symbol id="i-bell" viewBox="0 0 16 16"><path d="M8 2a3.5 3.5 0 0 0-3.5 3.5c0 3-1 4-1 4h9s-1-1-1-4A3.5 3.5 0 0 0 8 2zM6.6 12a1.5 1.5 0 0 0 2.8 0" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      {/* Тот же колокол, разобранный на купол и язычок: анимировать часть
          иконки внутри <use> нельзя — содержимое символа лежит в теневом
          дереве, и селектор класса туда не достаёт. Поэтому в шапке рисуются
          два <use> стопкой (см. .icstack), а цельный i-bell остаётся для
          мест, где колокол статичен. */}
      <symbol id="i-bell-dome" viewBox="0 0 16 16"><path d="M8 2a3.5 3.5 0 0 0-3.5 3.5c0 3-1 4-1 4h9s-1-1-1-4A3.5 3.5 0 0 0 8 2z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-bell-clap" viewBox="0 0 16 16"><path d="M6.6 12a1.5 1.5 0 0 0 2.8 0" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-help" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M6.4 6.2A1.7 1.7 0 0 1 9.7 6.6c0 1.2-1.7 1.4-1.7 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="8" cy="11.4" r=".7" fill="currentColor"/></symbol>
      <symbol id="i-plus" viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></symbol>
      <symbol id="i-doc-plus" viewBox="0 0 16 16"><path d="M9 2H4.6c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h6.8c.6 0 1-.4 1-1V5.4zM9 2v3.4h3.4M6.2 9.4h3.6M8 7.6v3.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-cols" viewBox="0 0 16 16"><rect x="2.2" y="3" width="11.6" height="10" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M6.1 3v10M9.9 3v10" stroke="currentColor" strokeWidth="1.2"/></symbol>
      <symbol id="i-export" viewBox="0 0 16 16"><path d="M8 10.5V2.8M8 2.8 5.6 5.2M8 2.8l2.4 2.4M3 10v2.2c0 .6.4 1 1 1h8c.6 0 1-.4 1-1V10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-back" viewBox="0 0 16 16"><path d="M9.5 3.5 5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-clock" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M8 4.7V8l2.4 1.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      {/* Жучок: тело капсулой, усики и две пары лап. Третьей пары нет
          намеренно — на 16 px лапы сливаются в кляксу, а узнаваемость держат
          усики и капсула, а не число ног. */}
      <symbol id="i-bug" viewBox="0 0 16 16"><path d="M4.9 7.2a3.1 3.1 0 0 1 6.2 0v2.9a3.1 3.1 0 0 1-6.2 0zM6.2 5 5.2 3.4M9.8 5l1-1.6M4.9 8.4H2.5M11.1 8.4h2.4M5.1 11 3.1 12.2M10.9 11l2 1.2M8 7.6v4.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-clip" viewBox="0 0 16 16"><path d="M10.5 5.5 6.2 9.8a1.7 1.7 0 0 0 2.4 2.4l4.6-4.6a3 3 0 0 0-4.2-4.2L4.2 8.2a4.3 4.3 0 0 0 6 6l3.6-3.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-prev" viewBox="0 0 16 16"><path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-next" viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-caret" viewBox="0 0 16 16"><path d="M4.5 6.5 8 10l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-check" viewBox="0 0 16 16"><path d="m3.6 8.4 3 3 5.8-6.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-more" viewBox="0 0 16 16"><circle cx="8" cy="3.4" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="12.6" r="1.3" fill="currentColor"/></symbol>
    </svg>
  );
}

/** Иконка по идентификатору из спрайта. */
export function Icon({ id, size = 16 }: { id: string; size?: 12 | 16 | 20 }) {
  return (
    <svg className={`ic${size}`} aria-hidden="true">
      <use href={`#i-${id}`} />
    </svg>
  );
}
