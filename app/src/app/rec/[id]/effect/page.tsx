/* Вкладка «Расчёт эффекта».
 *
 * Порядок блоков сверху вниз повторяет порядок вопросов, которые задают, глядя
 * на цифру эффекта: сколько получилось → от чего считали → сколько окна прошло
 * → как шёл факт против базы → из чего сложились деньги → покажи по суткам →
 * чему тут верить.
 *
 * Если посчитать нельзя, вкладка объясняет, чего не хватает. Пустой экран здесь
 * недопустим: примерно у трети фонда ставок нет, и «пусто» человек прочитает
 * как «эффекта нет», а не как «расчёт невозможен».
 */

import { notFound } from 'next/navigation';
import { Hint } from '@/components/ui/Hint';
import { getCard, type Card } from '@/db/card';
import { getEffect, WINDOW_DAYS, type EffectView } from '@/services/effect-store';
import { forecastTotal } from '@/domain/effect';
import { getWell } from '@/db/vmap';
import { currentUser, type SessionUser } from '@/lib/session';
import type { EffectDay } from '@/services/effect-window';
import { дата, рубли, сутки, число, прирост } from '@/lib/format';
import { БлокБазы } from './baseline-block';
import { СутРаскрытие } from './daily-collapsible';
import { ГрафикФакт } from './fact-chart';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  /* err больше не приходит: отказ валидации возвращается ответом действия
     и остаётся в открытом окне, не трогая адрес. */
  searchParams: Promise<{ form?: string }>;
}) {
  const { id } = await params;
  const { form } = await searchParams;
  /* Карточка и пользователь независимы — берём их одним заходом, а не
     цепочкой: сеть до базы одна и та же, а круговых задержек было две. */
  const [card, user] = await Promise.all([getCard(Number(id)), currentUser()]);
  if (!card) notFound();

  /* Расчёт и скважина тоже независимы: плотности нужны шкале прогноза, а не
     расчёту, и ждать их по очереди незачем. Расчёт — самый долгий запрос
     страницы, поэтому именно его стоит вести параллельно со всем остальным. */
  const [eff, скважина] = await Promise.all([
    getEffect(card),
    card.wellId === null ? null : getWell(card.wellId).catch(() => null),
  ]);
  if (!eff) return <ОкнаНет card={card} user={user} форма={form} />;

  const спорОДате = card.disputes.find((d) => d.subject === 'fact_date' && d.state === 'open');
  const спорОБазе = card.disputes.find((d) => d.subject === 'baseline' && d.state === 'open');

  /* Плотности берутся у скважины, а не из расчёта: расчёт закрытого окна
     приходит из кэша, где их нет, — а шкала прогноза нужна и там. Запрос
     дешёвый: getWell в cache(), оболочка карточки уже сходила за той же
     скважиной в этом же рендере. */
  const прогноз = forecastTotal(eff.economy, card.expectQzh, card.expectQn,
    скважина?.oilDensity ?? null, скважина?.waterDensity ?? null, WINDOW_DAYS);
  const считалисьДеньги = eff.days.some((d) => d.money !== null);
  const закрыто = card.implementation?.closedAt ?? null;

  return (
    <div className="eff">
      <section>
        {считалисьДеньги ? (
          <div className="eff-total">
            <div>
              <div className="eff-total__k">Накопленный эффект</div>
              <div className={`eff-total__v ${eff.total.total < 0 ? 'is-loss' : ''}`}>
                {рубли(eff.total.total)}<span className="eff-total__u">руб</span>
              </div>
            </div>
            <div className="eff-total__side">
              <span>
                <span className={`tag tag--${eff.isFinal ? 'ok' : 'warning'}`}>
                  {eff.isFinal ? 'окончательный' : 'предварительный'}
                </span>
              </span>
              <span className="eff__note">
                {eff.isFinal
                  ? `Окно закрыто ${дата(закрыто ?? eff.windowTo)}, расчёт зафиксирован ${дата(eff.calculatedAt, true)}.`
                  : спорОБазе || спорОДате
                    ? `Итог предварительный: спор ${спорОБазе ? 'о базовых значениях' : 'о дате реализации'} не закрыт — от него зависит, с чем и с какого дня сравнивать факт.`
                    : `Итог предварительный: окно эффекта идёт, посчитано ${сутки(eff.elapsedDays)} из ${WINDOW_DAYS}.`}
              </span>
            </div>
          </div>
        ) : (
          <ПочемуНеПосчитано problems={eff.problems} />
        )}
      </section>

      {считалисьДеньги && eff.problems.length > 0 && (
        <section><ПочемуНеПосчитано problems={eff.problems} частично /></section>
      )}

      <БлокБазы card={card} user={user} заголовок="База, от которой считается прирост"
                форма={form} />

      {/* Спор о дате целиком живёт на вкладке «Реализация» — и разбор, и
          справка о нём. Здесь он был вторым пересказом того же: на итог влияет
          признак «предварительный», а разбирать спор отсюда всё равно нельзя.
          В шапке карточки о нём говорит тег. */}

      <section>
        <div className="eff__h">Прогресс окна</div>
        <ПрогрессОкна eff={eff} прогноз={прогноз} закрыто={закрыто} />
      </section>

      <section>
        <div className="eff__h">Факт против базы</div>
        <div className="eff-charts">
          <ГрафикФакт days={eff.days} поле="factQzh" база={card.baseline?.baseQzh ?? null}
                      заголовок="Дебит жидкости, м³/сут" единица="м³/сут" />
          <ГрафикФакт days={eff.days} поле="factQn" база={card.baseline?.baseQn ?? null}
                      заголовок="Дебит нефти, т/сут" единица="т/сут" />
        </div>
      </section>

      {считалисьДеньги && eff.economy && (
        <section>
          <div className="eff__h">Статьи эффекта</div>
          <Статьи eff={eff} />
        </section>
      )}

      <section>
        <СутРаскрытие summary={`Посуточный расчёт — ${сутки(eff.daysTotal)}`}>
          <div className="eff-scroll">
            <ПосуточнаяТаблица days={eff.days} />
          </div>
        </СутРаскрытие>
      </section>

      <section>
        <div className="eff__h">Качество данных</div>
        <div className="eff-quality">
          <ЯчейкаКачества v={`${eff.daysWithData} из ${eff.daysTotal}`} k="суток с посчитанным дебитом" />
          <ЯчейкаКачества v={String(eff.daysCarried)} k="суток без своих замеров, значение протянуто" />
          <ЯчейкаКачества v={String(eff.daysTotal - eff.daysWithData)} k="суток без данных вовсе" />
          <ЯчейкаКачества
            v={`${число(среднееПокрытие(eff.days) * 100, 0)} %`}
            k="средняя опора суток на собственные замеры" />
        </div>
      </section>
    </div>
  );
}

