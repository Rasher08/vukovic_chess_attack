# Milestone 5 Specification Survey: Production Polish, Vercel Config & Docs

## Overview & Mission Context
Platform: **Интерактивная веб-платформа для тренировки атаки в миттельшпиле на базе книги Владимира Вуковича «Искусство атаки в шахматах» (Vukovic Chess Attack Training Platform)**.
Authoritative sources probed:
1. `ORIGINAL_REQUEST.md` (R4: Готовность к продакшен-деплою на Vercel; Acceptance criteria: `npm run build` exit code 0, Russian `README.md`, 1-Click Deploy button).
2. `PROJECT.md` (M5: Production Polish, Vercel Config & Docs; Code layout, interface contracts, zero-backend architecture).
3. Vercel Platform Deployment Specification (`vercel.json` schema, Edge routing, cache-control headers, security headers).
4. Codebase inspection: `next.config.mjs`, `package.json`, `src/app/`, `src/lib/audioSynth.ts`, `src/lib/storage.ts`, `src/data/studies/index.ts`.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Vercel Deployment | `vercel.json` Framework Preset | Explicitly defines Next.js framework preset to override heuristics and pin `@vercel/next` build pipeline | `framework: "nextjs"`, `$schema: "https://openapi.vercel.sh/vercel.json"` | Vercel builder activates Next.js App Router static build | Defaults to autodetection if omitted | Vercel Platform Schema |
| 2 | Vercel Deployment | Clean URLs & Trailing Slash Policy | Enforces canonical URL routing without `.html` extension and without trailing slashes | `cleanUrls: true`, `trailingSlash: false` | 308 Permanent Redirect for trailing slash URLs to non-slash URLs | Fallback to default route handler | Vercel Routing Spec |
| 3 | Caching & Performance | Static Assets Caching Header | Sets 1-year immutable caching for content-hashed Next.js assets (`/_next/static/*`) | Route pattern `/_next/static/(.*)` | `Cache-Control: public, max-age=31536000, immutable` | Non-static paths bypass this rule | RFC 7234 & Vercel Caching Best Practice |
| 4 | Caching & Performance | Static Media / Public Assets Caching | Sets 1-day caching with 7-day stale-while-revalidate for static icons, SVGs, and images | Route pattern `/(.*\\.(?:ico\|png\|svg\|jpg\|jpeg\|webp\|woff\|woff2))` | `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` | Unmatched assets default to edge revalidation | HTTP Caching Spec |
| 5 | Security Headers | Strict Transport Security (HSTS) | Enforces HTTPS encryption for 2 years across all domains and subdomains with preload eligibility | Route pattern `/(.*)` | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` | Browsers reject non-HTTPS connections | OWASP Security Headers Guide |
| 6 | Security Headers | MIME Sniffing Protection | Prevents browsers from MIME-sniffing a response away from declared content-type | Route pattern `/(.*)` | `X-Content-Type-Options: nosniff` | Blocks execution of mismatched MIME scripts/styles | OWASP & MDN |
| 7 | Security Headers | Clickjacking Protection | Restricts embedding within frames/iframes to prevent clickjacking attacks | Route pattern `/(.*)` | `X-Frame-Options: DENY` | Browser blocks framing on external domains | OWASP Clickjacking Defense |
| 8 | Security Headers | Referrer Information Control | Restricts referrer header transmission to protect path parameters and user privacy | Route pattern `/(.*)` | `Referrer-Policy: strict-origin-when-cross-origin` | Strips path on cross-origin requests | W3C Referrer Policy Spec |
| 9 | Security Headers | Hardware & Feature Permissions Policy | Disables unused browser hardware capabilities (camera, microphone, geolocation, tracking) | Route pattern `/(.*)` | `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()` | Access denied if script attempts hardware API call | W3C Permissions Policy |
| 10 | Security Headers | Legacy XSS Protection | Enables reflected XSS filtering in legacy browser engines | Route pattern `/(.*)` | `X-XSS-Protection: 1; mode=block` | Page rendering halted on reflected XSS attack | Browser Compatibility Spec |
| 11 | Deploy Button | 1-Click Vercel Deploy Badge | Markdown & HTML badge allowing instant cloning and deployment to Vercel | GitHub repo URL + Project Name + Demo metadata | Redirects to Vercel Clone flow with auto-configured build settings | Displays error on Vercel if repo is private without auth | Vercel Button Documentation |
| 12 | Deploy Button | Template Parameter Configuration | Pre-populates repo name, project name, demo title, and description on Vercel clone screen | `project-name=vukovic-chess-attack`, `repository-name=vukovic-chess-attack` | Instant project creation with 0 manual typing | Falls back to repository name if omitted | Vercel Clone API |
| 13 | Documentation | Production-Grade Russian `README.md` | Comprehensive user manual, architecture guide, quickstart, and deployment manual in Russian | Markdown documentation file at root | Formatted GitHub repository front page | N/A | Acceptance Criteria R4 |
| 14 | Architecture | Zero-Backend Verification | Validates that app requires 0 remote databases, 0 paid APIs, 0 remote chess engines, 0 audio assets | Next.js SSG + chess.js + Web Audio API + localStorage | 100% self-contained client execution with 0ms backend latency | Graceful fallback to memory storage if localStorage full | Codebase Audit (`audioSynth`, `storage`, `studies`) |
| 15 | Build Polish | ESLint Configuration Integrity | Ensures `npm run lint` and `npm run build` execute non-interactively with 0 errors/warnings | `.eslintrc.json` or devDependencies `eslint`, `eslint-config-next` | Clean exit code 0 on CI and Vercel builds | Interactive terminal prompt hangs CI if config missing | Empirical CLI Probe (`task-24`) |
| 16 | Responsive Polish | Multi-Device Responsive Layout | Responsive chessboard and analysis interface scaling from mobile (320px) to desktop (1920px) | Viewport widths 320px, 375px, 768px, 1024px, 1440px, 1920px | Fluid board resizing, stacked layout on mobile, side-by-side on desktop | Board wraps below navigation if screen < 1024px | CSS/Tailwind Audit |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Caching vs Hydration | Request to `/` or `/study/[id]` HTML document | If `Cache-Control: immutable` were applied to `/.*`, updates to the site would never reach users without hard refresh. Specification isolates `immutable` strictly to `/_next/static/(.*)`. |
| 2 | Content Security Policy (CSP) | Strict CSP without `'unsafe-inline'` / `'unsafe-eval'` in `vercel.json` | Next.js App Router client hydration and dynamic script evaluation fail with `Refused to execute inline script`. Specification recommends avoiding restrictive inline CSP in static `vercel.json` or explicitly allowing Next.js runtime requirements. |
| 3 | Audio Context Policy | User visits page on iOS Safari without clicking | Web Audio `AudioContext` starts in `'suspended'` state. `audioSynth.ts` intercepts `.resume()` and suppresses browser autoplay policy exceptions without crashing. |
| 4 | Storage Quota & Private Mode | Safari Private Browsing or full localStorage | `localStorage.setItem` throws `QuotaExceededError`. `storage.ts` catches error and falls back to in-memory dictionary `memoryStorage`, allowing trainer to continue seamlessly. |
| 5 | Invalid Study Route | User navigates to `/study/non-existent-study-id` | `generateMetadata` returns "Этюд не найден", and page calls Next.js `notFound()`, rendering pre-rendered 404 page with HTTP 404 status. |
| 6 | Trailing Slash Navigation | User visits `https://domain.com/study/colle-ohanlon-1930/` | Vercel Edge router issues 308 redirect to `https://domain.com/study/colle-ohanlon-1930`, maintaining canonical SEO URLs. |
| 7 | Missing ESLint on CI/Vercel | Running `npm run lint` without `.eslintrc.json` | `next lint` launches interactive prompt `? How would you like to configure ESLint?`, hanging non-interactive CI/CD pipelines. Specification requires `.eslintrc.json` with `{"extends": "next/core-web-vitals"}` and devDependencies. |
| 8 | Ultra-Narrow Mobile Viewport (320px) | iPhone SE / Galaxy Fold (320px-360px screen width) | Chessboard container dynamically scales board to `calc(100vw - 32px)`, preventing horizontal scrollbar overflow. |

