# Fieldwork — local job search

A standalone, single-user Windows application for scientific, analytical, environmental and research opportunities. Jobs, settings, source history, commute results and application records live in SQLite on **your computer**. There are no npm dependencies, AI calls, accounts, telemetry, hosted databases or ChatGPT/Codex runtime dependencies.

## Start here

If downloading from GitHub, choose **Code → Download ZIP**, then **Extract All** before following these steps. Run the application from the extracted folder, not from inside the ZIP.

1. Keep this entire folder in a permanent location.
2. Double-click **Setup.cmd** once. It installs a private Node.js 24 runtime in `.runtime`, verifies SQLite, creates Desktop and Start menu shortcuts, then opens the application.
3. Subsequently, double-click **Fieldwork Job Search** on the Desktop/Start menu, or **Launch Fieldwork.cmd**.
4. Your default browser opens **http://localhost:4317**. On a new installation, open **Settings** and enter your skills, qualifications and commute origin. Then choose **Search now** and review **Source Health** for actual coverage.

Setup copies an existing independent Node.js 24 installation when available. Otherwise, it downloads the official Windows LTS distribution over HTTPS and checks its SHA-256 against the publisher's checksum file. It does not download a runtime from ChatGPT or Codex. After setup, `.runtime/node.exe` is sufficient. `package.json` is the dependency manifest; its dependencies are intentionally empty.

Windows 10/11, PowerShell 5.1+, a modern browser and about 200 MB of free space are recommended. New vacancy discovery and live transport routes need internet access. Existing jobs, deterministic assessment, deduplication, manual estimates, tracking, export and backups work offline. Losing a ChatGPT subscription has no effect.

The repository contains application code and neutral initial settings. Your saved jobs, application notes, settings/API keys, logs, backups and installed runtime stay on your computer and are excluded by `.gitignore`. Downloading the repository on another computer does not restore your records: use the database backup and recovery steps below. GitHub is not needed to run the installed application.

## What closing things does

| Action | Result |
|---|---|
| Close the browser | Server and internal scheduler continue running. Reopen with the shortcut. |
| Close ChatGPT or Codex | No effect. The launcher starts a separate Windows process. |
| Settings → Stop application | Stops the local web server and its scheduler. All records remain saved. |
| Restart Windows | Restart with the shortcut; alternatively enable the optional Windows schedule below. |
| Turn off / sleep the computer | No searches occur. Overdue work can catch up once it is running again. |

The app records the real execution time. It never invents runs for periods when the computer was off.

## Optional Windows automatic searches

Double-click **Enable Scheduled Searches.cmd**. It registers a current-user task named `Fieldwork Job Search - <username>`:

- Checks hourly and at sign-in, executing `.runtime/node.exe server.mjs --search-once` through a hidden PowerShell script.
- Only due sources are checked. The default interval is 24 hours for NHS/academic sources and 48–72 hours for employers. Change intervals in Source Health.
- Uses Windows `StartWhenAvailable` to catch up after missed triggers. A source’s persisted due time also provides catch-up when the application starts.
- Runs while you are **signed in**, including with the screen locked. It does not require a terminal, ChatGPT, Codex or an open browser.
- A SQLite lease prevents simultaneous searches by the server and Windows task. Abandoned leases expire after five minutes.
- Scheduled logs are in `logs/scheduled-YYYY-MM-DD.log`; detailed source records are in SQLite and Source Health.

Double-click **Disable Scheduled Searches.cmd** to remove the task. Turning off automatic searches in Settings pauses scheduled source searches from both the app and the scheduled runner; housekeeping still runs. Startup catch-up controls the immediate startup check; while automatic search is on, the regular one-minute scheduler subsequently checks overdue sources.

If registration is blocked by organisational Windows policy, open Task Scheduler → Create Task: current user, **Run only when user is logged on**, logon and hourly triggers, **Run task as soon as possible after a scheduled start is missed**. Action: `powershell.exe`; arguments: `-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "FULL-PATH\scripts\ScheduledRun.ps1"`; start in the application folder. The command files set execution policy only for that invocation, never machine-wide.

## Searching and coverage

**Automatic, without a key:** NHS Jobs official XML feeds (including an explicit UKHSA government source), public Greenhouse, Lever and SmartRecruiters employer endpoints, and bounded personal-use retrieval of jobs.ac.uk listings and their structured vacancy metadata. Employer connectors are configurable in Source Health. Feeds and custom authorised employer JSON-LD pages can be added there.

