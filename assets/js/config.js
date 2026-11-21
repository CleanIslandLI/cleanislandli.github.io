// Site configuration. No secret keys belong in this file: it is public.
export const SITE = {
  url: "https://cleanislandli.github.io", // change to https://cleanislandli.com when the domain is connected
  name: "Clean Island Power Washing",
  base: "Islip",
};

// Customer-facing contact details. Leave blank until ready: blank values stay hidden on the site.
export const BUSINESS = {
  phone: "(631) 800-9643",
  email: "cleanislandli@gmail.com",
  hours: "Monday to Saturday, 8 am to 5 pm (April through October)",
};

// Supabase project URL (looks like https://abcdefgh.supabase.co). This is not a secret.
// Leave blank until the backend is set up; the site still shows prices and estimates.
export const BACKEND = {
  projectUrl: "https://mvheqhhvahxufcyzfdkg.supabase.co",
};
export const API_URL = BACKEND.projectUrl ? BACKEND.projectUrl.replace(/\/$/, "") + "/functions/v1/api" : "";
