# Quranic Topics — Ontology Explorer Notes

> **Translation CMS:** this folder also contains a static web app (`web/`) and tooling (`scripts/`) for community
> translations. `topics.db` stays the source of truth. See [CONTRIBUTING.md](CONTRIBUTING.md).

Reference notes for `topics.db` and how QuranApp consumes it in Compose.

**DB path:** see [`db_path.txt`](db_path.txt) → `app/src/main/assets/db/topics.db`  
**App entry:** `ActivityQuranicTopics` → `QuranicTopicsScreen`

---

## What this is

A packaged SQLite ontology of Quranic topics: entities (people, places, concepts, …), three hierarchy lenses, soft “related” links, and verse membership. The Android app exposes two browse modes — **Ontology Explorer** and **Thematic Topics** — plus search.

| Table | Role | Approx. size |
|---|---|---|
| `topics` | Node identity (`slug`, `type`, `flags`, optional image) | ~2.5k |
| `topic_localizations` | Titles/descriptions (`en` all, `ar` subset) | ~3.5k |
| `relationships` | Typed edges `src` (child) → `tgt` (parent) | ~1.7k |
| `topic_ayahs` | Topic ↔ verse (`ayah_id` = `surah*1000 + ayah`) | ~31k |

---

## Topic flags

Bitmask on `topics.flags` (`TopicFlags`):

| Value | Meaning |
|---|---|
| `0` | Neither curated tree (hidden / catalog-only) |
| `1` | Thematic |
| `2` | Ontology |
| `3` | Both |

Primary **roots** for each UI tree are topics with the matching flag that have **no parent** of that tree’s relationship type.

---

## Relationship types

Convention: **`src_topic_id` = child**, **`tgt_topic_id` = parent** (except `related`, which is bidirectional in queries).

| DB type | App use |
|---|---|
| `ontology_parent` | Entity “is-a” tree (Ontology Explorer) |
| `thematic_parent` | Curated thematic browse tree |
| `parent` | Broader keyword/index graph — used to attach **supplemental** topics not in the two curated trees |
| `related` | Soft associations (“Connected Concepts” on detail) |

`parent` and `thematic_parent` child sets are largely disjoint. `ontology_parent` is a smaller typed taxonomy (e.g. Human → Historic People → Quraysh).

---

## Topic `type` values

Entity kinds stored as free text, e.g.:

`concept` · `category` · `object` · `place` · `animal` · `prophet` · `person` · `body_part` · `event` · `plant` · `angel` · `religion` · `scripture` · `jinn`

Most rows are `concept` or `category`.

---

## App architecture

```
ActivityQuranicTopics
  └─ QuranicTopicsScreen (NavHost)
       ├─ TopicsListScreen      roots + paged supplemental
       ├─ TopicsDetailScreen    hero, verses, children, related
       └─ QuranicTopicsSearchScreen
            │
QuranicTopicsViewModel
            │
TopicsRepository  ←  TopicsDao (Room)  ←  assets/db/topics.db
```

### Screens (`compose/screens/quranictopics/`)

| File | Role |
|---|---|
| `QuranicTopicsScreen.kt` | Nested nav: ontology / thematic / topic detail / search |
| `TopicsListScreen.kt` | Root list; primary roots then “broader catalog”; infinite scroll for supplemental pages |
| `TopicsDetailScreen.kt` | Hero, verse previews, subtopics, broader children, connected concepts; breadcrumb trail in route |
| `QuranicTopicsSearchScreen.kt` | Debounced search; opens detail with inferred tree + breadcrumb path |

UI pieces live under `compose/components/quranic_topics/` (`Hero`, `TopicCards`, `TopicCommon`, …).

### Data layer

| Piece | Role |
|---|---|
| `TopicsDatabase` | Room DB, `createFromAsset("db/topics.db")` |
| `TopicsDao` | Roots, children, verses, related, hierarchy edges, search candidates |
| `TopicsRepository` | Language (`en` only for now), supplemental assignment, search scoring/paths, verse previews via translation factory |
| `QuranicTopicsViewModel` | Roots + detail cache (capped), maps rows → `TopicNode` |

### Supplemental (“broader catalog”) topics

Many topics have `flags = 0` and sit only on the `parent` graph. The repository:

1. Walks curated **visible** ontology/thematic trees (flagged roots + their `*_parent` descendants).
2. Treats remaining topics as **hidden**.
3. Unions them via `parent` edges (disjoint-set); assigns each component to ontology or thematic by which curated tree it touches (default thematic if ambiguous).
4. Surfaces orphan supplemental roots under “More topics from broader catalog”, paged (40 at a time).

Detail screens show primary children for the active tree, then optional broader-catalog children from that assignment.

### Search

1. SQL `LIKE` over title / short / description → candidates.  
2. Best ancestor trail over `parent` + `ontology_parent` + `thematic_parent` (prefer ontology, then thematic).  
3. Score by title match quality, path, verse count.  
4. Prefer hits whose path matches the current tree; otherwise fall back to all hits.

### Entry points

- Home verse collections → Ontology or Thematic (`HomeSectionVersesCollections`)
- Global exclusive search → deep-link with `topic_id` + `topic_trail` (`ExclusiveSearchResults`)
- Intent extras: `screen_type`, `topic_id`, `topic_trail`

---

## Detail screen content (order)

1. **Hero** — title, breadcrumbs, image, counts  
2. **Explore** — shortcuts when verses / subtopics / related exist  
3. **Verse refs** — all ayah refs + a few translation previews  
4. **Go Deeper / Subtopics** — tree children  
5. **More from broader catalog** — supplemental children  
6. **Connected Concepts** — `related` edges  

Empty leaf titles that look like “see X” redirects may navigate to a matching topic by normalized title (`resolveChildTopicNavigationTarget`).

---

## Key source paths (QuranApp)

```
app/src/main/assets/db/topics.db
app/.../activities/reference/ActivityQuranicTopics.kt
app/.../compose/screens/quranictopics/
app/.../compose/components/quranic_topics/
app/.../viewModels/QuranicTopicsViewModel.kt
app/.../repository/TopicsRepository.kt
app/.../db/TopicsDatabase.kt
app/.../db/dao/TopicsDao.kt
app/.../db/entities/topics/
app/.../db/DatabaseProvider.kt          # getTopicsRepository / createFromAsset
```

---

## Mental model

- **Ontology tree** = typed entity taxonomy (`ontology_parent` + flag bit 2).  
- **Thematic tree** = curated browse themes (`thematic_parent` + flag bit 1).  
- **Parent graph** = glue for the rest of the catalog into those two explorers.  
- **Related** = lateral links, not hierarchy.  
- **topic_ayahs** = what the reader opens when exploring a topic’s verses.