**Browser search + text/link import:** Civil Service Jobs, LinkedIn, Indeed, Gradcracker, Environmentjob, Kew and Rothamsted. These are prominently identified as manual sources. Direct Civil Service Jobs currently serves a verification challenge; it is not circumvented. UKHSA's official NHS syndication is only partial Civil Service coverage, not a substitute for Defra/APHA/MHRA/ONS/DHSC/DSIT/DESNZ searches. Search contains dedicated Civil Service and wider-web query links.

**Optional wider-web automation:** Enter a Brave Search API key in Settings to discover employers and indexed Civil Service adverts across the configured scientific job families. This uses a search API, not AI, and is subject to the provider’s own pricing/limits. Without a key, the other automatic sources and all core functions work. Indexed Civil Service snippets with blocked full adverts remain unverified Explore records; they cannot qualify as Complete Hits.

Paste the full advert, including essential/desirable headings, when an import cannot read the page. LinkedIn and Indeed automated retrieval is deliberately disabled. Importing the same URL enriches the existing record. Every record retains its source links. When an original employer advert merges with an aggregator result, a recognised direct employer URL is preferred.

Scans are intentionally bounded: NHS up to ten pages of 100 records and 60 full adverts per query, prioritising title relevance before retrieving details; jobs.ac.uk first 25 advert details from the latest results page; Lever up to 1,200 posts; SmartRecruiters up to 300 UK posts. NHS keyword searches can match broad advert text, so a short initial page is not sufficient coverage. Clearly unrelated titles and recognised overseas locations are filtered before storage; source logs retain scanned and scope-filtered counts. Limits, missing details, HTTP errors and verification challenges are reported. Use focused queries to narrow large result sets. A partial scan is not a claim to have exhausted a board. A failed source never counts as zero vacancies successfully checked. Search now requests an immediate scan; a focused query does not change the normal source due times or global profile.

The initial source set covers scientific employers and academic/health feeds; it does not claim complete coverage of every organisation or every job board. Workday and university-specific ATS variants can be added through permitted feeds or page imports; there is no universal Workday API connector in this version. See [research notes](docs/RESEARCH.md) and [validation](docs/VALIDATION.md).

## How suitability works

No language model is used. The engine extracts headings and requirement sentences, recognises early-career evidence, compares your actual skill list, checks known mandatory qualification/experience barriers, and produces reasons and evidence gates.

Complete Hits must satisfy **all eight** checks: early-career accessibility, strong relevant skill overlap, eligible commute/UK remote location, salary preference, adequate essential-requirement evidence, recent open-status verification, credible employer and an application URL. Keyword score alone is insufficient. Unknown evidence stays unconfirmed. Open checks older than seven days lose the gate; housekeeping reassesses daily. No exceptional result is fabricated to populate the tab.

**Needs review** retains plausible overlaps with unresolved requirements, career level or location. These are conditional leads, not verified recommendations. The discovery summary separates all records, fully verified matches, strong matches, conditional leads and filtered records, and explains the most common unresolved checks. An empty Complete Hits view is not evidence that no suitable jobs exist or that every employer has been searched.

Required experience beyond your configured ceiling, known absent professional registrations and mandatory qualifications are barriers. A senior title alone triggers review of the actual grade and experience rather than automatic rejection. Desirable criteria do not cause mandatory rejection. Publisher-labelled essential/desirable lists take precedence over guesses from boilerplate. Explicit alternatives such as SQL or Python are assessed as alternatives. Unfamiliar essential criteria need review. Record pending/unconfirmed qualifications separately in Settings: a pending MSc cannot establish an awarded degree. A role without entry-level wording can qualify using explicit 0–2 year requirements or a review of accessibility. Excluded employer names are stored in local Settings.

Supported skill names: `python`, `pandas`, `numpy`, `sql`, `duckdb`, `git`, `linux`, `data quality`, `data integration`, `dashboards`, `automation`, `statistics`, `data analysis`, `visualisation`, `machine learning`, `bioinformatics`, `computational biology`, `biology`, `neuroscience`, `research`, `laboratory`, `proteomics`, `mass spectrometry`, `databases`, `scientific computing`. Additional text can be recorded, but adding an unknown name does not create a new matcher. New installations start with empty skills, qualifications, profile summary and commute origin. Enter your own details in Settings; no personal profile is distributed in the source code. Existing installations retain their saved SQLite settings.

Plant/agriculture and child/population research have explicit category rules. Generic childcare, teaching and care roles are excluded. `Great match`, `Relevant` and `Not for me` adjust bounded local ranking weights. This cannot bypass Complete Hit gates. You can inspect filtered records in Search.

Rule extraction is conservative, not a full understanding of every advert. Open job details to review essential criteria and record verified facts. Known hard barriers remain in force after a review. Unknown descriptions, salary units, professional registrations, geography and experience statements can require manual checking.