---

## Detailed Specification: `vercel.json`

### File Location: `/Users/user/teamwork_projects/vukovic_chess_attack/vercel.json`
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/_next/static/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/(.*\\.(?:ico|png|svg|jpg|jpeg|webp|woff|woff2))",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=86400, stale-while-revalidate=604800"
        }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), browsing-topics=()"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        },
        {
          "key": "X-DNS-Prefetch-Control",
          "value": "on"
        }
      ]
    }
  ]
}
```

### Zero-External-Dependency Architecture Verification
1. **SSG Static Pre-rendering**:
   - `src/app/study/[id]/page.tsx` exports `generateStaticParams()`.
   - All 18 studies (`colle-ohanlon-1930`, `greco-gift-kg8`, etc.) are pre-rendered into static HTML during `npm run build`.
   - Vercel serves pages straight from Edge Cache with 0ms serverless compute delay.
2. **Client-Side Chess Engine (`chess.js`)**:
   - Move validation, legal moves dot rendering, FEN transitions, SAN notation, check/mate/draw logic run 100% inside the browser.
   - Zero remote Stockfish or external chess APIs needed.
3. **In-Browser Audio Synthesis (`audioSynth.ts`)**:
   - Native Web Audio API generates move clicks (400 Hz triangle wave), captures (260 Hz sawtooth), checks (880 Hz sine + 1760 Hz overtone), errors (150 Hz saw), and victory fanfares (C-E-G-C major chord).
   - Zero external audio files (`.mp3`, `.wav`) to download or host.
4. **Local Persistence (`storage.ts`)**:
   - User progress, mastery points, streak days, accuracy percentage, and active calculation sessions persist in browser `localStorage`.
   - Zero remote database (PostgreSQL, Supabase, Redis) required.
5. **No Secret Keys / Environment Variables**:
   - Application requires no `.env` variables or API tokens to deploy or run.

---

## Detailed Specification: 1-Click Vercel Deploy Button

### Markdown Format (for `README.md`)
```markdown
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2Fvukovic_chess_attack&project-name=vukovic-chess-attack&repository-name=vukovic-chess-attack&demo-title=%D0%98%D1%81%D0%BA%D1%83%D1%81%D1%81%D1%82%D0%B2%D0%BE%20%D0%B0%D1%82%D0%B0%D0%BA%D0%B8%20%D0%B2%20%D1%88%D0%B0%D1%85%D0%BC%D0%B0%D1%82%D0%B0%D1%85%20(%D0%92%D1%83%D0%BA%D0%BE%D0%B2%D0%B8%D1%87)&demo-description=%D0%98%D0%BD%D1%82%D0%B5%D1%80%D0%B0%D0%BA%D1%82%D0%B8%D0%B2%D0%BD%D1%8B%D0%B9%20%D1%82%D1%80%D0%B5%D0%BD%D0%B0%D0%B6%D0%B5%D1%80%20%D1%80%D0%B0%D1%81%D1%87%D0%B5%D1%82%D0%B0%20%D0%B0%D1%82%D0%B0%D0%BA%D0%B8%20%D0%B2%20%D0%BC%D0%B8%D1%82%D1%82%D0%B5%D0%BB%D1%8C%D1%88%D0%BF%D0%B8%D0%BB%D0%B5%20%D0%BF%D0%BE%20%D0%92%D1%83%D0%BA%D0%BE%D0%B2%D0%B8%D1%87%D1%83)
```

### HTML Centered Format (Optional Luxury Variant)
```html
<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2Fvukovic_chess_attack&project-name=vukovic-chess-attack&repository-name=vukovic-chess-attack">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" height="38" />
  </a>
