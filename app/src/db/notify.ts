/* Подписка на новые реплики через LISTEN/NOTIFY.
 *
 * Один выделенный клиент на процесс, а не по клиенту на читателя: соединение
 * с LISTEN занято постоянно, и пул из него не выпустишь. Сообщение о новой
 * реплике приходит от триггера (миграция 006) и раздаётся всем открытым
 * лентам этого процесса.
 *
 * Почему не общая память вместо базы: реплику может записать не только
 * страница — сервер запускается в нескольких процессах, а рядом ходят скрипты.
 * Событие, разосланное в памяти одного процесса, не увидит никто, кроме него.
 */

import { EventEmitter } from 'node:events';
import { Client } from 'pg';
import { modulePoolConfig } from './pool';

export interface CommentNotice {
  recId: number;
  commentId: number;
}

const globalForNotify = globalThis as unknown as {
  __recNotifyBus?: EventEmitter;
  __recNotifyStarted?: boolean;
};

/* Лент на процесс может быть много (несколько вкладок, несколько человек),
   и предел слушателей по умолчанию — десять — упёрся бы с предупреждением. */
const шина = globalForNotify.__recNotifyBus ?? (() => {
  const e = new EventEmitter();
  e.setMaxListeners(0);
  globalForNotify.__recNotifyBus = e;
  return e;
})();

/** Пауза перед новой попыткой связи: обрыв канала не должен крутить цикл. */
const ПАУЗА_МС = 2000;

async function слушать(): Promise<void> {
  /* Отдельный Client, а не клиент из пула: пул отдаёт соединение во временное
     пользование и вернёт его в оборот, а LISTEN живёт, пока живёт соединение. */
  const client = new Client(modulePoolConfig);

  client.on('notification', (msg) => {
    if (msg.channel !== 'rec_comment' || !msg.payload) return;
    const [rec, comment] = msg.payload.split(':');
    шина.emit('comment', { recId: Number(rec), commentId: Number(comment) } as CommentNotice);
  });

  /* Обрыв — штатное событие: база перезапускается, сеть моргает. Молча
     переподключаемся; открытые ленты этого не заметят, потому что подписаны
     на шину, а не на соединение. */
  client.on('error', () => {
    client.end().catch(() => {});
    setTimeout(() => { слушать().catch(() => {}); }, ПАУЗА_МС);
  });

  await client.connect();
  await client.query('LISTEN rec_comment');
}

/**
 * Подписка на реплики одной рекомендации. Возвращает функцию отписки —
 * её обязан вызвать тот, кто подписался, иначе закрытая вкладка оставит
 * за собой слушателя навсегда.
 */
export function подписатьсяНаРеплики(
  recId: number,
  fn: (n: CommentNotice) => void | Promise<void>,
): () => void {
  if (!globalForNotify.__recNotifyStarted) {
    globalForNotify.__recNotifyStarted = true;
    слушать().catch(() => {
      /* Не смогли встать на прослушку — живой ленты не будет, но страница
         обязана работать: она и без канала показывает всё, что есть в базе. */
      globalForNotify.__recNotifyStarted = false;
    });
  }

  /* Исключение слушателя не должно уходить наружу. Слушателей зовёт
     EventEmitter из обработчика соединения с базой: там некому ловить, а
     необработанный отказ в промисе убивает весь процесс рендера — падает не
     одна лента, а все страницы сразу. */
  const слушатель = (n: CommentNotice) => {
    if (n.recId !== recId) return;
    try {
      const r = fn(n) as unknown;
      if (r instanceof Promise) r.catch(() => {});
    } catch { /* подписчик уже закрыт или не смог прочитать реплику */ }
  };
  шина.on('comment', слушатель);
  return () => { шина.off('comment', слушатель); };
}
