# Champions Bid — Game Night Web App

A lightweight, single-page site for running a bidding + listing party game with teams and round-based scoring.

Features

- Team setup with validation (2+ teams, 3+ players per team)
- Per-round Champion nomination
- Bidding flow:
  - Alternate turns automatically
  - Raise by 1 or more
  - Challenge the previous team
- Listing flow:
  - Live unique count with duplicate prevention
  - Optional 60-second timer
  - One-click result: Hit or Fail
- Automatic scoring and starting team rotation (round-robin or fixed)
- Forfeit notes per round
- Local storage persistence
- Import/Export game state as JSON
- Topic Bank
  - Curated categories and questions, including your examples
  - Search and category filter
  - Random Topic + Question picker
  - Click “Use” to set the Round’s Topic and Question instantly
- NEW: Topic & Question Spotlight
  - Large banner on Bidding, Listing, and Result screens showing the Topic and Question clearly for all players
- NEW: Manual Counter Mode
  - On the Listing screen, toggle “Use manual counter” to increment/decrement the count with buttons instead of typing each item
  - When you enable the counter, it starts from your current unique typed count

How to use

1. Open index.html in a browser, or host via GitHub Pages (see below).
2. Setup:
   - Add at least 2 teams.
   - Ensure each team has 3+ players.
   - Click Start Game.
3. Round:
   - Use the Topic Bank to pick a topic and question:
     - Filter by category or search.
     - Click “Random Topic + Question” or “Random in Category”.
     - Click “Use” next to any question to set it.
   - Or type your own Topic/Question into the inputs.
   - Select a Champion for each team.
   - Click Start Bidding.
4. Bidding:
   - A large spotlight banner shows Topic & Question.
   - Teams take turns automatically.
   - Place a bid (initial min is 1), raise by 1 or more, or press Challenge.
5. Listing:
   - A large spotlight banner shows Topic & Question.
   - Toggle “Use manual counter” to switch to button-based counting:
     - +1 to increment, -1 to undo, Reset to clear.
     - Typing UI is hidden while counter mode is on.
   - If you keep typing mode, add items; duplicates (case-insensitive) are prevented.
   - Use the timer if enabled.
   - Click Champion Hit or Champion Failed to award the point.
6. Result:
   - Spotlight banner remains visible.
   - Optionally add a forfeit note for the losing team.
   - Click Next Round. Starting team rotates if round-robin is selected.

Keyboard shortcuts

- Bidding:
  - - to raise by 1
  - C to Challenge
- Listing:
  - Cmd+Enter / Ctrl+Enter to complete based on current count and target
  - Space to +1 when Manual Counter is enabled

Deployment (GitHub Pages)

1. Create a new repository and add these files.
2. Commit and push to the default branch (main or master).
3. In repo Settings → Pages:
   - Build and deployment: Deploy from a branch
   - Branch: select your default branch and root (/)
4. Access your site at: https://<your-username>.github.io/<repo-name>

Customization ideas

- Add/edit your own Topic Bank entries (convert the TOPIC_BANK constant in app.js to load from a JSON file or Local Storage).
- Per-team custom timers
- Multi-device mode (host + spectator)
- Sound effects and animations
- Export detailed round history

Tech

- Zero-dependency, plain HTML/CSS/JS
- Works offline, data stored in browser localStorage

Notes

- Duplicate checking is case-insensitive and whitespace-trimmed.
- You can edit team scores manually on the scoreboard if needed.
- Importing a saved game will overwrite current in-memory state.

License

- MIT (or your choice)