</p>
```

### URL Parameter Breakdown:
- `repository-url`: Encoded GitHub source repository.
- `project-name`: Suggested Vercel project name (`vukovic-chess-attack`).
- `repository-name`: Suggested repository name for user's GitHub clone (`vukovic-chess-attack`).
- `demo-title`: "Искусство атаки в шахматах (Вукович)"
- `demo-description`: "Интерактивный тренажер расчета атаки в миттельшпиле по Вуковичу"

---

## Detailed Specification: Production-Grade Russian `README.md`

### Required Structure & Content Blueprint:

1. **Header & Badges**:
   - Project Title: `# Искусство атаки в шахматах — Интерактивный тренажер по Владимиру Вуковичу`
   - Subtitle: *Профессиональная обучающая веб-платформа для тренировки глубокого расчета тактики (3–7 ходов) в миттельшпиле на базе классической книги «The Art of Attack in Chess».*
   - Badges:
     - Vercel Deploy Badge
     - Next.js 14 (App Router)
     - TypeScript Strict
     - Tailwind CSS
     - chess.js 1.4
     - 18 Этюдов / 245 Ходов
     - Zero-Backend
     - 100% Tests Pass
     - MIT License

2. **О проекте (Overview & Pedagogical Background)**:
   - Объяснение методологии Владимира Вуковича (1898–1975): переход от поверхностных одноходовых тактических задач к строгому расчету форсированных разветвленных вариантов.
   - Целевая аудитория: шахматисты клубного и мастерского уровней (рейтинг 1800–2200+ FIDE / Chess.com / Lichess).
   - Главный фокус: классическая жертва слона (*Greek Gift*: `1.Bxh7+! Kxh7 2.Ng5+`), ладейные лифты по 3-й горизонтали, разрушение пешечного забора рокировки и охота на короля.

