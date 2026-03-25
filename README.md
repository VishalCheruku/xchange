# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh


Xchange
A React + Vite app for listing, browsing, and managing products with Firebase auth, storage, and Firestore data. Deployed on Vercel with auto-deploys from GitHub.

Tech Stack
- React 18, Vite 6
- React Router v7 (SPA routing with code splitting via React.lazy + Suspense)
- Tailwind/Flowbite + Flowbite-React for UI components
- Firebase (Auth with Google provider, Firestore, Storage, Analytics)
- Tooling: ESLint 9, PostCSS/Autoprefixer, npm scripts

Features
- Google sign-in modal (popup) with Firebase Auth
- Product data fetched from Firestore (fetchFromFirestore)
- Responsive UI with Flowbite components and Tailwind utilities
- Lazy-loaded routes for faster initial load (Home, Details, Category/:name, Profile, Search, AdminPanel)
- Vercel CI/CD: pushes to main deploy to production; other branches get Preview URLs

Modules (key paths)
- src/App.jsx ï¿½  -replace  \u201d, route map with Suspense fallback (LoaderX)
- src/Components/Modal/Login.jsx ï¿½  -replace  \u201d, login modal, Google popup, CTA carousel
- src/Components/Firebase/Firebase.js ï¿½  -replace  \u201d, Firebase config/init, auth provider, storage, Firestore helper
- src/Components/Input/Input.jsx ï¿½  -replace  \u201d, styled text input with floating label
- src/index.css ï¿½  -replace  \u201d, Tailwind + Google font imports
- src/Components/Loader/LoaderX.jsx ï¿½  -replace  \u201d, global loading indicator

Project Structure
src/
  App.jsx
  index.css
  Components/
    Firebase/Firebase.js
    Modal/Login.jsx
    Input/Input.jsx
    Loader/LoaderX.jsx
    Pages/ (Home, Category, Details, Profile, Search, AdminPanel)
    Details/Details.jsx

Environment & Config
Create .env (or Vercel Project Env) with your Firebase values:
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
Update src/Components/Firebase/Firebase.js to read from import.meta.env.

Scripts
- npm install ï¿½  -replace  \u201d, install deps
- npm run dev ï¿½  -replace  \u201d, dev server
- npm run build ï¿½  -replace  \u201d, production build
- npm run preview ï¿½  -replace  \u201d, preview prod build
- npm run lint ï¿½  -replace  \u201d, lint with ESLint

Deployment (Vercel)
- Repo is connected to Vercel; pushes to main trigger prod deploy.
- Preview deploys for other branches/PRs.
- Build command: npm run build; output: dist/.
- Ensure Vercel project has Firebase env vars and your Vercel domains are added to Firebase Auth authorized domains.

Recent Updates (Mar 2026)
- Dynamic categories: navbar reads live categories from items; new user-added categories appear automatically.
- Chat system: product-name chat titles, typing indicator, read receipts, image sharing, quick chips, staged image preview, lightbox; delete chat removes conversation + messages + notifications; self-chat is blocked gracefully.
- Reliable listeners: chat/offers lists avoid composite indexes; client-side sorting keeps threads visible after reload; conversation names derive from product titles to avoid duplicates.
- Offers: buyers can make offers; sellers get notifications; offer status updates notify buyers; offers surface under Profile â†’ â€œOffers you made.â€
- Profile: added â€œMy Listingsâ€ (clickable to details) and â€œOffers you made.â€
- Listing management: unified delete helper; instant UI update across Home/Category/Details; only user-generated products remain (seed catalog removed).
- UX fixes: detail pages auto-scroll to top; sticky navbar; single in-place search; smooth search via deferred input; cleaned spacing/pointer issues on navbar search.
- Data hygiene: prevents self-chat creation; cleans up notification/read metadata on send.

Authentication Notes
- Uses signInWithPopup(auth, provider) for Google.
- If the popup closes immediately, add the Vercel domain (and any preview domains) to Firebase Auth â€œAuthorized domainsâ€.
- Keep pop-ups/cookies allowed for the site.

Data Layer
- Firestore products collection fetched via fetchFromFirestore.
- Storage initialized for asset uploads (usage TBD).
- Analytics initialized (optional; disable if not needed).

Styling
- Tailwind utility classes; Flowbite/Flowbite-React components.
- Fonts: Manrope + Space Grotesk from Google Fonts.

Roadmap / Nice-to-haves
1) Wire Firestore data into UI components (listing, filters, search, detail view).
2) Add protected routes for /profile and /admin.
3) Form validation and loading states on auth buttons.
4) Upload to Firebase Storage for product images.
5) Tests for route rendering and auth flows (React Testing Library).
6) Add vercel.json only if custom routes/headers are required.

Getting Started (local)
npm install
npm run dev
# visit http://localhost:5173

AI-First Marketplace Upgrade (Mar 2026)
- Added a dedicated AI orchestration backend at `server/` with:
  - `conversationAnalyzer.service.js`
  - `dealEngine.service.js`
  - `trustEngine.service.js`
  - Retry + timeout resilience (30s timeout, 3 retries with exponential backoff)
  - Per-user rate limit (10 requests/minute)
  - JSON audit logs (`server/logs/ai-audit.log`)
  - WebSocket non-blocking chat intelligence (`ai:message` -> `ai:insight`)
- Added global AI Mode client architecture:
  - `src/Components/Context/AIMode.jsx`
  - `Go AI Mode` CTA in navbar and home hero
  - persistent AI mode state + global ON indicator
  - chat inline AI suggestions + optional tone guard
  - listing deal intelligence and trust/risk indicators
