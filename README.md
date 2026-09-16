# GATE CSE PYQ Console

A static practice site built from your 3,126 GATE CSE previous-year questions
(all merged 1:1 with the fixed/corrected answer set — zero questions lost,
verified during the build).

## What's inside

- **14 subjects**, auto-organized by topic (and subtopic where the source
  data had one): Mathematics & Aptitude, Theory of Computation, Discrete
  Mathematics, Data Structures, Operating Systems, DBMS, Computer Networks,
  COA, Digital Electronics, Algorithms, Compiler Design, C Programming,
  Verbal Ability, Reasoning.
- **MCQ, MSQ and NAT** question types, all scored correctly (MSQ needs every
  correct option checked and nothing extra; NAT accepts any value inside the
  official accepted range).
- **Subject → topic browsing** with per-topic difficulty mix (Easy / Medium
  / Hard / Unrated, derived from each question's historical success rate).
- **A single flexible test builder** (`builder.html`) that covers year-wise
  practice, difficulty filtering, type filtering, and bookmarked-only sets —
  mix and match any of those instead of hunting through separate pages.
- **Timed or untimed tests**, with a custom total-duration timer you set per
  test, GATE-style question palette (answered / not answered / marked for
  review), flag-for-review, and bookmarking any question for later.
- **Results & review** with full solutions, correct/incorrect highlighting,
  and a one-click "retry incorrect + skipped" flow.
- **History** of every test you've taken, kept in your browser.

All progress (bookmarks, in-progress tests, history) is stored **locally in
your browser first** — the site works fully offline, with no account. If you
connect Supabase (below), your bookmarks, per-question outcomes, and test
history also sync to Postgres and merge across devices whenever you're
signed in; an in-progress test itself stays local only (not synced).

## Cloud sync (Supabase)

1. In your Supabase project, open **SQL Editor** and run everything in
   `supabase_schema.sql` (creates `bookmarks`, `question_outcomes`,
   `test_results`, all with row-level security so each person only ever
   sees their own rows).
2. Decide on **Authentication → Providers → Email → "Confirm email"**:
   leave it on for a public deployment (people confirm via email before
   they can sign in), or turn it off for a personal tool so account
   creation logs you straight in. No other auth/URL setup is needed —
   this uses plain email + password, not magic links.
3. Open `assets/js/config.js` and fill in the two values from
   **Project Settings → API**:
   ```js
   const CONFIG = {
     SUPABASE_URL: "https://xxxxxxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJ...",
   };
   ```
4. That's it — reload the site. A "Sync progress across devices" box
   appears at the bottom of the sidebar: "Create account" once with an
   email + password, then "Sign in" with the same two on any other
   device/browser to pull the same data down. Once signed in, bookmarks,
   per-question outcomes, and test history push to Postgres in the
   background and pull + merge back in on every page load.

Leaving `config.js` as the placeholder values is fine — the site quietly
runs local-only (the sidebar just says "Cloud sync not configured yet")
until you fill them in.

## Images

498 questions/solutions include real diagrams. These are currently loaded
directly from the original CDN (`cdn.knowledgegate.ai`) as-is, per your
instruction. If you later download them, drop the files somewhere like
`assets/images/<filename>` and run a find-and-replace across
`data/questions/*.json` to point `src="https://cdn.knowledgegate.ai/..."` at
your local copies — the HTML structure won't need to change.

## Running locally

Any static file server works, e.g.:

```bash
cd site
python3 -m http.server 8080
# open http://localhost:8080
```

(Opening `index.html` directly via `file://` won't work — the browser blocks
`fetch()` of the local JSON files under that protocol.)

## Deploying

**Vercel**
```bash
npm i -g vercel   # once
cd site
vercel --prod
```
No build step needed — it's picked up as a static site.

**GitHub Pages** (free)
1. Create a new **public** repo on GitHub (private repos need GitHub Pro for
   Pages).
2. Push the *contents* of this `site/` folder to the repo root — not the
   `site` folder itself, its contents (`index.html` should sit at the repo
   root):
   ```bash
   cd site
   git init
   git add .
   git commit -m "GATE CSE PYQ Console"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. On GitHub: repo → **Settings → Pages** → under "Build and deployment",
   set **Source** to "Deploy from a branch", **Branch** to `main` / `(root)`
   → Save.
4. Wait ~1 minute, then your site is live at
   `https://<you>.github.io/<repo>/`. No further Supabase configuration
   needed — email + password auth doesn't require a redirect URL allow list.

Everything here is plain static files (no build step, no `node_modules`),
so GitHub Pages serves it as-is — nothing else to configure.

## Data pipeline (for future re-runs)

`process_data.py` (not included in this bundle, kept from the build) reads
`pyq_questions.jsonl` + `pyq_answers_fixed.jsonl`, converts the rich-text
(Tiptap JSON) question/option/solution bodies to sanitized HTML, tags each
question with a difficulty bucket from `avgSuccessRate`, and writes:

- `data/manifest.json` — subject/topic counts for navigation
- `data/index.json` — a lightweight per-question index (id, subject, type,
  year, topic, difficulty) used for fast cross-subject filtering in the
  builder, without downloading full question text until a test actually
  starts
- `data/questions/<subject-slug>.json` — full question content per subject,
  loaded on demand

Math in LaTeX form (`\( ... \)`) renders client-side with KaTeX's
auto-render extension — no preprocessing needed, it just scans the rendered
DOM for those delimiters.
