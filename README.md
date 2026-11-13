# GC Campus Mystery Hunt

A campus treasure hunt for a graduating class. Students join by typing their
name, organizers draw random teams, and each team works through four clues,
verifying each location by scanning a QR code.

## Running it locally

```bash
npm install
cp .env.example .env.local   # then fill in your two Supabase values
npm run dev
```

- Students: http://localhost:3000
- Organizers: http://localhost:3000/admin

## How it is put together

- **`supabase/`** — the database: schema, access rules and all game logic.
  Start with [`supabase/README.md`](supabase/README.md).
- **`src/pages/StudentHome.tsx`** — the student's entire experience, one page.
- **`src/AdminArea.tsx`** — the organizer dashboard, loaded only at `/admin`.
- **`src/LegacyArea.tsx`** — the retired prototype, kept at `/legacy` for
  comparison. Shares nothing with the live app and can be deleted.

The important idea: **the browser never writes to the database.** Students and
organizers can only read, narrowed to what they are allowed to see, and every
change goes through a server-side function that re-checks who you are. That is
what makes the anti-cheat real rather than cosmetic — a student cannot award
themselves a checkpoint, read a later clue, or see another team's progress,
whatever they do in their browser.

## Testing

```bash
# needs a local PostgreSQL
createdb hunt_test
psql hunt_test -f supabase/tests/_auth_shim.sql
psql hunt_test -f supabase/setup.sql
psql hunt_test -v ON_ERROR_STOP=1 -f supabase/tests/01_acceptance.sql
```

82 assertions covering team sizing, stage ordering, repeat scans, the help
allowance, winner rules, and the isolation guarantees. Never run it against
production — it truncates tables as fixtures.

## Deploying

See [`DEPLOY.md`](DEPLOY.md). Free on Vercel + Supabase. Deploy before the
event: the camera scanner needs HTTPS and cannot be tested locally.
