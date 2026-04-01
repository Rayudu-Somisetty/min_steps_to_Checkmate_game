const START_FEN = "start";
const INITIAL_CLOCK_SECONDS = 5 * 60;
const MAX_PUZZLE_SCORE = 1000;
const EXTRA_MOVE_PENALTY = 100;
const HINT_PENALTY = 100;
const MINI_BOARD_FILES = "abcde";
const MINI_BOARD_MIN_RANK = 1;
const MINI_BOARD_MAX_RANK = 5;
const MINI_BOARD_SQUARES = (() => {
  const squares = [];
  for (const file of MINI_BOARD_FILES) {
    for (let rank = MINI_BOARD_MIN_RANK; rank <= MINI_BOARD_MAX_RANK; rank += 1) {
      squares.push(`${file}${rank}`);
    }
  }
  return squares;
})();

let board;
let game;
let activePuzzle = null;
let currentDifficulty = "easy";
let attackerColor = "w";
let defenderColor = "b";
let attackerMoveCount = 0;
let optimalMoves = null;
let hintsUsed = 0;
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
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const whiteClockEl = document.getElementById("whiteClock");
const blackClockEl = document.getElementById("blackClock");
const messageEl = document.getElementById("message");
const resultEl = document.getElementById("result");
const difficultySelectEl = document.getElementById("difficultySelect");
const customWrapEl = document.getElementById("customWrap");
const customPiecesPanelEl = document.getElementById("customPiecesPanel");
const customPieceCheckboxes = Array.from(document.querySelectorAll("#customPiecesPanel .piece-btn"));

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
  if (whiteClockEl) whiteClockEl.textContent = formatTime(clockSeconds.w);
  if (blackClockEl) blackClockEl.textContent = formatTime(clockSeconds.b);
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

function isColorInCheck(chess, color) {
  // Create a temporary game state with the specified color's turn
  const tempGame = new Chess(chess.fen());
  const fenParts = tempGame.fen().split(' ');
  fenParts[1] = color;
  tempGame.load(fenParts.join(' '));
  return isCheck(tempGame);
}

function stopAllTimers() {
  clearInterval(elapsedTimerId);
  clearInterval(clockIntervalId);
}

