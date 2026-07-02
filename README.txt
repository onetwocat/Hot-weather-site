EWO — Extreme Weather Observatory
==================================

This is a pure static website. No backend, no build step.
Just upload all files to any web host.

FILES
-----
  index.html         Entry page (lets visitor pick a direction)
  Atmosphere.html    Main version — fan + ice-carve experience
  Observatory.html   Alternate version — data dashboard
  Blog/              Static blog directory
  fan-wind.js        Fan + wind animation engine
  ice-carve.js       Ice block + carving interaction
  weather-data.js    City weather data (Open-Meteo live + local fallback)

DEPLOY OPTIONS
--------------

1) VERCEL  (recommended — easiest, free, auto-HTTPS)
   - Go to https://vercel.com  →  sign up
   - "Add New" → "Project" → drag the entire folder
   - Done. You get a free *.vercel.app URL in ~30 seconds.

2) NETLIFY  (also great)
   - Go to https://app.netlify.com/drop
   - Drag the folder onto the page
   - Done.

3) CLOUDFLARE PAGES
   - Go to https://pages.cloudflare.com
   - Connect a GitHub repo, or "Direct upload" → drag folder

4) GITHUB PAGES
   - Push files to a public repo's `main` branch
   - Settings → Pages → Source: main / root
   - Live at https://<username>.github.io/<repo>/

5) YOUR OWN SERVER (Nginx / Apache / etc.)
   - Upload all files to your web root (e.g. /var/www/html/ewo/)
   - Make sure index.html is the directory index
   - That's it — no server-side dependencies.

CUSTOM DOMAIN
-------------
After deploying to any platform above, you can point your own domain
(e.g. weather.yoursite.com) at it. Each platform has a "Custom domain"
setting that walks you through the DNS records.

CONNECTING REAL WEATHER DATA
----------------------------
weather-data.js now tries to load current readings from Open-Meteo
(free, no API key). If the live request fails, the page falls back to
the bundled local readings so the experience still works offline.

REQUIREMENTS
------------
None on the server side. Visitors need a modern browser
(Chrome / Safari / Firefox / Edge — last 2 years).
