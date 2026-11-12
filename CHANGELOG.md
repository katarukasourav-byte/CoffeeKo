# CoffeeKo change log

One entry per feature, newest first. Each says what it does, where the code lives, any database
change, and how to remove it. Several features usually go to GitHub together in one upload
(see CLAUDE.md), so to remove one feature, edit it out by hand using this list; reverting a
whole upload removes everything in it.

Search tips: every block of feature code starts with a `/* ... */` comment naming it, so
searching `js/app.js` for the function names below finds it.

**Whole-site rollback:** Netlify keeps every published version. In Netlify, go to Deploys, open
an older deploy and choose "Publish deploy". That rolls back all the code (not the database).

---

## 2026-11-12 · "What you can do" list on the sign-up screen
- **What:** five short lines next to the sign-up form showing the main features: personality,
  matches, journal, shelf and buying direct.
  - **People without brew styles** (older accounts, visitors) see beans and ground coffee in
    Explore, as before.
- **Code and content:**
  - `config/content.js`: `login.features` (edit the wording there).
  - `js/app.js`: `featList()`, `FEAT_IC`, and the `!myStyles` line in `exploreList()`.
  - `css/style.css`: `.feat`.
- **Database:** none.
- **Also on the first photo:** the same five titles sit under the headline, in a light font with a
  soft shadow so they read on the photo. There are two columns on desktop, and the headline is a
  little smaller on short screens to make room.
  - **Where:** `index.html` (`#heroFeat`), the `heroFeat` line in `js/app.js`, and `.hero-feat`
    plus the `.hero-text h1` size rule in `css/style.css`.
- **Remove:** delete `features` from `login` in `config/content.js`. This removes both lists.
  To remove only the photo version, delete `<ul id="heroFeat">` in `index.html`.

## 2026-11-12 · Explore kept simple for people with several styles
- **What:**
  - **"All my styles"** shows beans and ground coffee only. Cold brew bags, instant, drip bags
    and bottles show under their own chip, where they come first. They also show in the default
    view when instant, cold brew or cafés is the person's main style.
  - **No "Café drinks" chip** unless cafés are the main style.
  - **No style chip row** when there's only one chip.
  - **Card label:** every card says what the product is: "Whole coffee beans", "Ground coffee beans", "Instant", "Drip bags"…
- **Code (`js/app.js`):**
  - `exploreList()`: `PACKED`, `packOk`, and the "under a chip: … first" line.
  - `renderExplore()`: the `my` filter, the `xstyle` reset, the `my.length>1` check.
  - `typeLine()`.
- **Database:** none.
- **Remove:** delete `&&packOk(p)` in `styleOk` to mix packs back into the default view.

## 2026-11-12 · Catalogue keeps instant, drip bags and cold brew
- **What:**
  - **Sync:** the daily catalogue sync stops dropping instant coffee, drip bags, cold brew
    (bags, concentrate, bottles, cans) and filter blends. It records what each product is
    (`kind`) and how many come in a pack (`pack_count`).
  - **AI read:** it confirms both fields.
  - **Explore and the next-step card:** use `kind` instead of guessing from the name.
  - **Prices:** packs show "₹450 · pack of 5" instead of a per-250 g price.
- **Code:**
  - `netlify/lib/catalog.mjs`: `NOT_COFFEE` (instant, sachet, drip bag, easy pour, cold brew,
    bottle and can were removed from it), `kindOf()`, `countOf()`, `COUNTED`, the `kind` /
    `pack_count` lines in `syncRoaster()`, and the `kind` / `packCount` rules in `PROMPT` and
    `extractBatch()`.
  - `js/data.js`: catalogue columns `kind,pack_count` and cache key `ck-catalog-v2`.
  - `js/app.js`: `fromCat` (`productType`, `packCount`), `priceText`, the `filter100` rule in
    `nextStep()`.
- **Database:** `supabase/catalog_kinds.sql` adds the `kind` and `pack_count` columns and tags
  the existing rows. **Apply it before the code goes live:** the site asks for these columns,
  and the catalogue won't load without them.
