# Decimallens Agent Guidelines

## 1. Project Scope & Architecture (LOCKED)
- **Single-Document Extraction + Verification Pipeline**: This is NOT a retrieval-augmented generation (RAG) system. Do not build or reference hybrid search, embeddings, or vector stores. The entire ingested document goes directly to the agent reasoning context.
- **Dual-Agent Workflow**: Implement an explicit two-agent sequence:
  1. **Auditor Agent**: Scans the uploaded document, extracts claims, performs deterministic math verification, and outputs structured JSON with a `verified` field per numeric claim.
  2. **Forecaster Agent**: Receives verified claims from Auditor. Must not build projections on top of any claims marked `verified: false` without flagging the projection as low-confidence.
- **Deterministic Math Verification**: Recompute all formulas and aggregations in the Python backend using the `decimal` module (or `fractions`) for absolute numeric precision. Do not use float types. Output a `verified: true/false` flag for each item.

## 2. Tech Stack & Integration
- **Frontend**: Next.js (App Router), Tailwind CSS (v4), Motion (for animation), shadcn/ui, TanStack Table (data grid), `cmdk` (command palette), `react-pdf` (source document viewer).
- **Backend**: Python (FastAPI).
- **AI Inference**: Groq (Llama-3 models) via OpenAI SDK compatibility:
  - Base URL: `https://api.groq.com/openai/v1`
  - Streaming: Groq responses must stream token-by-token to the UI for fluid Motion animations.
- **Security**: Store `GROQ_API_KEY` in `.env.local` (backend-only). Never expose the API key to the frontend.

## 3. Design System & Aesthetics (Premium / Auditing Register)
- **Signature Layout**: A two-pane, split view (source filing on the left, extracted/verified insights on the right). Clicking a metric in the insights pane scrolls the PDF pane to and highlights the source location.
- **Color Palette**:
  - `--bg`: `#F7F8FA` (App background)
  - `--panel`: `#FFFFFF` (Card & pane surfaces)
  - `--border`: `#E2E8F0` (Hairline dividers, borders)
  - `--text-primary`: `#0F172A` (Body text, headings, numeric values)
  - `--text-secondary`: `#64748B` (Labels, captions, metadata)
  - `--accent-navy`: `#1E3A5F` (Primary brand accent - nav, active states, buttons)
  - `--verified`: `#15803D` (Verified numeric badge / checkmark)
  - `--flagged`: `#B45309` (Unverified / low-confidence badge / caution)
  - `--flagged-bg`: `#FEF3C7` (Background wash behind flagged rows)
  - **Rule**: Do not add a second accent hue. Restraint is key.
- **Typography**:
  - Body: Inter
  - Numbers / Table Cells / KPI cards: IBM Plex Mono or Inter with `font-variant-numeric: tabular-nums` to prevent column jittering.
  - Scale: Max `text-xl`/`text-2xl` for KPI numbers/headers. No giant hero/marketing text.
- **Motion**: Standard ease-out, duration 150-200ms (micro-interactions), 300-400ms (citation jumps). No bouncy/playful easing.

## 4. Git Rules
- **GitHub Pushes**: Do not push changes to the remote GitHub repository unless the USER explicitly requests or instructs to push them. All commits/changes must remain local.

## 5. Behavioral Guidelines (Karpathy Pitfalls Mitigation)
*Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.*

### 1. Think Before Coding
*Don't assume. Don't hide confusion. Surface tradeoffs.*
Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
*Minimum code that solves the problem. Nothing speculative.*
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
*Touch only what you must. Clean up only your own mess.*
When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- **The test**: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
*Define success criteria. Loop until verified.*
Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

