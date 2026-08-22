'use client';

/* Управляющие элементы экрана прав.
 *
 * Права правятся черновиком. Роль, полномочия и зона меняются в карточке
 * локально и уходят на сервер вместе, по кнопке «Сохранить». Причина не в
 * осторожности, а в связности: смена роли тянет за собой умолчания
 * полномочий, а зона осмысленна только вместе с ними. Применяя каждое поле
 * по отдельности, человека проводят через состояния, которых он не хотел, —
 * например, через «инженер с правом решения», когда роль уже сменили, а право
 * ещё не сняли, и в журнале это остаётся навсегда.
 *
 * Операции доступа — пароль, включение и отключение — наоборот, выполняются
 * сразу: это действия, а не поля формы, и держать «снять пароль» в черновике
 * значило бы, что на экране доступ снят, а на деле нет.
 *
 * Уйти с несохранёнными изменениями экран не даёт: переход по списку
 * перехватывается и спрашивает, что сделать. Права — не текст черновика,
 * потерять их молча нельзя.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Switch } from '@/components/ui/Switch';
import { Select } from '@/components/ui/Select';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { CountingNumber } from '@/components/animate-ui/primitives/animate/counting-number';
import { ScrollOverlay } from '@/components/ScrollOverlay';
import { Icon } from '@/components/Icons';
import type { КарточкаПользователя, РольСправочник, Месторождение } from '@/db/users';
import {
  сохранитьПрава, переключитьДоступ, задатьПароль, снятьПароль, добавитьПользователя,
  type Права,
} from './actions';

/* ------------------------------ поиск по списку ------------------------------ */

export function ПоискПоСписку({ children }: { children: React.ReactNode }) {
  const [строка, setСтрока] = React.useState('');
  const низ = строка.trim().toLowerCase();

  /* Фильтруется готовая серверная разметка: у каждой строки списка стоит
     data-search с именем, логином и ролью. Так поиск не требует второй копии
     данных на клиенте и не расходится с тем, что нарисовано. */
  const обёртка = React.useRef<HTMLDivElement>(null);
  const [скроллер, setСкроллер] = React.useState<HTMLElement | null | undefined>(undefined);
  React.useEffect(() => { setСкроллер(обёртка.current); }, []);
  React.useEffect(() => {
    const корень = обёртка.current;
    if (!корень) return;
    for (const строкаСписка of корень.querySelectorAll<HTMLElement>('[data-search]')) {
      const подходит = !низ || (строкаСписка.dataset.search ?? '').includes(низ);
      строкаСписка.style.display = подходит ? '' : 'none';
    }
    /* Заголовок группы прячется вместе с её последней строкой: «Заказчик» без
       единой фамилии под ним выглядит поломкой поиска. */
    for (const группа of корень.querySelectorAll<HTMLElement>('[data-group]')) {
      const свои = корень.querySelectorAll<HTMLElement>(`[data-in="${группа.dataset.group}"]`);
      группа.style.display = [...свои].some((э) => э.style.display !== 'none') ? '' : 'none';
    }
  }, [низ]);

  return (
    <>
      <div className="ulist__search">
        <div className="field">
          <Icon id="search" />
          <input
            value={строка}
            onChange={(e) => setСтрока(e.target.value)}
            placeholder="Имя, логин или роль"
            aria-label="Поиск по списку"
            /* Браузер запоминает введённое в поля с историей и предлагает его
               списком поверх результатов поиска — чужие фамилии из прошлых
               сеансов вперемешку со своими. Отбор по списку на экране, а не
               заполнение анкеты: подсказывать тут нечего. */
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
      <div className="ulist__scroll" ref={обёртка}>{children}</div>
      <ScrollOverlay target={скроллер} />
    </>
  );
}

/* Прокручиваемая область со своим индикатором вместо системной полосы — тот же
   приём, что на карточке рекомендации: системная отъедает восемь пикселов у
   содержимого и висит постоянно, а здесь таких областей на экране три сразу —
   список, карточка и журнал, — и три серые полосы рядом читаются как решётка.
   Индикатор появляется при прокрутке и гаснет.
 *
 * Обёртка клиентская, содержимое приходит с сервера пропсом children: ScrollOverlay
 * нужен живой элемент, а не разметка. */
