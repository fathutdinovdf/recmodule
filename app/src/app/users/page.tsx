/* Экран «Пользователи и роли».
 *
 * Отвечает на один вопрос: что человек увидит, открыв модуль, и что сможет по
 * увиденному сделать. Отсюда состав карточки — роль, три полномочия и зона, а
 * не список галочек по каждому действию.
 *
 * Выбранный пользователь живёт в адресе (`?u=login`), а не в состоянии
 * клиента. Так на человека можно дать ссылку, «назад» возвращает к предыдущему,
 * а журнал доступа читается с сервера ровно для того, кого смотрят, — не для
 * всех сразу про запас.
 */

import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { пользователи, ролиСправочник, месторождения, журналДоступа } from '@/db/users';
import {
  ПоискПоСписку, КарточкаПрав, Доступ, ДобавитьПользователя, СвойСкролл,
} from './controls';
import './users.css';

export const dynamic = 'force-dynamic';

const инициалы = (имя: string) => {
  const части = имя.split(' ');
  return ((части[0]?.[0] ?? '') + (части[1]?.[0] ?? '')).toUpperCase();
};

const дата = (d: Date) => new Date(d).toLocaleString('ru-RU',
  { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const я = await currentUser();
  /* Прав здесь не «меньше кнопок», а нет самого экрана: показывать чужие
     полномочия тому, кто их не выдаёт, незачем. */
  if (я?.role !== 'admin') redirect('/');

  const [список, роли, поля, { u }] = await Promise.all([
    пользователи(), ролиСправочник(), месторождения(), searchParams,
  ]);

  const выбран = список.find((x) => x.login === u) ?? список[0];
  const журнал = выбран ? await журналДоступа(выбран.id) : [];

  /* Администратор вынесен из стороны договора в свою группу: по стороне он
     Исполнитель, но рекомендаций у него нет, и в списке экспертов АКЭ он
     читается как эксперт, который почему-то ничего не ведёт. */
  const группы = [
    {
      key: 'executor',
      title: 'Исполнитель — АКЭ',
      люди: список.filter((x) => x.side === 'executor' && x.hasRecs),
    },
    { key: 'customer', title: 'Заказчик', люди: список.filter((x) => x.side === 'customer') },
    { key: 'admin', title: 'Администрирование', люди: список.filter((x) => !x.hasRecs) },
  ].filter((г) => г.люди.length > 0);

  return (
    <main className="content">
      <div className="pagehead">
        <h1>Пользователи и роли</h1>
        <span className="pagehead__zone">
          всего <b>{список.length}</b>, из них без входа{' '}
          <b>{список.filter((x) => !x.isActive).length}</b>
        </span>
        <div className="pagehead__actions"><ДобавитьПользователя роли={роли} /></div>
      </div>

      <div className="users">
        <nav className="panel ulist">
          <ПоискПоСписку>
            {группы.map((г) => (
              <div key={г.key}>
                <div className="ulist__group" data-group={г.key}>{г.title}</div>
                {г.люди.map((ч) => (
                  <a
                    key={ч.login}
                    className={`uitem${ч.login === выбран?.login ? ' is-active' : ''}${ч.isActive ? '' : ' uitem--off'}`}
                    href={`/users?u=${encodeURIComponent(ч.login)}`}
                    data-in={г.key}
                    data-search={`${ч.fullName} ${ч.login} ${ч.roleLabel}`.toLowerCase()}
                  >
                    <span className={`uitem__ava${ч.side === 'executor' ? ' uitem__ava--executor' : ''}`}>
                      {инициалы(ч.fullName)}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="uitem__name">{ч.fullName}</span>
                      <span className="uitem__role" style={{ display: 'block' }}>
                        {ч.isActive ? ч.roleLabel : 'доступ отключён'}
                      </span>
                    </span>
                    {/* Рекомендаций у администратора не бывает (решение 82) —
                        нулю в его строке взяться неоткуда, и он бы врал. */}
                    {ч.hasRecs && <span className="uitem__n">{ч.recCount}</span>}
                  </a>
                ))}
              </div>
            ))}
          </ПоискПоСписку>
        </nav>

        <СвойСкролл className="panel ucard">
          {выбран && (
            <>
              <header className="ucard__head">
                <span className="ucard__ava">{инициалы(выбран.fullName)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="ucard__name">
                    {выбран.fullName}
                    {!выбран.isActive && <span className="tag">доступ отключён</span>}
                  </div>
                  <div className="ucard__sub">
                    {выбран.position ?? 'должность не указана'} · {выбран.login} ·{' '}
                    {выбран.side === 'executor' ? 'Исполнитель' : 'Заказчик'}
                  </div>
                </div>
              </header>

              <div className="ucard__body">
                <div className="ucol">
                  <КарточкаПрав user={выбран} роли={роли} поля={поля} />
                </div>

                <div className="ucol">
                  <section className="usec">
                    <div className="usec__head">
                      <span className="usec__title">Доступ</span>
                    </div>
                    <Доступ user={выбран} этоЯ={выбран.id === я.id} />
                  </section>

                  <section className="usec">
                    <div className="usec__head">
                      <span className="usec__title">История доступа</span>
                    </div>
                    {журнал.length === 0
                      ? <div className="usec__hint">Права этого человека ещё не меняли.</div>
                      : (
                        <СвойСкролл className="log">
                          {журнал.map((с) => (
                            <div className="log__item" key={с.id}>
                              <div className="log__when">{дата(с.at)} · {с.actor}</div>
                              <div className="log__what">{с.details}</div>
                            </div>
                          ))}
                        </СвойСкролл>
                      )}
                  </section>
                </div>
              </div>
            </>
          )}
        </СвойСкролл>
      </div>
    </main>
  );
}
