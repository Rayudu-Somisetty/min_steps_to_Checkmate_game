const START_FEN = "start";
const INITIAL_CLOCK_SECONDS = 5 * 60;

let board;
let game;
let activePuzzle = null;
let currentDifficulty = "easy";
let attackerColor = "w";
let defenderColor = "b";
let attackerMoveCount = 0;
let optimalMoves = null;
let elapsedSeconds = 0;
let elapsedTimerId = null;
let clockIntervalId = null;
let clockSeconds = { w: INITIAL_CLOCK_SECONDS, b: INITIAL_CLOCK_SECONDS };
let puzzleGenerationToken = 0;
let isGeneratingPuzzle = false;

const puzzleTitleEl = document.getElementById("puzzleTitle");
const difficultyLabelEl = document.getElementById("difficultyLabel");
const targetMateEl = document.getElementById("targetMate");
const userMovesEl = document.getElementById("userMoves");
const timerEl = document.getElementById("timer");
const whiteClockEl = document.getElementById("whiteClock");
const blackClockEl = document.getElementById("blackClock");
const messageEl = document.getElementById("message");
const resultEl = document.getElementById("result");
const difficultySelectEl = document.getElementById("difficultySelect");
const customWrapEl = document.getElementById("customWrap");
const customPiecesPanelEl = document.getElementById("customPiecesPanel");
const customPieceCheckboxes = Array.from(document.querySelectorAll("#customPiecesPanel input[data-piece]"));
const newPuzzleBtnEl = document.getElementById("newPuzzleBtn");
const hintBtnEl = document.getElementById("hintBtn");
const resetBtnEl = document.getElementById("resetBtn");

function setMessage(text, kind = "info") {
  messageEl.className = `message ${kind}`;
  messageEl.textContent = text;
}

