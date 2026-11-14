# Backend — Game for power unity!

PostgreSQL schema, access rules and server-side game logic for the hunt, written
against the requirements spec. Nothing here depends on the frontend framework,
so it is valid whether the app stays on Vite or moves to Next.js.

## What's here

| File | Contents |
|---|---|
| `migrations/0001_schema.sql` | 14 tables, enums, constraints, indexes |
| `migrations/0002_functions.sql` | Identity helpers + every write operation as a transactional RPC |
| `migrations/0003_rls.sql` | Row Level Security policies and grants |
| `migrations/0004_bootstrap.sql` | Event setup: organizers, game, QR tokens, Realtime |
| `tests/01_acceptance.sql` | 73 assertions covering the §21 acceptance list |

## The one idea worth knowing

**The browser never writes to a table.** Students and admins get `SELECT` only,
narrowed by RLS to what they are allowed to see. Every change — registering,
verifying a checkpoint, publishing teams, revealing winners — goes through a
`SECURITY DEFINER` function that re-checks who you are on the server.

That is what makes the anti-cheat real rather than cosmetic. A student can open
devtools, read their JWT and call the API by hand, and still cannot award
themselves a checkpoint, read Stage 4 early, or see another team's progress.

Two consequences worth noting:

- **Checkpoint QR tokens are stored only as SHA-256 hashes.** Even a full
  database dump does not reveal the four codes. They exist in plaintext only on
  your printed signs.
- **Hints are gated in the database, not the UI.** A student whose team has
  completed stage 2 cannot read hint 4 by any request they can construct.

## Setting up a Supabase project

### 1. Create the project

At [supabase.com](https://supabase.com), create a project. Note the project ref,
the anon key, and the database password.

### 2. Enable anonymous sign-ins

**Authentication → Providers → Anonymous sign-ins → enable.**

Students have no email or password (spec §22). They get a Supabase anonymous
auth user instead, which gives every student a real, unforgeable identity while
only ever typing their name. Their session persists across refreshes, and the
recovery code moves it to a new device.

### 3. Apply the migrations

With the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each file, in numerical order, into the SQL Editor in the dashboard.

### 4. Create the three organizer accounts

**Authentication → Users → Add user**, with email + password, once per organizer.
Copy each new user's UUID, then in the SQL Editor:

```sql
select link_admin_account('organizer1@hunt.gc', '<uuid>', 'Yohannes M.', 'lead_organizer');
select link_admin_account('organizer2@hunt.gc', '<uuid>', 'Selamawit T.', 'clue_master');
select link_admin_account('organizer3@hunt.gc', '<uuid>', 'Biruk K.',    'safety_marshal');
```

Being a user in Supabase Auth grants nothing on its own. Only a row in `admins`
makes someone an organizer, so a student can never escalate to admin.

### 5. Create the event and the checkpoint codes

```sql
select create_game('Game for power unity!');

select * from provision_checkpoints(
  array['Heritage Library','Engineering Quad','Student Lounge','Grand Stadium']
);
```

`provision_checkpoints` returns the four plaintext QR tokens **once**:

```
 stage |      label       |        qr_token
-------+------------------+-------------------------
     1 | Heritage Library | GCMH-DE10E55D96873B2490
     ...
```

Save them somewhere safe and encode each one in the QR sign for that location.
They are not recoverable afterwards — running the function again issues new
tokens and invalidates the old signs, which is what you want if a code leaks
mid-event.

### 6. Optional: the on-site second factor

A printed QR can be photographed and sent to another team — the spec calls this
out, and it is the one hole a QR code cannot close by itself. For any checkpoint
where that matters:

```sql
select set_checkpoint_organizer_code(3, 'LION42');
```

Stage 3 now needs both the scan and a code an organizer reads out at the
location. Pass `null` to turn it off again.

## Running the tests

Against a local Postgres:

```bash
createdb hunt_test
psql hunt_test -f <(cat tests/_auth_shim.sql migrations/*.sql)   # shim stands in for Supabase's auth.uid()
psql hunt_test -v ON_ERROR_STOP=1 -f tests/01_acceptance.sql
```

Against a Supabase branch database, apply the migrations and run
`tests/01_acceptance.sql` directly — no shim needed, since `auth.uid()` is real
there.

The suite truncates `games`, `admins` and `rate_limit_events` as fixtures, so
**never run it against production.**

It exits non-zero if any assertion fails. Current status: **73/73 passing.**

Coverage includes the team-sizing examples from §9.3 (`7 → 3+2+2` and friends),
double-click registration, session recovery, stage-skip prevention, repeat-scan
idempotency, pause/resume, the per-group help allowance under concurrent
presses, duplicate winner positions, and the RLS isolation guarantees — a
student cannot read the checkpoints table, future hints, other teams' progress,
other students' notifications, or unrevealed winners, and cannot forge progress
or change the game status.

## Decisions you may want to revisit

- **One live game at a time.** A unique index allows only one game whose status
  is not `FINISHED`, which keeps "the current game" unambiguous everywhere. Drop
  `games_single_active` if you ever want to stage next year's event in parallel.
- **Help allowance defaults to 2 per group** per spec §7, changeable via
  `games.help_request_limit` before the game starts.
- **Prize amounts are stored per winning team**, matching the spec's default
  reading. If you decide prizes are per person instead, that is a display change
  plus a note in the rules, not a schema change.
- **Team sizing never creates a group of 1.** A lone leftover student is
  returned in `pending_participant_ids` for an organizer to place by hand.
