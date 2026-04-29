

// The 18 Belizean-themed symbols. Each one will appear on exactly two cards.
const SYMBOLS = [
  '🦜', '🐆', '🌊', '🏝️', '🐢', '🥥',
  '🌴', '🥭', '🦈', '🐬', '🦩', '🐠',
  '☀️',  '⛰️', '🌺', '🦎', '🦀', '🛶',
];

const TOTAL_PAIRS = SYMBOLS.length;          // 18
const TOTAL_CARDS = TOTAL_PAIRS * 2;         // 36
const FLIP_BACK_DELAY_MS = 900;              // time to view a failed match
const TIMER_INTERVAL_MS = 1000;

/**
 * Factory: produces a game service bound to the given event bus.
 *
 * @param {object} eventBus  an instance from createEventEmitter()
 * @returns {object} public API — { start, flipCard, restart, destroy }
 */
export function createGameService(eventBus) {
  if (!eventBus || typeof eventBus.emit !== 'function') {
    throw new TypeError('createGameService requires an event bus.');
  }

  // -------------------------------------------------------------------------
  // Private state — sealed in this closure. Never expose, never return.
  // -------------------------------------------------------------------------
  let state = createInitialState();

  function createInitialState() {
    return {
      status:         'idle',
      cards:          [],
      firstPickId:    null,
      secondPickId:   null,
      moves:          0,
      elapsedSeconds: 0,
      matchedCount:   0,
      isLocked:       false,
      timerId:        null,
    };
  }

  // -------------------------------------------------------------------------
  // Pure helpers — no state mutation, no side effects.
  // -------------------------------------------------------------------------

  /**
   * Fisher–Yates shuffle. Returns a NEW array; does not mutate the input.
   * This must be pure — given the same input it can produce different
   * outputs (because of randomness) but it must never mutate `arr`.
   */
  function shuffle(arr) {
    const clone = [...arr];

    for (let i = clone.length - 1; i > 0; i--) {
       const j = Math.floor(Math.random() * (i + 1));
       let temp = clone[i];
       clone[i] = clone[j];
       clone[j] = temp;
     }

     return clone;

  }

  /**
   * Builds the initial deck: two cards per symbol, shuffled, each with a
   * stable numeric id in the range [0, TOTAL_CARDS). Returns a new array.
   */
  function buildDeck() {
    const doubled = [...SYMBOLS, ...SYMBOLS];

    const shuffled = shuffle(doubled);

    return shuffled.map((symbol, index) => ({
      id: index,
      symbol: symbol,
      isFlipped: false,
      isMatched: false
    }));

  }

  /**
   * Look up a card by id. Returns the actual card object from state.cards
   * (not a copy). Only helpers inside this file should use this.
   */
  function getCardById(id) {
    return state.cards.find(card => card.id === id);
  }

  // -------------------------------------------------------------------------
  // Timer — private side effect, controlled via start/stop helpers.
  // -------------------------------------------------------------------------

  function startTimer() {
    if (state.timerId !== null) return;

    state.timerId = setInterval(() => {
      state.elapsedSeconds += 1;
      eventBus.emit('game:timerTick', { elapsedSeconds: state.elapsedSeconds });
    }, TIMER_INTERVAL_MS);

  }

  function stopTimer() {
    if (state.timerId !== null) {
      clearInterval(state.timerId);
      state.timerId = null;
    }

  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Begin a new game. Builds a fresh shuffled deck, resets state,
   * and emits 'game:started'. Also starts the timer.
   */
  function start() {
    stopTimer();

    state = createInitialState();
    state.cards = buildDeck();
    state.status = 'playing';

    eventBus.emit('game:started', {
      cards: state.cards,
      totalPairs: TOTAL_PAIRS
    });

    eventBus.emit('game:moveCountChanged', { moves: state.moves })
    startTimer();

  }

  /**
   * Player clicked a card. Validates the click, flips the card, and
   * handles match / no-match logic.
   *
   * Rejection rules (return early, do nothing):
   *   - status is not 'playing'
   *   - isLocked is true (we're in the flip-back window)
   *   - no card with that id exists
   *   - the card is already flipped or already matched
   *   - secondPickId is already set (can't pick a third)
   */
  function flipCard(cardId) {

    if (state.status !== 'playing') return
    if (state.isLocked) return

    const card = getCardById(cardId)
    if (!card) return
    if (card.isFlipped || card.isMatched) return
    if (state.secondPickId !== null) return

    card.isFlipped = true
    eventBus.emit('game:cardFlipped', { cardId, symbol: card.symbol })

    if (state.firstPickId === null) {
      state.firstPickId = cardId
      return
    }

    state.secondPickId = cardId
    state.moves += 1
    eventBus.emit('game:moveCountChanged', { moves: state.moves })

    const firstCard = getCardById(state.firstPickId)
    const secondCard = getCardById(state.secondPickId)

    if (firstCard.symbol === secondCard.symbol) {
      firstCard.isMatched = true
      secondCard.isMatched = true

      state.matchedCount += 2

      eventBus.emit('game:matchFound', {
        firstId: firstCard.id,
        secondId: secondCard.id,
        matchedCount: state.matchedCount
      });

      state.firstPickId = null
      state.secondPickId = null

      if (state.matchedCount === TOTAL_CARDS) {
        state.status = 'won'
        stopTimer();
        eventBus.emit('game:won', {
          moves: state.moves,
          elapsedSeconds: state.elapsedSeconds
        });
      }
    } else {
      state.isLocked = true

      const firstId = state.firstPickId
      const secondId = state.secondPickId

      eventBus.emit('game:matchFailed', {
        firstId,
        secondId
      });

      setTimeout(() => {
         const first = getCardById(firstId)
         const second = getCardById(secondId)

         if (first) first.isFlipped = false
         if (second) second.isFlipped = false

         state.firstPickId = null
         state.secondPickId = null
         state.isLocked = false
      }, FLIP_BACK_DELAY_MS)
    }

  }

  /**
   * Abort the current game (if any) and begin a new one.
   * This is a thin wrapper around start() — start() already resets state
   * and restarts the timer, so restart just delegates.
   */
  function restart() {
    start()
  }

  /**
   * Cleanup hook — stop the timer and clear listeners. Useful if the
   * service is torn down (e.g. page navigation in a SPA).
   */
  function destroy() {
    stopTimer();
  }

  return Object.freeze({ start, flipCard, restart, destroy });
}
