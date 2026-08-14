# -*- coding: utf-8 -*-
"""
Вторая выгрузка из ВМАП — то, чего не хватило для расчёта экономики.

Первая выгрузка (выгрузка_вмап.py) дала дерево объектов: месторождения, кусты,
скважины. Для расчёта эффекта этого мало, и вот почему.

  1. Пласт скважины. Ставка НДПИ задана в модели Заказчика по паре
     «месторождение + пласт», и внутри одного месторождения она расходится
     до 2,3 раза (Восточно-Придорожное: от 8 572 до 20 065 руб/т). Без пласта
     ставку выбрать нельзя — можно только угадать.

  2. Способ эксплуатации. У ЭЦН, ШГН и ЭВН разная стоимость обслуживания,
     и от неё зависит статья затрат. Берётся из Wells.OperationMode: поле
     заполнено у всех скважин, значение числовое — 0 это ЭЦН, 1 ШГН, 2 ЭВН.
     По поддереву Когалымнефтегаза 4006 скважин с ЭЦН, четыре с ШГН и одна
     с ЭВН.

  3. Плотности нефти и воды. Модуль вводит прирост жидкости в м³/сут, модель
     Заказчика считает в т/сут. Без плотности перевести нельзя.

  4. Коэффициент эксплуатации. В модели это константа 0,98 на весь фонд,
     а в ВМАП он есть по каждой скважине — параметры 10 и 11.

Скрипт только читает: ни одного INSERT, UPDATE, DELETE или DDL.

Запуск:
    pip install psycopg2-binary
    python выгрузка_вмап_экономика.py

Результат — файл «вмап-экономика.json» рядом со скриптом.
Пароль в результат не пишется.
"""

import json
import os
import sys
from collections import defaultdict

import requests

DB = {
    "host":     os.environ.get("PGHOST", "vps-pgsql03.ois.ru"),
    "port": int(os.environ.get("PGPORT", "5432")),
    "dbname":   os.environ.get("PGDATABASE", "luk_cycleopvmap_dev"),
    "user":     os.environ.get("PGUSER", "ois_vmap"),
    "password": os.environ.get("PGPASSWORD", "ois_vmap"),
}

SCHEMA = os.environ.get("VMAP_SCHEMA", "ois_vmap")
ТПП = os.environ.get("VMAP_TPP", "Когалымнефтегаз")

# ClickHouse хранит динамику (телеметрию), а не статику: коэффициент
# эксплуатации там, а не в WellData — WellData на дев-стенде по параметру 11
# пустая (проверено выгрузкой от 13.08.2026, покрытие 0 из 4011).
CH_URL = os.environ.get("CH_URL", "http://vps-chdb01.ois.ru:8123/")
CH_DB = os.environ.get("CH_DB", "luk_cycleopvmap_dev_ois_vmap")
CH_AUTH = (os.environ.get("CH_USER", "ois_vmap"), os.environ.get("CH_PASSWORD", "ois_vmap"))

# Расшифровка Wells.OperationMode. В базе только числа, словаря к ним нет.
СПОСОБ_ЭКСПЛУАТАЦИИ = {0: "ЭЦН", 1: "ШГН", 2: "ЭВН"}

# Параметры из справочника ois_vmap."Parameters", читаемые как статика из
# WellData. Названия оставлены как в базе, чтобы при расхождении было видно,
# что именно поехало. Коэффициент эксплуатации (10, 11) сюда не входит —
# он в ClickHouse, см. КОЭФФИЦИЕНТ_ЭКСПЛУАТАЦИИ_PARAM ниже.
ПАРАМЕТРЫ = {
    13:  "плотность нефти в стандартных условиях",
    12:  "плотность воды в стандартных условиях",
    53:  "плотность нефти в пластовых условиях",
    54:  "плотность воды в пластовых условиях",
    7:   "обводнённость объёмная",
    6:   "обводнённость объёмная режимная",
    52:  "дебит нефти",
    1:   "дебит жидкости замерной",
    0:   "дебит жидкости режимный",
    50:  "пласт(ы) на которые работает скважина",
    20:  "тип скважины",
}

