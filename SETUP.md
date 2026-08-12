# Work Orders App — Setup

This app needs a free Firebase project to store and sync your crew's tasks
across phones. Do this once before deploying.

## 1. Create a Firebase project
1. Go to https://console.firebase.google.com and sign in with a Google account.
2. Click **Add project**, give it a name (e.g. "norwood-work-orders"), and finish the wizard (you can skip Google Analytics).

## 2. Turn on Firestore (the database)
1. In the left sidebar, click **Build → Firestore Database**.
2. Click **Create database**.
3. Choose **Start in test mode** for now (this makes it work immediately —
   see the security note at the bottom before you rely on this long-term).
4. Pick a location close to New Jersey (e.g. `us-east1`) and click **Enable**.

## 3. Get your config keys
1. Click the gear icon (top left) → **Project settings**.
2. Scroll to **Your apps**, click the **</>** (web) icon to register a new web app.
3. Give it any nickname and click **Register app**.
4. You'll see a code block with a `firebaseConfig` object — copy those values.
5. Open `src/firebase.js` in this project and paste your values in, replacing
   the placeholders (`YOUR_API_KEY`, `YOUR_PROJECT`, etc).

## 4. Push this project to GitHub
1. Create a new repository at https://github.com/new
2. Upload every file in this folder (drag the whole folder in, or use `git push` if you're comfortable with git).

## 5. Deploy on Vercel
1. Go to https://vercel.com and sign in with your GitHub account.
2. Click **Add New → Project**, select this repository.
3. Vercel auto-detects it's a Vite app — leave the defaults and click **Deploy**.
4. In a minute you'll get a live link like `work-orders-app.vercel.app`.

## 6. Add it to phones
Open the link on each phone's browser, then use the browser menu's
**"Add to Home Screen"** option so it behaves like a regular app icon.

---

## Security note (read before real use)
"Test mode" Firestore rules allow anyone with your project ID to read and
write your data — fine for trying this out, but not for storing real
schedules long-term. Before relying on this day to day, go to
**Firestore Database → Rules** and tighten them, or ask me and I can write
locked-down rules for you once you're at that step.

## Adding real email/text alerts (optional, later)
This app currently only shows a live in-app badge when a task is completed.
To get an actual text or email, you'd add a Firebase Cloud Function that
triggers whenever a task's status changes to "done" and calls a service like
Twilio (text) or SendGrid (email). This is a good next step once the basic
app is working well for your crew — ask me when you're ready and I'll build it.