3. **4 фундаментальные главы курса (Учебная программа)**:
   - **Глава 1: Классическая жертва слона (Greek Gift)** (5 этюдов, включая партии Колле — О'Хэнлон 1930, разбор Греко 1619, необходимость маневра 3.Qd3!, опровержение выхода 2...Kg6 и ложную жертву с нарушенным чек-листом).
   - **Глава 2: Подключение тяжелых фигур и ладейные лифты** (4 этюда: Ласкер — Бауэр 1889, Тарраш — Шеве 1894, Маршалл — Берн 1900, Капабланка — Фонаров 1918).
   - **Глава 3: Разрушение пешечного прикрытия рокировки** (5 этюдов: Капабланка — Бланко 1913, Алехин — Фельдт 1916, Шпильман — Вальтер 1928, Пиллсбери — Марко 1900, Мароци — Тартаковер 1922).
   - **Глава 4: Преследование короля (King Hunt)** (4 этюда: Эдвард Ласкер — сэр Джордж Томас 1912, Рети — Тартаковер 1910, Греко 1619 с жертвой ферзя, Вукович — двойная батарея по вертикали «h»).

4. **Ключевые возможности платформы (Feature Highlights)**:
   - **Интерактивная доска (`react-chessboard` + `chess.js`)**: поддержка Drag-and-Drop и кликов, автоматическое переворачивание доски, цветные маркеры легальных ходов, графические стрелки угроз (SVG) и подсветка полей.
   - **Интерактивное дерево вариантов (`VariationTree`)**: полный граф ходов с шахматными символами NAG (`!`, `?`, `!!`, `??`), текстовыми комментариями гроссмейстера и навигацией клавиатурой (стрелки влево/вправо/вверх/вниз).
   - **Тренажер глубокого расчета (Deep Calculation Trainer)**:
     - 8-состояний FSM-движок.
     - Обязательный расчет 3–7 форсированных ходов.
     - Автоматический ответ черных за наиболее упорные варианты.
     - Интерактивный разбор типичных ошибок с физическим проигрыванием опровержения.
     - 3-уровневая лестница подсказок.
     - Подсчет очков точности и времени решения.
   - **Чек-лист 6 предпосылок Greek Gift**: интерактивная проверка готовности позиции к жертве слона.
   - **Звуковой синтезатор Web Audio API**: процедурный звук для тихого хода, взятия, шаха, ошибки и победного арпеджио без единого внешнего аудиофайла.

5. **Технологический стек (Architecture & Tech Stack)**:
   - Таблица компонентов: Next.js 14 App Router, React 18, TypeScript Strict, Tailwind CSS, chess.js, react-chessboard, Web Audio API, Lucide React, Canvas-Confetti, LocalStorage.

6. **Быстрый старт (Local Development Guide)**:
   - Системные требования: Node.js 18.17+ или 20.x, npm 9+.
   - Инструкция по шагам:
     ```bash
     git clone https://github.com/your-username/vukovic_chess_attack.git
     cd vukovic_chess_attack
     npm install
     npm run validate:dataset
     npm run dev
     ```
   - Запуск продакшен-сборки:
     ```bash
     npm run build
     npm run start
     ```

7. **Развертывание на Vercel (Production Deployment Guide)**:
   - Вариант 1: Развертывание в 1 клик через кнопку Vercel Deploy.
   - Вариант 2: Развертывание через Vercel CLI (`npm i -g vercel && vercel --prod`).
   - Вариант 3: Импорт Git-репозитория через дашборд Vercel.
   - Описание конфигурации `vercel.json` (HSTS, кэширование static assets, clean URLs).
   - Нулевая стоимость и нулевые требования к базе данных.

8. **Тестирование и проверка качества (Testing & QA)**:
   - Валидатор датасета: `npm run validate:dataset` (проверяет 100% ходов, FEN, легальность и маты).
   - Набор тестов: `tests/e2e/run_all_e2e.sh`.
   - Проверка адаптивности от 320px до 1920px.

9. **Структура проекта (Repository Layout)**:
   - Дерево каталогов с описанием назначения ключевых файлов.

10. **Лицензия и цитирование (License & Attribution)**:
    - MIT License.
    - Благодарность наследию Владимира Вуковича.

---

## Technical Recommendations for Implementer (M5 Implementation Guide)

1. **Create `vercel.json`**:
   - Write `/Users/user/teamwork_projects/vukovic_chess_attack/vercel.json` matching the exact schema above.
2. **ESLint Polish**:
   - Add `.eslintrc.json`:
     ```json
     {
       "extends": "next/core-web-vitals"
     }
     ```
   - Ensure `npm run lint` executes non-interactively without prompting or errors.
3. **Next.js Config Optimization**:
   - In `next.config.mjs`, ensure clean configuration without unneeded standalone locks if deploying purely to Vercel (or retain standalone if docker compatibility is preserved).
4. **Create Production `README.md`**:
   - Write comprehensive, richly formatted Russian documentation at `/Users/user/teamwork_projects/vukovic_chess_attack/README.md` following the detailed blueprint.
5. **Verify Build**:
   - Run `npm run build` and `npm run validate:dataset` to confirm 0 errors.
