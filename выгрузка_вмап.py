# -*- coding: utf-8 -*-
"""
Выгрузка справочных данных из ВМАП для макета модуля управления рекомендациями.

Что забирает:
  1. Дерево орг-единиц целиком — оно небольшое, а по нему видно устройство уровней.
  2. Поддерево ТПП «Когалымнефтегаз»: месторождения, кусты, скважины с реальными
     счётчиками. Именно эти числа нужны справочнику «Месторождения» в макете —
     сейчас там стоят цифры по тестовому набору, и таблица врёт про масштаб.
  3. Разведку схемы: список таблиц, их колонки и число строк. Нужна, чтобы
     подобрать источник параметров скважины для правой колонки карточки
     (дебит жидкости и нефти, обводнённость, давление на приёме, частота,
     загрузка ПЭД, способ эксплуатации) — угадывать имена таблиц вслепую хуже,
     чем один раз посмотреть.

Скрипт только читает: ни одного INSERT, UPDATE, DELETE или DDL.

Запуск:
    pip install psycopg2-binary
    python выгрузка_вмап.py

Параметры подключения берутся из переменных окружения PGHOST / PGPORT /
PGDATABASE / PGUSER / PGPASSWORD, иначе — значения ниже (дев-стенд).

Результат — файл «вмап.json» рядом со скриптом. Его и нужно прислать обратно.
Пароль в файл не пишется.
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

# Организация, ради которой всё делается. Сравнение по вхождению подстроки:
# в дереве узел может называться «ТПП "Когалымнефтегаз"» с кавычками любого вида.
ТПП = os.environ.get("VMAP_TPP", "Когалымнефтегаз")

# Сколько строк-образцов показывать по каждой таблице при разведке схемы.
ОБРАЗЦОВ = 2

# Таблицы, которые при разведке интересны в первую очередь: по именам видно,
# где могут лежать суточные параметры работы скважины.
ИНТЕРЕСНЫЕ = ("param", "value", "telemetr", "daily", "measure", "mode",
              "well", "organizationunit", "regime", "indicator")


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


def курсор(conn, factory, вид):
    return conn.cursor(row_factory=factory) if вид == "psycopg3" \
        else conn.cursor(cursor_factory=factory)


def выбрать(cur, sql, params=None):
    """SELECT с мягкой обработкой ошибки: отсутствующая таблица не должна ронять
    весь рейс — часть запросов здесь разведочные и могут не подойти к схеме."""
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
    cur = курсор(conn, factory, вид)
    итог = {"database": {k: v for k, v in DB.items() if k != "password"},
            "schema": SCHEMA, "tpp": ТПП}

    # ------------------------------------------------------------------
    # 1. Разведка схемы
    # ------------------------------------------------------------------
    таблицы, ошибка = выбрать(cur, """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = %s AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """, (SCHEMA,))
    if ошибка:
        sys.exit(f"Не удалось прочитать список таблиц схемы {SCHEMA}: {ошибка}")

    имена = [t["table_name"] for t in таблицы]
    print(f"Таблиц в схеме {SCHEMA}: {len(имена)}")

    колонки, _ = выбрать(cur, """
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = %s
        ORDER BY table_name, ordinal_position
    """, (SCHEMA,))
    по_таблицам = defaultdict(list)
    for c in колонки:
        по_таблицам[c["table_name"]].append(f'{c["column_name"]} :: {c["data_type"]}')

    разведка = []
    for имя in имена:
        строк, ош = выбрать(cur, f'SELECT count(*) AS n FROM {SCHEMA}."{имя}"')
        запись = {
            "table": имя,
            "rows": (строк[0]["n"] if строк else None),
            "error": ош,
            "columns": по_таблицам.get(имя, []),
        }
        # Образцы строк берём только у таблиц, где ожидаются параметры скважины:
        # по всей схеме это лишние мегабайты и лишние персональные данные.
        if any(k in имя.lower() for k in ИНТЕРЕСНЫЕ) and not ош:
            образцы, _ = выбрать(cur, f'SELECT * FROM {SCHEMA}."{имя}" LIMIT {ОБРАЗЦОВ}')
            запись["samples"] = образцы
        разведка.append(запись)
    итог["schema_survey"] = разведка

    # ------------------------------------------------------------------
    # 2. Дерево орг-единиц
    # ------------------------------------------------------------------
    units, ош = выбрать(cur, f"""
        SELECT "Id", "Name", "Code", "ParentId", "OrganizationUnitType"
        FROM {SCHEMA}."OrganizationUnits"
        WHERE "DeleteDate" IS NULL
        ORDER BY "Id"
    """)
    if ош:
        sys.exit(f"Не читается OrganizationUnits: {ош}")
    итог["org_units"] = units
    по_id = {u["Id"]: u for u in units}
    дети = defaultdict(list)
    for u in units:
        дети[u["ParentId"]].append(u["Id"])

    типы = defaultdict(lambda: {"count": 0, "samples": []})
    for u in units:
        т = типы[u["OrganizationUnitType"]]
        т["count"] += 1
        if len(т["samples"]) < 5:
            т["samples"].append(u["Name"])
    итог["org_unit_types"] = [{"type": k, **v} for k, v in sorted(типы.items())]
    print("Типы орг-единиц:", ", ".join(
        f'{x["type"]} — {x["count"]}' for x in итог["org_unit_types"]))

    # ------------------------------------------------------------------
    # 3. Поддерево ТПП
    # ------------------------------------------------------------------
    корни = [u["Id"] for u in units if ТПП.lower() in str(u["Name"]).lower()]
    if not корни:
        print(f"В дереве не нашлось узла с «{ТПП}» в названии.")
        print("Задайте другое имя через переменную окружения VMAP_TPP и запустите снова.")
        return

    поддерево = set()
    очередь = list(корни)
    while очередь:
        i = очередь.pop()
        if i in поддерево:
            continue
        поддерево.add(i)
        очередь.extend(дети.get(i, []))
    print(f"Узлов в поддереве «{ТПП}»: {len(поддерево)}")

    def предки(unit_id):
        цепочка, виденные = [], set()
        while unit_id in по_id and unit_id not in виденные:
            виденные.add(unit_id)
            u = по_id[unit_id]
            цепочка.append({"id": u["Id"], "name": u["Name"],
                            "code": u["Code"], "type": u["OrganizationUnitType"]})
            unit_id = u["ParentId"]
        return цепочка

    # ------------------------------------------------------------------
    # 4. Скважины поддерева
    # ------------------------------------------------------------------
    wells, ош = выбрать(cur, f"""
        SELECT "Id", "Code", "Name", "OrganizationUnitId", "OperationMode"
        FROM {SCHEMA}."Wells"
        WHERE "DeleteDate" IS NULL
    """)
    if ош:
        sys.exit(f"Не читается Wells: {ош}")
    итог["wells_total_in_db"] = len(wells)

    наши = [w for w in wells if w["OrganizationUnitId"] in поддерево]
    print(f"Скважин всего: {len(wells)} · в поддереве ТПП: {len(наши)}")

    # Тип узла месторождения и куста подтверждается по образцам: если в вашей
    # схеме нумерация типов другая, здесь она видна в org_unit_types выше.
    ТИП_МЕСТОРОЖДЕНИЯ = int(os.environ.get("VMAP_FIELD_TYPE", "3"))
    ТИП_КУСТА = int(os.environ.get("VMAP_KUST_TYPE", "4"))

    скважины = []
    по_месторождениям = defaultdict(lambda: {"kusts": set(), "wells": 0})
    for w in наши:
        цепочка = предки(w["OrganizationUnitId"])
        месторождение = next((x for x in цепочка if x["type"] == ТИП_МЕСТОРОЖДЕНИЯ), None)
        куст = next((x for x in цепочка if x["type"] == ТИП_КУСТА), None)
        скважины.append({
            "well_id": w["Id"], "code": w["Code"], "name": w["Name"],
            "operation_mode": w["OperationMode"],
            "org_unit_id": w["OrganizationUnitId"],
            "field": месторождение["name"] if месторождение else None,
            "field_id": месторождение["id"] if месторождение else None,
            "kust": куст["name"] if куст else None,
            "kust_id": куст["id"] if куст else None,
        })
        if месторождение:
            св = по_месторождениям[месторождение["id"]]
            св["wells"] += 1
            if куст:
                св["kusts"].add(куст["id"])
    итог["wells"] = скважины

    # ------------------------------------------------------------------
    # 5. Месторождения со счётчиками — то, ради чего всё затевалось
    # ------------------------------------------------------------------
    месторождения = []
    for u in units:
        if u["Id"] not in поддерево or u["OrganizationUnitType"] != ТИП_МЕСТОРОЖДЕНИЯ:
            continue
        св = по_месторождениям.get(u["Id"], {"kusts": set(), "wells": 0})
        # Кусты считаем и по дереву тоже: месторождение может иметь куст,
        # на котором сейчас нет ни одной действующей скважины.
        кустов_в_дереве = sum(
            1 for c in дети.get(u["Id"], [])
            if по_id[c]["OrganizationUnitType"] == ТИП_КУСТА)
        месторождения.append({
            "id": u["Id"], "name": u["Name"], "code": u["Code"],
            "parent": (по_id.get(u["ParentId"]) or {}).get("Name"),
            "kusts_in_tree": кустов_в_дереве,
            "kusts_with_wells": len(св["kusts"]),
            "wells": св["wells"],
        })
    месторождения.sort(key=lambda x: (-x["wells"], str(x["name"])))
    итог["fields"] = месторождения
    print(f"Месторождений в поддереве: {len(месторождения)}")
    for m in месторождения[:10]:
        print(f'   {m["name"]}: кустов {m["kusts_in_tree"]}, скважин {m["wells"]}')

    # ------------------------------------------------------------------
    # 6. Кусты поддерева
    # ------------------------------------------------------------------
    итог["kusts"] = [{
        "id": u["Id"], "name": u["Name"], "code": u["Code"],
        "field": (по_id.get(u["ParentId"]) or {}).get("Name"),
        "field_id": u["ParentId"],
    } for u in units
        if u["Id"] in поддерево and u["OrganizationUnitType"] == ТИП_КУСТА]

    # ------------------------------------------------------------------
    # 7. Справочник параметров, если он есть под ожидаемым именем
    # ------------------------------------------------------------------
    for имя in ("Parameters", "Parameter", "ParameterTypes"):
        if имя in имена:
            строки, ош = выбрать(cur, f'SELECT * FROM {SCHEMA}."{имя}" ORDER BY 1')
            if not ош:
                итог["parameters_dictionary"] = {"table": имя, "rows": строки}
                print(f'Справочник параметров: {имя}, строк {len(строки)}')
            break

    путь = os.path.join(os.path.dirname(os.path.abspath(__file__)), "вмап.json")
    with open(путь, "w", encoding="utf-8") as f:
        json.dump(итог, f, ensure_ascii=False, indent=1, default=str)

    размер = os.path.getsize(путь) / 1048576
    print(f"\nЗаписано: {путь} ({размер:.1f} МБ)")
    print("Пришлите этот файл — из него в макет уедут реальные месторождения и счётчики.")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
