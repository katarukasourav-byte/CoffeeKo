# Palate & Pour

A coffee website for **coffeeko.in**: a scroll story (bean to cup), user accounts, a Taste ID, AI coffee matching for India, bulk import of past coffees with rating reminders, a journal and a freshness-tracking shelf.

- **Hosting:** Netlify (static files + one server function)
- **Accounts and database:** Supabase (email + password login, Postgres)
- **AI:** Claude Haiku 5.5 via the Anthropic API, called only from the server function. Swappable to Gemini.

---

## Part 1 — Put it online (about 30 minutes, once)

You need four free accounts: **GitHub**, **Netlify**, **Supabase**, and **Anthropic Console** (the last one is pay-as-you-go for AI use).

### 1. Put the files on GitHub
1. Sign in at github.com → **New repository** → name it `palate-pour` → **Create**.
2. On the new repository page, click **uploading an existing file**.
3. Drag in **everything inside** this folder (not the folder itself): `index.html`, `404.html`, `netlify.toml`, `README.md` and the `config`, `css`, `js`, `photos`, `netlify` and `supabase` folders.
4. Click **Commit changes**.

### 2. Set up Supabase (accounts + database)
1. supabase.com → **New project**. Pick a region close to your users (e.g. Mumbai). Save the database password somewhere safe.
2. Left menu → **SQL Editor** → **New query**. Open `supabase/schema.sql` from this folder, copy all of it, paste, click **Run**. You should see “Success”.
3. Left menu → **Project Settings → API**. Copy:
   - **Project URL**
   - **anon public** key
   - **service_role** key (secret — never put this in the website files)
4. In GitHub, open `config/settings.js` → pencil icon → paste the **Project URL** and **anon public** key in place of the placeholders → **Commit changes**.

### 3. Connect Netlify
1. netlify.com → **Add new site → Import an existing project → GitHub** → choose `palate-pour`.
2. Leave the build settings as they are (no build command) → **Deploy**.
3. **Site configuration → Environment variables → Add a variable**, and add these four:

| Key | Value |
|---|---|
| `SUPABASE_URL` | your Supabase Project URL |
| `SUPABASE_ANON_KEY` | the anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key |
| `ANTHROPIC_API_KEY` | from console.anthropic.com → API Keys |

4. **Deploys → Trigger deploy → Deploy site** so the function picks up the keys.
5. Copy your site address (e.g. `https://palate-pour.netlify.app`).

### 4. Connect coffeeko.in
1. Netlify → your site → **Domain management → Add a domain** → type `coffeeko.in` → **Verify** → **Add domain**. Netlify adds `www.coffeeko.in` too and sends it to the main address.
2. Netlify shows two ways to point the domain. The easiest is **Netlify DNS**: click **Set up Netlify DNS**, and Netlify gives you four nameservers (like `dns1.p01.nsone.net`).
3. Sign in where you bought coffeeko.in (GoDaddy, Hostinger, BigRock…) → the domain’s **DNS / Nameservers** settings → choose **custom nameservers** → paste Netlify’s four → save.
4. Wait. It’s usually live within an hour (sometimes up to a day). Netlify then switches on HTTPS by itself; you’ll see “Your site has HTTPS enabled” under **Domain management → HTTPS**.

> If you’d rather keep your registrar’s DNS (for example because email is already set up there), choose **external DNS** in Netlify instead and add the two records it shows: an **A record** for `coffeeko.in` and a **CNAME** for `www`.

### 5. Tell Supabase your site address
Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://coffeeko.in`
- **Redirect URLs:** add `https://coffeeko.in/**` and `https://www.coffeeko.in/**` (and `https://YOUR-SITE.netlify.app/**` while you test before the domain is live)

