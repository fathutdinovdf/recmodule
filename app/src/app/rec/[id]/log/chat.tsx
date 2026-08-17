'use client';

/* Живая лента обсуждения.
 *
 * Три вещи, которые здесь важнее всего:
 *
 * 1. Своя реплика появляется до ответа сервера. Ждать круга «отправил →
 *    перерисовали страницу → увидел» в чате нельзя: это ощущается как задержка
 *    даже когда сервер быстрый.
 * 2. Чужая реплика приезжает по SSE и НЕ дёргает прокрутку, если человек
 *    читает выше. Лента, выдёргивающая текст из-под глаз, хуже, чем лента без
 *    живого обновления.
 * 3. Первый кадр — уже внизу. Обсуждение читают с конца.
 *
 * Начальные записи приходят с сервера отрисованными; дальше лента живёт сама.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, MessageSquare } from 'lucide-react';
import { ScrollOverlay, найтиСкроллер } from '@/components/ScrollOverlay';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/Button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Событие, Реплика } from './rows';
import { Композер, type Собеседник, type Черновик } from './composer';
import { вЛенту, ключДня, подписьДня, времяДня, инициалы, type FeedItem, type RawEntry } from './format';

/** Насколько далеко от низа человек ещё считается «читающим последнее». */
const У_ДНА_PX = 80;

