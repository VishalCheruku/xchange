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
- src/App.jsx �  -replace  \u201d, route map with Suspense fallback (LoaderX)
- src/Components/Modal/Login.jsx �  -replace  \u201d, login modal, Google popup, CTA carousel
- src/Components/Firebase/Firebase.js �  -replace  \u201d, Firebase config/init, auth provider, storage, Firestore helper
- src/Components/Input/Input.jsx �  -replace  \u201d, styled text input with floating label
- src/index.css �  -replace  \u201d, Tailwind + Google font imports
- src/Components/Loader/LoaderX.jsx �  -replace  \u201d, global loading indicator

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
- npm install �  -replace  \u201d, install deps
- npm run dev �  -replace  \u201d, dev server
- npm run build �  -replace  \u201d, production build
- npm run preview �  -replace  \u201d, preview prod build
- npm run lint �  -replace  \u201d, lint with ESLint

Deployment (Vercel)
- Repo is connected to Vercel; pushes to main trigger prod deploy.
- Preview deploys for other branches/PRs.
- Build command: npm run build; output: dist/.
- Ensure Vercel project has Firebase env vars and your Vercel domains are added to Firebase Auth authorized domains.

Recent Updates (Mar 2026)
- Dynamic categories: navbar reads live categories from items; new user-added categories appear automatically.
- Chat system: product-name chat titles, typing indicator, read receipts, image sharing, quick chips, staged image preview, lightbox; delete chat removes conversation + messages + notifications; self-chat is blocked gracefully.
- Reliable listeners: chat/offers lists avoid composite indexes; client-side sorting keeps threads visible after reload; conversation names derive from product titles to avoid duplicates.
- Offers: buyers can make offers; sellers get notifications; offer status updates notify buyers; offers surface under Profile → “Offers you made.”
- Profile: added “My Listings” (clickable to details) and “Offers you made.”
- Listing management: unified delete helper; instant UI update across Home/Category/Details; only user-generated products remain (seed catalog removed).
- UX fixes: detail pages auto-scroll to top; sticky navbar; single in-place search; smooth search via deferred input; cleaned spacing/pointer issues on navbar search.
- Data hygiene: prevents self-chat creation; cleans up notification/read metadata on send.

Authentication Notes
- Uses signInWithPopup(auth, provider) for Google.
- If the popup closes immediately, add the Vercel domain (and any preview domains) to Firebase Auth “Authorized domains”.
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

## Version Control & CI/CD

### GitHub workflow
- Initialize repo (if not): git init && git add . && git commit -m "Initial commit"
- Create remote: git remote add origin https://github.com/<your-username>/<repo>.git
- Main branch: git branch -M main
- Push: git push -u origin main
- Ongoing changes: git add . && git commit -m "Meaningful message" && git push origin main

### Vercel integration
- In Vercel Dashboard → Add New Project → Import Git Repository → pick this repo.
- Framework preset: Vite (auto-detected). Build command: npm run build. Output: dist/.
- Environment variables: add your VITE_FIREBASE_* keys in Project Settings → Environment Variables.
- Authorized domains: add your Vercel domain(s) in Firebase Auth → Settings → Authorized domains.

### Deploy behavior
- Push to main → Vercel builds & deploys to production automatically.
- Push to other branches/PRs → Preview Deployments with unique URLs.
- Promote/rollback: Vercel Dashboard → Deployments → select build → Redeploy or Promote.
- If a deploy fails: open the Vercel build log, fix, commit, and push again.