# MoodRoute AI

MoodRoute AI is a web app that recommends city walks and places by mood.

## Features

- AI chat endpoint with OpenAI integration and mock fallback
- Norway city grounding (Hamar + other Norwegian cities) with POI anchors
- Full website shell: `Home`, `Explore`, `About`, `Chat`, `Login`
- Profile page: presets + visited places (`/profile`)
- Floating bottom-right chat widget + dedicated full chat page
- PostgreSQL persistence for conversations/messages
- Account-based storage (users only see their own chats)
- Auth:
  - local email/password registration + login
  - GitHub OAuth login
- Header avatar:
  - GitHub avatar when authorized via GitHub
  - fallback circle avatar for local accounts
- Conversation restore on reload, clear chat, JSON export

## Tech Stack

- Backend: Node.js + Express
- AI: OpenAI Chat Completions API
- Database: PostgreSQL (`pg`)
- Frontend: Vanilla HTML/CSS/JS

## Project Structure

```text
.
|- config/
|  |- botConfig.js
|  |- norwayCityKnowledge.js
|- db/
|  |- database.js
|  |- init.sql
|- public/
|  |- index.html
|  |- explore.html
|  |- about.html
|  |- chat.html
|  |- login.html
|  |- profile.html
|  |- assets/
|  |  |- style.css
|  |  |- app.js
|  |  |- chat.js
|  |  |- auth.js
|  |  |- profile.js
|  |  |- icons/logo.svg
|- .env
|- .env.example
|- server.js
|- REFLECTION.md
|- package.json
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure env (`.env`):

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/moodroute_ai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
RATE_LIMIT_MAX=45
MAX_MESSAGE_LENGTH=1200
SESSION_TTL_DAYS=14
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback
```

3. Run:

```bash
npm run dev
```

4. Open:

`http://localhost:3000`

## Environment Variables

```env
PORT=3000
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
RATE_LIMIT_MAX=45
MAX_MESSAGE_LENGTH=1200
SESSION_TTL_DAYS=14
PGSSLMODE=disable
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback
```

If OpenAI is unavailable (missing/invalid key or API error), backend falls back to deterministic mock mode.

## Railway Postgres

1. Add a PostgreSQL service in Railway.
2. In your app service variables, set:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
3. Redeploy the app.
4. Open Railway Postgres `Data` tab and run:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

If the list contains `users`, `sessions`, `conversations`, `messages`, `user_profiles`, then migrations are applied.

## GitHub OAuth Notes

- In GitHub OAuth App settings, callback URL must match:
  - `http://localhost:3000/api/auth/github/callback`
- Start URL used by frontend:
  - `/api/auth/github/start?next=/chat`

## API Endpoints

- `GET /api/meta`
- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/profile` (auth required)
- `PUT /api/profile` (auth required)
- `GET /api/auth/github/start`
- `GET /api/auth/github/callback`
- `POST /api/chat` (auth required)
- `GET /api/conversations` (auth required)
- `POST /api/conversations` (auth required)
- `GET /api/conversations/:id/messages` (auth required)
- `POST /api/conversations/:id/messages` (auth required)
- `POST /api/conversations/:id/clear` (auth required)
- `DELETE /api/conversations/:id` (auth required)

## Security Notes

- OpenAI key stays on backend.
- Sessions use HttpOnly cookie.
- Passwords are stored as salted `scrypt` hashes.
- Simple per-IP rate limiting is enabled on API routes.
