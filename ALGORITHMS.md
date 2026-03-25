# Chess Puzzle Game - Algorithms Documentation

## Overview

This document describes the three core algorithms used in the minimum-steps-to-checkmate puzzle game:
1. **Forced-Mate Solver** (Iterative Deepening with Memoization)
2. **Minimax with Alpha-Beta Pruning** (AI Defense)
3. **Position Evaluation** (Material + Check Bonus)

---

## 1. Forced-Mate Solver: Iterative Deepening DFS

**Location:** `engine/forced-mate.js`  
**Purpose:** Verify that a generated puzzle position has a forced checkmate in exactly N moves

### Problem
Given a chess position, determine the minimum number of moves required for the attacker to force checkmate, assuming the defender plays optimally.

### Algorithm: Iterative Deepening with Memoization

```
findExactMateDistance(chess, maxMoves, attackerColor, options):
  for depth = 1 to maxMoves:
    memo = new FEN-based cache
    result = verifyForcedMate(chess, depth*2, attackerColor, memo, deadline)
    if result.ok:
      return { solved: true, mateIn: depth, ... }
  return { solved: false, ... }
```

### Key Features

1. **Iterative Deepening**: Tries mate-in-1, then mate-in-2, etc. until a solution is found
   - Advantage: Finds shortest mate first
   - Disadvantage: Re-explores nodes, but memoization + small max depth (6) makes it acceptable

2. **OR/AND Node Logic** (Minimax-style):
   - **Attacker's turn (OR node)**: Must find at least ONE move that leads to forced mate
   - **Defender's turn (AND node)**: ALL possible moves must still lead to checkmate
   
   ```javascript
   if (turn === attackerColor)  // OR node
     return any move leads to forced mate
   else                          // AND node
     return all moves lead to forced mate
   ```

3. **Memoization (Transposition Table)**:
   ```javascript
   key = FEN_position + remaining_plies + attacker_color
   memo[key] = result
   ```
   - Eliminates recomputation of same position at same depth
   - FEN includes piece placement, whose turn, castling rights, en passant
   - Critical for performance: reduces search space dramatically

4. **Timeout Support**:
   ```javascript
   deadlineTs = now + 90ms
   if (now > deadline) return { timedOut: true }
   ```
   - Prevents UI blocking during puzzle generation
   - If solver doesn't finish in 90ms, position is skipped

### Time Complexity
- Without memoization: O(b^d) where b = branching factor (~35), d = depth
- With memoization: O(d × s) where s = unique positions (highly compressed by memo)
- Typical: <100ms per position with 90ms timeout

### Example: Mate in 2
```
Position: White King on e1, Rook on a1; Black King on e8, no pieces
Turn: White to move

1. findExactMateDistance(pos, 2, 'w')
   1.1. Try depth=1: Can't mate in 1 move
   1.2. Try depth=2:
        - White Ra8+  (check, OR node)
          - Black Kd7: Can mate with Rd8# (AND node satisfied)
          - Black Kf7: Can mate with Rf8# (AND node satisfied)
        - Result found: mateIn = 2
   
   Return { solved: true, mateIn: 2, pv: ['Ra8', 'Kd7', 'Rd8'] }
```

### Statistics Returned
- `solved`: true if forced mate found
- `mateIn`: exact number of moves to forced mate
- `principalVariation`: sample line of play (e.g., ['Ra8', 'Kd7', 'Rd8'])
- `nodesExpanded`: number of positions evaluated
- `runtimeMs`: wall-clock time spent
- `timedOut`: true if 90ms limit exceeded

---

## 2. Minimax with Alpha-Beta Pruning

**Location:** `app.js` (functions: `minimax`, `bestMoveFor`, `aiDepth`)  
**Purpose:** Generate AI opponent's best-play moves during puzzle gameplay

### Problem
Given a chess position where it's the AI's turn (defending), what move minimizes the attacker's advantage?

### Algorithm: Minimax with Alpha-Beta Pruning

