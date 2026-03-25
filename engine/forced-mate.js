(function (global) {
  "use strict";

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

  function fenKey(chess) {
    const fen = chess.fen();
    const parts = fen.split(" ");
    return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
  }

  function verifyForcedMate(chess, plyRemaining, attackerColor, stats, memo, deadlineTs) {
    if (deadlineTs && Date.now() > deadlineTs) {
      return { ok: false, pv: [], timedOut: true };
    }

    stats.nodesExpanded += 1;

    if (isCheckmate(chess)) {
      return {
        ok: chess.turn() !== attackerColor,
        pv: [],
        timedOut: false
      };
    }

    if (isDraw(chess) || plyRemaining < 0) {
      return {
        ok: false,
        pv: [],
        timedOut: false
      };
    }

    const key = `${fenKey(chess)}|${plyRemaining}|${attackerColor}`;
    if (memo.has(key)) {
      return memo.get(key);
    }

    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) {
      const noMoveResult = {
        ok: false,
        pv: [],
        timedOut: false
      };
      memo.set(key, noMoveResult);
      return noMoveResult;
    }

    const sideToMove = chess.turn();

    if (sideToMove === attackerColor) {
      for (const move of moves) {
        chess.move(move);
        const child = verifyForcedMate(chess, plyRemaining - 1, attackerColor, stats, memo, deadlineTs);
        chess.undo();

        if (child.timedOut) {
          return child;
        }

        if (child.ok) {
          const result = {
            ok: true,
            pv: [move.san, ...child.pv],
            timedOut: false
          };
          memo.set(key, result);
          return result;
        }
      }

      const failResult = { ok: false, pv: [], timedOut: false };
      memo.set(key, failResult);
      return failResult;
    }

    // Defender node: all replies must still lead to mate within bound.
    let selectedDefenderLine = null;
    for (const move of moves) {
      chess.move(move);
      const child = verifyForcedMate(chess, plyRemaining - 1, attackerColor, stats, memo, deadlineTs);
      chess.undo();

      if (child.timedOut) {
        return child;
      }

      if (!child.ok) {
        const failResult = { ok: false, pv: [], timedOut: false };
        memo.set(key, failResult);
        return failResult;
      }

      if (!selectedDefenderLine || child.pv.length > selectedDefenderLine.pv.length) {
        selectedDefenderLine = {
          san: move.san,
          pv: child.pv
        };
      }
    }

    const passResult = {
      ok: true,
      pv: selectedDefenderLine ? [selectedDefenderLine.san, ...selectedDefenderLine.pv] : [],
      timedOut: false
    };
    memo.set(key, passResult);
    return passResult;
  }

  function canForceMateIn(chessInput, attackerMoves, attackerColor, options = {}) {
    const chess = typeof chessInput === "string" ? new global.Chess(chessInput) : new global.Chess(chessInput.fen());
    const plyLimit = Math.max(0, (attackerMoves * 2) - 1);
    const stats = { nodesExpanded: 0 };
    const memo = new Map();
    const deadlineTs = options.deadlineTs || (options.timeLimitMs ? Date.now() + options.timeLimitMs : 0);

    const result = verifyForcedMate(chess, plyLimit, attackerColor, stats, memo, deadlineTs);
    return {
      canForce: Boolean(result.ok),
      principalVariation: result.pv,
      nodesExpanded: stats.nodesExpanded,
      depth: attackerMoves,
      timedOut: Boolean(result.timedOut)
    };
  }

  function findExactMateDistance(chessInput, maxAttackerMoves, attackerColor, options = {}) {
    const startedAt = Date.now();
    const chess = typeof chessInput === "string" ? new global.Chess(chessInput) : new global.Chess(chessInput.fen());
    const deadlineTs = options.timeLimitMs ? startedAt + options.timeLimitMs : 0;

    let totalNodes = 0;
    let best = null;
    let timedOut = false;

    for (let n = 1; n <= maxAttackerMoves; n += 1) {
      const attempt = canForceMateIn(chess, n, attackerColor, { deadlineTs: deadlineTs });
      totalNodes += attempt.nodesExpanded;
      if (attempt.timedOut) {
        timedOut = true;
        break;
      }
      if (attempt.canForce) {
        best = {
          mateIn: n,
          principalVariation: attempt.principalVariation
        };
        break;
      }
    }

    return {
      solved: Boolean(best),
      mateIn: best ? best.mateIn : null,
      principalVariation: best ? best.principalVariation : [],
      nodesExpanded: totalNodes,
      runtimeMs: Date.now() - startedAt,
      algorithm: "DFS-ID",
      timedOut: timedOut
    };
  }

  global.MateSolver = {
    canForceMateIn: canForceMateIn,
    findExactMateDistance: findExactMateDistance
  };
})(window);
