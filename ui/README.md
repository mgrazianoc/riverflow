# Riverflow UI

The browser surface for [Riverflow](../README.md). A single-page React app that talks to the FastAPI backend over JSON and a WebSocket, served from the same process in production.

## Stack

- **React 19** + TypeScript + Vite
- **Tailwind v4** with an OKLCH token layer
- **React Router** for client routing, **TanStack Query** for server state
- **@xyflow/react** for the DAG graph tab (lazy-loaded)
- Hand-rolled inline SVG for icons and charts — no `lucide-react`, no `recharts`, no `framer-motion`

Initial JS bundle ≈ 75 kB gzipped.

## Scripts

```bash
npm install
npm run dev      # Vite dev server on :5173, proxies /api and /ws
npm run build    # tsc -b && vite build → ../src/riverflow/server/ui/dist
npm run lint
```

The backend serves the built assets in production, so `npm run build` writes directly into the Python package's static directory.

## Shape of the code

```
src/
├── api.ts              # Typed fetch client for /api
├── types.ts            # Shared Pydantic-mirror types
├── main.tsx            # Router + lazy-loaded heavy routes
├── index.css           # Tailwind layer + OKLCH tokens + reduced-motion override
├── components/         # Shell, CommandPalette, charts, QueryState, icons, …
├── hooks/              # useWebSocket, useLiveUpdates, useUrlState, useRowNav, …
├── lib/utils.ts        # cn(), errorMessage(), formatDuration, …
└── pages/              # Dashboard, DAGList, DAGDetail (tabs), RunDetail, Host, Settings
```

## Design contract

See [`AGENTS.md`](./AGENTS.md) for the full Broadsheet identity spec — typography, palette, rhythm, component recipes, and the keyboard grammar. Read it before making visual changes.

## Keyboard

`⌘K` command palette · `/` focus filter · `j` / `k` row navigation · `gg` / `G` top / bottom · `g d` / `g l` / `g h` / `g s` jump sections.
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