- **Remove:**
  1. Put the removed words back into `NOT_COFFEE`.
  2. Take `kind,pack_count` out of the `js/data.js` columns.
  3. Then run `supabase/catalog_kinds_undo.sql`.
  4. To also hide what was already added:
     `update catalog set is_coffee=false where kind in ('instant','dripbag','coldbrew','rtd')`.

## 2026-11-12 · Shareable card: full "Look for" line
- **What:** The Personality share card no longer cuts the "Look for:" line off mid-list. It
  drops whole items if they don't fit, and any other long text ends with "…".
- **Code:** `js/app.js` → `personalityCard()` (the `lines()` and `wrap()` helpers, the `P.look` line).
- **Database:** none.
- **Remove:** not needed; it's a fix.

## 2026-11-12 · Brew styles, phase 2: "Your next step" and servings on the Shelf
- **What:**
  - **Next-step card:** a card on the Personality suggests one easy upgrade, with a real product.
    - Instant → specialty instant → drip bags → cold brew bags → French press → beans.
    - Cafés and cold brew have their own steps.
    - Chicory filter → 100% coffee roast.
    - "Not now" hides it for 3 weeks.
  - **Shelf in servings:** instant, drip bags, cold brew packs and bottles are counted in
    servings with a "Had one" button. Beans and ground stay in grams.
- **Code (`js/app.js`):**
  - Next step: `LADDER`, `triedTypes()`, `nextStep()`, `nextStepCard()`; the `nsexplore` /
    `nslater` click actions; the `renderProfile()` call at the end of `loadCatalog()`.
  - Servings: `SERV`, `isServ()`, `uWord()`, `nU()`, `countRing()`, `ringOf()`, `openHad()`.
    Also the `f.serv` branches in `fresh()`, `advice()`, `renderShelf0()` and `openBagView()`,
    the "What is it?" field in `openBag()`, and the `K` branch in the rate sheet's
    "add to my shelf" part.
- **CSS:** `css/style.css`, the block marked `/* next step card */` plus `.row[hidden],.field[hidden]`.
- **Data:**
  - **Shelf items** get optional `kind` and `bestBy` fields inside their existing JSON data.
  - **Profile settings** get `nextHide`.
  - **Brew log entries** get `u` (unit).
  - No table changes.
- **Remove:**
  - **Next-step card:** delete `${nextStepCard()}` in `renderProfile()`. The rest can stay unused.
  - **Servings:** items already saved with `kind` would then show as grams. Edit them, or leave
    the `SERV` code in place.

## 2026-11-12 · Brew styles, phase 1
- **What:**
  - **Quiz:** it starts with how people drink coffee (pour-over, espresso, French press, South
    Indian filter, cold brew, instant, cafés). It then asks which style is their main one, and
    one question about that style.
  - **Personality:** shows a tip for that style.
  - **Explore:** gets "For" style chips, ranks products by style, and labels what each product
    is (beans, instant, drip bags…).
- **Code:**
  - `config/content.js`: quiz questions `styles`, `main`, `form`, `chicory`, `cbserve`,
    `strength`; `brews` list.
  - `js/app.js`:
    - Quiz: `BREWER`, `STYLE_NAME`, `stylesOf()`, `mainOf()`, `qOn()`, `qOpts()`, `qVisible()`.
    - Products: `PTYPE`, `ptype()`, `suits()`, `styleTip()`, `typeLine()`.
    - Explore: `xstyle` and the `styleOk` / `lead` parts of `exploreList()`, and the
      `styleRow` in `renderExplore()`.
- **CSS:** `.filters.styles`, `.f-lbl`, `.x-type`, `.style-tip`.
- **Data:** new answers stored in the profile's prefs JSON (`styles`, `main`, `chicory`…).
  No table changes.
- **Remove:** take the `styles` / `main` / style questions out of `config/content.js`. The code
  skips styles when a profile has none.

