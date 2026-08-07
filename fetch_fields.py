# -*- coding: utf-8 -*-
"""
Запрос месторождений по списку скважин из ois_vmap.

Что делает: для каждой скважины находит запись в ois_vmap."Wells", поднимается
по дереву ois_vmap."OrganizationUnits" от её орг-единицы до корня и отдаёт всю
цепочку. Какой уровень цепочки считать месторождением, определим по результату —
поэтому цепочка возвращается целиком, вместе с кодами типов.

Дополнительно выгружается всё дерево OrganizationUnits: оно небольшое, а по нему
видно, как устроены уровни (ЦИТС → цех → месторождение → куст) и какие значения
принимает OrganizationUnitType.

Запуск:
    pip install psycopg2-binary        # или psycopg[binary]
    python fetch_fields.py

Результат — файл fields.json рядом со скриптом. Его и нужно прислать обратно.
"""

import json
import os
import sys

# --- Подключение ---------------------------------------------------------
# Ниже — параметры демо-стенда из памяти проекта. Если запрос нужно делать
# к другому контуру, поменяйте здесь или задайте переменные окружения
# PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD.

DB = {
    "host":     os.environ.get("PGHOST", "vps-pgsql03.ois.ru"),
    "port": int(os.environ.get("PGPORT", "5432")),
    "dbname":   os.environ.get("PGDATABASE", "luk_cycleopvmap_dev"),
    "user":     os.environ.get("PGUSER", "ois_vmap"),
    "password": os.environ.get("PGPASSWORD", "ois_vmap"),
}

# --- Скважины, которые есть в макете реестра ------------------------------

WELLS = [
    "3407г", "1014", "348", "1071", "6100", "832л", "4159л", "184р",
    "915л", "129к", "131", "1546", "3210", "2751", "985", "1203к",
    "776г", "2208", "567л", "1899", "3021к", "744", "2560г", "412", "1130",
]


def connect():
    try:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(**DB)
        return conn, psycopg2.extras.RealDictCursor
    except ImportError:
        pass
    try:
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(**DB), dict_row
    except ImportError:
        sys.exit("Нужен psycopg2-binary или psycopg[binary]: pip install psycopg2-binary")


def norm(s):
    """Нормализация имени скважины: регистр, пробелы и латиница, похожая на кириллицу."""
    if s is None:
        return ""
    s = str(s).strip().lower().replace(" ", "").replace(" ", "")
    for lat, cyr in (("a", "а"), ("c", "с"), ("e", "е"), ("o", "о"),
                     ("p", "р"), ("x", "х"), ("k", "к"), ("m", "м"), ("t", "т")):
        s = s.replace(lat, cyr)
    return s


def main():
    conn, row_factory = connect()
    cur = conn.cursor(row_factory=row_factory) if "psycopg." in str(type(conn)) \
        else conn.cursor(cursor_factory=row_factory)

    # Всё дерево орг-единиц
    cur.execute("""
        SELECT "Id", "Name", "Code", "ParentId", "OrganizationUnitType"
        FROM ois_vmap."OrganizationUnits"
        WHERE "DeleteDate" IS NULL
        ORDER BY "Id"
    """)
    units = [dict(r) for r in cur.fetchall()]
    by_id = {u["Id"]: u for u in units}

    # Все скважины: выбираем целиком, сопоставляем в питоне — так надёжнее,
    # чем угадывать, лежит номер в Name или в Code.
    cur.execute("""
        SELECT "Id", "Code", "Name", "OrganizationUnitId", "OperationMode"
        FROM ois_vmap."Wells"
        WHERE "DeleteDate" IS NULL
    """)
    wells = [dict(r) for r in cur.fetchall()]

    index = {}
    for w in wells:
        for field in ("Name", "Code"):
            key = norm(w.get(field))
            if key:
                index.setdefault(key, w)

    def chain(unit_id):
        out, seen = [], set()
        while unit_id and unit_id in by_id and unit_id not in seen:
            seen.add(unit_id)
            u = by_id[unit_id]
            out.append({"id": u["Id"], "name": u["Name"], "code": u["Code"],
                        "type": u["OrganizationUnitType"]})
            unit_id = u["ParentId"]
        return out

    found, missing = [], []
    for name in WELLS:
        w = index.get(norm(name))
        if not w:
            missing.append(name)
            continue
        found.append({
            "asked": name,
            "well_id": w["Id"],
            "code": w["Code"],
            "name": w["Name"],
            "operation_mode": w["OperationMode"],
            "org_chain_bottom_up": chain(w["OrganizationUnitId"]),
        })

    types = {}
    for u in units:
        t = u["OrganizationUnitType"]
        types.setdefault(t, {"type": t, "count": 0, "samples": []})
        types[t]["count"] += 1
        if len(types[t]["samples"]) < 5:
            types[t]["samples"].append(u["Name"])

    result = {
        "database": {k: v for k, v in DB.items() if k != "password"},
        "asked_wells": WELLS,
        "found": found,
        "not_found": missing,
        "wells_total_in_db": len(wells),
        "org_unit_types": sorted(types.values(), key=lambda x: x["type"]),
        "org_units": units,
    }

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fields.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, default=str)

    print(f"Скважин в БД: {len(wells)}")
    print(f"Найдено из списка: {len(found)} из {len(WELLS)}")
    if missing:
        print("Не найдены:", ", ".join(missing))
    print("Типы орг-единиц:", ", ".join(
        f'{t["type"]} ({t["count"]}: {t["samples"][0] if t["samples"] else "—"})'
        for t in result["org_unit_types"]))
    print("Записано:", out)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
