# Beat the Clock (Multi-Deck)

Now supports multiple prompt decks and random selection.

## What changed

- Deck selector and Random Deck button in the header
- Decks are JSON files under `decks/`
- A manifest file `decks/decks.json` lists available decks
- Click “Load Deck” to load the selected deck, or “Random Deck” to pick one at random

## How to use

1. Open `index.html` in a modern browser.
   - For local decks to load via fetch, serve this folder with a static server:
     ```
     npx serve .
     ```
     Then open the served URL (e.g., http://localhost:3000).
2. Choose a deck from the dropdown or click “Random Deck”.
3. Press “Start Game” (or Space) to begin.
4. Enter to mark Correct/Next, Tab to switch turn, S to skip prompt, R to reset.

## Add your own decks

1. Create a new JSON file in `decks/`, e.g., `decks/countries.json`.
   - Format: array of items where each item is either:
     ```json
     { "type": "text", "text": "Capital of Australia?", "answer": "Canberra" }
     ```
     or
     ```json
     { "type": "image", "src": "assets/obscured-logo.png", "answer": "Acme Corp" }
     ```
2. Add an entry to `decks/decks.json`:
   ```json
   {
     "id": "countries",
     "name": "Countries & Capitals",
     "file": "decks/countries.json"
   }
   ```
3. Reload the page. The new deck will appear in the selector.

## Tips

- To keep things fast and offline, host images in your project (e.g., `assets/`) and reference them with relative paths. Remember to serve via http.
- Click “Load Deck” to start a new game with the selected deck; press R to reset timers if needed.

Keyboard shortcuts:

- Enter: Correct/Next
- Space: Pause/Resume
- Tab: Switch Turn
- S: Skip Prompt
- R: Reset
- 1-9: Jump to a team