### 6. Let Supabase send emails to everyone
Supabase’s built-in email only reaches your own team and is limited to 2 an hour, so sign-up confirmations and password resets won’t reach the public until you connect an email service.
1. Create a free account with an email provider such as **Brevo** or **Resend** and get its SMTP details.
2. In the email provider, **verify coffeeko.in** as a sending domain: it gives you a few DNS records (SPF, DKIM) to add in Netlify → **Domain management → coffeeko.in → DNS records** (or at your registrar if you kept its DNS).
3. Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP → paste the host, port, username and password, and a sender such as `hello@coffeeko.in` with the name “Coffeeko”.

That’s it. Open your site, create an account, take the quiz.

### 7. Put a spending cap on AI
console.anthropic.com → **Billing / Limits** → set a monthly limit (e.g. $10). Together with the per-user daily limits this keeps costs predictable. Rough guide: a bag scan ≈ $0.001, a set of 12 suggestions ≈ $0.002.

---

## Part 2 — Edit the site yourself

Every change works the same way: **open the file on github.com → pencil icon → edit → Commit changes**. Netlify republishes in about a minute.

| I want to change… | File | What to edit |
|---|---|---|
| Story captions, order, photos, credits | `config/content.js` | the `story:` list |
| Opening headline | `config/content.js` | `hero:` |
| Section titles (Explore, Journal, Shelf) | `config/content.js` | `sections:` |
| Login screen words | `config/content.js` | `login:` |
| Site name shown in the header and tab | `config/content.js` | `brand:` |
| “Add past coffees” wording, how many photos at once | `config/content.js` | `onboarding:` |
| Rating reminder wording, snooze length | `config/content.js` | `reminders:` |
| Quiz questions and answers | `config/content.js` | `quiz:` |
| Taste-type names and descriptions | `config/content.js` | `archetypes:` |
| Which tasting notes count as “fruity”, “chocolate”… | `config/content.js` | `flavours:` |
| Rating button labels, brew methods | `config/content.js` | `verdicts:`, `brews:` |
| Freshness windows for the shelf | `config/content.js` | `freshness:` |
| Colours and fonts | `config/theme.css` | the hex codes |
| AI model, daily limits, roasters to favour | `config/ai.json` | the values (`identify_bulk` is the allowance for adding past coffees in one go) |
| Switch AI to Google Gemini | `config/ai.json` | `"provider": "gemini"`, `"model": "gemini-…"`, and add `GEMINI_API_KEY` in Netlify |

**Photos:** upload a new photo into `photos/` with the same file name to replace one. For phones, also put a smaller copy (about 1800 px on the long side) with the same name into `photos/m/`. To add a story stage, upload the photo and copy one block in the `story:` list.

**If the site goes blank after an edit**, the last change has a typo (usually a missing quote or comma). In GitHub open the file → **History** → open the previous version → copy it back, or use Netlify → **Deploys** → pick the last good deploy → **Publish deploy**.

**Bigger changes** (new features, new pages) are normal HTML, CSS and JavaScript in `index.html`, `css/` and `js/`. Any web developer can work on them, or bring the folder back to Claude.

---

## Part 3 — Look after your users’ data

- **See users:** Supabase → Authentication → Users.
- **See their coffees:** Supabase → Table Editor → `journal`, `shelf`, `profiles`.
- **See AI use per day:** Table Editor → `ai_usage_by_day`.
- **Privacy:** every table has rules so a logged-in user can only read and change their own rows. The `ai_usage` table can only be touched by the server function.
- **Free plan notes:** Supabase’s free plan pauses a project after a week with no activity (restore it from the dashboard), and includes 500 MB of database, which is plenty for thousands of users’ journals.

---

## How it fits together

```
Browser ── index.html, config/, css/, js/, photos/   (served by Netlify)
   │
   ├── js/data.js ──► Supabase: login, profiles, journal, shelf
   │
   └── /.netlify/functions/ai ──► checks login + daily limit (Supabase)
                                └► calls Claude with your secret key
```

**Demo mode:** if `config/settings.js` still has the placeholder values, the site runs without logins. Data stays in that browser and the AI features are off. This is handy for checking edits before going live.

## Credits
Story photos are from Unsplash under the Unsplash License; photographers are credited on screen. The crease close-up was upscaled 4× with Real-ESRGAN.
