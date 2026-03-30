# Minimum Steps to Checkmate (5x5 Variant)

Interactive chess puzzle game where you play the attacking side and try to force checkmate in the fewest moves.

This project uses a 5x5 board viewport with legal-move filtering, exact mate validation, and an AI defender.

## Live Idea

- Generate random custom puzzles based on selected attacker pieces.
- Guarantee that each accepted puzzle has a forced mate.
- Let the defender reply with best practical resistance.

## Current Features

- 5x5 variant board (cropped from standard board rendering)
- Custom attacker piece selection using + buttons
- King always included by default
- Puzzle generation with exact mate verification
- Hint system based on forced-mate principal variation
- Defender AI powered by minimax with alpha-beta pruning
- Puzzle reset and instant new puzzle generation
- Responsive layout for desktop and mobile screens

## Rules and Behavior

- You always play the attacking side.
- Only moves that stay on the 5x5 board are allowed.
- The puzzle is successful only when you deliver checkmate.
- If no valid forced-mate puzzle is found for your selected pieces, the game shows a suggestion message.

## Tech Stack

- HTML, CSS, Vanilla JavaScript
- chess.js for chess rules and move legality
- chessboard.js for board UI
- Custom forced-mate solver in `engine/forced-mate.js`

## Core Algorithms

### 1. Forced-mate verification

- File: `engine/forced-mate.js`
- Iterative deepening search checks if a forced mate exists within target depth.
- Uses memoization on FEN-derived keys.
- Supports time-limited solving during generation and hints.

### 2. Defender move selection

- File: `app.js`
- Minimax + alpha-beta pruning for defender responses.
- Material-based evaluation with check/checkmate terminal handling.

### 3. Async puzzle generation

- File: `app.js`
- Chunked generation loop (`setTimeout`) keeps UI responsive.
- Enforces piece placement constraints and king adjacency rules.
- Accepts only positions that solver confirms as forced mate.

## Project Structure

- `index.html`: main UI markup
- `styles.css`: visual design and responsive layout
- `app.js`: game flow, generation, hints, AI moves
- `engine/forced-mate.js`: exact mate solver
- `vendor/`: third-party chess and board libraries

## Run Locally

1. Clone the repository.
2. Open the project folder in VS Code.
3. Start a static server (for example, VS Code Live Server).
4. Open `index.html` in the browser.

## Deploy on GitHub Pages

1. Push all project files to your GitHub repository root (or configured docs folder).
2. In repository settings, enable GitHub Pages and select the correct branch/folder.
3. Wait for deployment to complete, then open the generated Pages URL.

If styling looks stale after deployment, hard-refresh the page to clear cached CSS/JS.