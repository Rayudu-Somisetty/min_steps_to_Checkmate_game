# Minimum Steps to Checkmate Chess Puzzle Game

A chess puzzle game that generates custom checkmate puzzles with AI opponent. Features advanced algorithms for exact mate verification and optimal defense.

## Features

- **Puzzle Mode**: Solve generated checkmate puzzles with custom piece selection
- **Difficulty Levels**: 
  - Easy: Checkmate in 1-3 moves
  - Hard: Checkmate in 4-6 moves
- **Custom Piece Selection**: Choose which attacking pieces (pawns, rooks, knights, bishops, queens) to include
- **AI Defense**: Opponent plays optimal defense using minimax algorithm
- **Exact Mate Verification**: Puzzles are validated to guarantee forced checkmate
- **Move Efficiency**: Track how your solution compares to optimal
- **Timers**: Elapsed time and chess clocks for both sides
- **Hint System**: Suggests best attacking moves
- **Responsive Design**: Works on desktop and tablet

## Algorithms Implemented

### 1. Forced-Mate Solver (Iterative Deepening DFS)
**File**: `engine/forced-mate.js`
- **Purpose**: Verifies exact mate distance during puzzle generation
- **Method**: 
  - Tries mate-in-1, then mate-in-2, incrementally up to mate-in-6
  - Uses minimax-style OR/AND node logic (attacker seeks winning move, defender plays best defense)
  - Memoization with FEN-based transposition table to avoid recomputing positions
  - Timeout support (90ms per puzzle) prevents UI blocking
- **Returns**: Exact mate depth, principal variation, nodes expanded, runtime

### 2. Minimax with Alpha-Beta Pruning
**File**: `app.js` (functions: `minimax`, `bestMoveFor`)
- **Purpose**: Generate AI defender's best-response moves during puzzle play
- **Search Depth**: 
  - Easy mode: 2 levels deep
  - Hard mode: 3 levels deep
- **Evaluation Function**: 
  - Material count (Pawn=100, Knight=320, Bishop=330, Rook=500, Queen=900, King=20000)
  - Check status bonus (+30 for checking side, -30 for checked side)
  - Checkmate/Draw terminal evaluation
- **Pruning**: Alpha-beta pruning eliminates futile branches

### 3. Position Evaluation
**File**: `app.js` (function: `evaluatePosition`)
- Counts material for both sides
- Applies check bonus based on game state
- Returns quantified score for minimax comparison

### 4. Puzzle Generation (Async Chunked)
**File**: `app.js` (function: `createCustomPuzzleAsync`)
- Non-blocking position generation via `setTimeout` chunking
- Random square placement with conflict/edge avoidance
- King adjacency validation
- Solver verification before accepting puzzle
- Limit: 3 attacking pieces max (computational efficiency)
- Timeout cancellation support via request tokens

## How to Play

1. Select difficulty level (Easy or Hard)
2. Check the piece types you want in puzzles
3. Click "New Puzzle" to generate a custom puzzle
4. Drag pieces to make moves
5. Try to checkmate the defending AI in minimum moves
6. Use "Hint" for suggested moves or "Reset" to replay the same puzzle

## File Structure

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 88 | Page layout, controls, board container |
| `app.js` | 748 | Puzzle flow, UI, minimax AI, async generation |
| `engine/forced-mate.js` | 170 | Exact mate solver with iterative deepening |
| `styles.css` | 290 | Responsive design, gradients, animations |
| `vendor/chess.min.js` | - | Chess rules engine & move validation |
| `vendor/chessboard-1.0.0.min.js` | - | Interactive board UI |
| `vendor/chessboard-1.0.0.min.css` | - | Board styling |
| `vendor/jquery.min.js` | - | Required by chessboard.js |

## Technical Details

**Puzzle Generation Flow:**
1. User selects pieces and clicks "New Puzzle"
2. Async generator creates random positions with selected pieces
3. Each position checked with forced-mate solver (90ms timeout)
4. Only positions with exact mate in [1-3] or [4-6] accepted
5. Position becomes active puzzle

**Game Play Flow:**
1. Position loaded with attacker (white) to move
2. Player makes attacking moves (can drag pieces)
3. After each attacker move, AI defender responds with minimax best move
4. Game ends when checkmate or draw detected
5. Efficiency calculated: (optimal_moves / actual_moves) * 100%

**Performance:**
- Puzzle generation: ~1-3 seconds per puzzle
- AI move response: <200ms (minimax depth 2-3)
- No UI blocking due to async chunking