# Фильтр фонда: берём только скважины с типом 1 (по указанию пользователя,
# 13.08.2026) — параметр 20 должен быть заполнен и равен '1'.
ТИП_СКВАЖИНЫ_PARAM = 20
ТИП_СКВАЖИНЫ_ФИЛЬТР = "1"

КОЭФФИЦИЕНТ_ЭКСПЛУАТАЦИИ_PARAM = 11


def подключиться():
    try:
        import psycopg2
        import psycopg2.extras
        return psycopg2.connect(**DB), psycopg2.extras.RealDictCursor, "psycopg2"
    except ImportError:
        pass
    try:
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(**DB), dict_row, "psycopg3"
    except ImportError:
        sys.exit("Нужен psycopg2-binary или psycopg[binary]: pip install psycopg2-binary")


def выбрать(cur, sql, params=None):
    """SELECT, у которого ошибка не роняет весь рейс: часть запросов
    разведочные и может не подойти к схеме конкретного стенда."""
    try:
        cur.execute(sql, params or ())
        return [dict(r) for r in cur.fetchall()], None
    except Exception as e:                                  # noqa: BLE001
        try:
            cur.connection.rollback()
        except Exception:                                   # noqa: BLE001
            pass
        return [], str(e).strip().split("\n")[0]


def main():
    conn, factory, вид = подключиться()
    cur = conn.cursor(row_factory=factory) if вид == "psycopg3" \
        else conn.cursor(cursor_factory=factory)

    итог = {"database": {k: v for k, v in DB.items() if k != "password"},
            "schema": SCHEMA, "tpp": ТПП}

    # ------------------------------------------------------------------
    # Поддерево ТПП: те же скважины, что и в первой выгрузке
    # ------------------------------------------------------------------
    units, ош = выбрать(cur, f"""
        SELECT "Id", "Name", "ParentId", "OrganizationUnitType"
        FROM {SCHEMA}."OrganizationUnits" WHERE "DeleteDate" IS NULL
    """)
    if ош:
        sys.exit(f"Не читается OrganizationUnits: {ош}")

    дети = defaultdict(list)
    for u in units:
        дети[u["ParentId"]].append(u["Id"])
    корни = [u["Id"] for u in units if ТПП.lower() in str(u["Name"]).lower()]
    поддерево, очередь = set(), list(корни)
    while очередь:
        i = очередь.pop()
        if i in поддерево:
            continue
        поддерево.add(i)
        очередь.extend(дети.get(i, []))

    wells, ош = выбрать(cur, f"""
        SELECT "Id", "Code", "Name", "OrganizationUnitId", "OperationMode"
        FROM {SCHEMA}."Wells" WHERE "DeleteDate" IS NULL
    """)
    if ош:
        sys.exit(f"Не читается Wells: {ош}")
    фонд = [w for w in wells if w["OrganizationUnitId"] in поддерево]
    ids_фонд = [w["Id"] for w in фонд]
    print(f"Скважин в поддереве «{ТПП}»: {len(фонд)}")

    # ------------------------------------------------------------------
    # 1. Параметры скважины из WellData: способ эксплуатации, плотности,
    #    пласт (параметр 50), тип скважины (параметр 20)
    # ------------------------------------------------------------------
    # WellData — 3,7 млн строк, поэтому берём последнее значение на пару
    # «скважина + параметр» одним запросом, а не выгружаем таблицу целиком.
    список = ", ".join(str(p) for p in ПАРАМЕТРЫ)
    значения, ош = выбрать(cur, f"""
        SELECT DISTINCT ON (d."WellId", d."ParameterId")
               d."WellId", d."ParameterId", d."Value", d."UpdateDate"
        FROM {SCHEMA}."WellData" d
        WHERE d."DeleteDate" IS NULL
          AND d."ParameterId" IN ({список})
          AND d."WellId" = ANY(%s)
        ORDER BY d."WellId", d."ParameterId", d."UpdateDate" DESC
    """, (ids_фонд,))
    if ош:
        print(f"WellData не прочиталась: {ош}")

    по_скважинам = defaultdict(dict)
    for з in значения:
        по_скважинам[з["WellId"]][int(з["ParameterId"])] = з["Value"]

    # ------------------------------------------------------------------
    # 2. Фильтр фонда по параметру 20 (тип скважины) = 1
    # ------------------------------------------------------------------
    наши = [w for w in фонд
            if по_скважинам.get(w["Id"], {}).get(ТИП_СКВАЖИНЫ_PARAM) == ТИП_СКВАЖИНЫ_ФИЛЬТР]
    ids = [w["Id"] for w in наши]
    print(f"Из них с типом скважины = {ТИП_СКВАЖИНЫ_ФИЛЬТР}: {len(наши)}")

    # ------------------------------------------------------------------
    # 3. Коэффициент эксплуатации — из ClickHouse (телеметрия, не WellData)
    # ------------------------------------------------------------------
    ке_by_well, ке_ошибка = {}, None
    try:
        wids = ",".join(str(i) for i in ids)
        query = (f"SELECT well_id, argMax(value, timestamp) AS val "
                 f"FROM {CH_DB}.telemetries FINAL "
                 f"WHERE parameter_id = {КОЭФФИЦИЕНТ_ЭКСПЛУАТАЦИИ_PARAM} "
                 f"AND well_id IN ({wids}) "
                 f"GROUP BY well_id FORMAT JSONEachRow")
        r = requests.post(CH_URL, params={"query": query}, auth=CH_AUTH, timeout=60)
        r.raise_for_status()
        for line in r.text.strip().splitlines():
            row = json.loads(line)
            ке_by_well[int(row["well_id"])] = row["val"]
    except Exception as e:                                    # noqa: BLE001
        ке_ошибка = str(e).strip().split("\n")[0]
    print(f"Коэффициент эксплуатации (ClickHouse): {len(ке_by_well)} скважин"
          + (f" · ошибка: {ке_ошибка}" if ке_ошибка else ""))

    итог["ke_source"] = {"table": f"{CH_DB}.telemetries", "parameter_id": КОЭФФИЦИЕНТ_ЭКСПЛУАТАЦИИ_PARAM,
                          "error": ке_ошибка}

    итог["wells"] = [{
        "well_id": w["Id"], "code": w["Code"], "name": w["Name"],
        "operation_mode_code": w["OperationMode"],
        "operation_mode": СПОСОБ_ЭКСПЛУАТАЦИИ.get(w["OperationMode"]),
        "params": {ПАРАМЕТРЫ[k]: v for k, v in по_скважинам.get(w["Id"], {}).items()
                   if k not in (ТИП_СКВАЖИНЫ_PARAM,)},
        "коэффициент эксплуатации": ке_by_well.get(w["Id"]),
    } for w in наши]

    # Сколько скважин чем заполнено — по этому сразу видно, что можно
    # использовать в расчёте, а что придётся вводить руками.
    покрытие = {}
    for код, имя in ПАРАМЕТРЫ.items():
        if код == ТИП_СКВАЖИНЫ_PARAM:
            continue
        покрытие[имя] = sum(1 for w in наши if код in по_скважинам.get(w["Id"], {}))
    покрытие["коэффициент эксплуатации"] = sum(1 for w in наши if w["Id"] in ке_by_well)
    итог["coverage"] = покрытие
    print("\nЗаполненность по скважинам (после фильтра по типу):")
    for имя, n in sorted(покрытие.items(), key=lambda x: -x[1]):
        print(f"   {n:>5} из {len(наши)}  {имя}")

    # Ноль здесь — полноценный код, а не пустота: на этом уже один раз
    # споткнулись, посчитав его отсутствием значения.
    режимы = defaultdict(int)
    for w in наши:
        режимы[СПОСОБ_ЭКСПЛУАТАЦИИ.get(w["OperationMode"], f'код {w["OperationMode"]}')] += 1
    итог["operation_modes"] = dict(режимы)
    print("\nСпособ эксплуатации:",
          ", ".join(f"{k} — {n}" for k, n in sorted(режимы.items(), key=lambda x: -x[1])))

    путь = os.path.join(os.path.dirname(os.path.abspath(__file__)), "вмап-экономика.json")
    with open(путь, "w", encoding="utf-8") as f:
        json.dump(итог, f, ensure_ascii=False, indent=1, default=str)
    print(f"\nЗаписано: {путь} ({os.path.getsize(путь) / 1048576:.1f} МБ)")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
