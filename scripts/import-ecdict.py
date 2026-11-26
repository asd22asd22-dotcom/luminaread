import csv
import io
import os
import re
import sqlite3
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "luminaread.db")
ZIP_PATH = os.path.join(ROOT, "data", "ecdict_master.zip")

POS_PREFIX_RE = re.compile(
    r"^(?:(?:adj|adv|vt|vi|v|n|prep|conj|pron|art|num|int|interj|aux|abbr|pl|a|ad|pref|suf|det|modal)\.(?:\s*\/\s*(?:adj|adv|vt|vi|v|n|prep|conj|pron|a|ad)\.)*\s*)+",
    re.IGNORECASE,
)
BRACKET_RE = re.compile(r"（[^）]*）|\([^)]*\)|\[[^\]]*\]|<[^>]*>")


def normalize_translation(raw: str) -> str:
    if not raw:
        return ""
    text = raw.replace("\\n", "\n").replace("\r\n", "\n")
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    return "；".join(lines)


def extract_short_meaning(raw: str) -> str:
    if not raw:
        return ""
    text = raw.replace("\\n", "\n").replace("\r\n", "\n")
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    if not lines:
        return ""

    chosen = lines[0]
    for ln in lines:
        if not ln.startswith("[") and "人名" not in ln and "地名" not in ln:
            chosen = ln
            break

    cleaned = POS_PREFIX_RE.sub("", chosen).strip()
    cleaned = BRACKET_RE.sub("", cleaned).strip()
    if not cleaned:
        cleaned = POS_PREFIX_RE.sub("", chosen).strip() or chosen

    parts = [p.strip() for p in re.split(r"[；;，,]", cleaned) if p.strip()]
    if not parts:
        return cleaned[:10]
    if len(parts[0]) <= 4 and len(parts) > 1 and len(parts[0]) + len(parts[1]) + 1 <= 10:
        return f"{parts[0]}；{parts[1]}"
    return parts[0][:10]


def parse_int(val: str) -> int:
    try:
        return int(val)
    except (TypeError, ValueError):
        return 0


def main():
    if not os.path.exists(ZIP_PATH):
        print(f"ERROR: zip not found at {ZIP_PATH}", file=sys.stderr)
        sys.exit(1)

    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        csv_name = None
        for info in zf.infolist():
            if info.filename.endswith("/ecdict.csv") or info.filename == "ecdict.csv":
                csv_name = info.filename
                break
        if not csv_name:
            print("ERROR: ecdict.csv not found inside zip. Entries:", zf.namelist()[:20], file=sys.stderr)
            sys.exit(2)

        print(f"Found {csv_name} inside {ZIP_PATH}, importing into SQLite...")

        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA busy_timeout = 10000;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS offline_dictionary (
              word TEXT PRIMARY KEY,
              phonetic TEXT NOT NULL DEFAULT '',
              short_meaning TEXT NOT NULL DEFAULT '',
              full_meaning TEXT NOT NULL DEFAULT '',
              tag TEXT NOT NULL DEFAULT '',
              exchange TEXT NOT NULL DEFAULT ''
            );
            """
        )

        best_entries = {}
        inflection_links = []

        with zf.open(csv_name, "r") as raw_stream:
            reader = csv.DictReader(io.TextIOWrapper(raw_stream, encoding="utf-8-sig", errors="replace"))
            for row in reader:
                word_raw = (row.get("word") or "").strip()
                trans = (row.get("translation") or "").strip()
                if not word_raw or not trans:
                    continue

                w_lower = word_raw.lower()
                has_space = " " in w_lower
                tag = (row.get("tag") or "").strip()
                collins = parse_int(row.get("collins"))
                oxford = parse_int(row.get("oxford"))
                bnc = parse_int(row.get("bnc"))
                frq = parse_int(row.get("frq"))
                exchange = (row.get("exchange") or "").strip()

                if has_space:
                    if not (tag or collins or oxford or bnc or frq):
                        continue
                    if len(w_lower) > 32:
                        continue
                else:
                    if len(w_lower) > 28:
                        continue
                    if not re.match(r"^[a-z][a-z'\-]*$", w_lower):
                        continue

                score = (
                    (100 if word_raw == w_lower else 0)
                    + (50 if tag else 0)
                    + (30 if oxford else 0)
                    + (collins * 5)
                    + (20 if bnc > 0 else 0)
                    + (20 if frq > 0 else 0)
                )

                prev = best_entries.get(w_lower)
                if prev is None or score > prev[0]:
                    phonetic_raw = (row.get("phonetic") or "").strip()
                    phonetic = f"/{phonetic_raw.strip('/')}/" if phonetic_raw else ""
                    short_m = extract_short_meaning(trans)
                    full_m = normalize_translation(trans)
                    if short_m:
                        best_entries[w_lower] = (score, phonetic, short_m, full_m, tag, exchange)

                if exchange and not has_space:
                    for part in exchange.split("/"):
                        if ":" not in part:
                            continue
                        code, target = part.split(":", 1)
                        target_l = target.strip().lower()
                        if code in ("d", "p", "i", "3", "s", "r", "t") and target_l and target_l != w_lower:
                            if re.match(r"^[a-z][a-z'\-]*$", target_l):
                                inflection_links.append((target_l, w_lower))

        backfilled = 0
        for inflected, base in inflection_links:
            if inflected not in best_entries and base in best_entries:
                base_entry = best_entries[base]
                best_entries[inflected] = (
                    1,
                    base_entry[1],
                    base_entry[2],
                    base_entry[3],
                    base_entry[4],
                    f"0:{base}",
                )
                backfilled += 1

        print(f"Prepared {len(best_entries)} dictionary entries (including {backfilled} inflected forms). Writing to DB...")

        conn.execute("BEGIN")
        conn.execute("DELETE FROM offline_dictionary")
        batch = [
            (w, data[1], data[2], data[3], data[4], data[5])
            for w, data in best_entries.items()
        ]
        conn.executemany(
            """
            INSERT OR REPLACE INTO offline_dictionary
              (word, phonetic, short_meaning, full_meaning, tag, exchange)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            batch,
        )
        conn.commit()
        total = conn.execute("SELECT COUNT(*) FROM offline_dictionary").fetchone()[0]
        conn.close()
        print(f"SUCCESS: offline_dictionary now holds {total} entries.")

    try:
        os.remove(ZIP_PATH)
        print(f"Removed temp archive {ZIP_PATH}")
    except OSError as e:
        print(f"Warning: could not remove temp zip: {e}")


if __name__ == "__main__":
    main()