export function Чат({ recId, начальные, люди, я, обсуждаемо, причина }: {
  recId: number;
  начальные: FeedItem[];
  люди: Собеседник[];
  я: { id: number; fullName: string; side: 'executor' | 'customer' } | null;
  обсуждаемо: boolean;
  /** Почему нельзя писать, если нельзя. */
  причина?: string;
}) {
  const [записи, setЗаписи] = useState<FeedItem[]>(начальные);
  const [ошибка, setОшибка] = useState<string | null>(null);
  const [естьНовое, setЕстьНовое] = useState(false);
  /* Строки, приехавшие уже при открытой странице: только они анимируются.
     Иначе при каждом обновлении въезжала бы вся история разом. */
  const свежие = useRef(new Set<string>());
  const корень = useRef<HTMLDivElement>(null);
  const [скроллер, setСкроллер] = useState<HTMLElement | null | undefined>(undefined);

  /* Контейнер прокрутки ищем после монтирования: до этого его высоты ещё нет.
     Заодно прячем его системную полосу — вместо неё накладной индикатор. */
  useEffect(() => {
    const el = найтиСкроллер(корень.current);
    if (el) el.style.scrollbarWidth = 'none';
    setСкроллер(el);
    return () => { if (el) el.style.scrollbarWidth = ''; };
  }, []);

  /* Своей области прокрутки у ленты нет: она давала вторую полосу рядом с
     полосой панели вкладки, а две полосы в сантиметре друг от друга — это
     загадка «что чем крутится». Крутится тот контейнер, что и на остальных
     вкладках карточки, — его и находим. */
  const уДна = () => {
    const el = скроллер;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < У_ДНА_PX;
  };

  const вниз = useCallback((плавно: boolean) => {
    const el = скроллер;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: плавно ? 'smooth' : 'auto' });
    setЕстьНовое(false);
  }, [скроллер]);

  /* Первый кадр — сразу внизу, без анимации: плавная прокрутка при открытии
     читается как «страница поехала сама». Ждём, пока найдётся контейнер
     прокрутки: до него прыгать некуда. */
  useLayoutEffect(() => { if (скроллер) вниз(false); }, [скроллер, вниз]);

  const добавить = useCallback((запись: FeedItem, своя: boolean) => {
    свежие.current.add(запись.key);
    const держатьсяДна = своя || уДна();
    setЗаписи((было) => было.some((x) => x.key === запись.key) ? было : [...было, запись]);
    /* Прокрутка после того, как строка отрисована, иначе высота ещё старая. */
    requestAnimationFrame(() => {
      if (держатьсяДна) вниз(true);
      else setЕстьНовое(true);
    });
  }, [вниз]);

  /* Лента, взятая из клиентского кэша маршрутов, отстаёт: кэш живёт три минуты
     (staleTimes.dynamic), а догрузки пропущенного у нас нет — история приходит
     серверным рендером, дальше только канал. Свежее подключение канала принесёт
     лишь то, что появится после него, и реплики, написанные за время
     отсутствия, потерялись бы до перезагрузки. Поэтому вкладка обсуждения при
     каждом открытии просит свежий рендер; остальные вкладки продолжают жить из
     кэша. */
  const router = useRouter();
  useEffect(() => { router.refresh(); }, [router]);

  /* Свежий рендер приходит новым значением пропа, а состояние ленты уже
     заведено — его надо догрузить, иначе refresh не даст ничего. Слияние по
     ключу, а не замена: в состоянии могут висеть свои реплики, ещё не дошедшие
     до сервера (pending), и замена стёрла бы их с экрана. */
  useEffect(() => {
    setЗаписи((было) => {
      const естьВСостоянии = new Set(было.map((x) => x.key));
      const добавленные = начальные.filter((x) => !естьВСостоянии.has(x.key));
      if (!добавленные.length) return было;
      /* Неотправленные встают последними: они новее всего, что пришло с
         сервера, и уезжать выше чужих реплик им незачем. */
      return [...было.filter((x) => !x.pending), ...добавленные, ...было.filter((x) => x.pending)];
    });
  }, [начальные]);

  /* Живой канал. Реплики приходят готовыми записями — форматирование общее с
     сервером, поэтому строка, приехавшая по каналу, неотличима от серверной. */
  useEffect(() => {
    const src = new EventSource(`/api/rec/${recId}/stream`);
    src.addEventListener('comment', (ev) => {
      const raw = JSON.parse((ev as MessageEvent).data) as RawEntry;
      /* Свою реплику канал тоже приносит — она уже нарисована оптимистично и
         заменена ответом сервера, поэтому здесь отсеется по ключу. */
      добавить(вЛенту(raw, new Date()), false);
    });
    return () => src.close();
  }, [recId, добавить]);

  async function отправить(ч: Черновик) {
    if (!я) return;
    setОшибка(null);

    const временный = `tmp-${Date.now()}`;
    const сейчас = new Date();
    const черновик: FeedItem = {
      key: временный,
      talk: true,
      kind: 'talk',
      toStatus: null,
      time: времяДня(сейчас),
      dayKey: ключДня(сейчас),
      dayLabel: подписьДня(сейчас, сейчас),
      text: ч.текст,
      actorName: я.fullName,
      sideLabel: я.side === 'executor' ? 'Исполнитель' : 'Заказчик',
      initials: инициалы(я.fullName),
      own: true,
      /* Файлы показываем ещё до заливки: отрицательные номера — заведомо не
         существующие в базе, ссылка на них не построится. */
      attachments: ч.файлы.map((f, i) => ({ id: -(i + 1), fileName: f.name, sizeBytes: f.size })),
      mentions: люди.filter((u) => ч.упомянуты.includes(u.id)).map((u) => u.fullName),
      pending: true,
      progress: ч.файлы.length ? 0 : undefined,
    };
    добавить(черновик, true);

    const тело = new FormData();
    тело.set('text', ч.текст);
    for (const id of ч.упомянуты) тело.append('mentions', String(id));
    for (const f of ч.файлы) тело.append('files', f);

    try {
      const ответ = await послатьСПрогрессом(`/api/rec/${recId}/comment`, тело, (доля) => {
        setЗаписи((было) => было.map((x) => x.key === временный ? { ...x, progress: доля } : x));
      });
      const запись = вЛенту(ответ, new Date());
      свежие.current.add(запись.key);
      /* Подмена, а не «убрать и добавить»: строка остаётся на месте, меняется
         только её содержимое — иначе реплика моргнула бы. */
      setЗаписи((было) => было.map((x) => x.key === временный ? запись : x));
    } catch (e) {
      const текст = e instanceof Error ? e.message : 'Не удалось отправить';
      setЗаписи((было) => было.map((x) => x.key === временный
        ? { ...x, pending: false, progress: undefined, failed: текст } : x));
    }
  }

  /* Сутки — единственная группировка ленты: время внутри дня отвечает «когда»,
     а сам день — «насколько давно», и второе из строки «14:20» не следует. */
  const дни: { key: string; label: string; items: FeedItem[] }[] = [];
  for (const e of записи) {
    const последний = дни[дни.length - 1];
    if (последний && последний.key === e.dayKey) последний.items.push(e);
    else дни.push({ key: e.dayKey, label: e.dayLabel, items: [e] });
  }

  return (
    /* Во всю высоту панели вкладки: поле ввода стоит внизу контейнера всегда,
       а не подпирает короткую ленту снизу, оставляя под собой пустоту. */
    <div ref={корень} className="relative flex min-h-full flex-col">
      <div className="flex-1">
        {записи.length === 0 ? <Пусто /> : дни.map((д) => (
          <section key={д.key}>
            <div className="flex items-center gap-3 pb-2 pt-1">
              <span className="text-xs tabular-nums text-muted-foreground">{д.label}</span>
              <Separator className="flex-1" />
            </div>
            <ol className="mb-2">
              {д.items.map((e) => e.talk
                ? <Реплика key={e.key} e={e} свежая={свежие.current.has(e.key)} />
                : <Событие key={e.key} e={e} свежая={свежие.current.has(e.key)} />)}
            </ol>
          </section>
        ))}
      </div>

      {/* Пилюля вместо рывка: человек сам решает, прыгать ли вниз. */}
      {естьНовое && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => вниз(true)}
          /* Пилюля крепится к окну, а не к ленте: прокрутка теперь оконная, и
             привязанная к ленте кнопка уезжала бы за экран вместе с ней. */
          className="fixed bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full bg-popover text-xs shadow-md animate-in fade-in-0 slide-in-from-bottom-2"
          style={{ animationDuration: 'var(--motion-base)', animationTimingFunction: 'var(--ease-out)' }}
        >
          <ArrowDown className="size-3.5" /> Новое сообщение
        </Button>
      )}

      {/* Поле ввода липнет к низу видимой области: при чтении середины
          переписки писать иначе было бы некуда. */}
      {обсуждаемо
        ? (
          <div className="sticky bottom-0 z-10 bg-[var(--bg-card)]">
            <Композер люди={люди} отправить={отправить} ошибка={ошибка} />
          </div>
        )
        : причина && <div className="form__hint mt-3 border-t border-border pt-3">{причина}</div>}

      <ScrollOverlay target={скроллер} />
    </div>
  );
}

/* XHR, а не fetch: прогресс заливки отдаёт только он. Ради одного индикатора
   это оправдано — вложением ходит выгрузка тренда, и молчащая кнопка на
   десять мегабайт выглядит зависшей. */
function послатьСПрогрессом(url: string, тело: FormData, наПрогресс: (доля: number) => void) {
  return new Promise<RawEntry>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) наПрогресс(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      try {
        const данные = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && данные) resolve(данные as RawEntry);
        else reject(new Error(данные?.error ?? 'Сервер отклонил реплику'));
      } catch {
        reject(new Error('Непонятный ответ сервера'));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Нет связи с сервером')));
    xhr.send(тело);
  });
}

function Пусто() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
        <EmptyTitle>Пока пусто</EmptyTitle>
        <EmptyDescription>История ведётся с момента регистрации рекомендации.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