/* ------------------------------ окна ещё нет ------------------------------ */

const БЕЗ_ОКНА: Record<string, string> = {
  draft: 'Это черновик: он ещё не зарегистрирован, и до окна эффекта ему далеко.',
  registered: 'Рекомендация зарегистрирована и ждёт передачи Заказчику.',
  sent: 'Рекомендация у Заказчика на рассмотрении.',
  review: 'Рекомендация у Заказчика на рассмотрении.',
  clarify: 'Заказчик запросил уточнение — круг ещё не закрыт.',
  approved: 'Заказчик согласовал мероприятие, но факт реализации ещё не зафиксирован.',
  rejected: 'Рекомендация отклонена Заказчиком — мероприятия не будет, считать нечего.',
  cancelled: 'Рекомендация отменена Исполнителем — мероприятия не будет, считать нечего.',
};

function ОкнаНет({ card, user, форма }: {
  card: Card; user: SessionUser | null; форма?: string;
}) {
  const мёртвая = card.status === 'rejected' || card.status === 'cancelled';
  return (
    <div className="eff">
      <div className="eff-gap">
        <div className="eff-gap__h">Расчёта пока нет</div>
        <div>{БЕЗ_ОКНА[card.status] ?? 'Окно эффекта по этой рекомендации не открыто.'}</div>
        {!мёртвая && (
          <div>
            Окно на {WINDOW_DAYS} суток открывается в тот момент, когда Исполнитель фиксирует
            факт реализации по телеметрии. С этого дня и начинается расчёт.
          </div>
        )}
      </div>

      {/* База показывается и до открытия окна — тем же блоком, что и после:
          она уже внесена, эффект будет считаться от неё, и спорить о ней
          разумнее до начала счёта, а не посреди него. */}
      {card.baseline && (
        <БлокБазы card={card} user={user} заголовок="База уже внесена"
                  форма={форма} />
      )}
    </div>
  );
}

