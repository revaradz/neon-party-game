# Neon Party — online Scribble + Quiz

A real-time browser party game. Friends join the same room with a six-character code. In **Both** mode, rounds alternate between Scribble and Quiz. Up to 12 players.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder run:
   ```bash
   npm install
   npm start
   ```
3. Open `http://localhost:3000`.

To play with friends on the same Wi-Fi, share your computer's local network address and port `3000` (allow it through your firewall).

## Free online hosting (Render)

This project uses one Node web server for the site and real-time Socket.IO connection.

1. Create a free GitHub account and a new repository. Upload all files in this folder.
2. Sign in to [Render](https://render.com/) and choose **New → Web Service**.
3. Connect the repository.
4. Set **Runtime: Node**, **Build Command: `npm install`**, **Start Command: `npm start`**.
5. Choose the free instance type and deploy. Open the `onrender.com` URL and share it with friends.

The app does not need a database, API key, or paid service. Room state lives in server memory, so rooms reset when the server restarts or sleeps. Free hosting availability and limits can change; Render's free web services may sleep after inactivity, so the first visit after a quiet period can take a little longer. For a hobby game this is a no-cost starting point, not a guaranteed always-on production host.

## Gameplay

- Create a room and choose Both, Scribble only, or Quiz only.
- Share the room code; the host starts when at least two people have joined.
- Both mode alternates between drawing and multiple-choice trivia.
- Correct Scribble guesses earn 100 points; the drawer earns 50. Correct quiz answers earn 100.
- Eight rounds per game; up to 12 players.

## Project structure

- `server.js` — Express + Socket.IO game server and authoritative scoring
- `public/index.html` — page structure
- `public/style.css` — neon responsive styling
- `public/game.js` — browser client and drawing/quiz interface

## Notes

This is a playable starter project. It intentionally keeps rooms in memory and has no accounts, database, moderation dashboard, or persistent leaderboards. Do not expose private information in room chat.
