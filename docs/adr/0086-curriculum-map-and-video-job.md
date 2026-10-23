# ADR 0086: A curriculum map of the books, book pointers on claims, and a video job runner

Status: proposed (agent, at the owner's request of 2026-10-23: build the engine side of the YourTutor and EduVideoEngine plan; the owner agreed that the NCERT books are used for structure and page references only, with no book text; the owner is asked to confirm this record). Supersedes nothing. The package contract gains a section (ENGINE_INTERFACE.md section 10); no recorded planner request changes key.

## Context
The owner supplied the NCERT mathematics books for Classes VII to XII as PDFs (`assets/CBSE maths`, 91 files). Every book is all rights reserved: no part may be reproduced or stored without the publisher's written permission, and none has been asked for. The engine needs to say where a topic sits in a book and to run a request for a video from start to end with progress, failure reasons and a resume, without reading book text into any record, prompt or index.

## Decision
1. **A book map, structure only.** `scripts/curriculum/extract.py` (`pnpm curriculum:extract`) reads the chapter PDFs with `pdftotext` and writes `knowledge/books/cbse-maths.json`: per book, chapter file, kind, title, page counts, the section headings (`2.3 Relationship between ...`) and the printed page each is on (the offset between file page and printed page is the most common difference over the pages whose header has a number). Titles of Class X chapters come from its printed contents (`titleSource: contents`); other titles are automatic (`auto`) and may be wrong. `pageRangeConfirmed` is false until a person sets it. Nothing else of a book is read into the output; a test pins the fields.
2. **The rights ledger gets the books.** `config/sources.json` entry `ncert-maths-books`, licence `all-rights-reserved`, `permittedUses: ["reference-only"]` (a new use). `validateKb` refuses a book map whose ledger entry is missing or permits wording or claim checks.
3. **Pointers, not text.** A curriculum node may carry `book: { bookId, section }`, `lessonSkillId` and `lessonNote`; a claim may carry `citations: [{ bookId, section, confirmed? }]`. `validateKb` refuses a citation or a node book that is not a section of the map, and a node tied to a book section whose taught claims do not all cite it. `confirmed` is for a person only, like `humanReviewed`.
4. **The first grounded topic: Class X section 2.3** (`cbse.10.maths.ch02.s2_3`, printed pages 18 to 23 by the map). `knowledge/chapters/maths-polynomial-zeroes.json` holds three concepts and ten claims in the project's own words (owner-original notes): seven supported by those notes (tier B) and three computed claims proved in exact arithmetic (tier A: a zero of `2x^2-8x+6`, the sum and the product of its zeroes against `-b/a` and `c/a`). The book is a pointer.
5. **The lesson of that topic is the existing verified sum-of-roots lesson** (`MATH.ALG.QUAD.SUM_OF_ROOTS`, made for Chapter 4). It says "roots of a quadratic equation" where section 2.3 says "zeroes of a polynomial", and it teaches the sum but not the product. This is said in `lessonNote` and shown in `sources.json`. The law compiler (ADR 0081) was tried first and does not fit: it assumes a multiplication mistake and physical units.
6. **The video job runner** (`pnpm video:job`, `scripts/video-job.ts`, pure parts in `packages/pipeline/job/job.ts`): request, retrieve, ground, build, render, qa. Events are JSON lines; the state of a job is computed from them; a stage whose input hash is unchanged and whose output exists is skipped; the same idempotency key finds a finished job; a signal cancels. The request names a curriculum place and never a student. A place that is not in the knowledge base ends as `no_curriculum_data`, a place without a lesson as `no_lesson_for_topic`. Replay mode only. `assets/` is git-ignored.

## What this does not do (said so the owner is not misled)
- No person has read the claims against the book's pages, and no one has confirmed the page ranges; `sources.json` says so. The video does not say it "follows the textbook".
- The map has gaps: Part II of Grade 9 and Part II of Class XII have no sections found (their headings differ); Class X section 5.3 is missing; chapter titles outside Class X are automatic. Grade 8 Part II is not in the folder.
- No captions file is produced; the video has the on-screen text and the voice.
- The lesson is not in the book's words (roots, not zeroes) and has no product beat. Writing one is the next piece of authoring.
- The voice is a development voice (ADR 0084); the lesson is not publishable until its grounded claims are approved.

## Consequences
- A new board, year or subject arrives as data: books in the map, a ledger entry, a chapter file and a node.
- YourTutor can import the book map as data and call `pnpm video:job` through a worker (ENGINE_INTERFACE.md section 10); nothing of the engine's code crosses.
