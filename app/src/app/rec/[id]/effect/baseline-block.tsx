/* Блок базы на вкладке «Расчёт эффекта»: действующие значения, спор о них и
 * его разбор.
 *
 * Отдельным файлом и одним компонентом на два места страницы: база показывается
 * и когда окно эффекта уже идёт, и когда его ещё нет (после согласования база
 * уже внесена, а считать пока нечего). Раньше эти два места рисовали базу
 * по-разному, и любая правка требовала помнить про оба.
 *
 * Кто что делает: базу вносит Исполнитель при регистрации, Заказчик вправе
 * подать свою версию с обоснованием, разбирает возражение снова Исполнитель.
 * Тот же круг, что у даты реализации, и по той же причине: величину определяет
 * одна сторона, а принимать по ней эффект — другой.
 *
 * Формы — окном поверх карточки; сами окна и их состояние лежат в
 * `baseline-forms.tsx` с 'use client'. Здесь остаётся серверная часть: что
 * показывать, кому и с какими значениями, плюс справка по замерам, которую
 * окна получают готовой разметкой.
 */

import { Suspense } from 'react';
import { getBaseline, type Card, type CardBaseline } from '@/db/card';
import type { SessionUser } from '@/lib/session';
import { measuredBaseline } from '@/services/baseline';
import { BASELINE_DAYS } from '@/domain/baseline';
import { дата, число, прирост } from '@/lib/format';
import { ОкноВозражения, ОкноПринятия, ОкноОтклонения } from './baseline-forms';

/* Статусы, на которых базу можно оспорить. Дублируется с actions.ts намеренно:
   здесь список решает, показывать ли кнопку, там — пускать ли операцию, и
   вторая проверка обязана существовать независимо от первой. */
const СТАТУСЫ_СПОРА = new Set(['approved', 'windowOpen']);

const ИСТОЧНИК_БАЗЫ: Record<string, string> = {
  manual: 'Внесена вручную',
  measured: 'Посчитана по замерам',
  disputed: 'Предложена Заказчиком в споре',
};

