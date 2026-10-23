"""
Curriculum structure extractor (ADR 0086).

Reads the NCERT maths chapter PDFs under assets/CBSE maths and writes knowledge/books/cbse-maths.json: for each book, each chapter file, its section headings
("2.3 Relationship between ...") and the page each heading is on (the page of the PDF file, and the number printed in the page header).

STRUCTURE ONLY. Titles of sections and page numbers are kept; no sentence, equation, figure or exercise of a book is read into the output. The books are all rights
reserved (config/sources.json), so the output is pointers: it says where a topic sits, never what the book says there.

usage: python scripts/curriculum/extract.py [--check]   (--check compares with the file on disk and exits 1 on a difference)
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets" / "CBSE maths"
OUT = ROOT / "knowledge" / "books" / "cbse-maths.json"

# The books, as read from their preliminary pages. `folder` is as named in assets/; Grade 8's second part is not in the folder (the folder named "CLASS VIII ... PART 2" holds Grade 7 Part II).
BOOKS = [
    {"id": "cbse.8.maths.p1", "folder": "CLASSVIII MATHS BOOK PART 1", "grade": 8, "part": 1, "title": "Ganita Prakash, Grade 8, Part I", "edition": "First edition July 2025, reprint January 2026"},
    {"id": "cbse.7.maths.p2", "folder": "CLASS VIII MATHS BOOK PART 2", "grade": 7, "part": 2, "title": "Ganita Prakash, Grade 7, Part II", "edition": "First edition October 2025",
     "note": "The folder is named Class VIII Part 2 but the book is Grade 7 Part II; Grade 8 Part II is not in assets/."},
    {"id": "cbse.9.maths.p1", "folder": "CLASS IX MATHS PART 1", "grade": 9, "part": 1, "title": "Ganita Manjari, Grade 9, Part I", "edition": "First edition April 2026"},
    {"id": "cbse.9.maths.p2", "folder": "CLASS IX MATHS PART 2", "grade": 9, "part": 2, "title": "Ganita Manjari, Grade 9, Part II", "edition": "First edition August 2026"},
    {"id": "cbse.10.maths", "folder": "CLASS X MATHS", "grade": 10, "part": None, "title": "Mathematics, Class X", "edition": "Revised October 2022, reprint 2026-27"},
    {"id": "cbse.11.maths", "folder": "CLASS XI MATHS", "grade": 11, "part": None, "title": "Mathematics, Class XI", "edition": "Revised November 2022, reprint 2026-27"},
    {"id": "cbse.12.maths.p1", "folder": "CLASS XII MATHS", "grade": 12, "part": 1, "title": "Mathematics, Class XII, Part I", "edition": "Revised October 2022, reprint 2026-27"},
    {"id": "cbse.12.maths.p2", "folder": "CLASS XII MATHS PART 2", "grade": 12, "part": 2, "title": "Mathematics, Class XII, Part II", "edition": "Revised January 2023, reprint 2026-27"},
]

HEAD = re.compile(r"^(A\.\d+\.\d+|\d+\.\d+)\s+([A-Z][^\n]*?)\s*(?:\.{2,})?$")
CODE = re.compile(r"^[a-z]+(?:[0-9]?)(?:mh|gp)?[0-9]?([0-9]{2}|a[12]|an|ps|sm)\.pdf$")


def pages_of(pdf: Path) -> list[list[str]]:
    out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, check=True).stdout.decode("utf-8", "replace")
    pages = out.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    return [[l.rstrip() for l in p.split("\n") if l.strip()] for p in pages]


def printed_number(lines: list[str]):
    if not lines:
        return None
    first = lines[0].strip()
    m = re.match(r"^(\d{1,4})\b", first) or re.search(r"\b(\d{1,4})$", first)
    return int(m.group(1)) if m else None


def page_offset(pages: list[list[str]]):
    """printed page number minus file page number, the most common value over the pages whose header has a number (None when no page has one)."""
    votes: dict[int, int] = {}
    for i, lines in enumerate(pages):
        n = printed_number(lines)
        if n is not None and 0 < n < 600:
            votes[n - (i + 1)] = votes.get(n - (i + 1), 0) + 1
    if not votes:
        return None
    best = max(votes.items(), key=lambda kv: kv[1])
    return best[0] if best[1] >= 2 else None


# Titles read from the contents page of the Class X book by a person-checkable source: the printed contents list. Other books keep the automatic title (titleSource "auto"), to be confirmed.
TITLES = {
    ("cbse.10.maths", n): t
    for n, t in enumerate(
        ["Real Numbers", "Polynomials", "Pair of Linear Equations in Two Variables", "Quadratic Equations", "Arithmetic Progressions", "Triangles", "Coordinate Geometry",
         "Introduction to Trigonometry", "Some Applications of Trigonometry", "Circles", "Areas Related to Circles", "Surface Areas and Volumes", "Statistics", "Probability"], 1)
}


def kind_of(stem: str):
    tail = stem[-2:]
    if tail == "ps":
        return "prelims", None
    if tail == "an":
        return "answers", None
    if tail == "sm":
        return "supplement", None
    if tail in ("a1", "a2"):
        return "appendix", int(tail[1])
    return "chapter", int(tail)


def chapter_title(pages: list[list[str]]):
    if not pages:
        return None
    lines = pages[0][:8]
    for i, l in enumerate(lines):
        s = l.strip()
        if re.match(r"^Chapter\s+\d+$", s, re.I) and i + 1 < len(lines):
            return lines[i + 1].strip().title()
        m = re.match(r"^([A-Z][A-Z ,&'-]{4,})\s+\d{1,2}$", s)
        if m:
            return m.group(1).strip().title()
        m = re.match(r"^\d{1,2}\s+([A-Z][A-Za-z ]+)$", s)
        if m and "MATHEMATICS" not in s:
            nxt = lines[i + 1].strip() if i + 1 < len(lines) and not HEAD.match(lines[i + 1].strip()) else ""
            return (m.group(1) + (" " + nxt if nxt and len(nxt) < 40 else "")).strip()
        if re.match(r"^(Appendix \d)$", s) and i + 1 < len(lines):
            return lines[i + 1].strip().title()
    return None


def sections_of(pages: list[list[str]], number, offset):
    seen, out = set(), []
    for idx, lines in enumerate(pages):
        for l in lines[1:]:
            m = HEAD.match(l.strip())
            if not m:
                continue
            num, title = m.group(1), m.group(2).strip().rstrip(".").strip()
            if num in seen or len(title) < 3 or len(title) > 90:
                continue
            if number is not None and not num.startswith(f"{number}.") and not num.startswith(f"A.{number}."):
                continue
            seen.add(num)
            out.append({"number": num, "title": title, "filePage": idx + 1, "printedPage": (idx + 1 + offset) if offset is not None else None})
    return out


def build():
    books = []
    for b in BOOKS:
        folder = ASSETS / b["folder"]
        pdfs = sorted(folder.rglob("*.pdf"))
        chapters = []
        for pdf in pdfs:
            kind, number = kind_of(pdf.stem)
            pages = pages_of(pdf)
            offset = page_offset(pages)
            title = chapter_title(pages) if kind in ("chapter", "appendix") else None
            known = TITLES.get((b["id"], number)) if kind == "chapter" else None
            chapters.append({
                "file": pdf.name,
                "kind": kind,
                "number": number,
                "title": known or title,
                "titleSource": "contents" if known else ("auto" if title else "none"),
                "fileCount": len(pages),
                "printedFirst": (1 + offset) if offset is not None else None,
                "printedLast": (len(pages) + offset) if offset is not None else None,
                "sections": sections_of(pages, number, offset) if kind in ("chapter", "appendix") else [],
                "pageRangeConfirmed": False,
            })
        chapters.sort(key=lambda c: ({"prelims": 0, "chapter": 1, "appendix": 2, "answers": 3, "supplement": 4}[c["kind"]], c["number"] or 0))
        books.append({**{k: v for k, v in b.items() if k != "folder"}, "folder": b["folder"], "chapters": chapters})
    return {
        "schema": 1,
        "comment": "Structure only (ADR 0086): section titles and page numbers of NCERT chapter files. No text of any book. Rights: see config/sources.json (permittedUses is empty).",
        "tool": "scripts/curriculum/extract.py",
        "ledgerId": "ncert-maths-books",
        "books": books,
    }


if __name__ == "__main__":
    data = build()
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if "--check" in sys.argv:
        same = OUT.exists() and OUT.read_text(encoding="utf-8") == text
        print("curriculum map is up to date" if same else "curriculum map differs from the books: run the extractor")
        sys.exit(0 if same else 1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    total = sum(len(c["sections"]) for b in data["books"] for c in b["chapters"])
    print(f"wrote {OUT}: {len(data['books'])} books, {sum(len(b['chapters']) for b in data['books'])} files, {total} sections")
