"""
Export high-paying leads as a CSV for the WhatsApp Agent Desk "Outreach" page.

    python export_whatsapp_leads.py                 # data/high_paying_leads.csv -> data/whatsapp_leads.csv
    python export_whatsapp_leads.py in.csv out.csv

Each row carries what the dashboard's AI needs to write a message for exactly that
business: phone in international format, business name, top pain points, the
client-facing impact, the pitch angle and the Maps link. Leads without a usable
phone number are skipped (and counted).

maps_lead_rag.py also calls export_whatsapp_csv() at the end of every run.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_IN = BASE_DIR / "data" / "high_paying_leads.csv"
DEFAULT_OUT = BASE_DIR / "data" / "whatsapp_leads.csv"

OUT_COLUMNS = [
    "phone", "name", "category", "city", "country", "rating", "reviews",
    "website", "website_broken", "pay_score", "pain_points", "client_impact",
    "pitch_angle", "maps_link",
]

# Calling codes for numbers written without "+". Google Maps usually shows "+1 ..." for
# foreign businesses, so this is only a fallback.
COUNTRY_CODES = {
    "canada": "1", "usa": "1", "united states": "1", "us": "1",
    "india": "91", "united kingdom": "44", "uk": "44", "australia": "61",
    "new zealand": "64", "united arab emirates": "971", "uae": "971",
    "singapore": "65", "ireland": "353", "germany": "49", "france": "33",
    "south africa": "27", "saudi arabia": "966", "qatar": "974",
}

MAX_PAIN_POINTS = 3
MAX_POINT_CHARS = 220


def normalize_phone(raw: str, country: str) -> str | None:
    """Digits with country code (no '+'), or None when it can't be a WhatsApp number."""
    raw = (raw or "").strip()
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("+") or raw.startswith("00"):
        digits = digits[2:] if raw.startswith("00") else digits
    else:
        code = COUNTRY_CODES.get((country or "").strip().lower())
        if not code:
            return None
        digits = digits.lstrip("0")
        if not digits.startswith(code) or len(digits) <= 10:
            digits = code + digits
    return digits if 11 <= len(digits) <= 15 else None


def clean_text(s: str) -> str:
    s = (s or "").replace("�", "'")
    return re.sub(r"\s+", " ", s).strip()


def pain_points(problems: str) -> list[str]:
    """'1) A ... 2) B ...' -> ['A ...', 'B ...'] (first 3, trimmed)."""
    text = clean_text(problems)
    if not text:
        return []
    parts = re.split(r"(?:^|\s)\d{1,2}[).]\s*", text)
    parts = [p.strip(" ;.-") for p in parts if p.strip(" ;.-")]
    if len(parts) <= 1:
        parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()]
    out = []
    for p in parts[:MAX_PAIN_POINTS]:
        # Drop section labels like "LEAD CAPTURE:" or "Trust & proof gaps:".
        p = re.sub(r"^[A-Za-z &/]{3,40}:\s*", "", p)
        if len(p) > MAX_POINT_CHARS:
            p = p[:MAX_POINT_CHARS].rsplit(" ", 1)[0] + "…"
        out.append(p)
    return out


def clean_website(url: str) -> str:
    url = (url or "").strip()
    try:
        u = urlparse(url)
    except ValueError:
        return ""
    if u.scheme not in ("http", "https") or not u.netloc or "." not in u.netloc:
        return ""  # e.g. Google ad redirect links like https:///aclk?...
    return f"{u.scheme}://{u.netloc}{u.path}".rstrip("/")


def export_whatsapp_csv(in_path: Path = DEFAULT_IN, out_path: Path = DEFAULT_OUT) -> dict:
    """Writes the WhatsApp CSV. Returns counts: {'written', 'skipped_no_phone', 'duplicates', 'path'}."""
    in_path, out_path = Path(in_path), Path(out_path)
    stats = {"written": 0, "skipped_no_phone": 0, "duplicates": 0, "path": str(out_path)}
    if not in_path.exists():
        return stats
    with in_path.open(encoding="utf-8", errors="replace", newline="") as f:
        rows = list(csv.DictReader(f))

    seen: set[str] = set()
    out_rows = []
    for r in rows:
        phone = normalize_phone(r.get("phone", ""), r.get("country", ""))
        if not phone:
            stats["skipped_no_phone"] += 1
            continue
        if phone in seen:
            stats["duplicates"] += 1
            continue
        seen.add(phone)
        out_rows.append({
            "phone": phone,
            "name": clean_text(r.get("name", "")),
            "category": clean_text(r.get("category", "")),
            "city": clean_text(r.get("city", "")),
            "country": clean_text(r.get("country", "")),
            "rating": clean_text(r.get("rating", "")),
            "reviews": clean_text(r.get("review_count", "")),
            "website": clean_website(r.get("website_url", "")),
            "website_broken": "yes" if str(r.get("is_broken", "")).strip().lower() in ("1", "true", "yes") else "no",
            "pay_score": clean_text(r.get("pay_score", "")),
            "pain_points": " | ".join(pain_points(r.get("website_problems", ""))),
            "client_impact": clean_text(r.get("client_problem_translation", ""))[:600],
            "pitch_angle": clean_text(r.get("pitch_angle", ""))[:300],
            "maps_link": (r.get("google_maps_link", "") or "").strip(),
        })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    # utf-8-sig so Excel opens it with the right characters too.
    with out_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLUMNS)
        w.writeheader()
        w.writerows(out_rows)
    stats["written"] = len(out_rows)
    return stats


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IN
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    s = export_whatsapp_csv(src, dst)
    print(f"Wrote {s['written']} leads to {s['path']} "
          f"(skipped {s['skipped_no_phone']} without a WhatsApp-able phone, {s['duplicates']} duplicates).")
    print("Upload it on Agent Desk -> Outreach.")