function ПочемуНеПосчитано({ problems, частично }: { problems: string[]; частично?: boolean }) {
  return (
    <div className="eff-gap">
      <div className="eff-gap__h">
        {частично ? 'Расчёт неполный' : 'Эффект в деньгах посчитать не удалось'}
      </div>
      <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      {!частично && (
        <div>
          Деньги считаются, только когда известны оба прироста — и по жидкости, и по нефти:
          часть статей висит на жидкости, часть на нефти, и «половина расчёта» дала бы
          заниженный эффект, выданный за полный.
        </div>
      )}
    </div>
  );
}

/* ------------------------------ прогресс окна ------------------------------ */

/* Шкала на все 90 суток. Полная шкала — прогнозный эффект, заполнение —
   накопленный факт. Прогноз НЕ пересчитывается на прошедшие сутки: пересчитанный,
   он перестаёт быть тем, с чем сравнивают. Вместо пересчёта — засечка «где факт
   должен быть сейчас», по ней и видно опережение или отставание.
   Решение Эльдара. */
function ПрогрессОкна({ eff, прогноз, закрыто }: {
  eff: EffectView; прогноз: number | null; закрыто: Date | null;
}) {
  const доля = (v: number) => Math.max(0, Math.min(1, v));
  const процент = (v: number) => `${(доля(v) * 100).toFixed(1)}%`;

  const прошло = eff.elapsedDays / eff.windowDays;

  if (прогноз === null || прогноз <= 0) {
    /* Прогноза нет — шкала показывает только ход времени. Рисовать вместо
       прогноза ноль нельзя: любой факт выглядел бы бесконечным перевыполнением. */
    return (
      <div className="win">
        <div className="win__bar">
          <div className="win__fill is-days" style={{ width: процент(прошло) }} />
        </div>
        <div className="win__scale">
          <span>{дата(eff.windowFrom)}</span>
          <span><b>{сутки(eff.elapsedDays)}</b> из {eff.windowDays}</span>
          <span>{дата(eff.windowTo)}</span>
        </div>
        <div className="eff__note">
          Прогнозный эффект не с чем сравнить: {прогноз === null
            ? 'у рекомендации не заполнены ожидаемые приросты либо не заведены ставки по скважине'
            : 'ожидаемый эффект по введённым приростам получается нулевым или отрицательным'}.
          Шкала показывает только, сколько окна прошло.
        </div>
      </div>
    );
  }

  const факт = eff.total.total;
  const выполнение = факт / прогноз;
  const ожидается = прогноз * доля(прошло);
  const отставание = факт - ожидается;

  const позицияЗасечки = доля(прошло) * 100;
  /* Подпись засечки у самых краёв шкалы прижимается к краю, а не центрируется:
     иначе она уезжает за пределы панели и обрезается. */
  const подпись = позицияЗасечки < 15
    ? { left: 0 }
    : позицияЗасечки > 85
      ? { right: 0 }
      : { left: '50%', transform: 'translateX(-50%)' };

  return (
    <div className="win">
      <div className="win__bar">
        <div className={`win__fill ${факт < 0 ? 'is-loss' : выполнение > 1 ? 'is-over' : ''}`}
             style={{ width: процент(факт < 0 ? 0.01 : выполнение) }} />
        {!закрыто && (
          <Hint text="Где накопленный факт должен быть сейчас, если прогноз сбывается ровно">
            <div className="win__mark" style={{ left: `${позицияЗасечки}%` }}>
              <span className="win__marklab" style={подпись}>
                к этому дню ожидается {рубли(ожидается)} руб
              </span>
            </div>
          </Hint>
        )}
      </div>

      <div className="win__scale">
        <span>{дата(eff.windowFrom)}</span>
        <span><b>{сутки(eff.elapsedDays)}</b> из {eff.windowDays}</span>
        <span>прогноз {рубли(прогноз)} руб</span>
      </div>

      <div className="eff__note">
        Накоплено {рубли(факт)} руб — {число(выполнение * 100, 0)} % прогноза.
        {закрыто
          ? ` Окно закрыто ${дата(закрыто)}${eff.elapsedDays < eff.windowDays ? ' досрочно' : ''}: ${
              выполнение >= 1 ? 'прогноз перекрыт' : `в прогноз не уложились на ${рубли(прогноз - факт)} руб`}.`
          : отставание >= 0
            ? ` Это на ${рубли(отставание)} руб больше, чем ожидалось к этому дню.`
            : ` Это на ${рубли(-отставание)} руб меньше, чем ожидалось к этому дню.`}
      </div>
    </div>
  );
}

/* ------------------------------ статьи ------------------------------ */

/* Ставка, объём и сумма в одной строке: спор с Заказчиком идёт по статьям, и
   должно быть видно не только «сколько», но и «из чего» — ставка × накопленный
   прирост. */
