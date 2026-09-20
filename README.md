# Trao AI Interview Prep Kit

Welcome to the **Trao AI Interview Prep Kit** repository. This project is a production-grade, full-stack AI interview preparation platform built with **Next.js 15 (App Router)**, **Tailwind CSS**, **Node.js**, **Express**, **MongoDB (Mongoose)**, and **JavaScript (ES Modules)**.

It includes a fully decoupled 8-stage LLM generation pipeline, an SSRF-hardened company research web crawler, deterministic coverage checking and targeted gap remediation, a deterministic study schedule allocator (1–60 days), an interactive optimistic kit builder with state-preserving selective regeneration, a flashcard practice mode with confidence-weighted revision ordering, and the mandatory Trao batch evaluation CLI conforming strictly to Appendix B.

---

## 1. Project Directory Structure

```
trao-ai-interview-prep-kit/
├── package.json                         # Monorepo root scripts (dev, test, lint, evaluate)
├── .gitignore                           # Monorepo-wide gitignore
├── README.md                            # Complete architecture, evaluation & setup guide
├── cases.sample.json                    # Sample batch evaluator test cases
├── backend/                             # Express + Node.js + MongoDB API Service
│   ├── package.json                     # Backend dependencies (ES Modules: "type": "module")
│   ├── .env.example                     # Backend environment variable template
│   ├── .env                             # Local backend environment file
│   ├── eslint.config.js                 # Modern ESLint 9 Flat Config
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.js                   # Validated environment loader (fail-fast)
│   │   │   └── db.js                    # Mongoose connection with exponential backoff
│   │   ├── middleware/
│   │   │   ├── auth.js                  # JWT cookie authentication & user context
│   │   │   ├── errorHandler.js          # Centralized JSON error envelope
│   │   │   ├── notFound.js              # 404 Route handler
│   │   │   ├── rateLimiter.js           # Sliding window IP rate limiters
│   │   │   └── requestLogger.js         # Morgan request logging
│   │   ├── controllers/
│   │   │   ├── authController.js        # Register, login, logout, session check
│   │   │   ├── healthController.js      # Deep health telemetry (uptime, memory, DB)
│   │   │   ├── kitController.js         # CRUD, modules, builder mutations, regeneration
│   │   │   ├── practiceController.js    # Flashcard practice session, ratings, metrics
│   │   │   └── researchController.js    # On-demand company web crawler endpoint
│   │   ├── routes/
│   │   │   ├── auth.js                  # /api/v1/auth
│   │   │   ├── health.js                # /api/v1/health
│   │   │   ├── kits.js                  # /api/v1/kits (generation, builder, schedule)
│   │   │   ├── practice.js              # /api/v1/kits/:id/practice (flashcard mode)
│   │   │   ├── research.js              # /api/v1/research (crawler)
│   │   │   └── index.js                 # Central API router
│   │   ├── models/
│   │   │   ├── User.js                  # User schema with bcrypt password hashing (cost 12)
│   │   │   └── PrepKit.js               # PrepKit, modules, questions, schedule, state model
│   │   ├── services/
│   │   │   ├── research/                # Company Web Research Pipeline
│   │   │   │   ├── urlValidator.js      # SSRF protection, RFC 1918 & metadata blocker
│   │   │   │   ├── linkRanker.js        # Heuristic BFS link discovery & relevance scoring
│   │   │   │   ├── htmlCleaner.js       # Cheerio noise stripping & semantic formatting
│   │   │   │   ├── promptSanitizer.js   # XML tag breakout stripping & prompt isolation
│   │   │   │   └── crawlerService.js    # Safe fetch, depth/size limits, retry backoff
│   │   │   ├── llm/                     # Decoupled Multi-Stage LLM Pipeline
│   │   │   │   ├── providers/           # Provider factory (OpenAI, Anthropic, Gemini, Mock)
│   │   │   │   ├── stages/              # Stages 1 to 8 (Requirements -> Flashcards)
│   │   │   │   ├── schemaValidator.js   # JSON schema validation & requirement ID cross-checking
│   │   │   │   ├── jsonRepair.js        # Resilient JSON repair (fences, trailing commas)
│   │   │   │   └── llmPipelineService.js# Pipeline orchestrator & kit contract validator
│   │   │   ├── coverage/                # Deterministic Coverage Checking & Remediation
│   │   │   │   ├── coverageChecker.js   # Inspects targetRequirementIds, zero-LLM arithmetic
│   │   │   │   └── remediationService.js# Targeted missing question generator (pass 2)
│   │   │   ├── scheduler/               # Deterministic Schedule Allocator
│   │   │   │   └── scheduleAllocator.js # Exact N-day distribution (1-60 days), must-haves early
│   │   │   ├── editor/                  # Editable Kit Builder Engine
│   │   │   │   └── kitEditorService.js  # State machine, mutations, selective regeneration
│   │   │   └── practice/                # Flashcard Practice Engine
│   │   │       └── flashcardPracticeService.js # Confidence scoring, deterministic priority queue
│   │   ├── scripts/
│   │   │   └── evaluate.js              # Mandatory Trao Batch Evaluator CLI entry point
│   │   ├── app.js                       # Express app configuration (Helmet, CORS, parsers)
│   │   └── server.js                    # Server bootstrap with graceful shutdown
│   └── tests/                           # Hermetic automated unit test suites (84 tests)
│       ├── health.test.js
│       ├── auth.test.js
│       ├── crawler.test.js
│       ├── llmPipeline.test.js
│       ├── coverage.test.js
│       ├── scheduler.test.js
│       ├── editor.test.js
│       ├── practice.test.js
│       ├── evaluator.test.js
│       └── rateLimiter.test.js
└── frontend/                            # Next.js 15 App Router + Tailwind CSS
    ├── package.json                     # Frontend dependencies & Next.js scripts
    ├── .env.example                     # Frontend environment template
    ├── .env.local                       # Local frontend environment file
    ├── next.config.js                   # Next.js configuration
    ├── tailwind.config.js               # Tailwind CSS configuration
    ├── postcss.config.js                # PostCSS configuration
    ├── .eslintrc.json                   # Next.js ESLint rules
    └── src/
        ├── app/
        │   ├── layout.js                # Root layout with responsive Navbar & Toast Provider
        │   ├── page.js                  # Hero, features overview, live backend health probe
        │   ├── login/page.js            # Login view with validation & error handling
        │   ├── register/page.js         # Registration view with password strength check
        │   ├── kits/
        │   │   ├── page.js              # Kit library, creation modal, generation progress
        │   │   └── [id]/
        │   │       ├── page.js          # Interactive Kit Builder workspace (edit, pin, regen)
        │   │       └── practice/
        │   │           └── page.js      # Interactive Flashcard Practice Mode with spaced repetition
        │   └── globals.css              # Tailwind baseline directives & animations
        ├── components/
        │   ├── Navbar.js                # Sticky navigation bar with auth session badge
        │   ├── HealthBadge.js           # Live backend polling & memory telemetry badge
        │   └── Footer.js                # Platform footer
        └── lib/
            ├── api.js                   # Standardized fetch client (cookies, timeouts, errors)
            └── authContext.js           # Global React authentication provider
```