export async function БлокБазы({ card, user, заголовок, форма }: {
  card: Card;
  user: SessionUser | null;
  заголовок: string;
  /** Окно из адреса (`?form=`): задаёт начальную открытость. */
  форма?: string;
}) {
  const спор = card.disputes.find((d) => d.subject === 'baseline') ?? null;
  const открытый = спор && спор.state === 'open' ? спор : null;
  const предложенная = спор?.proposedBaselineId ? await getBaseline(спор.proposedBaselineId) : null;

  const заказчик = user?.side === 'customer';
  const исполнитель = user?.side === 'executor';
  const окноЗакрыто = Boolean(card.implementation?.closedAt);
  /* Открытый спор — единственное, что мешает подать возражение снова: после
     разбора Заказчик вправе вернуться к базе, пока окно не закрыто. Тот же
     набор условий проверяется в actions.ts независимо. */
  const можноОспорить = Boolean(card.baseline) && СТАТУСЫ_СПОРА.has(card.status)
    && !окноЗакрыто && !открытый;

  return (
    <section>
      <div className="eff__h">{заголовок}</div>

      {card.baseline ? (
        <>
          <div className="eff-base">
            <ЯчейкаБазы k="Дебит жидкости" v={card.baseline.baseQzh} ед="м³/сут" />
            <ЯчейкаБазы k="Дебит нефти" v={card.baseline.baseQn} ед="т/сут" />
            <ЯчейкаБазы k="Энергопотребление" v={card.baseline.baseEe} ед="кВт·ч/сут" знаков={0} />
          </div>
          <div className="eff__note" style={{ marginTop: 'var(--item-gap-vertical-s)' }}>
            {ИСТОЧНИК_БАЗЫ[card.baseline.source]}
            {card.baseline.periodFrom && ` за период ${дата(card.baseline.periodFrom)} — ${дата(card.baseline.periodTo)}`}
            {`; внесена ${card.baseline.authorName}, ${дата(card.baseline.createdAt, true)}.`}
            {card.baseline.note && ` ${card.baseline.note}`}
          </div>
        </>
      ) : (
        <div className="block__b">
          База не задана. Прирост считать не от чего — вводится Исполнителем при регистрации.
        </div>
      )}

      {открытый ? (
        <div className="alertbox" style={{ marginTop: 'var(--group-gap-m)' }}>
          <div className="alertbox__h">База оспорена Заказчиком</div>
          <div className="alertbox__m">
            {открытый.openedByName}, {дата(открытый.openedAt, true)}
          </div>
          <div className="alertbox__b">{открытый.reason}</div>
          {предложенная && (
            <ТаблицаСпора было={card.baseline} стало={предложенная}
                          подписьБыло="Действующая" подписьСтало="Предложена Заказчиком" />
          )}
          {/* Расчёт по предложенной базе здесь не показывается намеренно: пока
              спор открыт, действующей остаётся принятая база, и два итога рядом
              читались бы как «выбери, какой нравится». */}
          <div className="alertbox__m">
            Пока спор не разобран, эффект считается по действующей базе, а итог помечен
            предварительным. Окно при этом не останавливается.
          </div>

          {исполнитель ? (
            /* Кнопка и окно — одно целое: окно стоит здесь же закрытым и
               открывается мгновенно, без похода на сервер. */
            <div className="form__btns">
              {предложенная && (
                <ОкноПринятия recId={card.id} disputeId={открытый.id}
                              справка={<Справка card={card} />}
                              стартОткрыто={форма === 'baseAccept'} />
              )}
              <ОкноОтклонения recId={card.id} disputeId={открытый.id}
                              справка={<Справка card={card} />}
                              стартОткрыто={форма === 'baseDecline'} />
              <span className="form__note">Действие Исполнителя</span>
            </div>
          ) : (
            <div className="form__hint">
              Возражение разбирает Исполнитель: базу вносил он, и объяснять расхождение ему.
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Разобранный спор остаётся в карточке навсегда: по нему видно, почему
              прирост считается от этих значений, а не от тех, что называл Заказчик. */}
          {спор && (
            <div className="block block--quiet" style={{ marginTop: 'var(--group-gap-m)' }}>
              <div className="block__h">Спор о базовых значениях</div>
              <div className="block__b">{спор.reason}</div>
              {предложенная && (
                /* После принятия предложенная версия САМА стала действующей, и
                   сравнивать её с действующей значило бы сравнивать её с собой:
                   получалась строка «29,7 против 29,7, разница 0». Сравниваем с
                   замещённой — с тем, что было до спора. */
                <ТаблицаСпора
                  было={спор.state === 'accepted' ? замещённая(card, предложенная) : card.baseline}
                  стало={предложенная}
                  подписьБыло={спор.state === 'accepted' ? 'Была до спора' : 'Действующая'}
                  подписьСтало={спор.state === 'accepted' ? 'Принята' : 'Предложена и отклонена'} />
              )}
              <div className="alertbox__m">
                {дата(спор.openedAt, true)}, {спор.openedByName} — {спор.state === 'accepted'
                  ? `база заменена предложенной, эффект пересчитан ${дата(спор.resolvedAt, true)}`
                  : `возражение отклонено ${дата(спор.resolvedAt, true)}${спор.resolutionNote ? `: ${спор.resolutionNote}` : ''}`}
              </div>
            </div>
          )}

          {заказчик && можноОспорить && card.baseline && (
            <div className="form__btns" style={{ marginTop: 'var(--group-gap-m)' }}>
              <ОкноВозражения
                recId={card.id}
                значения={{
                  qzh: дляВвода(card.baseline.baseQzh),
                  qn: дляВвода(card.baseline.baseQn),
                  ee: дляВвода(card.baseline.baseEe),
                }}
                справка={<Справка card={card} />}
                стартОткрыто={форма === 'baseDispute'} />
              <span className="form__note">Действие Заказчика</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ------------------------------ показ значений ------------------------------ */

function ЯчейкаБазы({ k, v, ед, знаков = 1 }: {
  k: string; v: number | null; ед: string; знаков?: number;
}) {
  return (
    <div className="eff-base__i">
      <span className="eff-base__k">{k}</span>
      <span className="eff-base__v">{число(v, знаков)}<small>{ед}</small></span>
    </div>
  );
}

function ТаблицаСпора({ было, стало, подписьБыло, подписьСтало }: {
  было: CardBaseline | null;
  стало: CardBaseline;
  подписьБыло: string;
  подписьСтало: string;
}) {
  return (
    <table className="eff-tbl" style={{ marginTop: 'var(--group-gap-s)' }}>
      <thead>
        <tr>
          <th>Показатель</th>
          <th className="num">{подписьБыло}</th>
          <th className="num">{подписьСтало}</th>
          <th className="num">Разница</th>
        </tr>
      </thead>
      <tbody>
        <СтрокаСпора k="Дебит жидкости, м³/сут" было={было?.baseQzh ?? null} стало={стало.baseQzh} />
        <СтрокаСпора k="Дебит нефти, т/сут" было={было?.baseQn ?? null} стало={стало.baseQn} />
        <СтрокаСпора k="Энергопотребление, кВт·ч/сут" было={было?.baseEe ?? null} стало={стало.baseEe} знаков={0} />
      </tbody>
    </table>
  );
}

/* Версия, которую заменила принятая: ближайшая более ранняя из замещённых.
   Связи «этот спор заместил эту версию» в схеме нет, но порядок версий её
   заменяет — спор всегда замещает ту базу, что действовала на момент подачи. */
function замещённая(card: Card, принятая: CardBaseline): CardBaseline | null {
  return card.baselines.find((b) => b.status === 'superseded' && b.id < принятая.id) ?? null;
}

function СтрокаСпора({ k, было, стало, знаков = 1 }: {
  k: string; было: number | null; стало: number | null; знаков?: number;
}) {
  const разница = было !== null && стало !== null ? стало - было : null;
  return (
    <tr>
      <td>{k}</td>
      <td className="num">{число(было, знаков)}</td>
      <td className="num">{число(стало, знаков)}</td>
      <td className="num">{прирост(разница, знаков)}</td>
    </tr>
  );
}

/* Значение в поле ввода — с той точностью, что лежит в базе, но с запятой:
   округлить до вида карточки нельзя, иначе Заказчик, ничего не меняя, сдвинул
   бы базу самим фактом открытия формы. Запятая — потому что интерфейс русский,
   а сервер принимает оба разделителя. */
const дляВвода = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));

/* ------------------------------ справка по замерам ------------------------------ */

/**
 * База, посчитанная договорным способом — средневзвешенные за трое суток до
 * регистрации.
 *
 * Показывается ОБЕИМ сторонам одинаково: и Заказчику при подаче возражения, и
 * Исполнителю при разборе. Асимметрия превратила бы справку в подсказку одной
 * стороне; в одинаковом виде это просто общий факт — способ прописан в
 * Приложении № 2 договора, и цифру по нему может получить каждый.
 *
 * Стенд ВМАП чужой и может не ответить: тогда справки просто нет, окно
 * действия от этого не должно ломаться.
 */
async function СправкаПоЗамерам({ card }: { card: Card }) {
  if (card.wellId === null || !card.registeredAt) return null;

  const b = await measuredBaseline({ wellId: card.wellId, until: card.registeredAt })
    .catch(() => null);
  if (!b) return null;

  return (
    <div className="form__hint" style={{ marginTop: 'var(--item-gap-vertical-s)' }}>
      Справочно, договорный способ (Приложение № 2): средневзвешенные за {BASELINE_DAYS} суток
      до регистрации, {дата(b.periodFrom)} — {дата(b.periodTo)} —{' '}
      {b.usedDays === 0
        ? 'кондиционных суток в периоде не нашлось, посчитать нечем.'
        : <>Qж <b>{число(b.baseQzh)}</b> м³/сут, Qн <b>{число(b.baseQn, 2)}</b> т/сут
            {' '}по {b.usedDays} из {BASELINE_DAYS} суток.</>}
    </div>
  );
}


/* Справка в Suspense: окна теперь стоят в разметке всегда, а не появляются по
   переходу, и без границы поход на стенд ВМАП задерживал бы всю вкладку —
   ради текста внутри закрытого окна. Пустой fallback: у закрытого окна
   показывать нечего, а к открытию справка обычно уже здесь. */
function Справка({ card }: { card: Card }) {
  return (
    <Suspense fallback={null}>
      <СправкаПоЗамерам card={card} />
    </Suspense>
  );
}