function Статьи({ eff }: { eff: EffectView }) {
  const econ = eff.economy!;
  /* Суммируются только те сутки, что дошли до денег: сутки без замеров в
     объёме статьи участвовать не должны, иначе объём и сумма разойдутся. */
  const дQzhT = eff.days.reduce((s, d) => s + (d.money ? d.deltaQzhT ?? 0 : 0), 0);
  const дQn = eff.days.reduce((s, d) => s + (d.money ? d.deltaQn ?? 0 : 0), 0);

  const нефть = 'т нефти';
  const жидкость = 'т жидкости';
  const строки: [string, string, number, string, number, number][] = [
    ['Выручка от прироста нефти', 'цена нефти (МСУ)', econ.oilPrice, нефть, дQn, eff.total.revenue],
    ['НДПИ и НДД', `ставка по пласту «${econ.taxPlast}»`, econ.ndpi, нефть, дQn, -eff.total.ndpi],
    ['Электроэнергия на жидкость', 'ставка месторождения', econ.eeLiquid, жидкость, дQzhT, -eff.total.eeLiquid],
    ['Электроэнергия на нефть', 'ставка месторождения', econ.eeOil, нефть, дQn, -eff.total.eeOil],
    ['Деэмульгаторы', 'ставка месторождения', econ.chem, нефть, дQn, -eff.total.chem],
  ];

  return (
    <>
      <table className="eff-tbl">
        <thead>
          <tr>
            <th>Статья</th>
            <th>Ставка</th>
            <th className="num">руб/т</th>
            <th className="num">Прирост за окно</th>
            <th className="num">Сумма, руб</th>
          </tr>
        </thead>
        <tbody>
          {строки.map(([имя, пояснение, ставка, едОбъёма, объём, сумма]) => (
            <tr key={имя}>
              <td>{имя}</td>
              <td><small>{пояснение}</small></td>
              <td className="num">{число(ставка, 2)}</td>
              <td className="num">{прирост(объём, 1)} <small>{едОбъёма}</small></td>
              <td className={`num ${сумма < 0 ? 'eff-minus' : 'eff-plus'}`}>{рубли(сумма)}</td>
            </tr>
          ))}
          <tr className="is-total">
            <td colSpan={4}>Эффект за окно</td>
            <td className="num">{рубли(eff.total.total)}</td>
          </tr>
        </tbody>
      </table>

    </>
  );
}

/* ------------------------------ посуточно ------------------------------ */

function ПосуточнаяТаблица({ days }: { days: EffectDay[] }) {
  return (
    <table className="eff-tbl">
      <thead>
        <tr>
          <th>Сутки</th>
          <th className="num">Qж факт, м³</th>
          <th className="num">Δ Qж, м³</th>
          <th className="num">Δ Qж, т</th>
          <th className="num">Qн факт</th>
          <th className="num">Δ Qн</th>
          <th className="num">Замеров</th>
          <th className="num">Опора</th>
          <th className="num">Эффект, руб</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => {
          const класс = d.factQzh === null ? 'is-empty' : d.points === 0 ? 'is-carried' : '';
          return (
            <tr key={d.date.toISOString()} className={класс}>
              <td>{дата(d.date)}</td>
              <td className="num">{число(d.factQzh, 1)}</td>
              <td className="num">{прирост(d.deltaQzh, 1)}</td>
              <td className="num">{прирост(d.deltaQzhT, 1)}</td>
              <td className="num">{число(d.factQn, 2)}</td>
              <td className="num">{прирост(d.deltaQn, 2)}</td>
              <td className="num">{d.factQzh === null ? '—' : d.points}</td>
              <td className="num">{d.factQzh === null ? '—' : `${число(d.coverage * 100, 0)} %`}</td>
              <td className={`num ${d.money && d.money.total < 0 ? 'eff-minus' : ''}`}>
                {d.money ? рубли(d.money.total) : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ------------------------------ качество ------------------------------ */

function ЯчейкаКачества({ v, k }: { v: string; k: string }) {
  return (
    <div className="eff-quality__i">
      <span className="eff-quality__v">{v}</span>
      <span className="eff-quality__k">{k}</span>
    </div>
  );
}

/** Средняя доля суток, опирающаяся на собственные замеры, а не на протяжку. */
function среднееПокрытие(days: EffectDay[]): number {
  if (!days.length) return 0;
  return days.reduce((s, d) => s + d.coverage, 0) / days.length;
}