---

## 2. Mandatory Trao Batch Evaluator

The repository implements the exact batch evaluator command specified in the Trao Assessment.

### Command Syntax

From the monorepo root directory:
```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

*(You can also run directly from within `backend/`: `npm run evaluate -- --input <cases.json> --output <kits.json>`)*

### Clean-Clone Verification (No Running MongoDB Required)
The batch evaluator uses the shared, pure-functional pipeline engine (`backend/src/services/llm/llmPipelineService.js`). It executes hermetically in memory, requiring **no active MongoDB daemon** to be running.

```bash
# Run against the included sample test cases:
npm run evaluate -- --input cases.sample.json --output kits.sample.json
```

Output:
```
======================================================
 Trao AI Interview Prep Kit - Batch Evaluator v1.0
======================================================
Input file:   cases.sample.json (5 test cases)
Output file:  kits.sample.json
Provider:     default
Started at:   2026-09-20T04:36:30.077Z
------------------------------------------------------

[1/5] Processing case "case-01" (days: 5, url: "https://stripe.com")...
  ✔ Case "case-01" succeeded in 5.42s (Requirements: 4, Questions: 4, Score: 100%)
[2/5] Processing case "case-02" (days: 3, url: "http://localhost:3000")...
  ✔ Case "case-02" succeeded in 0.66s (Requirements: 4, Questions: 4, Score: 100%)
