# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

This is a personal knowledge base documenting children's art education from 2013–2026. Content was exported from 有道云笔记 (Youdao Cloud Notes). There are no build, test, or development commands — this is a documentation-only repository.

## Directory structure

```
宝贝作品/               # All art notes and assets (~470 items)
  note-title.md          # Markdown note with metadata header
  note-title/            # Corresponding asset directory (images, PDFs, videos, docx)
```

Each note is a **paired unit** of a `.md` file and a same-named subdirectory holding its assets. Not all `.md` files have a corresponding subdirectory, and vice versa (233 dirs vs 236 `.md` files as of May 2026).

Two CSV files at root level (`宝贝作品 HASH.csv` and `宝贝作品 HASH_all.csv`) are database exports from the source note system. The `_all` variant includes a `Created Time` column with original timestamps.

## Note format

Every note starts with a metadata block:

```markdown
# Title (date + description, optionally @child_name)

Date: YYYY/MM/DD
星期: DayOfWeek
年龄: DecimalAge
生日: YYYY/MM/DD      # child's birthday
Tags: comma,separated
```

File references use URL-encoded paths pointing into the same-named subdirectory:
- Images: `![alt](subdir/filename.png)`
- Files: `[name](subdir/filename.pdf)`

## Key conventions

**Children** (referenced via `@name` in titles):
- `@圆圆` / 任羿霏 — main subject, born 2010/08/28 (appears in most notes)
- `@丞丞` — sibling, appears in earlier works
- `@成成` — sibling, appears in earlier works

**Art schools** (chronological):
- 天智 (2014) → 新点美术 (2015–2017) → 东城国际 (2017) → 雨花树 (2018–2019) → 玩美之徒 (2021–2022) → 天艺四方 (2024–present)

**Common tags**: `作品` (artwork), `含视频` (contains video), `老师` (teacher-related)

**Naming patterns**:
- Most files: `YYYY-MM-DD 描述 @child HASH.md` — the hex hash is from Youdao Cloud Notes
- Series use `「」` brackets, e.g. `「新高一暑假美术课」结构素描6 27`
- Some older notes lack the hash suffix

## Working with this repo

- Do not rename or reorganize files without understanding the paired `.md` ↔ subdirectory relationship — file references within notes use URL-encoded paths relative to the note's directory
- The CSV files are the source-of-truth index of all notes; the `Date` and `Created Time` fields may differ
- When adding new notes, follow the existing metadata format and place assets in a matching subdirectory
