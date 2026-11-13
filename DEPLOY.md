# Putting the hunt online

Free, about 15 minutes. You need this before the event for two reasons:

- students can reach it from anywhere, not just your Wi-Fi
- **the camera scanner only works over HTTPS**, so QR scanning has never been
  testable locally

Everything below is the free tier. No card, no cost.

---

## 1. Put the code on GitHub

Vercel deploys from a GitHub repository.

In the project folder:

```bash
git init
git add .
git commit -m "GC Campus Mystery Hunt"
git branch -M main
```

Then create an empty repository at [github.com/new](https://github.com/new) —
name it `gc-campus-mystery-hunt`, **Private**, and do *not* tick "Add a README".

GitHub then shows two lines to copy. They look like:

```bash
git remote add origin https://github.com/YOUR-USERNAME/gc-campus-mystery-hunt.git
git push -u origin main
```

Your Supabase keys are **not** uploaded — `.gitignore` excludes `.env.local`.
You add those to Vercel directly in step 3.

---

## 2. Import into Vercel

1. Go to [vercel.com](https://vercel.com) → **Sign up with GitHub**.
2. **Add New → Project** → pick your repository → **Import**.
3. Framework Preset should say **Vite**. Leave the build settings alone —
   `vercel.json` in this project already sets them.
4. **Do not press Deploy yet.** Do step 3 first, or the first build produces a
   site that cannot reach your database.

---

## 3. Add the two Supabase values

Still on the import screen, open **Environment Variables** and add:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://hwoleuktiyjagcfptsui.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_…` key |

Both are in `.env.local` on your computer, and both are safe to put here —
they are designed to be public and already travel inside every student's
browser.

**Never add the `sb_secret_…` key or your database password.** The app does not
use them, and anything here reaches the browser.

Now press **Deploy**. About a minute.

---

## 4. Check it

Vercel gives you an address like `gc-campus-mystery-hunt.vercel.app`.

- Open it on your phone → you should get the name prompt.
- Open `/admin` → organizer sign-in.
- **Tap "I found it" → "Scan QR"** → your phone should ask for camera
  permission. This is the part that has never worked locally.

Nothing to change in Supabase. Anonymous sign-in and password sign-in both work
from any address; there are no redirect URLs to configure.

---

## 5. Share it with students

The address is long. Before the event, either:

- turn it into a QR code students scan to open the site (any free QR generator),
  or
- add a free short link.

Put that QR on a poster at the start line. Do **not** mix it up with the
checkpoint QR codes — those are the secret ones.

---

## Updating after you deploy

```bash
git add .
git commit -m "what changed"
git push
```

Vercel rebuilds automatically, usually under a minute. Students on the page get
the new version on their next refresh.

---

## Things worth knowing

**Free Supabase projects sleep after 7 days idle.** Open the dashboard a few
times in the week before the event, and definitely the day before.

**Free Vercel does not sleep.** The site stays up.

**Roughly 30 students is comfortably inside every free limit.** The one to watch
is ~200 simultaneous live connections; you are far below it.

**Students download about 196 KB** (185 KB of app, 11 KB of styling). The
organizer dashboard is a separate piece that only loads at `/admin`, so
students never fetch it.

---

## If something breaks

**White page** — open the browser console (F12). Nine times out of ten it is a
missing or mistyped environment variable in step 3. Fix it in Vercel under
Settings → Environment Variables, then **Redeploy**.

**"Cannot reach the game"** — the two values in step 3 do not match your
Supabase project.

**Camera does nothing** — confirm the address starts with `https://`, and that
you allowed camera permission. iPhones only allow it in Safari.

**Deep link 404s** — `vercel.json` handles this; if you removed it, put it back.