- Added adaptive learning system:
  - Per-user profile tracking for price preferences, negotiation style, response behavior, and transaction patterns
  - Profile-driven listing personalization (`/api/ai/rank-listings`)
  - Profile update endpoints (`/api/ai/profile`, `/api/ai/profile/interactions`)
  - Persistent profile storage at `server/data/adaptive-profiles.json`

Run (frontend + AI backend)
1) `npm install`
2) `npm run dev:full`
3) Open `http://localhost:5173`

Environment Variables
- Frontend:
  - `VITE_AI_API_BASE_URL=http://localhost:8787`
- Backend (optional for LLM):
  - `AI_SERVER_PORT=8787`
  - `FRONTEND_ORIGIN=http://localhost:5173`
  - `OPENAI_API_KEY=...` (optional; heuristics fallback works without it)
  - `OPENAI_MODEL=gpt-4.1-mini`
  - `AI_TIMEOUT_MS=30000`
  - `AI_RETRIES=3`
  - `AI_RATE_LIMIT_PER_MINUTE=10`
  - `AI_AUDIT_LOG_PATH=server/logs/ai-audit.log`

## Version Control & CI/CD

### GitHub workflow
- Initialize repo (if not): git init && git add . && git commit -m "Initial commit"
- Create remote: git remote add origin https://github.com/<your-username>/<repo>.git
- Main branch: git branch -M main
- Push: git push -u origin main
- Ongoing changes: git add . && git commit -m "Meaningful message" && git push origin main

### Vercel integration
- In Vercel Dashboard â†’ Add New Project â†’ Import Git Repository â†’ pick this repo.
- Framework preset: Vite (auto-detected). Build command: npm run build. Output: dist/.
- Environment variables: add your VITE_FIREBASE_* keys in Project Settings â†’ Environment Variables.
- Authorized domains: add your Vercel domain(s) in Firebase Auth â†’ Settings â†’ Authorized domains.

### Deploy behavior
- Push to main â†’ Vercel builds & deploys to production automatically.
- Push to other branches/PRs â†’ Preview Deployments with unique URLs.
- Promote/rollback: Vercel Dashboard â†’ Deployments â†’ select build â†’ Redeploy or Promote.
- If a deploy fails: open the Vercel build log, fix, commit, and push again.

================================================================================
APPENDED UPDATE (Mar 2026) - Added Without Removing Previous Content
================================================================================

This section is appended on top of the existing README content to include the latest AI architecture and behavior updates.

Latest AI System Enhancements
- Added output policy enforcement layer:
  - `server/services/ai/outputPolicy.service.js`
  - Enforces concise, actionable, context-aware outputs
  - Suppresses generic/repeated suggestions
  - Ensures high-impact guidance targeting: improve deal, reduce risk, save time
- Added system-goal intelligence layer:
  - `server/services/ai/goalEngine.service.js`
  - Computes maximize metrics:
    - successful transactions
    - user trust
    - efficiency
  - Computes minimize metrics:
    - scams
    - wasted time
    - failed deals
  - Returns `systemGoal` with `goalHealth` and `priorityActions`

Orchestration Layer Upgrades
- Updated `server/services/ai/aiOrchestrator.service.js` with:
  - Input envelope normalization and bounded payload handling
  - Per-layer cache hit/miss logging with audit metadata
  - Safe orchestrator-level fallbacks for each layer
  - Full-layer aggregate logging
  - Output policy application for conversation/deal/trust responses
  - `systemGoal` generation embedded in every `/api/ai/full` response

Realtime AI Integration And Fail-Safe Behavior
- Enhanced `src/Components/Context/AIMode.jsx` for robust non-blocking realtime AI:
  - Socket request lifecycle management with timeout-safe resolution
  - Client-side short-lived AI insight cache
  - Automatic fallback resolution when socket disconnects or times out
  - Basic deterministic fallback insight when server/LLM is unavailable
  - Background REST refresh while UI remains responsive
- Chat flow remains non-blocking:
  - user message send does not wait for AI
  - AI insight updates the UI asynchronously when available
  - if AI is unavailable, chat continues normally without feature breakage

AI Mode Behavior (Prompt 7 Coverage)
- `Go AI Mode` activation available in:
  - navbar top-right
  - home hero CTA
- Global AI indicator displayed when enabled
- Contextual rendering guards prevent noisy AI:
  - high-impact assist bar only
  - deal sidebar only on high-impact deal conditions
  - risk chips only when risk signals are present
  - suggestion deduplication and cooldown suppression

UI-Level Embedded Goal Actions
- Chat UI now surfaces top system priority action:
  - `src/Components/Chat/ChatModal.jsx`
- Listing details UI also surfaces top system priority action:
  - `src/Components/Details/Details.jsx`

API And Contract Additions
- Existing endpoints remain the same:
  - `POST /api/ai/conversation`
  - `POST /api/ai/deal`
  - `POST /api/ai/trust`
  - `POST /api/ai/full`
  - `GET /api/ai/profile`
  - `POST /api/ai/profile/interactions`
  - `POST /api/ai/rank-listings`
- `/api/ai/full` response now also includes:
  - `systemGoal`

Reliability Defaults (Confirmed)
- Timeout: `AI_TIMEOUT_MS=30000`
- Retries: `AI_RETRIES=3` (exponential backoff)
- Rate limit: `AI_RATE_LIMIT_PER_MINUTE=10` per user (HTTP + Socket)
- Audit log output:
  - `server/logs/ai-audit.log`

Architecture Documentation
- Detailed contracts and data flow are documented in:
  - `docs/ai-system-architecture.md`

Operational Summary
- AI is embedded as a core system layer across chat, listings, pricing, trust, and decision optimization.
- AI Mode OFF keeps normal marketplace behavior.
- AI Mode ON continuously runs intelligence layers with graceful degradation and non-blocking UX.