[3/5] Processing case "case-03" (days: 14, url: "https://openai.com")...
  ✔ Case "case-03" succeeded in 0.52s (Requirements: 4, Questions: 4, Score: 100%)
[4/5] Processing case "case-04" (days: 7, url: "https://example.com")...
  ✖ Case "case-04" failed in 0.00s: Case is missing required "jd" (job description) string.
[5/5] Processing case "case-05" (days: 1, url: "https://github.com")...
  ✔ Case "case-05" succeeded in 5.52s (Requirements: 4, Questions: 4, Score: 100%)

------------------------------------------------------
Batch evaluation complete in 12.12s
Results: 4 succeeded, 1 failed (5 total)
Output saved to: kits.sample.json
======================================================
```

### Input Format
An array of test cases:
```json
[
  {
    "id": "case-01",
    "jd": "Staff Distributed Systems Engineer. You will design and operate high-throughput event-driven microservices processing 100k+ transactions/sec using Node.js, Apache Kafka, and PostgreSQL...",
    "company_url": "https://stripe.com",
    "days": 5
  },
  {
    "id": "case-02",
    "jd": "Senior Frontend Engineer. Build highly responsive web applications using React, Next.js, and Tailwind CSS...",
    "company_url": "http://localhost:3000",
    "days": 3
  }
]
```

### Output Format (Appendix B Compliance)
```json
{
  "version": "1.0",
  "generated_at": "2026-09-20T04:36:42.000Z",
  "kits": [
    {
      "id": "case-01",
      "status": "ok",
      "kit": {
        "targetRole": "Staff Distributed Systems Engineer",
        "targetCompany": "Stripe",
        "companyUrl": "https://stripe.com",
        "jobDescriptionRaw": "...",
        "requirements": [
          {
            "id": "req-tech-1",
            "text": "Distributed systems engineering with Node.js",
            "kind": "technical",
            "priority": "must-have",
            "sourceSnippet": "..."
          }
        ],
        "companyBrief": { "overview": "...", "techStack": [...] },
        "roleBreakdown": { "seniority": "Staff", "dayToDayResponsibilities": [...] },
        "modules": [...],
        "flashcards": [...],
        "coverageScore": 100,
        "schedule": [...]
      },
      "error": null
    },
    {
      "id": "case-04",
      "status": "error",
      "kit": null,
      "error": "Case is missing required \"jd\" (job description) string."
    }
  ]
}
```

### Batch Evaluator Guarantees
1. **Identical Pipeline**: Calls the exact same `generateCompleteKit()` function used by the web application controller.
2. **Error Resilience**: Does not abort on a failed test case. Continues processing subsequent cases and records the exact error message.
3. **Localhost Support**: Allows `http://localhost:*` and `http://127.0.0.1:*` URLs for automated evaluator test fixtures while still strictly blocking cloud metadata IP addresses (`169.254.169.254`).
4. **Execution Speed**: 5 cases complete in ~12 seconds (well under the 15-minute maximum limit).
5. **CLI Options**: Supports `--input`, `-i`, `--output`, `-o`, and optional `--provider` (`gemini`, `openai`, `anthropic`, `mock`).

---

## 3. Core Architecture & Subsystems

### A. Company Research Web Crawler & SSRF Guard
- **SSRF Hardening**: Validates protocol (`http`/`https` only), strips IPv6 brackets, rejects private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) in public mode, and unconditionally blocks cloud metadata endpoints (`169.254.169.254`).
- **Discovery**: Crawls the homepage, extracts useful links, resolves relative URLs, and ranks URLs using anchor text and slug relevance (+50 for Careers/Jobs, +45 for Engineering/Tech, +35 for Culture/About, -60 for Privacy/Terms/Login).
- **Safety**: Cheerio strips scripts, styles, navs, footers, and cookie banners. Text is capped at 15,000 characters.
- **Untrusted Prompt Isolation**: Retreived text is treated strictly as untrusted data. Breakout closing tags (`</untrusted_company_source>`) are neutralized, and content is encapsulated within strict XML boundaries with anti-injection instructions.