## 2026-11-11 · Brew Wall (and open to everyone, All / Mine filter)
- **What:**
  - **Sharing:** people paste an Instagram post or reel link. It's shown with Instagram's
    official embed and the creator's handle, after admin review.
  - **Features:** likes, a full-screen swipe feed, and an All / Mine filter.
  - **Visibility:** everyone can see it, signed in or not.
- **Code:**
  - `js/wall.js` (whole file).
  - `js/data.js`: `wallList`, `wallAdd`, `wallRemove`, `wallLike`, `isAdmin`, `wallReview`,
    `wallDemo`.
  - `js/app.js`: `wallFor`, `wallCtx()`, `renderWall()`, `openOverlay()` / `closeOverlay()`.
  - `index.html`: the `#wall` section and the "Brew Wall" tab.
- **CSS:** `.wall-*`, `.wcard`, `.wframe`, `.wfeed`, `.wbadge`, `.wdel`, `.wall-sec`, `.wall-filter`.
- **Database:** `supabase/brew_wall.sql`. It creates the tables `brew_posts`, `brew_likes` and
  `app_admins`, and the functions `is_admin()` and `brew_pending_count()`.
- **Remove:**
  1. Delete the `#wall` section and the tab in `index.html`, and the `renderWall` calls in
     `js/app.js`.
  2. Then run `supabase/brew_wall_undo.sql`. This deletes all posts and likes.
- **Hide temporarily:** delete only the section and tab in `index.html`. The data stays.

## 2026-11-10 · Atlas map: Mercator, swipe on phones
- **What:** Familiar map shapes cropped to the coffee belt. On phones the map is wider than
  the screen and swipes sideways.
- **Code:** `js/atlas.js` → `worldSVG()`; `.mscroll` in `css/style.css`.
- **Database:** none.
- **Remove:** restore `worldSVG()` from the git commit before `807639d`.

## 2026-11-10 · Google sign-in on coffeeko.in (Google Identity Services)
- **What:** Google's own button and One Tap on coffeeko.in, so Google's screen shows coffeeko.in.
  It falls back to the old redirect button.
- **Code:**
  - `config/settings.js`: `googleClientId`.
  - `js/app.js`: `loadGIS()`, `makeNonce()`, `mountGoogle()`.
  - `js/data.js`: `signInWithGoogleToken()`.
  - `css/auth.css`: `.gsi-box`.
- **Database / settings:** Google provider in Supabase Auth (the Client ID and secret live in
  Supabase).
- **Remove:** set `googleClientId: ''` in `config/settings.js` to go back to the redirect button.
  To remove Google entirely, also turn off the Google provider in Supabase → Authentication.

## 2026-11-10 · Coffee Atlas, quiz before sign-up, share card, photo viewer
- **What:**
  - Atlas map in the Journal.
  - Visitors can take the quiz before creating an account.
  - Shareable Personality card (Instagram story size).
  - Full-screen photo viewer.
  - The app reopens on the last section used.
- **Code:**
  - Atlas: `js/atlas.js`, `js/vendor/geo.js`, `data/world.json`, `data/detail.json`, plus
    `jview` / `atlasCtx()` in `js/app.js`.
  - Quiz first: `PENDING`, `showGuestResult()`.
  - Card: `personalityCard()`, `shareCard()`.
- **Database:** none.
- **Remove:**
  - **Atlas:** remove the Atlas view switch (`jview`) in `js/app.js`.
  - **Share card:** remove the `data-act="sharecard"` buttons.

## 2026-11-09 and earlier
- **Installable app:** `manifest.webmanifest`, `sw.js`, `icons/`.
- **Roaster list from the Supabase `roasters` table:** two roasters an hour; failing shops
  switch off.
  - Code: `netlify/lib/catalog.mjs`, `netlify/functions/catalog-cron.mjs`.
  - **Pause the sync:** set roasters to disabled in Supabase.
- **Shelf:** dose choice, Brew history and Past bags.
- **Explore:** match %, international filter, roaster mixing.
- **Base app:** catalogue, personality, journal, shelf, account deletion.
- **Database files:** `supabase/schema.sql` (profiles, journal, shelf, ai_usage) and
  `supabase/catalog.sql` (catalog).
