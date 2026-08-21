'use client';

/* Управляющие элементы экрана прав.
 *
 * Клиентскими сделаны ровно те места, где нужен обработчик: поиск в списке,
 * выбор роли, переключатели полномочий, чипы зоны и два окна. Вся остальная
 * разметка карточки приходит с сервера.
 *
 * Общий приём у всех: изменение уходит в серверное действие сразу, без кнопки
 * «Сохранить», а на время запроса элемент гаснет через `useTransition`.
 * Ответ с ошибкой показывается тут же, рядом с элементом, — не тостом поверх
 * экрана: человек смотрит на переключатель, который только что тронул.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/Switch';
import { Select } from '@/components/ui/Select';
import { ActionDialog } from '@/components/ui/ActionDialog';
import { CountingNumber } from '@/components/animate-ui/primitives/animate/counting-number';
import { Icon } from '@/components/Icons';
import type { КарточкаПользователя, РольСправочник, Месторождение } from '@/db/users';
import {
  сменитьРоль, переключитьПолномочие, задатьЗону, переключитьДоступ,
  задатьПароль, снятьПароль, добавитьПользователя, type Полномочие,
} from './actions';

/* ------------------------------ поиск по списку ------------------------------ */

export function ПоискПоСписку({ children }: { children: React.ReactNode }) {
  const [строка, setСтрока] = React.useState('');
  const низ = строка.trim().toLowerCase();

  /* Фильтруется готовая серверная разметка: у каждой строки списка стоит
     data-search с именем, логином и ролью. Так поиск не требует второй копии
     данных на клиенте и не расходится с тем, что нарисовано. */
  const обёртка = React.useRef<HTMLDivElement>(null);
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
          />
        </div>
      </div>
      <div className="ulist__scroll" ref={обёртка}>{children}</div>
    </>
  );
}

/* ------------------------------ роль ------------------------------ */

export function ВыборРоли({ user, роли }: { user: КарточкаПользователя; роли: РольСправочник[] }) {
  const [идёт, начать] = React.useTransition();
  const [ошибка, setОшибка] = React.useState<string | null>(null);
  const [выбрана, setВыбрана] = React.useState(user.role);
  const router = useRouter();

  /* Пояснение меняется сразу при выборе, до ответа сервера: оно объясняет
     последствие, и показывать его после применения — поздно. */
  const роль = роли.find((r) => r.key === выбрана) ?? роли[0];
  const меняетСторону = роль && роль.side !== user.side;

  return (
    <>
      <Select
        options={роли.map((r) => ({
          value: r.key,
          label: r.label,
          note: r.side === 'executor' ? 'Исполнитель' : 'Заказчик',
        }))}
        defaultValue={user.role}
        disabled={идёт}
        onValueChange={(next) => {
          setВыбрана(next);
          setОшибка(null);
          начать(async () => {
            const ответ = await сменитьРоль(user.id, next);
            if (ответ.ошибка) { setОшибка(ответ.ошибка); setВыбрана(user.role); }
            router.refresh();
          });
        }}
      />
      <div className="usec__hint">{роль?.note}</div>
      {меняетСторону && (
        <div className="usec__hint">
          Сторона договора станет «{роль.side === 'executor' ? 'Исполнитель' : 'Заказчик'}»:
          это другой набор действий, а не другой объём прав. Полномочия вернутся к умолчаниям роли.
        </div>
      )}
      {ошибка && <div className="uerror">{ошибка}</div>}
    </>
  );
}

/* ------------------------------ полномочия ------------------------------ */

export function Полномочия({ user }: { user: КарточкаПользователя }) {
  return (
    <>
      <Полномочие
        user={user} что="decide" включено={user.canDecide}
        заголовок="Право решения по рекомендациям"
        подсказка="Кнопки «Принять», «Отклонить» и «Требует уточнения» в карточке. Без него карточка открывается целиком, вместе с нормативом ответа, — не хватает только кнопок."
        применимо={user.side === 'customer'}
        почемуНет="Решение по рекомендации принимает Заказчик."
      />
      <Полномочие
        user={user} что="onlyOwn" включено={user.onlyOwn}
        заголовок="Только свои рекомендации"
        подсказка="Реестр и счётчики показывают то, где человек — ответственный Исполнителя или автор. Так работает эксперт: рекомендация именная."
        применимо={user.side === 'executor' && user.hasRecs}
        почемуНет={user.hasRecs
          ? 'Рекомендации ведёт Исполнитель.'
          : 'Задач по рекомендациям у этой роли не бывает.'}
      />
      <Полномочие
        user={user} что="economy" включено={user.canEditEconomy}
        заголовок="Правка экономической модели"
        подсказка="Цена нефти, коэффициент эксплуатации, ставки по месторождениям и НДПИ. Ставки идут в расчёт денег по договору, поэтому полномочие отдельное — из роли оно не следует."
        применимо
      />
    </>
  );
}