function startElapsedTimer() {
  clearInterval(elapsedTimerId);
  elapsedSeconds = 0;
  if (timerEl) timerEl.textContent = formatTime(elapsedSeconds);
  elapsedTimerId = setInterval(() => {
    elapsedSeconds += 1;
    if (timerEl) timerEl.textContent = formatTime(elapsedSeconds);
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
      if (scoreEl) scoreEl.textContent = "0";
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
  if (puzzleTitleEl) puzzleTitleEl.textContent = activePuzzle ? activePuzzle.title : "-";
  if (difficultyLabelEl) difficultyLabelEl.textContent = currentDifficulty === "hard" ? "Hard" : "Easy";
  if (targetMateEl) targetMateEl.textContent = activePuzzle
    ? (activePuzzle.mateIn ? `Mate in ${activePuzzle.mateIn}` : "-")
    : "-";
  if (userMovesEl) userMovesEl.textContent = `${attackerMoveCount}`;
  if (scoreEl) scoreEl.textContent = `${calculateCurrentScore()}`;
}

function calculateCurrentScore() {
  const safeOptimal = Math.max(Number(optimalMoves) || 0, 1);
  const extraMoves = Math.max(attackerMoveCount - safeOptimal, 0);
  const penalties = (extraMoves * EXTRA_MOVE_PENALTY) + (hintsUsed * HINT_PENALTY);
  return Math.max(MAX_PUZZLE_SCORE - penalties, 0);
}

function selectedCustomPieces() {
  return customPieceCheckboxes
    .filter((btn) => btn.classList.contains("selected"))
    .map((btn) => btn.getAttribute("data-piece"));
}



function squareRank(square) {
  return Number(square.slice(1));
}

function squareFileIndex(square) {
  return square.charCodeAt(0) - 97;
}

function coordsToSquare(fileIndex, rank) {
  return `${String.fromCharCode(97 + fileIndex)}${rank}`;
}

function isMiniCoords(fileIndex, rank) {
  return fileIndex >= 0
    && fileIndex < MINI_BOARD_FILES.length
    && rank >= MINI_BOARD_MIN_RANK
    && rank <= MINI_BOARD_MAX_RANK;
}

function isSquareOnMiniBoard(square) {
  if (typeof square !== "string" || square.length < 2) return false;
  const file = square[0];
  const rank = squareRank(square);
  return MINI_BOARD_FILES.includes(file)
    && Number.isInteger(rank)
    && rank >= MINI_BOARD_MIN_RANK
    && rank <= MINI_BOARD_MAX_RANK;
}

function isSquareOnFullBoard(square) {
  if (typeof square !== "string" || square.length < 2) return false;
  const file = square[0];
  const rank = squareRank(square);
  return 'abcdefgh'.includes(file)
    && Number.isInteger(rank)
    && rank >= 1
    && rank <= 8;
}

function moveOnMiniBoard(move) {
  return isSquareOnMiniBoard(move.from) && isSquareOnMiniBoard(move.to);
}

function legalMovesWithinMiniBoard(chess) {
  return chess.moves({ verbose: true }).filter(moveOnMiniBoard);
}

function isMiniSquareAttackedBy(chess, targetSquare, attackerColor) {
  const targetFile = squareFileIndex(targetSquare);
  const targetRank = squareRank(targetSquare);

  for (const from of MINI_BOARD_SQUARES) {
    const piece = chess.get(from);
    if (!piece || piece.color !== attackerColor) continue;

    const fromFile = squareFileIndex(from);
    const fromRank = squareRank(from);
    const fileDiff = targetFile - fromFile;
    const rankDiff = targetRank - fromRank;

    if (piece.type === "p") {
      const dir = piece.color === "w" ? 1 : -1;
      if (rankDiff === dir && Math.abs(fileDiff) === 1) return true;
      continue;
    }

    if (piece.type === "n") {
      const isKnightHop = (Math.abs(fileDiff) === 1 && Math.abs(rankDiff) === 2)
        || (Math.abs(fileDiff) === 2 && Math.abs(rankDiff) === 1);
      if (isKnightHop) return true;
      continue;
    }

    if (piece.type === "k") {
      if (Math.max(Math.abs(fileDiff), Math.abs(rankDiff)) === 1) return true;
      continue;
    }

    const canSlideDiag = piece.type === "b" || piece.type === "q";
    const canSlideStraight = piece.type === "r" || piece.type === "q";

    const diagonalMatch = Math.abs(fileDiff) === Math.abs(rankDiff) && fileDiff !== 0;
    const straightMatch = (fileDiff === 0 && rankDiff !== 0) || (rankDiff === 0 && fileDiff !== 0);

    if ((diagonalMatch && canSlideDiag) || (straightMatch && canSlideStraight)) {
      const stepFile = fileDiff === 0 ? 0 : (fileDiff > 0 ? 1 : -1);
      const stepRank = rankDiff === 0 ? 0 : (rankDiff > 0 ? 1 : -1);

      let currentFile = fromFile + stepFile;
      let currentRank = fromRank + stepRank;

      while (isMiniCoords(currentFile, currentRank)) {
        const currentSquare = coordsToSquare(currentFile, currentRank);
        if (currentSquare === targetSquare) return true;
        if (chess.get(currentSquare)) break;
        currentFile += stepFile;
        currentRank += stepRank;
      }
    }
  }

  return false;
}

function findMiniBoardKingSquare(chess, color) {
  for (const square of MINI_BOARD_SQUARES) {
    const piece = chess.get(square);
    if (piece && piece.type === "k" && piece.color === color) {
      return square;
    }
  }
  return null;
}

function isMiniBoardInCheck(chess, color = chess.turn()) {
  const kingSquare = findMiniBoardKingSquare(chess, color);
  if (!kingSquare) return false;
  const attacker = color === "w" ? "b" : "w";
  return isMiniSquareAttackedBy(chess, kingSquare, attacker);
}

function miniBoardTerminalState(chess) {
  const moves = legalMovesWithinMiniBoard(chess);
  if (moves.length > 0) {
    return { kind: "none", legalMoves: moves };
  }

  // Checkmate = King is in check AND has no legal moves to escape
  // Check if current side to move's king is in check
  const sideToMove = chess.turn();
  const isInCheck = isMiniBoardInCheck(chess, sideToMove);
  
  if (isInCheck) {
    return { kind: "checkmate", legalMoves: moves };
  }

  return { kind: "draw", legalMoves: moves };
}

function randomSquare(usedSquares, avoidPawnEdges = false) {
  const choices = MINI_BOARD_SQUARES.filter((square) => {
    if (usedSquares.has(square)) return false;
    if (!avoidPawnEdges) return true;
    const rank = squareRank(square);
    return rank !== MINI_BOARD_MIN_RANK && rank !== MINI_BOARD_MAX_RANK;
  });

  if (choices.length > 0) {
    const randomIndex = Math.floor(Math.random() * choices.length);
    return choices[randomIndex];
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
  for (const btn of customPieceCheckboxes) {
    btn.style.pointerEvents = disabled ? "none" : "auto";
    btn.style.opacity = disabled ? "0.5" : "1";
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

    // Ensure minimum mate is at least 1 (not 0)
    const limits = currentDifficulty === "hard"
      ? { minMate: 4, maxMate: 6 }
      : { minMate: 1, maxMate: 3 };

    const maxAttempts = 240;
    const chunkSize = 6;
    let attempt = 0;
    let lastMessageTime = 0;

    function tryChunk() {
      if (requestToken !== puzzleGenerationToken) {
        resolve(null);
        return;
      }

      // Update message every 30 attempts to show progress
      if (attempt % 30 === 0 && Date.now() - lastMessageTime > 500) {
        lastMessageTime = Date.now();
        const progress = Math.min(Math.round((attempt / maxAttempts) * 100), 99);
        setMessage(`Finding checkmate position... (${progress}%)`, "info");
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

        // Ensure white is not in check at the start
        if (isMiniBoardInCheck(testGame, "w")) continue;

        // Skip if already checkmate or draw
        const terminal = miniBoardTerminalState(testGame);
        if (terminal.kind !== "none") continue;

        const solved = MateSolver.findExactMateDistance(testGame, limits.maxMate, "w", {
          timeLimitMs: 90,
          moveFilter: moveOnMiniBoard,
          isInCheck: (searchChess, sideToCheck) => isMiniBoardInCheck(searchChess, sideToCheck)
        });
        if (solved.timedOut) continue;
        // Only accept if mateIn is at least 1 (not 0), and not already checkmate
        if (!solved.solved || solved.mateIn < limits.minMate || solved.mateIn > limits.maxMate || solved.mateIn === 0) continue;

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
        // Puzzle generation failed - suggest better piece combinations
        resolve({ failed: true, suggestion: "Try adding more attacking pieces or changing piece combinations." });
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
  const terminal = miniBoardTerminalState(chess);
  if (terminal.kind === "checkmate" || isCheckmate(chess)) {
    return chess.turn() === color ? -999999 : 999999;
  }
  if (terminal.kind === "draw" || isDraw(chess)) return 0;

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
  const terminal = miniBoardTerminalState(chess);
  if (depth === 0 || terminal.kind !== "none" || isCheckmate(chess) || isDraw(chess)) {
    return evaluatePosition(chess, aiSide);
  }

  const moves = terminal.legalMoves;
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
  const moves = legalMovesWithinMiniBoard(chess)
    .filter(move => {
      // Exclude any moves that would capture the opponent's king (illegal in chess)
      const piece = chess.get(move.to);
      return !(piece && piece.type === "k");
    });
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

function renderResult(summary, detailsText = "") {
  resultEl.innerHTML = detailsText ? `${summary}<br>${detailsText}` : summary;
}

function finalizeGameIfNeeded() {
  const terminal = miniBoardTerminalState(game);
  if (terminal.kind === "checkmate" || isCheckmate(game)) {
    stopAllTimers();

    const success = game.turn() === defenderColor;
    if (success) {
      setMessage("Checkmate found on the 5x5 board.", "good");
      const finalScore = calculateCurrentScore();
      if (optimalMoves) {
        renderResult(
          `Solved in ${attackerMoveCount} move(s).`,
          `Optimal: ${optimalMoves}. Hints used: ${hintsUsed}. Score: ${finalScore}/1000.`
        );
      } else {
        renderResult(`Solved in ${attackerMoveCount} move(s).`, `Hints used: ${hintsUsed}. Score: ${finalScore}/1000.`);
      }
    } else {
      setMessage("Your king was checkmated.", "bad");
      renderResult("Puzzle failed.");
      if (scoreEl) scoreEl.textContent = "0";
    }
    return true;
  }

  if (terminal.kind === "draw") {
    stopAllTimers();
    setMessage("Draw reached.", "warn");
    renderResult("Puzzle failed by draw.");
    if (scoreEl) scoreEl.textContent = "0";
    return true;
  }

  return false;
}

function makeAIMove() {
  if (!game || finalizeGameIfNeeded()) return;

  const side = game.turn();
  if (side !== defenderColor) return;

  // Show thinking message during delay
  setMessage("Defender is thinking...", "info");

  setTimeout(() => {
    if (finalizeGameIfNeeded()) return;

    const move = bestMoveFor(game, side, aiDepth());
    if (!move) {
      finalizeGameIfNeeded();
      return;
    }

    game.move(move);
    board.position(game.fen(), false);
    removeHighlights();
    updateCheckHighlighting();
    setMessage(`Defender plays ${move.san}.`, "info");
    updateStatusFields();
    finalizeGameIfNeeded();
  }, 3000);
}

function applyPuzzle(puzzle) {
  activePuzzle = puzzle;
  game = new Chess(puzzle.fen);
  attackerColor = game.turn();
  defenderColor = attackerColor === "w" ? "b" : "w";
  attackerMoveCount = 0;
  optimalMoves = puzzle.mateIn;
  hintsUsed = 0;
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
      onMouseoverSquare,
      onMouseoutSquare,
      pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png"
    });
    updateCheckHighlighting();
  } else {
    board.position(game.fen());
    removeHighlights();
    updateCheckHighlighting();
  }

  // Update board note based on difficulty
  const boardNoteEl = document.querySelector('.board-note');
  if (boardNoteEl) {
    boardNoteEl.textContent = currentDifficulty === "hard" ? "Drag and drop pieces on the 8x8 board. Only legal moves are accepted." : "Drag and drop pieces on the 5x5 board. Only legal moves are accepted.";
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

  createCustomPuzzleAsync(requestToken).then((result) => {
    if (requestToken !== puzzleGenerationToken) return;

    setPuzzleGenerationUI(false);
    if (!result) {
      setMessage("Could not create custom puzzle. Try fewer pieces or try again.", "bad");
      return;
    }

    if (result.failed) {
      setMessage(`No checkmate found. ${result.suggestion}`, "bad");
      return;
    }

    applyPuzzle(result);
  });
}

function resetCurrent() {
  if (!activePuzzle) {
    setMessage("No active puzzle to reset.", "warn");
    return;
  }
  loadPuzzle(activePuzzle);
}

function onDragStart(source, piece) {
  if (isGeneratingPuzzle || !game || miniBoardTerminalState(game).kind !== "none" || isCheckmate(game) || isDraw(game)) return false;

  if (game.turn() !== attackerColor) return false;
  if (piece[0] !== attackerColor) return false;
  if (!isSquareOnMiniBoard(source)) return false;

  // Highlight possible moves when dragging starts
  const moves = game.moves({ verbose: true }).filter(move => move.from === source && moveOnMiniBoard(move));
  moves.forEach(move => {
    const isCapture = move.captured !== undefined;
    highlightSquare(move.to, isCapture);
  });

  // Ensure check highlighting is maintained
  updateCheckHighlighting();

  return true;
}

function onDrop(source, target) {
  if (!game) return "snapback";
  if (!isSquareOnMiniBoard(source) || !isSquareOnMiniBoard(target)) return "snapback";

  // Check if target square has opponent's king - illegal move in real chess
  const targetPiece = game.get(target);
  if (targetPiece && targetPiece.type === "k") {
    // Cannot capture the king - this is not a legal chess move
    setMessage("Illegal move: cannot capture the king. Checkmate occurs when the king is in check with no escape.", "warn");
    return "snapback";
  }

  const move = game.move({ from: source, to: target, promotion: "q" });
  if (move === null) return "snapback";
  if (!moveOnMiniBoard(move)) {
    game.undo();
    return "snapback";
  }

  attackerMoveCount += 1;

  board.position(game.fen(), false);
  removeHighlights();
  updateCheckHighlighting();
  updateStatusFields();

  if (finalizeGameIfNeeded()) return undefined;

  makeAIMove();
  return undefined;
}

function onSnapEnd() {
  if (board && game) board.position(game.fen());
  removeHighlights();
  updateCheckHighlighting();
}

function onMouseoverSquare(square, piece) {
  // Remove any existing highlights
  removeHighlights();

  if (!game || !piece || game.turn() !== attackerColor || piece[0] !== attackerColor || isGeneratingPuzzle) return;

  // Get all possible moves for this piece
  const moves = game.moves({ verbose: true }).filter(move => move.from === square && moveOnMiniBoard(move));
  
  // Highlight the target squares
  moves.forEach(move => {
    const isCapture = move.captured !== undefined;
    highlightSquare(move.to, isCapture);
  });

  // Re-apply check highlighting
  updateCheckHighlighting();
}

function onMouseoutSquare(square, piece) {
  removeHighlights();
  updateCheckHighlighting();
}

function highlightSquare(square, isCapture = false) {
  const $square = $(`.square-55d63[data-square="${square}"]`);
  const highlightClass = isCapture ? 'highlight2-9c5d2' : 'highlight1-32417';
  $square.addClass(highlightClass);
}

function removeHighlights() {
  $('.square-55d63').removeClass('highlight1-32417 highlight2-9c5d2 king-in-check');
}

function updateCheckHighlighting() {
  if (!game) return;

  // Remove existing check highlighting
  $('.square-55d63').removeClass('king-in-check');

  // Check if white is in check
  if (isColorInCheck(game, 'w')) {
    const whiteKingSquare = findMiniBoardKingSquare(game, 'w');
    if (whiteKingSquare) {
      const $kingSquare = $(`.square-55d63[data-square="${whiteKingSquare}"]`);
      $kingSquare.addClass('king-in-check');
    }
  }

  // Check if black is in check
  if (isColorInCheck(game, 'b')) {
    const blackKingSquare = findMiniBoardKingSquare(game, 'b');
    if (blackKingSquare) {
      const $kingSquare = $(`.square-55d63[data-square="${blackKingSquare}"]`);
      $kingSquare.addClass('king-in-check');
    }
  }
}

function moveToUci(move) {
  if (!move) return "";
  return `${move.from}${move.to}${move.promotion || ""}`;
}

function findSolverHintMove(chess, side) {
  if (typeof MateSolver === "undefined" || typeof MateSolver.findExactMateDistance !== "function") {
    return null;
  }

  const maxMoves = currentDifficulty === "hard" ? 6 : 3;
  const solved = MateSolver.findExactMateDistance(chess, maxMoves, side, {
    timeLimitMs: 150,
    moveFilter: moveOnMiniBoard,
    isInCheck: (searchChess, sideToCheck) => isMiniBoardInCheck(searchChess, sideToCheck)
  });

  if (!solved.solved || solved.principalVariation.length === 0) {
    return null;
  }

  const pvFirst = solved.principalVariation[0];
  const legalMoves = legalMovesWithinMiniBoard(chess);
  const exactSan = legalMoves.find((move) => move.san === pvFirst);
  if (exactSan) return exactSan;

  const normalizedPv = pvFirst.replace(/[+#]?[?!]*$/g, "");
  return legalMoves.find((move) => move.san.replace(/[+#]?[?!]*$/g, "") === normalizedPv) || null;
}

function showHint() {
  if (!game || game.turn() !== attackerColor || isGeneratingPuzzle) {
    setMessage("Hint is available on your turn.", "warn");
    return;
  }

  const terminal = miniBoardTerminalState(game);
  if (terminal.kind !== "none") {
    setMessage("This position is already finished.", "warn");
    return;
  }

  const move = findSolverHintMove(game, attackerColor) || bestMoveFor(game, attackerColor, aiDepth());
  if (!move) {
    setMessage("No hint available from this position.", "warn");
    return;
  }

  hintsUsed += 1;
  updateStatusFields();
  setMessage(`Hint: try ${move.san} (${moveToUci(move)}).`, "info");
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
  currentDifficulty = event.target.value;
  if (currentDifficulty === "hard") {
    customWrapEl.style.display = "none";
    // Select all pieces for hard
    customPieceCheckboxes.forEach(btn => {
      if (btn.getAttribute("data-piece") !== "k") {
        btn.classList.add("selected");
      }
    });
  } else {
    customWrapEl.style.display = "block";
    // For easy/medium, deselect all except king
    customPieceCheckboxes.forEach(btn => {
      if (btn.getAttribute("data-piece") !== "k") {
        btn.classList.remove("selected");
      }
    });
  }
  if (currentDifficulty === "medium") {
    hintBtnEl.disabled = true;
  } else {
    hintBtnEl.disabled = false;
  }
  startAccordingToMode();
});

for (const btn of customPieceCheckboxes) {
  btn.addEventListener("click", () => {
    if (btn.getAttribute("data-piece") === "k" || btn.hasAttribute("disabled")) return;
    btn.classList.toggle("selected");
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
