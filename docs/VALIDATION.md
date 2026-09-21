# Validation

Validated on Windows on 21 September 2026 using the private `.runtime/node.exe` (Node 24.16.0 / SQLite 3.53.0). Synthetic tests use isolated temporary databases; no synthetic vacancy or application is stored in the user's production dashboard.

## Automated tests

`node --test tests/*.test.mjs`: **48 tests passing**. Coverage includes all eight Complete Hit gates; essential versus desirable experience; written-out experience numbers; PhD/MSc/professional-registration barriers; unknown technical skills; remote geography and misleading TELECOMMUTE metadata; commute limits, stale cache and origin changes; annual GBP salary handling; plant and child-research families; protected application statuses; all application fields after reopening SQLite; full HTTP-server shutdown/restart; strict earlier-than-yesterday archiving; restoration exemptions; duplicates and distinct references; online backup recovery; concurrent-process leases; startup catch-up and pause settings; failed-source isolation; manual-source accounting; XML/JSON-LD parsing; localhost Host/CSRF protections; blank personal settings on fresh installations; saved profile preservation across restart; refusing commute eligibility without a configured origin.

Follow-up regression tests cover publisher-labelled requirements overriding boilerplate; SQL, dashboards and data QA; explicit SQL/Python alternatives; R&D not implying R programming; pending qualifications remaining unconfirmed; conditional leads not bypassing Complete Hit gates; senior titles alone remaining reviewable; excluded employers; confirmed excessive commutes staying outside the conditional local shortlist; NHS discovery beyond the former three-page bound with documented query parameters.

## Discovery follow-up

The initial coverage was too narrow to reproduce a broad researcher-led search. AlphaSights and four additional academic searches were added. A live check of those five sources added 41 distinct records. A separate expanded NHS analyst scan read 689 feed records, selected 113 relevant-title records, and added 98 records; 576 unrelated titles were excluded before storage. These are discovery counts, not counts of suitable jobs. The NHS scan reported partial coverage because full-detail retrieval is bounded at 60 adverts. King's College vacancy pages can be imported with full visible advert text; its search listing disallows automated access and is not bypassed. The dashboard now distinguishes discovery totals, strong matches, conditional leads and filtered records, with reasons for unresolved checks.

## Live source checks

The first real run retrieved **1,179 source records**, merged **36 duplicate discoveries**, and stored **1,143 distinct vacancies** across **14 automatic sources**. Eight sources reported partial coverage because of page/detail limits or missing structured metadata. No automatic source completely failed during that run. Failure handling was tested separately with a deliberately failing adapter and persisted error logs.

| Source | Live result |
|---|---|
| NHS Jobs | Four keyword feeds retrieved 30, 30, 2 and 30 results. First three pages per query are the configured bound; truncated feeds are marked partial. |
| Civil Service / UKHSA official NHS syndication | 15 adverts discovered; 14 newly added and one merged. Government coverage also included an APHA Molecular Biologist / Bioinformatician advert via jobs.ac.uk. |
| Direct Civil Service Jobs | HTTP 200 returned a human-verification page, **not vacancies**. Direct automated discovery remains blocked; browser search/import and the separate official syndication source are clearly distinguished. |
| jobs.ac.uk | Plant science: 12 adverts. Bioinformatics, environmental science and child development: 15 details each. Research-data-analyst query: 3 usable structured adverts; a missing-JobPosting warning was retained. |
| Greenhouse / Isomorphic Labs | 29 live adverts. |
| Lever / Veeva | 920 live adverts, mostly filtered by geography, career level or relevance. |
| SmartRecruiters / LGC and Eurofins | 17 and 46 UK adverts respectively, with details fetched for relevant titles. |
| LinkedIn and Indeed | Browser search links and pasted-text import are implemented. **No automated scraping or authenticated account access is claimed or enabled.** |
| Wider web | Browser search links work without a key. Brave API adapter is implemented but **not live-tested with a paid/configured key**. Existing ATS and academic sources provide live wider-employer discovery. |

Repeating the two-result NHS bioinformatics query produced **zero new jobs** and left the total at **1,143**, verifying real deduplication. This repeat appears as its own actual-time run in Source Health.