export function СвойСкролл({
  className, children,
}: {
  className: string; children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [цель, setЦель] = React.useState<HTMLElement | null | undefined>(undefined);
  React.useEffect(() => { setЦель(ref.current); }, []);

  return (
    <div className={className} ref={ref}>
      {children}
      <ScrollOverlay target={цель} />
    </div>
  );
}

/* ------------------------------ карточка прав ------------------------------ */

const снимок = (u: КарточкаПользователя): Права => ({
  role: u.role,
  canDecide: u.canDecide,
  onlyOwn: u.onlyOwn,
  canEditEconomy: u.canEditEconomy,
  fields: [...u.fields].sort((a, b) => a - b),
});

const одинаково = (a: number[], b: number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

export function КарточкаПрав({
  user, роли, поля,
}: {
  user: КарточкаПользователя; роли: РольСправочник[]; поля: Месторождение[];
}) {
  const [идёт, начать] = React.useTransition();
  const [ошибка, setОшибка] = React.useState<string | null>(null);
  const [черновик, setЧерновик] = React.useState<Права>(() => снимок(user));
  const router = useRouter();

  /* Пришёл другой человек или страница перечиталась после сохранения —
     черновик начинается заново от того, что в базе. */
  const исходное = снимок(user);
  const ключ = `${user.id}:${user.role}:${user.canDecide}:${user.onlyOwn}:${user.canEditEconomy}:${исходное.fields.join(',')}`;
  const прошлыйКлюч = React.useRef(ключ);
  if (прошлыйКлюч.current !== ключ) {
    прошлыйКлюч.current = ключ;
    setЧерновик(снимок(user));
  }

  const роль = роли.find((r) => r.key === черновик.role) ?? роли[0];
  const заказчик = роль?.side === 'customer';
  const исполнитель = роль?.side === 'executor';

  const изменения = [
    черновик.role !== исходное.role && 'роль',
    черновик.canDecide !== исходное.canDecide && 'право решения',
    черновик.onlyOwn !== исходное.onlyOwn && 'отбор по ответственному',
    черновик.canEditEconomy !== исходное.canEditEconomy && 'экономическая модель',
    !одинаково(черновик.fields, исходное.fields) && 'зона',
  ].filter(Boolean) as string[];

  const грязно = изменения.length > 0;

  const сохранить = (после?: () => void) => {
    setОшибка(null);
    начать(async () => {
      const ответ = await сохранитьПрава(user.id, черновик);
      if (ответ.ошибка) { setОшибка(ответ.ошибка); return; }
      router.refresh();
      после?.();
    });
  };

  /* Смена роли переносит полномочия к её умолчаниям прямо в черновике: роль
     меняют, когда человек сменил обязанности, и тащить за ним прежнее право
     решения — не «сохранить настройку», а выдать лишнее по недосмотру.
     Видно это сразу, до сохранения, — потому и делается на клиенте. */
  const сменитьРоль = (key: string) => {
    const новая = роли.find((r) => r.key === key);
    if (!новая) return;
    setЧерновик((ч) => ({
      ...ч,
      role: key,
      canDecide: новая.canDecide,
      onlyOwn: новая.onlyOwn,
      fields: новая.hasRecs ? ч.fields : [],
    }));
  };

  return (
    <>
      <УходСоСтраницы грязно={грязно} идёт={идёт} сохранить={сохранить} />

      <section className="usec">
        <div className="usec__head"><span className="usec__title">Роль</span></div>
        <Select
          options={роли.map((r) => ({
            value: r.key,
            label: r.label,
            note: r.side === 'executor' ? 'Исполнитель' : 'Заказчик',
          }))}
          value={черновик.role}
          disabled={идёт}
          onValueChange={сменитьРоль}
        />
        <div className="usec__hint">{роль?.note}</div>
        {роль && роль.side !== user.side && (
          <div className="usec__hint">
            Сторона договора станет «{заказчик ? 'Заказчик' : 'Исполнитель'}»: это другой
            набор действий, а не другой объём прав. Полномочия уже приведены к умолчаниям роли.
          </div>
        )}
      </section>

      <section className="usec">
        <div className="usec__head"><span className="usec__title">Полномочия</span></div>

        <Полномочие
          заголовок="Право решения по рекомендациям"
          подсказка="Кнопки «Принять», «Отклонить» и «Требует уточнения» в карточке. Без него карточка открывается целиком, вместе с нормативом ответа, — не хватает только кнопок."
          включено={черновик.canDecide}
          применимо={заказчик}
          почемуНет="Решение по рекомендации принимает Заказчик."
          disabled={идёт}
          onChange={(v) => setЧерновик((ч) => ({ ...ч, canDecide: v }))}
        />
        <Полномочие
          заголовок="Только свои рекомендации"
          подсказка="Реестр и счётчики показывают то, где человек — ответственный Исполнителя или автор. Так работает эксперт: рекомендация именная."
          включено={черновик.onlyOwn}
          применимо={исполнитель && !!роль?.hasRecs}
          почемуНет={роль?.hasRecs
            ? 'Рекомендации ведёт Исполнитель.'
            : 'Задач по рекомендациям у этой роли не бывает.'}
          disabled={идёт}
          onChange={(v) => setЧерновик((ч) => ({ ...ч, onlyOwn: v }))}
        />
        <Полномочие
          заголовок="Правка экономической модели"
          подсказка="Цена нефти, коэффициент эксплуатации, ставки по месторождениям и НДПИ. Ставки идут в расчёт денег по договору, поэтому полномочие отдельное — из роли оно не следует."
          включено={черновик.canEditEconomy}
          применимо
          disabled={идёт}
          onChange={(v) => setЧерновик((ч) => ({ ...ч, canEditEconomy: v }))}
        />
      </section>

      {роль?.hasRecs && (
        <section className="usec">
          <div className="usec__head">
            <span className="usec__title">Зона ответственности</span>
            <span className="usec__aside">
              <ВЗоне
                n={user.recCount}
                всё={исходное.fields.length === 0}
                устарел={!одинаково(черновик.fields, исходное.fields)}
              />
            </span>
          </div>
          <Зона
            выбрано={черновик.fields}
            поля={поля}
            disabled={идёт}
            onChange={(next) => setЧерновик((ч) => ({ ...ч, fields: [...next].sort((a, b) => a - b) }))}
          />
        </section>
      )}

      {ошибка && <div className="uerror">{ошибка}</div>}

      {/* Полоса сохранения появляется только когда есть что сохранять: пустая
          строка с погашенной кнопкой внизу каждой карточки — шум, который
          перестают замечать ровно тогда, когда он что-то значит. */}
      <AnimatePresence>
        {грязно && (
          <motion.div
            className="usave"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            <span className="usave__what">
              Не сохранено: {изменения.join(', ')}
            </span>
            <button type="button" className="btn btn--small" disabled={идёт}
              onClick={() => setЧерновик(снимок(user))}>
              Отменить
            </button>
            <button type="button" className="btn btn--accent btn--small" disabled={идёт}
              onClick={() => сохранить()}>
              {идёт ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Полномочие({
  заголовок, подсказка, включено, применимо, почемуНет, disabled, onChange,
}: {
  заголовок: string;
  подсказка: string;
  включено: boolean;
  применимо: boolean;
  почемуНет?: string;
  disabled: boolean;
  onChange: (значение: boolean) => void;
}) {
  return (
    <div className={`perm${применимо ? '' : ' perm--na'}`}>
      <div>
        <div className="perm__title">{заголовок}</div>
        <div className="perm__hint">{применимо ? подсказка : почемуНет}</div>
      </div>
      <Switch
        checked={применимо && включено}
        disabled={disabled || !применимо}
        aria-label={заголовок}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function Зона({
  выбрано, поля, disabled, onChange,
}: {
  выбрано: number[]; поля: Месторождение[]; disabled: boolean;
  onChange: (следующее: number[]) => void;
}) {
  return (
    <>
      {выбрано.length === 0 && (
        <div className="zone__all">
          <Icon id="check" />
          Зона не задана — человек видит все объекты договора.
        </div>
      )}

      <div className="zone__chips">
        {поля.map((f) => {
          const отмечено = выбрано.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              className={`chip${отмечено ? ' is-on' : ''}`}
              disabled={disabled}
              aria-pressed={отмечено}
              onClick={() => onChange(отмечено
                ? выбрано.filter((x) => x !== f.id)
                : [...выбрано, f.id])}
            >
              {f.name}
              <span className="chip__n">{f.wells}</span>
            </button>
          );
        })}
      </div>

      <div className="usec__hint">
        Число рядом с названием — сколько там скважин. Зона не фильтр, который
        можно снять: от неё считаются строки реестра, плитки и счётчики в
        отборе по колонкам.
      </div>

      {выбрано.length > 0 && (
        <div>
          <button type="button" className="btn btn--ghost btn--small"
            disabled={disabled} onClick={() => onChange([])}>
            Снять зону — все объекты договора
          </button>
        </div>
      )}
    </>
  );
}

/** Счётчик рекомендаций в зоне. Показывает сохранённое состояние: пока зону
 *  правят, пересчитать его нечем — граница видимости считается в базе. Поэтому
 *  при несохранённой правке он честно помечается устаревшим, а не показывает
 *  число, которого сейчас нет ни у кого. */
function ВЗоне({ n, всё, устарел }: { n: number; всё: boolean; устарел: boolean }) {
  return (
    <span className={`zone__count${устарел ? ' zone__count--stale' : ''}`}>
      {устарел
        ? 'пересчитается после сохранения'
        : <>{всё ? 'видит' : 'в зоне'} <b><CountingNumber value={n} /></b></>}
    </span>
  );
}

/* Перехват ухода с несохранёнными изменениями.
 *
 * Список слева — обычные ссылки, отрисованные сервером, и перехватывать их
 * приходится на документе: сделать список клиентским ради одного условия
 * значило бы тащить в браузер весь его состав ради строчки логики.
 * Перезагрузку и закрытие вкладки ловит beforeunload — там свой диалог
 * браузера, и заменить его нечем. */
function УходСоСтраницы({
  грязно, идёт, сохранить,
}: {
  грязно: boolean; идёт: boolean; сохранить: (после?: () => void) => void;
}) {
  const [куда, setКуда] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!грязно) return undefined;

    const перехват = (e: MouseEvent) => {
      const ссылка = (e.target as HTMLElement | null)?.closest?.('a.uitem') as HTMLAnchorElement | null;
      if (!ссылка || e.metaKey || e.ctrlKey || e.button !== 0) return;
      e.preventDefault();
      setКуда(ссылка.href);
    };
    const закрытие = (e: BeforeUnloadEvent) => { e.preventDefault(); };

    document.addEventListener('click', перехват, true);
    window.addEventListener('beforeunload', закрытие);
    return () => {
      document.removeEventListener('click', перехват, true);
      window.removeEventListener('beforeunload', закрытие);
    };
  }, [грязно]);

  const уйти = () => { if (куда) window.location.href = куда; };

  return (
    <ActionDialog
      title="Изменения не сохранены"
      open={куда !== null}
      onOpenChange={(о) => { if (!о) setКуда(null); }}
    >
      <div className="login__form">
        <div className="usec__hint">
          Роль, полномочия или зона изменены и ещё не применены. Что сделать
          перед переходом к другому пользователю?
        </div>
        <button type="button" className="btn btn--accent btn--main login__submit"
          disabled={идёт} onClick={() => сохранить(уйти)}>
          Сохранить и перейти
        </button>
        <button type="button" className="btn" disabled={идёт} onClick={уйти}>
          Уйти без сохранения
        </button>
      </div>
    </ActionDialog>
  );
}

/* ------------------------------ доступ ------------------------------ */

export function Доступ({ user, этоЯ }: { user: КарточкаПользователя; этоЯ: boolean }) {
  const [идёт, начать] = React.useTransition();
  const [ошибка, setОшибка] = React.useState<string | null>(null);
  const [окно, setОкно] = React.useState(false);
  const [пароль, setПароль] = React.useState('');
  const router = useRouter();

  const действие = (что: () => Promise<{ ошибка?: string }>) => {
    setОшибка(null);
    начать(async () => {
      const ответ = await что();
      if (ответ.ошибка) setОшибка(ответ.ошибка);
      router.refresh();
    });
  };

  return (
    <>
      <div className="access__row">
        <span>Вход в модуль</span>
        <span className="access__val">{user.hasPassword ? 'по паролю' : 'из ВМАП'}</span>
      </div>
      <div className="access__row">
        <span>Последний вход</span>
        <span className="access__val">
          {user.lastLoginAt
            ? new Date(user.lastLoginAt).toLocaleString('ru-RU',
              { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'не входил'}
        </span>
      </div>

      <div className="usec__hint">
        Пароль — временная мера: в рабочем контуре человек приходит из ВМАП уже
        опознанным. Кнопки ниже срабатывают сразу, без сохранения.
      </div>

      <div className="access__btns">
        <ActionDialog
          title={user.hasPassword ? 'Сменить пароль' : 'Задать пароль'}
          open={окно}
          onOpenChange={(о) => { setОкно(о); setПароль(''); }}
          trigger={(
            <button type="button" className="btn btn--small" disabled={идёт}>
              {user.hasPassword ? 'Сменить пароль' : 'Задать пароль'}
            </button>
          )}
        >
          <div className="login__form">
            <label className="login__label" htmlFor="newpass">
              Пароль для {user.fullName}
            </label>
            <div className="field login__field">
              <input
                id="newpass" type="password" autoComplete="new-password"
                value={пароль} onChange={(e) => setПароль(e.target.value)}
              />
            </div>
            <div className="usec__hint">
              Не короче восьми символов. Пароль передаёте человеку вы — модуль
              его не показывает и не пересылает.
            </div>
            <button
              type="button" className="btn btn--accent btn--main login__submit"
              disabled={идёт}
              onClick={() => действие(async () => {
                const ответ = await задатьПароль(user.id, пароль);
                if (!ответ.ошибка) { setОкно(false); setПароль(''); }
                return ответ;
              })}
            >
              Задать
            </button>
          </div>
        </ActionDialog>

        {user.hasPassword && (
          <button type="button" className="btn btn--small" disabled={идёт}
            onClick={() => действие(() => снятьПароль(user.id))}>
            Снять пароль
          </button>
        )}

        {/* Себя отключить нельзя: администратор остался бы без входа, а вернуть
            его было бы некому. Действие это тоже проверяет — здесь кнопки
            просто нет, чтобы не предлагать заведомо отказ. */}
        {!этоЯ && (
          <button type="button" className="btn btn--small" disabled={идёт}
            onClick={() => действие(() => переключитьДоступ(user.id, !user.isActive))}>
            {user.isActive ? 'Отключить доступ' : 'Включить доступ'}
          </button>
        )}
      </div>

      {ошибка && <div className="uerror">{ошибка}</div>}
    </>
  );
}

/* ------------------------------ новый пользователь ------------------------------ */

export function ДобавитьПользователя({ роли }: { роли: РольСправочник[] }) {
  const [окно, setОкно] = React.useState(false);
  const [идёт, начать] = React.useTransition();
  const [ошибка, setОшибка] = React.useState<string | null>(null);
  const router = useRouter();

  return (
    <ActionDialog
      title="Новый пользователь"
      open={окно}
      onOpenChange={(о) => { setОкно(о); setОшибка(null); }}
      trigger={<button type="button" className="btn btn--accent btn--main">Добавить</button>}
    >
      <form
        className="login__form"
        action={(форма) => начать(async () => {
          const ответ = await добавитьПользователя(форма);
          if (ответ.ошибка) { setОшибка(ответ.ошибка); return; }
          setОкно(false);
          router.refresh();
        })}
      >
        {ошибка && <div className="uerror">{ошибка}</div>}

        <label className="login__label" htmlFor="nu-login">Логин учётной записи ВМАП</label>
        <div className="field login__field"><input id="nu-login" name="login" required /></div>

        <label className="login__label" htmlFor="nu-name">Фамилия и инициалы</label>
        <div className="field login__field">
          <input id="nu-name" name="fullName" placeholder="Иванов И.И." required />
        </div>

        <label className="login__label" htmlFor="nu-pos">Должность</label>
        <div className="field login__field"><input id="nu-pos" name="position" /></div>

        <label className="login__label" htmlFor="nu-role">Роль</label>
        <Select
          id="nu-role"
          name="role"
          options={роли.map((r) => ({
            value: r.key,
            label: r.label,
            note: r.side === 'executor' ? 'Исполнитель' : 'Заказчик',
          }))}
          required
        />

        <div className="usec__hint">
          Зона и полномочия задаются после в карточке; пароль по умолчанию не
          заводится — человек приходит из ВМАП.
        </div>

        <button type="submit" className="btn btn--accent btn--main login__submit" disabled={идёт}>
          Завести
        </button>
      </form>
    </ActionDialog>
  );
}