```
minimax(chess, depth, alpha, beta, maximizing, aiSide):
  if depth == 0 or terminal state (checkmate/draw):
    return evaluatePosition(chess, aiSide)
  
  moves = getLegalMoves(chess)
  if no moves:
    return evaluatePosition(chess, aiSide)
  
  if maximizing (attacker's turn):
    value = -∞
    for each move in moves:
      chess.move(move)
      value = max(value, minimax(..., depth-1, alpha, beta, false, aiSide))
      chess.undo()
      alpha = max(alpha, value)
      if alpha ≥ beta: break  // Beta cutoff
    return value
  
  else (defender's turn):
    value = +∞
    for each move in moves:
      chess.move(move)
      value = min(value, minimax(..., depth-1, alpha, beta, true, aiSide))
      chess.undo()
      beta = min(beta, value)
      if alpha ≥ beta: break  // Alpha cutoff
    return value
```

### Key Features

1. **Depth Limiting**:
   - Easy mode: depth = 2 (look ahead 2 half-moves)
   - Hard mode: depth = 3
   - Trade-off: Faster response vs. better play

2. **Alpha-Beta Pruning**:
   - Alpha: maximum score attacker can guarantee
   - Beta: minimum score defender can guarantee
   - When alpha ≥ beta, remaining moves are irrelevant (pruned)
   - Reduces average branching factor from ~35 to ~6 (√35)

3. **Terminal Node Evaluation**:
   ```javascript
   if (isCheckmate):
     return (attacker won) ? +999999 : -999999
   if (isDraw):
     return 0
   ```

4. **Move Selection** (`bestMoveFor`):
   - Evaluates every legal move one level deep
   - Returns move with best score
   - Used by AI to pick defender's response

### Time Complexity
- Worst case: O(b^d) where b ≈ 35, d ≈ 3 → ~42,000 nodes
- With alpha-beta: O(b^(d/2)) → ~200 nodes average (√35^3 ≈ 200)
- Typical runtime: 50-200ms (acceptable for UI responsiveness)

### Example: Easy Mode (Depth 2)
```
Position: White Queen on d4; Black King on e8; Black Rook on e7
Defender (Black) to move, difficulty = Easy (depth 2)

bestMoveFor(chess, 'b', 2):
  Black's options: Re8-e1, Re8-e2, Re8-e3, ... Kd8, Kf8, Kf7
  
  Evaluate Re1:
    After Re1, minimax(depth=1):
      White's options: Qd8+, Qe5, Qd1, ...
      Best: Qd8+ (gives check, advantage to attacker)
      Score: +50
  
  Evaluate Kf8:
    After Kf8, minimax(depth=1):
      White's options: Qf6+, Qd8+, ...
      Best: Qf6+ (check + threat)
      Score: +40
  
  ... (evaluate all moves)
  
  Return move with lowest score (e.g., Re1 might be less bad)
```

---

## 3. Position Evaluation

**Location:** `app.js` (function: `evaluatePosition`)  
**Purpose:** Assign a numeric score to a position for minimax comparison

### Evaluation Function

```javascript
score = materialScore + checkBonus

materialScore = Σ(piece_value × piece_color)
  where piece_value = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 }

checkBonus = {
  +30 if side to move is giving check,
  -30 if side to move is in check,
  0 otherwise
}
```

### Piece Values (Standard Chess)
- Pawn: 100
- Knight: 320 (≈ 3 pawns)
- Bishop: 330 (≈ 3 pawns, slightly better than knight)
- Rook: 500 (≈ 5 pawns)
- Queen: 900 (≈ 9 pawns)
- King: 20000 (prevent capture/checkmate)

### Example Evaluation

```
Position: White King e1, Queen d4
          Black King e8, Rook e7

From White's perspective:
  White material: 20000 (K) + 900 (Q) = 20900
  Black material: 20000 (K) + 500 (R) = 20500
  Net score: +400 (White is up a Queen for Rook, +400 material advantage)
  
  If Black giving check: score += 30 → +430
```

### Positive vs. Negative
- **Positive score**: Favorable for attacker (White)
- **Negative score**: Favorable for defender (Black)
- Minimax uses this to rank moves at leaf nodes