function Полномочие({
  user, что, включено, заголовок, подсказка, применимо, почемуНет,
}: {
  user: КарточкаПользователя;
  что: Полномочие;
  включено: boolean;
  заголовок: string;
  подсказка: string;
  применимо: boolean;
  почемуНет?: string;
}) {
  const [идёт, начать] = React.useTransition();
  const [ошибка, setОшибка] = React.useState<string | null>(null);
  const [состояние, setСостояние] = React.useState(включено);
  const router = useRouter();

  React.useEffect(() => { setСостояние(включено); }, [включено]);

  return (
    <div className={`perm${применимо ? '' : ' perm--na'}`}>
      <div>
        <div className="perm__title">{заголовок}</div>
        <div className="perm__hint">{применимо ? подсказка : почемуНет}</div>
        {ошибка && <div className="uerror">{ошибка}</div>}
      </div>
      <Switch
        checked={состояние}
        disabled={идёт || !применимо}
        aria-label={заголовок}
        onCheckedChange={(next) => {
          /* Переключатель встаёт в новое положение сразу, не дожидаясь
             ответа: иначе он «залипает» на время запроса и кажется сломанным.
             При отказе возвращается назад вместе с сообщением. */
          setСостояние(next);
          setОшибка(null);
          начать(async () => {
            const ответ = await переключитьПолномочие(user.id, что, next);
            if (ответ.ошибка) { setОшибка(ответ.ошибка); setСостояние(!next); }
            router.refresh();
          });
        }}
      />
    </div>
  );
}

/* ------------------------------ зона ответственности ------------------------------ */

export function Зона({
  user, поля,
}: {
  user: КарточкаПользователя; поля: Месторождение[];
}) {
  const [идёт, начать] = React.useTransition();
  const [ошибка, setОшибка] = React.useState<string | null>(null);
  const [выбрано, setВыбрано] = React.useState<number[]>(user.fields);
  const router = useRouter();

  React.useEffect(() => { setВыбрано(user.fields); }, [user.fields]);

  const применить = (следующее: number[]) => {
    setВыбрано(следующее);
    setОшибка(null);
    начать(async () => {
      const ответ = await задатьЗону(user.id, следующее);
      if (ответ.ошибка) { setОшибка(ответ.ошибка); setВыбрано(user.fields); }
      router.refresh();
    });
  };

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
              disabled={идёт}
              aria-pressed={отмечено}
              onClick={() => применить(отмечено
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
            disabled={идёт} onClick={() => применить([])}>
            Снять зону — все объекты договора
          </button>
        </div>
      )}

      {ошибка && <div className="uerror">{ошибка}</div>}
    </>
  );
}

/** Счётчик рекомендаций в зоне. Отдельным компонентом ради анимации числа:
 *  оно меняется при каждом щелчке по месторождению, и скачок без движения
 *  читается как перерисовка всей карточки. */
export function ВЗоне({ n, всё }: { n: number; всё: boolean }) {
  return (
    <span className="zone__count">
      {/* «В зоне» при пустой зоне было бы неправдой: зоны нет, а число есть —
          это всё, что человеку видно. */}
      {всё ? 'видит' : 'в зоне'} <b><CountingNumber value={n} /></b>
    </span>
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
        опознанным.
      </div>

      <div style={{ display: 'flex', gap: 'var(--item-gap-horizontal-m)', flexWrap: 'wrap' }}>
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
              Не короче восьми символов. Пароль передаётся человеку вами — модуль
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

        {/* Себя отключить нельзя: администратор остался бы без входа, а
            вернуть его было бы некому. Действие это тоже проверяет — здесь
            кнопки просто нет, чтобы не предлагать заведомо отказ. */}
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
