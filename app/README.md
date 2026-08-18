# AI Video Flow

A prompt-to-video storyboard editor modeled on the core loop of tools like
Google Flow: describe a shot, generate a clip, arrange a storyboard, trim,
and export one stitched video.

## What's real vs. mocked

Everything **except AI video generation** is fully real and working:

- Auth (register/login, hashed passwords, sessions) — real.
- Projects and storyboards, persisted per user — real (SQLite via Prisma).
- Reordering, trimming (in/out points), deleting clips — real.
- Exporting: clips are trimmed and concatenated into one mp4 with ffmpeg — real.
- **Clip generation** uses a mock renderer (`lib/generate.ts`): it burns
  your prompt text onto a solid-colour card with ffmpeg's `drawtext`. This
  exercises the entire pipeline (generate → storyboard → trim → stitch →
  export) without requiring a paid video-generation API key.

This means the app is a working, demoable pipeline today, and the one
missing piece — a real text-to-video model — is a single swap-in away.

## Swapping in a real video-generation model

Replace the body of `generateClip()` in `lib/generate.ts` with a call to a
provider such as:

- **Google Veo** (via the Gemini API)
- **Runway Gen-3/4**
- **Luma Dream Machine**
- **Kling**

Keep the function signature the same — `generateClip(prompt, seed)` should
resolve to `{ relativePath, duration }`, where `relativePath` is a video
file saved under the `storage/` directory (see `lib/storage.ts`). Nothing
else in the app (API routes, UI, export pipeline) needs to change. Add the
provider's API key as an env var (see `.env.example` for the placeholder).

## Stack

- Next.js 14 (App Router) + TypeScript
- NextAuth (Credentials provider, JWT sessions)
- Prisma + SQLite (`User`, `Project`, `Clip`)
- ffmpeg (via `@ffmpeg-installer/ffmpeg`, no system install required) for
  mock generation and for trim/concat during export

## Running locally

```bash
cd app
npm install
cp .env.example .env        # fill in NEXTAUTH_SECRET (openssl rand -base64 32)
npx prisma db push          # create the SQLite dev database
npm run dev
```

Open http://localhost:3000, sign up, create a project, and add a few
prompts to see clips generate, then export.

## Known limitations / what a production version needs

This is an MVP built for a persistent single-instance server
(`npm run dev` / `npm start`), not a fully serverless deployment:

- **Storage**: generated/exported media is written to a local `storage/`
  directory on disk. On serverless hosts with ephemeral, per-instance
  filesystems (e.g. Vercel functions), files written by one invocation may
  not be visible to the next. Production would write to an object store
  (S3, Vercel Blob, etc.) instead.
- **Database**: SQLite is a single file on local disk, which has the same
  ephemeral-filesystem problem on serverless. Production would use Postgres
  (Prisma's `datasource` provider is a one-line change).
- **Generation queueing**: `POST /api/projects/:id/clips` generates
  synchronously and blocks the request. A real model call can take much
  longer than the mock's ~4s; production would make this async (job queue +
  polling or websockets) so the UI doesn't sit on a long-held connection.
- **Dependency security**: this MVP pins `next@14.2.x`. `npm audit` still
  flags several Next.js advisories that are only fully resolved on the
  Next.js 16 line, which is a breaking major upgrade (React 19, etc.) out
  of scope for this pass — worth doing before any real deployment.