---

## 4. Puzzle Generation (Async Chunked)

**Location:** `app.js` (function: `createCustomPuzzleAsync`)  
**Purpose:** Generate random positions with exact mate distance, non-blocking

### Problem
Puzzle generation is expensive (forced-mate solver on many positions). UI blocking makes game unplayable. Need to parallelize work.

### Solution: Async Generator with Timeouts

```javascript
createCustomPuzzleAsync(requestToken):
  selected = getUserSelectedPieces()  // e.g., [pawn, queen]
  limits = getDifficultyLimits()       // e.g., { minMate: 1, maxMate: 3 }
  
  maxAttempts = 240
  chunkSize = 6  // Try 6 positions per setTimeout batch
  
  function tryChunk():
    for i = 1 to chunkSize:
      if (attempts >= maxAttempts):
        return null  // Failed to find puzzle
      
      position = randomPosition(selected)  // Place pieces randomly
      
      if validatePosition(position):  // No illegal positions
        solved = MateSolver.findExactMateDistance(position, limits.maxMate)
        
        if solved.mateIn in [limits.minMate, limits.maxMate]:
          return position  // Found valid puzzle!
    
    setTimeout(tryChunk, 0)  // Schedule next chunk
```

### Key Features

1. **Chunking**: 6 positions per setTimeout call
   - Allows browser to respond to UI events between chunks
   - Typical generation: 1-3 seconds (non-blocking)

2. **Validation**:
   - Kings placed at non-adjacent squares
   - Pawns avoid ranks 1 and 8 (invalid)
   - At least one legal move available
   - No starting checkmate/draw

3. **Piece Limits**:
   - Attacker pieces max: 3 (for speed; more pieces = exponential complexity)
   - Defender: Always exactly 1 king

4. **Cancellation Tokens**:
   - `requestToken`: Unique ID for each puzzle request
   - If user clicks "New Puzzle" during generation, old tokens are ignored
   - Prevents stale results from overwriting current state

### Performance

| Pieces | Attempts | Avg Time | Success Rate |
|--------|----------|----------|--------------|
| 1 (K + Q) | 10-20 | 0.5-1.0s | ~95% |
| 2 (K + Q + R) | 40-60 | 1-2s | ~90% |
| 3 (K + Q + R + B) | 100+ | 2-3s | ~85% |

---

## Algorithm Complexity Summary

| Algorithm | Time | Space | Used For |
|-----------|------|-------|----------|
| Forced-Mate (ID + Memo) | O(d × s) | O(s) | Puzzle verification |
| Minimax (Alpha-Beta) | O(b^(d/2)) | O(d) | AI defense moves |
| Position Evaluation | O(n) | O(1) | Scoring leaf nodes |
| Async Generator | O(a × b^d) | O(c) | Puzzle generation |

Where:
- d = search depth
- s = unique positions (memoization)
- b = branching factor (~35 chess)
- a = generation attempts (240 max)
- c = request queue size

---

## Tuning & Optimization

### Forced-Mate Solver
- Increase `timeLimitMs` (default 90ms) for more thorough search (slower puzzle generation)
- Decrease for faster generation but some timeouts

### Minimax AI
- Increase depth for harder AI (currently: 2 for easy, 3 for hard)
- Decrease for faster moves but weaker play

### Puzzle Generation
- Increase `chunkSize` (default 6) for batching more work per setTimeout (but UI less responsive)
- Limit piece count further (max 2) for faster generation
- Adjust `maxAttempts` (240 default) for timeout vs. thoroughness

---

## Testing / Validation

To verify algorithms work correctly:

1. **Forced-Mate**: Generate a known mate-in-2 position, confirm solver returns `mateIn: 2`
2. **Minimax**: Place a position with obvious best move (e.g., mate threat), confirm AI blocks it
3. **Evaluation**: Set defenders in difficult positions, confirm negative scores
4. **Generation**: Generate 10 puzzles, verify each has exact stated mate distance by hand play

