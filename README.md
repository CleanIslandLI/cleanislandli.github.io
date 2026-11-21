# Clean Island Power Washing website

Static site on GitHub Pages, with a free Supabase backend for bookings and admin and Stripe Checkout for payments.

- `docs/SETUP.md`: step-by-step launch guide (GitHub, Supabase, Stripe, email, domain, Google)
- `docs/EQUIPMENT-AND-STARTUP.md`: gear list, chemicals, insurance and licensing checklist
- `docs/BRAND.md`: logo, colors and type
- `assets/js/pricing-core.js`: prices, service area and season rules (shared by the site and backend)
- `tools/content.mjs`, `tools/build.mjs`: page copy and generator (`node tools/build.mjs` rebuilds every page)
- `supabase/schema.sql`: database, security rules and starting data
- `supabase/functions/api/index.ts`: generated backend function (edit `handler.ts`)
- `tests/`: pricing tests (`node --test tests/pricing.test.mjs`)

No secret keys are stored in this repository. Stripe keys live only in Supabase Edge Function secrets.
