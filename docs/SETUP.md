# Clean Island Power Washing: setup guide

Everything here is free except the Stripe fees on real payments (2.9% + 30¢ per card charge) and, later, the optional domain.
Plan on about 45 minutes. Do the parts in order.

---

## Part 1: GitHub (puts the website online), about 5 min

1. Sign in at https://github.com. Click your profile picture, then **Your organizations**, then **New organization**.
2. Pick the **Free** plan. Organization name: **cleanislandli**. Contact email: yours. Select "My personal account", then click **Next** and **Complete setup**.
3. In the new org, click **New repository**. Name it exactly **cleanislandli.github.io**. Set it to **Public**, leave everything else unticked, and click **Create repository**.
4. Tell Claude "the repo is ready." Claude connects to it and uploads the site, committed under your name.
5. In the repo: **Settings > Pages**. Under "Build and deployment," set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, then click **Save**.
6. After about 2 minutes the site is live at **https://cleanislandli.github.io**.

At this point the site, prices, estimates and calendar all work. Booking and payment switch on after Parts 2 and 3.

---

## Part 2: Supabase (bookings database and admin login, free), about 15 min

1. Go to https://supabase.com and click **Start your project**. Sign up with GitHub.
2. Click **New project**. Name it `cleanisland`, create a strong database password and save it, pick the region **East US (North Virginia)**, and click **Create**.
3. **Create the database.** Open **SQL Editor > New query**. Paste in all of `supabase/schema.sql` and click **Run**. It should say "Success."
4. **Create your admin login.** Go to **Authentication > Users > Add user > Create new user**. Enter your email and a strong password, tick **Auto Confirm User**, and save.
5. **Make yourself admin.** Back in the SQL Editor, run this line with your email:
   `insert into public.admins (user_id) select id from auth.users where email = 'YOUR@EMAIL.com';`
6. **Block strangers from signing up.** Go to **Authentication > Sign In / Providers** and turn **off** "Allow new users to sign up."
7. **Deploy the booking function.**
   - Go to **Edge Functions > Deploy a new function > Via Editor**.
   - Name it exactly **api**.
   - Delete the sample code, paste in all of `supabase/functions/api/index.ts`, and click **Deploy**.
   - Open the function's **Settings**, turn **off** "Enforce JWT verification" (or "Verify JWT"), and save. The function does its own security checks.
8. **Connect the website.** Go to **Project Settings > API** (or **Data API**) and copy the **Project URL**. It looks like `https://abcdxyz.supabase.co`. Send it to Claude, or paste it into `assets/js/config.js` as `projectUrl`.
9. **Add the secrets.** Go to **Edge Functions > Secrets** and add:
   - `SITE_URL` = `https://cleanislandli.github.io`
   - `IP_SALT` = any long random phrase (it's only used to anonymize IP addresses)
   - `NOTIFY_EMAIL` = your email, for new-booking alerts (see Part 4)

To sign in as admin, go to https://cleanislandli.github.io/admin/. The first time on each device, it asks for the **anon public** key from **Project Settings > API**. That key is meant to be public and is safe to paste.

---

## Part 3: Stripe (payments), about 15 min plus Stripe's review

1. Register at https://dashboard.stripe.com/register using the business email. Use this new account only for Clean Island.
2. Click **Activate payments** and fill in the business details. With no LLC yet, choose **Individual / Sole proprietor** and use your SSN; you can switch to an EIN or LLC later. Business name: Clean Island Power Washing. Website: https://cleanislandli.github.io. Then add the bank account for payouts.
3. **Secret key.** Go to **Developers > API keys** and reveal the **Secret key** (`sk_live_...`). In Supabase **Edge Functions > Secrets**, add `STRIPE_SECRET_KEY` with that value. Never put this key in the website code or send it in a chat.
4. **Webhook.** Go to **Developers > Webhooks > Add endpoint**.
   - Endpoint URL: `https://YOURPROJECT.supabase.co/functions/v1/api?action=stripe_webhook`
   - Events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
   - Save, then reveal the **Signing secret** (`whsec_...`) and add it in Supabase Secrets as `STRIPE_WEBHOOK_SECRET`.
5. **Practice run (recommended).** Turn on **Test mode** in Stripe and repeat steps 3 and 4 with the test keys. Make a booking on the site and pay with card `4242 4242 4242 4242`, any future date and any CVC. Check that it shows **Confirmed** in /admin. Then swap both secrets back to the live values.

Until `STRIPE_SECRET_KEY` is set, every online booking comes in as a request. Nobody is charged, and you can approve requests and take payment however you like.

---

## Part 4 (optional): email notifications

The site works without email: new bookings show up in /admin, and customers get a status link on screen. For automatic emails:

1. Sign up at https://resend.com (free for 3,000 emails a month) and create an API key.
2. In Supabase Secrets, add `RESEND_API_KEY`.
3. Until a domain is verified, Resend only delivers to your own address, so you'll get alerts but customers won't. After you buy **cleanislandli.com**, verify it in Resend and add `FROM_EMAIL` = `Clean Island <bookings@cleanislandli.com>`. Customer confirmations then go out automatically.

---

## Part 5 (later): custom domain cleanislandli.com, about $11 to $15 a year

Buy it at Cloudflare, Porkbun or Namecheap. Then:
1. In the repo, go to **Settings > Pages > Custom domain**, enter `cleanislandli.com` and save. Follow GitHub's DNS instructions and tick **Enforce HTTPS**.
2. Ask Claude to switch the site address. That changes one line in `config.js` and rebuilds the sitemap and links.
3. In Supabase Secrets, change `SITE_URL` to `https://cleanislandli.com`. In Stripe, edit the website in **Settings > Business details**.

---

## Part 6: Google (free customers from search)

1. **Google Search Console** (https://search.google.com/search-console): add the property `https://cleanislandli.github.io/`, verify it with the HTML-tag method (send Claude the tag), then submit `sitemap.xml`.
2. **Google Business Profile** (https://business.google.com): create the profile as a **service-area business**. Hide the home address and list the towns you serve. Add the phone number and website, and post photos from your first jobs. This is the biggest driver of "power washing near me" searches.
3. Ask every happy customer for a Google review. Real reviews are the strongest trust signal you can have.

---

## Running the business from /admin

- **Needs action**: approve or reject requests, and change the price, date or deposit before approving. Approving emails the customer a link to pay the deposit, or you can copy the link and text it.
- **Mark job done**: enter the final price. The customer gets a link for the balance, and the booking shows **Paid in full** when it's paid.
- **Cash or check**: use "Record cash or check."
- **Season & availability**: season dates, working days, crews, blocked days, and the switch for winter bookings (off by default).
- **Services & prices** and **Discounts**: changes apply to the booking form within minutes.
- If a customer cancels more than 48 hours ahead, their deposit is refunded automatically.

## Editing the site later

The text lives in `tools/content.mjs` and `tools/build.mjs`, and the styles in `assets/css/site.css`. After editing, run `node tools/build.mjs`. Or just ask Claude.