## Commutes

Enter your own commute origin in Settings. It is blank on a new installation and lives only in the local database. An exact workplace postcode/address or station is required; a broad city label is not routed as a workplace. TfL returns public-transport journeys for the next weekday at 08:00, and the fastest returned route is stored as an **estimate**, including destination, checked time, departure and route summary. Results are cached for seven days. A changed origin invalidates old eligibility. The user may enter a clearly labelled estimate when live routing is unavailable; it expires after 30 days. No distance-based times are invented. A station route does not include an unknown onward workplace walk; use the workplace postcode when possible.

An otherwise strong job slightly above the configured commute threshold (45 minutes on a new installation) appears as **Borderline commute** within Explore. The default allowance is 10 minutes. Unconfirmed routes cannot pass the Complete Hit location gate.

## Applications and archiving

Use **Apply / Track** to record Interested, Preparing, Applied, Interview, Assessment, Offer, Rejected or Withdrawn. Notes, application/closing/interview/follow-up dates, salary, contact, URL, CV version and cover-letter status persist locally. Saving this form does **not** submit an external application. Submit directly to the employer.

Daily housekeeping archives a vacancy only when its closing date is **strictly earlier than yesterday in London** and it is not protected. Applied, Interview, Assessment and Offer are protected. For extra protection, a record that has ever been applied to (or has an application date) stays protected even if later rejected or withdrawn. Archived records are retained under **Expired / Not Applied**, never deleted. Restoring an expired record sets an exemption so tomorrow’s housekeeping does not immediately rearchive it.

Closing dates used for expiry are the vacancy’s advertised closing date, not an independently edited application-planning date. Confirm advertised date corrections in the job detail review.

## Backup, export and recovery

**Preferred:** Settings → **Back up database** or double-click **Backup Fieldwork.cmd**. This uses SQLite’s online backup API for a consistent snapshot, including jobs, all source links, application histories, settings, keys, source logs and commute cache. A `.sqlite` snapshot is created under `backups/`; the UI also offers a browser download. Keep another copy on a separate drive.

**Readable export:** Settings → **Export JSON** includes jobs, application records/history, sources and preferences; API keys are omitted. The full SQLite backup is the supported restore format. JSON is for independent use/analysis; this version has no bulk JSON restore importer.

**Restore on this or another Windows computer:**

1. Disable the Windows scheduled task if installed and stop the local application in Settings.
2. Keep a copy of the existing `data` folder. Do not overwrite a live SQLite database.
3. Create a new empty `data` folder and copy the chosen backup into it, renaming the file to **fieldwork.sqlite**. Do not bring old `fieldwork.sqlite-wal` or `fieldwork.sqlite-shm` files into the restored folder.
4. Keep the entire project folder and run **Setup.cmd**. Recreate shortcuts/scheduling after moving the folder. Settings and records are read from the restored database.
5. Confirm your applications and sources, then re-enable the schedule if desired.

For a manual backup, stop both server and scheduled tasks first, then copy the **entire** data folder. Do not copy only the main database file while writers are active: recent transactions may be in SQLite’s WAL file. Keys and application notes are sensitive local data; backups are not encrypted by the app.

Recovery from a runtime problem: preserve `data/` and `backups/`, rename `.runtime` to `.runtime-old`, then run Setup.cmd to provision Node again. No npm install is needed. If startup fails, a message box identifies the error; inspect `logs/launcher-errors.log` and `logs/server-*.error.log`. For port conflicts use an unused port through `FIELDWORK_PORT`, ensuring the same variable is set for your launcher. The server binds only to `127.0.0.1`.

## Developers / maintenance

Optional terminal commands (users normally use launchers):

```powershell
.\.runtime\node.exe server.mjs
.\.runtime\node.exe server.mjs --search-once --force
.\.runtime\node.exe server.mjs --backup
.\.runtime\node.exe --test tests/*.test.mjs
```

`FIELDWORK_DATA_DIR` overrides the data directory. `FIELDWORK_PORT` defaults to 4317. The backend is native Node HTTP plus SQLite; the UI is local HTML/CSS/JavaScript with no CDN assets. Connectors output the common schema from `src/util.mjs`. See `src/sources.mjs` to add adapters and `src/engine.mjs` to improve rule extraction. The core has no AI integration; future enrichment should be optional and must not determine availability of deterministic assessment.

The server enforces local Host validation and a per-process token for mutations, refuses cross-origin writes, escapes advert text in the browser and blocks private-network retrieval. It is designed for one trusted Windows user, not multi-user/LAN hosting. Files are protected by the current user's Windows permissions, not application authentication.
