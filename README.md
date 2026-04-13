# ApplyFlow Web

ApplyFlow Web is a focused job application tracker built with React, TypeScript, Vite, Supabase, and a lightweight Node API. It lets users create real accounts, search live jobs, save listings into a personal tracker, update statuses, and keep job-search activity in one clean dashboard.

## What it does

- Track applications with company, role, location, source, link, and notes
- Search and filter entries by status
- Update an application through a simple workflow: saved, applied, interview, offer, rejected, withdrawn, and archived
- Edit existing entries without losing the selected record
- Create and sign in to real accounts with Supabase Auth
- Persist applications in a hosted Supabase database
- Pull current job listings from Adzuna through the server and save them into the tracker

## Tech stack

- React 19
- TypeScript
- Vite
- Supabase Auth + Postgres
- Express
- CSS

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts both the Vite frontend and the local API server.

For a production build:

```bash
npm run build
```

## Live job listings setup

This project pulls real job listings from Adzuna through the local server.

1. Create a file named `.env.local` in the project root.
2. Copy the values from `.env.example`.
3. Add your real Adzuna credentials:

```bash
VITE_ADZUNA_APP_ID=your_app_id
VITE_ADZUNA_APP_KEY=your_app_key
```

4. Restart `npm run dev`.

The live job search now runs through the local API server, which is a better product setup than exposing the jobs request directly in the browser.

## Supabase setup

1. Open the Supabase SQL Editor.
2. Run the file at `supabase/applyflow_schema.sql`.
3. Make sure your `.env.local` contains:

```bash
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_publishable_key
```

After that, registration, login, and hosted application storage will be live.

Note: old demo emails are no longer used. Authentication now runs through your Supabase project.

## Demo account

If you want a quick portfolio walkthrough without creating a new user, sign in with:

```text
Email: demo@applyflow.app
Password: ApplyFlow123!
```

This account was created in Supabase Auth after email confirmation was disabled for the project.

## GitHub-ready checklist

Before pushing this project:

1. Keep `.env.local` out of Git.
2. Commit `.env.example` so reviewers know which variables are required.
3. Run `npm run lint`.
4. Run `npm run build`.
5. Make sure the Supabase SQL schema has been applied once in the dashboard.

## Project goals

This version is intentionally scoped as a clean portfolio-ready product prototype:

- polished UI with a custom palette
- authenticated user accounts and hosted application storage
- live job search with duplicate protection when saving roles
- easy setup for GitHub reviewers and recruiters

## Next improvements

- add resume/email parsing with Claude or OpenAI
- support resume or screenshot parsing for faster entry creation
- add analytics for interview rate, response rate, and offer conversion
