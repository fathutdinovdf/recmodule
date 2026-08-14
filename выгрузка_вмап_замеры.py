# -*- coding: utf-8 -*-
"""
Третья выгрузка из ВМАП — замеры, из которых считается фактический эффект.

Замерной дебит жидкости (параметр 1) и обводнённость (параметр 7) лежат в
PostgreSQL, в WellData. Это не суточные значения, а мгновенные: столько
скважина давала в момент замера. Суточное значение из них собирает уже
модуль — интегралом по времени с протяжкой последнего значения.

Две вещи, на которых здесь легко ошибиться, — и обе стоили одной неверной
выгрузки.

1. DeleteDate у замера НЕ означает «запись ошибочна». WellData хранит текущее
   значение параметра, и когда приходит следующий замер, предыдущий помечается
   удалённым. Вся история — это и есть записи с проставленным DeleteDate:
   их 1 774 442 против 9 115 «живых». Фильтр «DeleteDate IS NULL» оставляет
   последний замер на скважину, то есть 0,5 % данных, и ряда из этого не
   собрать.

2. Время замера — LEAST(CreateDate, UpdateDate), а не одно из полей.
   Семантика этой пары в разных пачках разная: где-то замер лежит в CreateDate
   (01.02 12:00 при UpdateDate 03.02 04:33 — ночная загрузка), где-то наоборот
   (UpdateDate 08:35 при CreateDate 08:45:02.912, одинаковом у всей пачки).
   Общее у обоих случаев одно: момент замера всегда раньше момента записи в
   базу, поэтому минимум из двух дат и есть замер. FactDate точнее, но заполнен
   у сотни записей, поэтому идёт первым в COALESCE, а не единственным.

Скрипт только читает: ни одного INSERT, UPDATE, DELETE или DDL.

Запуск:
    python выгрузка_вмап_замеры.py

Результат — файл «вмап-замеры.json» рядом со скриптом.
"""

import json
import os
import sys
from collections import defaultdict

DB = {
    "host":     os.environ.get("PGHOST", "vps-pgsql03.ois.ru"),
    "port": int(os.environ.get("PGPORT", "5432")),
    "dbname":   os.environ.get("PGDATABASE", "luk_cycleopvmap_dev"),
    "user":     os.environ.get("PGUSER", "ois_vmap"),
    "password": os.environ.get("PGPASSWORD", "ois_vmap"),
}
SCHEMA = os.environ.get("VMAP_SCHEMA", "ois_vmap")

# Замерной дебит жидкости и обводнённость: пара, из которой получается нефть.
# Оба — по одной и той же логике замеров, поэтому и выгружаются вместе.
ПАРАМЕТРЫ = {1: "qzh", 7: "watercut"}

# С какой даты тянуть. Окно эффекта — 90 суток, «сейчас» в макете 05.08.2026,
# значит самое раннее нужное окно открылось в начале мая. Берём с апреля:
# первым суткам окна нужен ещё и последний замер ДО них, иначе протягивать
# нечего и сутки начинаются с неизвестности.
С_ДАТЫ = os.environ.get("VMAP_SINCE", "2026-04-01")


def подключиться():
    try:
        import psycopg2
        import psycopg2.extras
        return psycopg2.connect(**DB), psycopg2.extras.RealDictCursor
    except ImportError:
        sys.exit("Нужен psycopg2-binary: pip install psycopg2-binary")


def main():
    conn, factory = подключиться()
    cur = conn.cursor(cursor_factory=factory)

    путь_эконом = os.path.join(os.path.dirname(os.path.abspath(__file__)), "вмап-экономика.json")
    if not os.path.exists(путь_эконом):
        sys.exit("Сначала нужна выгрузка_вмап_экономика.py — из неё берётся список скважин фонда.")
    эконом = json.load(open(путь_эконом, encoding="utf-8"))
    ids = [w["well_id"] for w in эконом["wells"]]
    имена = {w["well_id"]: w["name"] for w in эконом["wells"]}
    print(f"Скважин в фонде: {len(ids)}")

    список = ", ".join(str(p) for p in ПАРАМЕТРЫ)
    # DISTINCT нужен: один и тот же замер может лежать в нескольких строках
    # истории, отличающихся только служебными полями.
    cur.execute(f"""
        SELECT DISTINCT
               d."WellId", d."ParameterId", d."Value",
               COALESCE(d."FactDate", LEAST(d."CreateDate", d."UpdateDate")) AS at,
               d."FactDate" IS NOT NULL AS exact
        FROM {SCHEMA}."WellData" d
        WHERE d."ParameterId" IN ({список})
          AND d."WellId" = ANY(%s)
          AND COALESCE(d."FactDate", LEAST(d."CreateDate", d."UpdateDate")) >= %s
        ORDER BY d."WellId", d."ParameterId", at
    """, (ids, С_ДАТЫ))

    по_скважинам = defaultdict(lambda: defaultdict(list))
    точных = 0
    for r in cur.fetchall():
        r = dict(r)
        try:
            значение = float(r["Value"])
        except (TypeError, ValueError):
            continue
        имя = ПАРАМЕТРЫ[int(r["ParameterId"])]
        по_скважинам[r["WellId"]][имя].append([r["at"].isoformat(timespec="minutes"), значение])
        if r["exact"]:
            точных += 1

    скважины = []
    for wid, ряды in по_скважинам.items():
        скважины.append({
            "well_id": wid,
            "name": имена.get(wid),
            "qzh": ряды.get("qzh", []),
            "watercut": ряды.get("watercut", []),
        })
    скважины.sort(key=lambda x: -(len(x["qzh"]) + len(x["watercut"])))

    всего_qzh = sum(len(s["qzh"]) for s in скважины)
    всего_wc = sum(len(s["watercut"]) for s in скважины)
    print(f"Замеров дебита: {всего_qzh} · обводнённости: {всего_wc}")
    print(f"Скважин хоть с одним замером: {len(скважины)}")
    print(f"Из них время замера точное (FactDate): {точных}, остальное — CreateDate")

    # По каким периодам данные есть — это первое, что надо знать, глядя
    # на пустой расчёт в макете.
    по_месяцам = defaultdict(int)
    for s in скважины:
        for at, _ in s["qzh"]:
            по_месяцам[at[:7]] += 1
    print("\nЗамеры дебита по месяцам:")
    for м in sorted(по_месяцам):
        print(f"   {м}: {по_месяцам[м]}")

    итог = {
        "database": {k: v for k, v in DB.items() if k != "password"},
        "parameters": {"qzh": 1, "watercut": 7},
        "wells": скважины,
        "months": dict(sorted(по_месяцам.items())),
    }
    путь = os.path.join(os.path.dirname(os.path.abspath(__file__)), "вмап-замеры.json")
    with open(путь, "w", encoding="utf-8") as f:
        json.dump(итог, f, ensure_ascii=False, indent=1, default=str)
    print(f"\nЗаписано: {путь} ({os.path.getsize(путь) / 1048576:.1f} МБ)")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
