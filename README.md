# URL Video Player (Frontend + Backend)

This project contains:
- `public/index.html` → Frontend (can be hosted on GitHub Pages)
- `server.js` → Node.js backend (for Render.com). Provides `/play` (proxy + Range) and `/remux` (ffmpeg remux to MP4)
- `package.json`

## Quick start (local)
1. Install Node.js 18+ and ffmpeg (ffmpeg required for /remux)
2. npm install
3. npm start
4. Open http://localhost:3000 and update the BACKEND constant in public/index.html if accessing from another origin.

## Deploy to Render
- Create a new Web Service on Render connected to this repository.
- Use a build command that installs ffmpeg before npm install, for example:
  ```
  apt-get update && apt-get install -y ffmpeg && npm install
  ```
- Start command: `npm start`

## Notes
- The backend does not do heavy validation — consider adding rate-limiting, auth, or host allow-listing in production.
- Respect copyright and terms of service when streaming remote media.