### B. 8-Stage Decoupled LLM Generation Pipeline
Rather than relying on a single brittle prompt, kit generation is partitioned into 8 decoupled, sequential stages:
1. **Stage 1**: Extract atomic requirements from the job description (stable IDs: `req-tech-N`, `req-behav-N`, `req-domain-N`, `req-system-N`; kind, priority, JD quote). Honestly flags sparse JDs without hallucinating.
2. **Stage 2**: Synthesize Company Brief from retrieved web sources inside injection-resistant XML blocks.
3. **Stage 3**: Generate Role Breakdown (seniority, core challenges, day-to-day responsibilities).
4. **Stage 4**: Generate Technical Questions (each question MUST explicitly reference `targetRequirementIds`).
5. **Stage 5**: Generate Behavioral Questions (STAR outlines, evaluation rubric).
6. **Stage 6**: Generate System Design Questions (only generated if seniority and role type warrant it).
7. **Stage 7**: Generate Company-Fit Questions (culture, mission, product alignment).
8. **Stage 8**: Generate High-Yield Flashcards (front prompt, back key points, difficulty).

### C. Deterministic Coverage Checking & Remediation
- **Zero LLM Arithmetic**: Coverage calculation is completely deterministic in code (`coverageChecker.js`).
- **Inspection**: Analyzes `targetRequirementIds` across all generated questions against the requirement list.
- **Remediation Loop**: If any must-have or nice-to-have requirements remain uncovered, a second pass generates questions targeted *strictly* to the uncovered IDs.
- **Honest Reporting**: If any requirements still remain uncovered after remediation, they are honestly reported in `uncoveredGaps` rather than hidden.

### D. Deterministic Schedule Allocator (1–60 Days)
- **Zero LLM Arithmetic**: All day allocations, study minutes, and question distributions are computed deterministically (`scheduleAllocator.js`).
- **Guarantees**:
  - Exactly matches requested day count $N \in [1, 60]$.
  - Every must-have requirement appears in the schedule.
  - Prioritizes must-have and harder (HARD/MID) questions earlier in the timeline.
  - Every day has a theme/focus title, question IDs, and integer study minutes.
  - Handles the 1-day sprint edge case and 60-day spaced-repetition edge case cleanly.

### E. Editable Kit Builder & State Model
- **State Model**:
  - `origin: 'GENERATED'`: Generated by initial LLM pipeline.
  - `origin: 'USER_EDITED'`: Modified by the user; increments `revision` counter.
  - `origin: 'USER_CREATED'`: Added manually by the user; automatically pinned.
  - `isPinned: boolean`: Explicit user lock preventing automated replacement.
- **Selective Non-Destructive Regeneration**:
  - Regenerating the **Company Brief** updates only the brief; questions and schedule are untouched.
  - Regenerating a **Question Category** (e.g., Technical):
    $$Q_{\text{preserve}} = \{ q \in M \mid q.\text{isPinned} = \text{true} \lor q.\text{origin} \in \{\text{'USER\_CREATED'}, \text{'USER\_EDITED'}\} \}$$
    $$Q_{\text{replaceable}} = \{ q \in M \mid q.\text{isPinned} = \text{false} \land q.\text{origin} = \text{'GENERATED'} \}$$
    Replaces only $Q_{\text{replaceable}}$ with fresh questions while preserving all user edits, manual additions, and pinned questions.
- **Optimistic Concurrency Control**:
  - Uses an integer `version` field. Concurrent conflicting edits trigger HTTP 409 Conflict to prevent lost updates.

### F. Flashcard Practice Mode
- **Algorithm**: Deterministic confidence-weighted spaced repetition ordering.
- **Scoring**:
  - Low confidence (1): Priority weight 400
  - Uncovered (never reviewed): Priority weight 300
  - Medium confidence (2): Priority weight 200
  - High confidence (3): Priority weight 100
- **Ties**: Resolved deterministically by oldest `lastReviewedAt` timestamp, then stable card ID.
- **State**: Tracks `reviewCount`, `confidenceLevel`, and `isCovered`. Persists updates in MongoDB and allows session progress resetting.

---

## 4. Installation & Quickstart

### Prerequisites
- **Node.js**: v18+ (tested on Node.js v24 LTS)
- **npm**: v9+ (tested on npm v11)
- **MongoDB**: Local MongoDB on `mongodb://localhost:27017` or MongoDB Atlas URI (required for web app; *not required for batch evaluator*).

