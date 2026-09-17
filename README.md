# Ipon — setup guide

This is the working code for the app we designed: savings by pay cutoff, income
allocation, recurring bills, and a buddy system with a combined dashboard.

## 1. Install dependencies

Open this folder in VS Code, open a terminal (`` Ctrl+` ``), and run:

```
npm install
```

## 2. Create your Supabase project

1. Go to https://supabase.com, sign up (free), and create a new project.
2. Wait for it to finish provisioning (a couple minutes).
3. In the left sidebar, go to **SQL Editor** > **New query**.
4. Open `supabase/schema.sql` from this project, copy the whole thing, paste it
   into the SQL editor, and click **Run**. This creates every table and all
   the security rules (so buddies can see each other's data, but nobody else can).
5. Go to **Project Settings > API**. Copy the **Project URL** and the
   **anon / public** key.

## 3. Connect your app to Supabase

1. Copy `.env.local.example` to a new file named `.env.local`.
2. Paste in your Project URL and anon key from step 2.5 above.

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

## 4. Run it locally

```
npm run dev
```

Open http://localhost:3000 — you should land on the login page. Click "Sign up"
to create an account. Supabase will send a confirmation email by default; check
the inbox you signed up with (or turn off email confirmation in Supabase under
**Authentication > Providers > Email** while you're testing, so you can log in
immediately).

## 5. Try the flow

1. Sign up, log in, land on the dashboard.
2. Create your first cutoff (pick a start/end date and a savings target).
3. Log some income, then allocate it across Savings / Bills / Groceries / Other.
4. Go to **Bills**, add a recurring bill, and try the edit action (this instance
   vs. going forward).
5. Go to **Buddy**, invite a second account (sign up a second test account with
   a different email in an incognito window), accept the invite from that
   account, and you'll see the combined dashboard appear on both sides.

## 6. Push to GitHub

```
git init
git add .
git commit -m "Initial Ipon app"
```

Create a new empty repository on https://github.com, then follow the push
instructions GitHub shows you (something like):

```
git remote add origin https://github.com/your-username/ipon-app.git
git branch -M main
git push -u origin main
```

## 7. Deploy on Vercel

1. Go to https://vercel.com, sign in with GitHub.
2. Click **Add New Project**, pick your `ipon-app` repo.
3. Before deploying, add your two environment variables (same names as
   `.env.local`) under **Environment Variables**.
4. Click **Deploy**. Every future `git push` to `main` redeploys automatically.

## What's simplified for this first version (v1 notes)

- Recurring bills don't yet auto-generate an allocation row every cutoff on a
  schedule — you add them once, and the "edit" action either logs a one-time
  adjusted entry (this instance) or updates the bill's baseline (going
  forward). Auto-generation on cutoff rollover is a good next step.
- The buddy combined dashboard compares each person's **most recent** cutoff —
  it doesn't yet require matching date ranges. Worth revisiting once you're
  using it with a real buddy on a shared pay schedule.
- No email notifications yet for buddy invites — the invited person sees the
  pending request only when they open the Buddy tab themselves.
- Streak logic and the "Ipon tree" visual from our design mockups aren't wired
  up on this dashboard yet — the streak number is computed, but the growth
  visualization can be added as a next pass.

Bring any errors or questions back here and we'll work through them together.
