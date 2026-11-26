import json
import os
import re
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "luminaread.db")
OUT_DIR = os.path.join(ROOT, "web", "mobile-assets")
os.makedirs(OUT_DIR, exist_ok=True)

EXAM_TAG_MAP = {
    "ky": "考研",
    "cet6": "六级",
    "cet4": "四级",
    "ielts": "雅思",
    "toefl": "托福",
    "gre": "GRE",
    "gk": "高考",
    "zk": "中考",
}


def parse_tags(tag_str: str):
    if not tag_str:
        return []
    seen = set()
    out = []
    for raw in tag_str.split():
        label = EXAM_TAG_MAP.get(raw.strip().lower())
        if label and label not in seen:
            seen.add(label)
            out.append(label)
    return out


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # 1. Export all articles with full 6 sections
    rows = conn.execute(
        """
        SELECT slug, stage, stage_label, order_num, title, difficulty,
               word_count, estimated_minutes, body, vocabulary_json,
               sentences_json, translation, quizzes_json, word_glossary_json,
               enrichment_status
        FROM articles
        ORDER BY stage ASC, order_num ASC, id ASC
        """
    ).fetchall()

    articles = []
    article_words = set()
    for r in rows:
        body = r["body"] or ""
        for tok in re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)*", body):
            article_words.add(tok.lower())
        articles.append(
            {
                "slug": r["slug"],
                "stage": r["stage"],
                "stage_label": r["stage_label"],
                "order_num": r["order_num"],
                "title": r["title"],
                "difficulty": r["difficulty"],
                "word_count": r["word_count"],
                "estimated_minutes": r["estimated_minutes"],
                "body": body,
                "vocabulary": json.loads(r["vocabulary_json"] or "[]"),
                "sentences": json.loads(r["sentences_json"] or "[]"),
                "translation": r["translation"] or "",
                "quizzes": json.loads(r["quizzes_json"] or "[]"),
                "word_glossary": json.loads(r["word_glossary_json"] or "{}"),
                "enrichment_status": r["enrichment_status"] or "complete",
            }
        )

    articles_path = os.path.join(OUT_DIR, "seed-articles.json")
    with open(articles_path, "w", encoding="utf-8") as f:
        json.dump(articles, f, ensure_ascii=False, separators=(",", ":"))

    # 2. Export compact offline dictionary:
    # Include all exam-tagged words + all words appearing in the 90 articles + common general English words
    dict_rows = conn.execute(
        "SELECT word, phonetic, short_meaning, full_meaning, tag FROM offline_dictionary"
    ).fetchall()

    compact = {}
    for r in dict_rows:
        w = r["word"]
        tag = (r["tag"] or "").strip()
        is_exam = bool(tag)
        in_articles = w in article_words
        if is_exam or in_articles or (len(w) <= 14 and " " not in w and "-" not in w and "'" not in w and len(compact) < 45000):
            compact[w] = [
                r["phonetic"] or "",
                r["short_meaning"] or "",
                r["full_meaning"] or r["short_meaning"] or "",
                parse_tags(tag),
            ]

    # Also merge dictionary_cache entries for article words not in offline_dictionary
    cache_rows = conn.execute(
        "SELECT word_key, phonetic, short_meaning, full_meaning FROM dictionary_cache"
    ).fetchall()
    for r in cache_rows:
        wk = (r["word_key"] or "").lower()
        if wk.startswith("phrase:") or not r["short_meaning"] or r["short_meaning"] == "暂未收录":
            continue
        if wk not in compact and (wk in article_words or len(wk) <= 18):
            compact[wk] = [
                r["phonetic"] or "",
                r["short_meaning"] or "",
                r["full_meaning"] or r["short_meaning"] or "",
                [],
            ]

    dict_path = os.path.join(OUT_DIR, "compact-dict.json")
    with open(dict_path, "w", encoding="utf-8") as f:
        json.dump(compact, f, ensure_ascii=False, separators=(",", ":"))

    conn.close()

    art_mb = os.path.getsize(articles_path) / (1024 * 1024)
    dict_mb = os.path.getsize(dict_path) / (1024 * 1024)
    print(f"Exported {len(articles)} articles -> {articles_path} ({art_mb:.2f} MB)")
    print(f"Exported {len(compact)} dict entries -> {dict_path} ({dict_mb:.2f} MB)")


if __name__ == "__main__":
    main()