### 1. Clone and Install Dependencies
```bash
# Clone the repository
git clone <repo-url>
cd trao-ai-interview-prep-kit

# Install dependencies across root, backend, and frontend
npm run install:all
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in both `backend` and `frontend`:

**Backend (`backend/.env`):**
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/trao_prep_kit
JWT_SECRET=your-super-secure-jwt-secret-min-32-characters
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
CLIENT_URL=http://localhost:3000

# LLM Provider Configuration (mock, gemini, openai, anthropic)
LLM_PROVIDER=mock
# GEMINI_API_KEY=your-gemini-api-key
# OPENAI_API_KEY=your-openai-api-key
# ANTHROPIC_API_KEY=your-anthropic-api-key
```

**Frontend (`frontend/.env.local`):**
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_APP_NAME="Trao AI Interview Prep Kit"
```

### 3. Run Automated Tests
```bash
npm test
```
Runs 84 unit and integration tests across 20 test suites using Node.js built-in test runner.

### 4. Run Linters
```bash
npm run lint
```
Runs ESLint 9 Flat Config on `backend/` and Next.js ESLint on `frontend/`. Zero errors and zero warnings.

### 5. Start Development Servers
```bash
npm run dev
```
Starts Express backend on `http://localhost:5000` and Next.js frontend on `http://localhost:3000` concurrently with color-coded log streams.

---

## 5. Verification & Smoke Testing

### 1. Batch Evaluator Smoke Test
```bash
npm run evaluate -- --input cases.sample.json --output kits.sample.json
```
Verify that `kits.sample.json` is created with valid Appendix B JSON formatting and 5 processed cases.

### 2. Health & Telemetry Probe
```bash
curl http://localhost:5000/api/v1/health
```
Returns HTTP 200 with system uptime, memory metrics, and MongoDB connection status.

### 3. End-to-End Web App Flow
1. Open `http://localhost:3000`.
2. Register a new account at `/register` (passwords hashed with bcrypt cost 12).
3. Navigate to `/kits` and click **"Generate Prep Kit"**.
4. Enter a job description and company URL.
5. Watch the real-time 8-stage progress indicator.
6. In the Kit Builder (`/kits/[id]`):
   - Edit questions, answer frameworks, and rubrics.
   - Toggle pin status on critical questions.
   - Move questions between categories and reorder them.
   - Click **"Regenerate Category"** and verify that your edited and pinned questions are preserved while unpinned generated questions are refreshed.
7. Click **"Practice Flashcards"** (`/kits/[id]/practice`):
   - Review cards, reveal key points, and rate confidence (1–3).
   - Verify that low-confidence cards appear first in subsequent sessions.

---

## 6. Security & Multi-Tenancy Architecture

| Security Domain | Mitigation Strategy | Implementation Location |
| :--- | :--- | :--- |
| **Authentication** | `HttpOnly`, `SameSite=Lax` JWT cookies with bcrypt cost factor 12 | `authController.js`, `auth.js`, `User.js` |
| **Authorization (BOLA)** | User isolation enforced at query filter (`{ userId }`) and document assertion (`kit.userId === req.user.id`) | `kitController.js`, `practiceController.js` |
| **SSRF Protection** | Blocks RFC 1918 subnets, cloud metadata (`169.254.169.254`), non-HTTP schemes | `urlValidator.js`, `crawlerService.js` |
| **Prompt Injection** | Strips XML breakout tags, isolates retrieved text in `<untrusted_company_source>` blocks | `promptSanitizer.js`, `stage2GenerateCompanyBrief.js` |
| **Denial of Service** | Sliding-window IP rate limiters (30 auth/min, 15 kit gen/min, 300 global/min) | `rateLimiter.js` |
| **Payload Tampering** | Strict schema validation, resilient JSON repair, requirement ID cross-referencing | `jsonRepair.js`, `schemaValidator.js` |
| **Concurrent Lost Updates** | Optimistic concurrency control via incrementing integer `version` field (409 Conflict) | `PrepKit.js`, `kitEditorService.js` |

---

## 7. License
ISC License. Built for the Trao Engineering Assessment.
