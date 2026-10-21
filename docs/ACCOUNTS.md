# Accounts in the ECHO web app

People sign up or log in before the map opens. New accounts see three welcome cards once (they
can skip them); people logging back in go straight to the map. The account button (top of the
explore panel, or Settings on phones) shows who is signed in and has **Log out**.

The code is in `apps/web/app/auth.js` (accounts), `gate.js` (the sign-in screen) and
`onboarding.js` (the welcome cards). Which kind of account is used is set in
`apps/web/app/config.js`, under `auth`.

## Today: device accounts (`provider: 'device'`)

Accounts are kept in each visitor's browser. Passwords are never stored, only a salted
PBKDF2-SHA256 hash. This needs no server, so it works on GitHub Pages as it is, but:

- an account exists only in the browser where it was made: it does not follow someone to
  their phone, and clearing browser data deletes it;
- there is no password reset and no email check;
- anyone with access to that browser's storage could remove the gate. It is a front door,
  not a vault. Nothing in ECHO is private server data yet, so this is acceptable for a preview.

The sign-in screen says so ("saved in this browser only").

## Real accounts: Supabase (`provider: 'supabase'`)

The same screens work with real accounts on [Supabase](https://supabase.com) (free tier), with
no other code changes:

1. Create a Supabase project.
2. In **Authentication → Providers**, keep **Email** on. Decide whether people must confirm
   their email (recommended); ECHO shows "we sent a confirmation link" when they must.
3. In **Authentication → URL Configuration**, set the Site URL to
   `https://bandkoconnect-ui.github.io/From-space-for-earth/`.
4. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
5. In `apps/web/app/config.js` set:

   ```js
   auth: { provider: 'supabase', supabaseUrl: 'https://YOUR-PROJECT.supabase.co', supabaseAnonKey: 'YOUR-ANON-KEY' }
   ```

   The anon key is meant to be public. Never paste the `service_role` key anywhere in this repo.
6. Push. Test sign-up, the confirmation email, log-in and log-out on the live site.

The Supabase adapter is covered by unit tests against a fake server; it has not yet been run
against a live Supabase project, so do step 6 before telling people about it. Investigations and
notes still live in the browser either way; syncing them to the account is a separate piece of
work (a database table per user with row-level security).

## Desktop and phone apps

The sign-in screen is in the web app only. The desktop and phone apps do not ask for an account yet.
