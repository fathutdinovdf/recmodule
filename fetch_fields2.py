# -*- coding: utf-8 -*-
"""
Уточняющий запрос: скважины ТПП «Когалымнефтегаз» с их кустами и месторождениями.

Зачем второй заход. Первый искал скважину по номеру по всей базе, а номера в
компании не уникальны: 348 нашлась в Возейском (ЛУКОЙЛ-Пермь), 131 — в
Жирновском (РИТЭК). Этот скрипт ограничивает поиск деревом ТПП
«Когалымнефтегаз» и заодно сверяет номер куста с тем, что стоит в Форме 2, —
так совпадение либо подтверждается, либо явно помечается как сомнительное.

Дополнительно выгружается весь фонд ТПП: по нему видно, существуют ли вообще
скважины с ненайденными номерами и в каком они цехе.

Запуск:
    python fetch_fields2.py

Результат — fields2.json рядом со скриптом.
"""

import json
import os
import sys

DB = {
    "host":     os.environ.get("PGHOST", "vps-pgsql03.ois.ru"),
    "port": int(os.environ.get("PGPORT", "5432")),
    "dbname":   os.environ.get("PGDATABASE", "luk_cycleopvmap_dev"),
    "user":     os.environ.get("PGUSER", "ois_vmap"),
    "password": os.environ.get("PGPASSWORD", "ois_vmap"),
}

TPP_NAME_LIKE = "%Когалымнефтегаз%"

# Скважина → куст по Форме 2 (боевой реестр за 3–4 августа).
# Куст нужен, чтобы отличить нужную скважину от однофамильца из другого цеха.
EXPECTED = {
    "3407г": "75", "1014": "2", "348": "30", "1071": "18", "6100": "17",
    "832л": "28", "4159л": "28", "184р": "184", "915л": "4", "129к": "40",
    "131": "4",
}


def connect():
    try:
        import psycopg2
        import psycopg2.extras
        return psycopg2.connect(**DB), psycopg2.extras.RealDictCursor
    except ImportError:
        pass
    try:
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(**DB), dict_row
    except ImportError:
        sys.exit("Нужен psycopg2-binary или psycopg[binary]: pip install psycopg2-binary")


def norm(s):
    if s is None:
        return ""
    s = str(s).strip().lower().replace(" ", "").replace(" ", "")
    for lat, cyr in (("a", "а"), ("c", "с"), ("e", "е"), ("o", "о"),
                     ("p", "р"), ("x", "х"), ("k", "к"), ("m", "м"), ("t", "т")):
        s = s.replace(lat, cyr)
    return s


def main():
    conn, row_factory = connect()
    cur = conn.cursor(row_factory=row_factory) if "psycopg." in str(type(conn)) \
        else conn.cursor(cursor_factory=row_factory)

    # Весь фонд ТПП одним рекурсивным запросом: скважина, куст, месторождение, цех.
    cur.execute("""
        WITH RECURSIVE root AS (
            SELECT "Id" FROM ois_vmap."OrganizationUnits"
            WHERE "OrganizationUnitType" = 1 AND "Name" LIKE %s AND "DeleteDate" IS NULL
        ),
        tree AS (
            SELECT u."Id", u."Name", u."ParentId", u."OrganizationUnitType"
            FROM ois_vmap."OrganizationUnits" u JOIN root r ON u."Id" = r."Id"
            UNION ALL
            SELECT c."Id", c."Name", c."ParentId", c."OrganizationUnitType"
            FROM ois_vmap."OrganizationUnits" c
            JOIN tree t ON c."ParentId" = t."Id"
            WHERE c."DeleteDate" IS NULL
        )
        SELECT w."Id"   AS well_id,
               w."Code" AS well_code,
               w."Name" AS well_name,
               w."OperationMode" AS operation_mode,
               kust."Name"  AS kust,
               field."Name" AS field,
               ceh."Name"   AS ceh
        FROM ois_vmap."Wells" w
        JOIN tree kust  ON kust."Id" = w."OrganizationUnitId" AND kust."OrganizationUnitType" = 4
        LEFT JOIN ois_vmap."OrganizationUnits" field ON field."Id" = kust."ParentId"
        LEFT JOIN ois_vmap."OrganizationUnits" ceh   ON ceh."Id"   = field."ParentId"
        WHERE w."DeleteDate" IS NULL
        ORDER BY ceh."Name", field."Name", kust."Name", w."Name"
    """, (TPP_NAME_LIKE,))
    fund = [dict(r) for r in cur.fetchall()]

    by_num = {}
    for w in fund:
        for key in (norm(w["well_name"]), norm(w["well_code"])):
            if key:
                by_num.setdefault(key, []).append(w)

    resolved, ambiguous, missing = [], [], []
    for num, kust in EXPECTED.items():
        cands = by_num.get(norm(num), [])
        if not cands:
            missing.append(num)
            continue
        exact = [c for c in cands if norm(c["kust"]) == norm(kust)]
        target = exact[0] if len(exact) == 1 else None
        entry = {
            "asked": num, "expected_kust": kust,
            "candidates": [{k: c[k] for k in
                            ("well_id", "well_code", "well_name", "kust", "field", "ceh")}
                           for c in cands],
            "kust_match": bool(exact),
        }
        (resolved if target else ambiguous).append(entry)

    result = {
        "tpp": TPP_NAME_LIKE,
        "fund_size": len(fund),
        "resolved": resolved,
        "ambiguous": ambiguous,
        "not_in_tpp": missing,
        "fund": fund,
    }

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fields2.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, default=str)

    print(f"Фонд ТПП: {len(fund)} скважин")
    print(f"Однозначно по номеру и кусту: {len(resolved)}")
    print(f"Неоднозначно (куст не сошёлся или несколько кандидатов): {len(ambiguous)}")
    if missing:
        print("Нет в ТПП вовсе:", ", ".join(missing))
    print("Записано:", out)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