function clearResult() {
  resultEl.textContent = "";
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateClockUI() {
  whiteClockEl.textContent = formatTime(clockSeconds.w);
  blackClockEl.textContent = formatTime(clockSeconds.b);
}

function isCheckmate(chess) {
  if (typeof chess.isCheckmate === "function") return chess.isCheckmate();
  if (typeof chess.in_checkmate === "function") return chess.in_checkmate();
  return false;
}

function isDraw(chess) {
  if (typeof chess.isDraw === "function") return chess.isDraw();
  if (typeof chess.in_draw === "function") return chess.in_draw();
  return false;
}

function isCheck(chess) {
  if (typeof chess.isCheck === "function") return chess.isCheck();
  if (typeof chess.in_check === "function") return chess.in_check();
  return false;
}

function stopAllTimers() {
  clearInterval(elapsedTimerId);
  clearInterval(clockIntervalId);
}

function startElapsedTimer() {
  clearInterval(elapsedTimerId);
  elapsedSeconds = 0;
  timerEl.textContent = formatTime(elapsedSeconds);
  elapsedTimerId = setInterval(() => {
    elapsedSeconds += 1;
    timerEl.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function startClocks() {
  clearInterval(clockIntervalId);
  clockIntervalId = setInterval(() => {
    if (!game || isCheckmate(game) || isDraw(game)) return;

    const side = game.turn();
    clockSeconds[side] -= 1;
    updateClockUI();

    if (clockSeconds[side] <= 0) {
      clearInterval(clockIntervalId);
      setMessage(`${side === "w" ? "White" : "Black"} lost on time.`, "bad");
      resultEl.innerHTML = `Time's up.`;
    }
  }, 1000);
}

function updateModeUI() {
  newPuzzleBtnEl.textContent = "New Puzzle";
  hintBtnEl.disabled = false;
  customWrapEl.style.display = "block";
  customPiecesPanelEl.hidden = false;
}

function updateStatusFields() {
  puzzleTitleEl.textContent = activePuzzle ? activePuzzle.title : "-";
  difficultyLabelEl.textContent = currentDifficulty === "hard" ? "Hard" : "Easy";
  targetMateEl.textContent = activePuzzle
    ? (activePuzzle.mateIn ? `Mate in ${activePuzzle.mateIn}` : "-")
    : "-";
  userMovesEl.textContent = `${attackerMoveCount}`;
}

function selectedCustomPieces() {
  return customPieceCheckboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.getAttribute("data-piece"));
}

function randomSquare(usedSquares, avoidPawnEdges = false) {
  const files = "abcdefgh";
  for (let tries = 0; tries < 150; tries += 1) {
    const file = files[Math.floor(Math.random() * files.length)];
    const rank = 1 + Math.floor(Math.random() * 8);
    if (avoidPawnEdges && (rank === 1 || rank === 8)) continue;
    const square = `${file}${rank}`;
    if (!usedSquares.has(square)) return square;
  }
  return null;
}

function squareToCoords(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return { file, rank };
}

function areAdjacent(squareA, squareB) {
  const a = squareToCoords(squareA);
  const b = squareToCoords(squareB);
  return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank)) <= 1;
}

function setPuzzleGenerationUI(disabled) {
  isGeneratingPuzzle = disabled;
  newPuzzleBtnEl.disabled = disabled;
  resetBtnEl.disabled = disabled;
  hintBtnEl.disabled = disabled;
  difficultySelectEl.disabled = disabled;
  for (const checkbox of customPieceCheckboxes) {
    checkbox.disabled = disabled || checkbox.getAttribute("data-piece") === "k";
  }
}

function createCustomPuzzleAsync(requestToken) {
  return new Promise((resolve) => {
    const selected = selectedCustomPieces();
    const nonKingPieces = selected.filter((piece) => piece !== "k");

    if (nonKingPieces.length === 0) {
      setMessage("Select at least one attacking piece besides king.", "warn");
      resolve(null);
      return;
    }

    if (nonKingPieces.length > 3) {
      setMessage("Choose up to 3 attacking pieces for faster puzzle generation.", "warn");
      resolve(null);
      return;
    }

    if (typeof MateSolver === "undefined" || typeof MateSolver.findExactMateDistance !== "function") {
      setMessage("Mate solver is not available. Reload the page and try again.", "bad");
      resolve(null);
      return;
    }

    const limits = currentDifficulty === "hard"
      ? { minMate: 4, maxMate: 6 }
      : { minMate: 1, maxMate: 3 };

    const maxAttempts = 240;
    const chunkSize = 6;
    let attempt = 0;

    function tryChunk() {
      if (requestToken !== puzzleGenerationToken) {
        resolve(null);
        return;
      }

      for (let step = 0; step < chunkSize && attempt < maxAttempts; step += 1) {
        attempt += 1;

        const testGame = new Chess();
        testGame.clear();

        const occupied = new Set();
        const blackKingSquare = randomSquare(occupied, false);
        if (!blackKingSquare) continue;
        testGame.put({ type: "k", color: "b" }, blackKingSquare);
        occupied.add(blackKingSquare);

        let whiteKingSquare = null;
        for (let kingTry = 0; kingTry < 80; kingTry += 1) {
          const candidate = randomSquare(occupied, false);
          if (!candidate || areAdjacent(candidate, blackKingSquare)) continue;
          whiteKingSquare = candidate;
          break;
        }
        if (!whiteKingSquare) continue;

        testGame.put({ type: "k", color: "w" }, whiteKingSquare);
        occupied.add(whiteKingSquare);

        let placedAll = true;
        for (const piece of nonKingPieces) {
          const square = randomSquare(occupied, piece === "p");
          if (!square) {
            placedAll = false;
            break;
          }
          testGame.put({ type: piece, color: "w" }, square);
          occupied.add(square);
        }
        if (!placedAll) continue;

        const legalMoves = testGame.moves({ verbose: true });
        if (legalMoves.length === 0) continue;
        if (isCheckmate(testGame) || isDraw(testGame)) continue;

        const solved = MateSolver.findExactMateDistance(testGame, limits.maxMate, "w", { timeLimitMs: 90 });
        if (solved.timedOut) continue;
        if (!solved.solved || solved.mateIn < limits.minMate || solved.mateIn > limits.maxMate) continue;

        resolve({
          id: `custom-${Date.now()}`,
          title: "Custom Piece Puzzle",
          fen: testGame.fen(),
          mateIn: solved.mateIn,
          difficulty: currentDifficulty
        });
        return;
      }

      if (attempt >= maxAttempts) {
        resolve(null);
        return;
      }

      setTimeout(tryChunk, 0);
    }

    setTimeout(tryChunk, 0);
  });
}

function pieceValue(type) {
  if (type === "p") return 100;
  if (type === "n") return 320;
  if (type === "b") return 330;
  if (type === "r") return 500;
  if (type === "q") return 900;
  if (type === "k") return 20000;
  return 0;
}

function evaluatePosition(chess, color) {
  if (isCheckmate(chess)) {
    return chess.turn() === color ? -999999 : 999999;
  }
  if (isDraw(chess)) return 0;

  const boardState = chess.board();
  let score = 0;
  for (const rank of boardState) {
    for (const piece of rank) {
      if (!piece) continue;
      const value = pieceValue(piece.type);
      score += piece.color === color ? value : -value;
    }
  }

  if (isCheck(chess)) {
    score += chess.turn() === color ? -30 : 30;
  }

  return score;
}

function minimax(chess, depth, alpha, beta, maximizing, aiSide) {
  if (depth === 0 || isCheckmate(chess) || isDraw(chess)) {
    return evaluatePosition(chess, aiSide);
  }

  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return evaluatePosition(chess, aiSide);
  }

  if (maximizing) {
    let value = -Infinity;
    for (const move of moves) {
      chess.move(move);
      value = Math.max(value, minimax(chess, depth - 1, alpha, beta, false, aiSide));
      chess.undo();
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    chess.move(move);
    value = Math.min(value, minimax(chess, depth - 1, alpha, beta, true, aiSide));
    chess.undo();
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function aiDepth() {
  return currentDifficulty === "hard" ? 3 : 2;
}

function bestMoveFor(chess, side, depth) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    chess.move(move);
    const score = minimax(chess, depth - 1, -Infinity, Infinity, false, side);
    chess.undo();

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

function renderResult(summary, efficiencyText = "") {
  resultEl.innerHTML = efficiencyText ? `${summary}<br>${efficiencyText}` : summary;
}

function finalizeGameIfNeeded() {
  if (isCheckmate(game)) {
    stopAllTimers();

    const success = game.turn() === defenderColor;
    if (success) {
      setMessage("Checkmate found.", "good");
      if (optimalMoves) {
        const efficiency = Math.min((optimalMoves / Math.max(attackerMoveCount, 1)) * 100, 100).toFixed(1);
        renderResult(`Solved in ${attackerMoveCount} move(s).`, `Optimal: ${optimalMoves}. Efficiency: ${efficiency}%.`);
      } else {
        renderResult(`Solved in ${attackerMoveCount} move(s).`);
      }
    } else {
      setMessage("Your king was checkmated.", "bad");
      renderResult("Puzzle failed.");
    }
    return true;
  }

  if (isDraw(game)) {
    stopAllTimers();
    setMessage("Draw reached.", "warn");
    renderResult("Puzzle failed by draw.");
    return true;
  }

  return false;
}

function makeAIMove() {
  if (!game || finalizeGameIfNeeded()) return;

  const side = game.turn();
  if (side !== defenderColor) return;

  setTimeout(() => {
    if (finalizeGameIfNeeded()) return;

    const move = bestMoveFor(game, side, aiDepth());
    if (!move) {
      finalizeGameIfNeeded();
      return;
    }

    game.move(move);
    board.position(game.fen(), false);
    setMessage(`Defender plays ${move.san}.`, "info");
    updateStatusFields();
    finalizeGameIfNeeded();
  }, 180);
}

function applyPuzzle(puzzle) {
  activePuzzle = puzzle;
  game = new Chess(puzzle.fen);
  attackerColor = game.turn();
  defenderColor = attackerColor === "w" ? "b" : "w";
  attackerMoveCount = 0;
  optimalMoves = puzzle.mateIn;
  clearResult();

  clockSeconds = { w: INITIAL_CLOCK_SECONDS, b: INITIAL_CLOCK_SECONDS };
  updateClockUI();
  startElapsedTimer();
  startClocks();

  updateStatusFields();
  setMessage("Puzzle loaded. Find checkmate while AI defends.", "info");

  if (!board) {
    board = Chessboard("board", {
      draggable: true,
      position: game.fen(),
      onDragStart,
      onDrop,
      onSnapEnd,
      pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png"
    });
  } else {
    board.position(game.fen());
  }
}

function loadPuzzle(puzzle = null) {
  const requestToken = ++puzzleGenerationToken;

  if (puzzle) {
    setPuzzleGenerationUI(false);
    applyPuzzle(puzzle);
    return;
  }

  setPuzzleGenerationUI(true);
  setMessage("Generating exact puzzle...", "info");

  createCustomPuzzleAsync(requestToken).then((generatedPuzzle) => {
    if (requestToken !== puzzleGenerationToken) return;

    setPuzzleGenerationUI(false);
    if (!generatedPuzzle) {
      setMessage("Could not create custom puzzle. Try fewer pieces or try again.", "bad");
      return;
    }

    applyPuzzle(generatedPuzzle);
  });
}

function resetCurrent() {
  if (!activePuzzle) {
    setMessage("No active puzzle to reset.", "warn");
    return;
  }
  loadPuzzle(activePuzzle);
}

function onDragStart(_source, piece) {
  if (isGeneratingPuzzle || !game || isCheckmate(game) || isDraw(game)) return false;

  if (game.turn() !== attackerColor) return false;
  if (piece[0] !== attackerColor) return false;
  return true;
}

function onDrop(source, target) {
  if (!game) return "snapback";

  const move = game.move({ from: source, to: target, promotion: "q" });
  if (move === null) return "snapback";

  attackerMoveCount += 1;

  board.position(game.fen(), false);
  updateStatusFields();

  if (finalizeGameIfNeeded()) return undefined;

  makeAIMove();
  return undefined;
}

function onSnapEnd() {
  if (board && game) board.position(game.fen());
}

function showHint() {
  if (!game || game.turn() !== attackerColor) {
    setMessage("Hint is available on your turn.", "warn");
    return;
  }

  const move = bestMoveFor(game, attackerColor, aiDepth());
  if (!move) {
    setMessage("No hint available from this position.", "warn");
    return;
  }

  setMessage(`Hint: consider ${move.san}.`, "info");
}

function startAccordingToMode() {
  stopAllTimers();
  puzzleGenerationToken += 1;
  setPuzzleGenerationUI(false);
  updateModeUI();
  clearResult();
  loadPuzzle();
}

newPuzzleBtnEl.addEventListener("click", () => {
  loadPuzzle();
});

hintBtnEl.addEventListener("click", showHint);
resetBtnEl.addEventListener("click", resetCurrent);

difficultySelectEl.addEventListener("change", (event) => {
  currentDifficulty = event.target.value === "hard" ? "hard" : "easy";
  startAccordingToMode();
});

for (const checkbox of customPieceCheckboxes) {
  checkbox.addEventListener("change", () => {
    loadPuzzle();
  });
}

window.addEventListener("resize", () => {
  if (board) board.resize();
});

if (typeof Chess === "undefined" || typeof Chessboard === "undefined") {
  setMessage("Failed to load chess libraries. Check local vendor files.", "bad");
} else {
  updateModeUI();
  startAccordingToMode();
}