Suitability was checked using a locally configured profile. Missing early-career, essential-requirement or location evidence prevented unverified results from qualifying as Complete Hits. Standards were not lowered; personal profile settings and shortlist results are omitted from this public record. Examples of discovered subject matter include plant-functional genomics, agricultural research assistants, molecular modelling/biochar fertiliser, bioinformatics, and child-development research. Discovery is not a recommendation: many are intentionally filtered for seniority or qualification barriers.

Two real-data problems found during review became regression tests: a data product manager with strategic ownership must not qualify on “2+ years” alone, and a generic TELECOMMUTE schema tag must not prove a laboratory job is fully remote. Database familiarity is not assumed to prove SQL proficiency.

## Transport

Live TfL requests returned public-transport estimates for two workplace destinations. Repeating an identical request used the persisted cache (`cached: true`). Personal origin settings and route details are omitted from this public record. Estimates retain timestamps locally and do not guarantee future journeys. Unresolved workplace addresses display unavailable; no commute times are fabricated.

## Windows and browser operation

- Setup copied an independently installed Node executable to `.runtime/node.exe` and verified native SQLite.
- Desktop and Start menu shortcuts were created. The final launcher opens the default browser and exits, leaving the hidden Node server running. A loopback health-check issue caused by the system proxy was found and fixed using a process-local proxy bypass and 127.0.0.1.
- Both server restart and relaunch were tested. Launcher and server use no ChatGPT/Codex paths or subscription services. Closing ChatGPT/Codex and rebooting the entire computer were **not physically performed during this development session**; independence is supported by the separate runtime/process architecture and restart tests.
- The optional Windows Task Scheduler definition was constructed and exported successfully using actual Windows ScheduledTasks cmdlets. It has hourly/logon triggers, `StartWhenAvailable`, interactive current-user execution and `IgnoreNew` overlap policy. It is **not enabled automatically**. An actual overnight/offline wakeup was not simulated.
- In an isolated `.qa` database, the browser form saved an Applied record with notes, application/interview/follow-up dates, salary, contact, URL, CV version and cover-letter status. The server was stopped and restarted; Applications and the reopened edit form retained the values. This did not create an application in the real data folder or submit anything externally.
- The UI was inspected at normal in-app size and tested at 1280-pixel desktop and 390-pixel mobile widths. The tested pages had no document-level horizontal overflow; mobile navigation intentionally scrolls. The real dashboard had no browser warnings/errors during inspection.
- Backups were created and opened as valid SQLite files; the automated test restored a backup into a fresh data directory and verified the application record. JSON export was checked for persistent records and omitted API keys.

## Remaining limits

No all-web completeness claim is made. Workday does not have a native connector here. User-added RSS and JSON-LD connectors have parser tests, but each added publisher still needs its own live validation and permission checks. Ads can change, omit essential information, or be incorrectly structured by their publishers. The deterministic engine is intentionally conservative and supports explicit user review. API keys, Task Scheduler policy and real off/on behaviour on a future Windows installation remain installation-specific.

## Supplied repository and assisted Indeed follow-up

The ZIP was inspected without executing third-party code. The catalogue was adapted with MIT attribution, and a native Ashby connector, hosted-board URL identification and guided Indeed pasted-text drafts were added. New regression coverage checks Ashby listed/unlisted posts, explicit UK remote evidence and secondary locations; malformed upstream schemas; supported versus spoofed board hosts; canonical Indeed job keys; unchanged application records after duplicate imports; and preview routes that do not save jobs. Source creation is idempotent for the same provider, board and region.

Live checks on 21 September 2026 returned 52 listed Synthesia posts, five Improbable posts and 193 Wayve posts. After title/geography scope filtering, the first application run stored 74 new records (six Synthesia, zero Improbable, 68 Wayve), with three sources checked and zero failures. Counts are discoveries, not suitable recommendations. The supplied DeepMind Greenhouse board returned HTTP 404 and was omitted from the catalogue. Other optional catalogue entries have not all been live-validated in this session.

The real database was backed up before restarting through the Windows launcher. Existing records were preserved. Browser validation confirmed that changing Indeed terms/recency updates the external search link, a pasted synthetic advert produces editable fields with evidence checkboxes unset, preparing a draft saves no vacancy, and a hosted Ashby URL identifies the correct board. No synthetic record was saved to the production database. The updated browser screen reported no console warnings/errors. Indeed itself was not scraped or automatically searched.
