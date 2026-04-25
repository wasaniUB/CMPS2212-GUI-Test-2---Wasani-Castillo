// ============================================================================
// ui.js — View Layer (the Observer in Observer Pattern)
// ============================================================================
//
// LAYER RULES
//
//   1. This file is the ONLY place allowed to touch the DOM.
//
//   2. This file MUST NOT contain any game logic. No match checking, no
//      move counting, no timer state. If you need to know something about
//      the game, either the service emits it in an event payload, or
//      you are doing it wrong.
//
//   3. Communicate with the service only by calling its public methods
//      (gameService.start, gameService.flipCard, gameService.restart).
//      Never read or mutate service state directly.
//
// ============================================================================
// EVENT SUBSCRIPTIONS YOU WILL WIRE UP
//
//   'game:started'           → renderBoard(cards), resetHud(totalPairs), hideWinOverlay()
//   'game:cardFlipped'       → flipCardFaceUp(cardId)
//   'game:matchFound'        → markCardsMatched(firstId, secondId), updateMatchedCount(matchedCount)
//   'game:matchFailed'       → after FLIP_BACK_DELAY_MS, flipCardsFaceDown(firstId, secondId)
//                               (use the same 900ms the service uses; a constant is defined below)
//   'game:moveCountChanged'  → updateMoves(moves)
//   'game:timerTick'         → updateTimer(elapsedSeconds)
//   'game:won'               → showWinOverlay(moves, elapsedSeconds)
//
// ============================================================================

const FLIP_BACK_DELAY_MS = 900;
const TOTAL_PAIRS = 18;

/**
 * Factory: builds the UI controller and wires it to the given bus and service.
 *
 * @param {object} eventBus      from createEventEmitter()
 * @param {object} gameService   from createGameService(bus)
 * @param {HTMLElement} rootEl   usually document.body
 * @returns {object} { mount, unmount }
 */
export function createUI(eventBus, gameService, rootEl) {
  // -------------------------------------------------------------------------
  // DOM element cache — resolved once on mount.
  // -------------------------------------------------------------------------
  const els = {
    board:       null,
    moves:       null,
    timer:       null,
    matched:     null,
    restart:     null,
    playAgain:   null,
    winOverlay:  null,
    winMoves:    null,
    winTime:     null,
  };

  // Track the subscriptions we create so we can clean them up in unmount().
  // Each entry: { event: string, handler: Function }
  const subscriptions = [];

  // -------------------------------------------------------------------------
  // Small formatting helpers (pure — safe to keep here, not game logic).
  // -------------------------------------------------------------------------
  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  // -------------------------------------------------------------------------
  // RENDERERS — produce / mutate DOM based on payloads. Students implement.
  // -------------------------------------------------------------------------

  /**
   * Build a single card element for the given card object.
   * Expected structure (matches styles.css):
   *
   *   <button class="card" data-card-id="<id>" type="button">
   *     <div class="card-inner">
   *       <div class="card-face card-back"></div>
   *       <div class="card-face card-front"><span>🦜</span></div>
   *     </div>
   *   </button>
   *
   * Security note: use textContent, never innerHTML, when inserting the
   * symbol. Treat all payload data as untrusted on principle.
   */
  function buildCardElement(card) {
    const button = document.createElement("button")
    button.className = "card"
    button.type = "button"
    button.dataset.cardId = card.id

    const inner = document.createElement("div")
    inner.className = "card-inner"

    const back = document.createElement("div")
    back.className = "card-face card-back"

    const front = document.createElement("div")
    front.className = "card-face card-front"

    const span = document.createElement("span")
    span.textContent = card.symbol

    front.appendChild(span)
    inner.appendChild(back)
    inner.appendChild(front)
    button.appendChild(inner)

  return button

  }

  /**
   * Replace the board's contents with freshly rendered cards.
   * Called on 'game:started'.
   */
  function renderBoard(cards) {
    els.board.replaceChildren()

    const frag = document.createDocumentFragment()

    cards.forEach((card) => {
      const el = buildCardElement(card)
      frag.appendChild(el)
    })

    els.board.appendChild(frag)

  }

  /**
   * Reset the HUD for a new game.
   */
  function resetHud(totalPairs) {
    els.timer.textContent = "0:00"
    els.matched.textContent = `0 / ${totalPairs}`
  }

  function updateMoves(moves) {
    if (els.moves){
       els.moves.textContent = String(moves)
    }
  }

  function updateTimer(elapsedSeconds) {
    if (els.timer) {
    els.timer.textContent = formatTime(elapsedSeconds)
    }
  }

  function updateMatchedCount(matchedCardCount) {
    const pairs = matchedCardCount / 2

    if (els.matched) {
       els.matched.textContent = `${pairs} / ${TOTAL_PAIRS}`
    }
  }

  /**
   * Find the card element by id and add the .is-flipped class.
   */
  function flipCardFaceUp(cardId) {
    const el = els.board.querySelector(`[data-card-id="${cardId}"]`)
    if(!el) return

    el.classList.add("is-flipped")
  }

  /**
   * Mark both cards as matched. Once matched they should stay face-up
   * permanently, so we keep .is-flipped AND add .is-matched.
   */
  function markCardsMatched(firstId, secondId) {
    const first = els.board.querySelector(`[data-card-id="${firstId}"]`)
    const second = els.board.querySelector(`[data-card-id="${secondId}"]`)

    if(first) {
      first.classList.add("is-matched") 
    }
    if(second) {
      second.classList.add("is-matched")
    }

  }

  /**
   * Flip two unmatched cards back face-down after the viewing delay.
   * Called on 'game:matchFailed' via setTimeout.
   */
  function flipCardsFaceDown(firstId, secondId) {
    const first = els.board.querySelector(`[data-card-id="${firstId}"]`)
    const second = els.board.querySelector(`[data-card-id="${secondId}"]`)

    if(first) {
      first.classList.remove("is-flipped")
    }
    if(second) {
       second.classList.remove("is-flipped")
    }
  
  }
  

  function showWinOverlay(moves, elapsedSeconds) {
    els.winMoves.textContent = String(moves)
    els.winTime.textContent = formatTime(elapsedSeconds)
    els.winOverlay.classList.add('is-visible')
    els.winOverlay.setAttribute("aria-hidden", "false")
  }

  function hideWinOverlay() {
    if(!els.winOverlay) return
    
    if (els.winOverlay) {
       els.winOverlay.classList.remove('is-visible')
       els.winOverlay.setAttribute("aria-hidden", "true")
    }
    
  }

  // -------------------------------------------------------------------------
  // DOM EVENT HANDLERS — user input → service method calls
  // -------------------------------------------------------------------------

  /**
   * Click on the board. Use event delegation: one listener on the board,
   * figure out which card was clicked via the event target.
   */
  function onBoardClick(domEvent) {
    const card = domEvent.target.closest('.card')
    if (!card) return

    const id = Number(card.dataset.cardId)
    gameService.flipCard(id)
  }

  function onRestartClick() {
    gameService.restart()

  }

  // -------------------------------------------------------------------------
  // SUBSCRIPTION WIRING — Observer Pattern subscriptions live here.
  // -------------------------------------------------------------------------

  /**
   * Subscribe a handler and remember it so unmount() can detach cleanly.
   * Use this helper instead of calling eventBus.on directly.
   */
  function subscribe(eventName, handler) {
    eventBus.on(eventName, handler);
    subscriptions.push({ event: eventName, handler });
  }

  function wireSubscriptions() {

    subscribe('game:started', ({ cards, totalPairs }) => {
      renderBoard(cards)
      resetHud(totalPairs)
      hideWinOverlay()
    })

    subscribe('game:cardFlipped', ({ cardId }) => {
      flipCardFaceUp(cardId)
    })

    subscribe('game:matchFound', ({ firstId, secondId, matchedCount }) => {
      markCardsMatched(firstId, secondId)
      updateMatchedCount(matchedCount)
    })

    subscribe('game:matchFailed', ({ firstId, secondId }) => {
      setTimeout(() => {
        flipCardsFaceDown(firstId, secondId)
      }, FLIP_BACK_DELAY_MS)
    })

    subscribe('game:moveCountChanged', ({ moves }) => {
      updateMoves(moves)
    })

    subscribe('game:timerTick', ({ elapsedSeconds }) => {
      updateTimer(elapsedSeconds)
    })

    subscribe('game:won', ({ moves, elapsedSeconds }) => {
      showWinOverlay(moves, elapsedSeconds)
    })

  }

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  function mount() {
    // Resolve DOM refs.
    els.board      = rootEl.querySelector('[data-role="board"]');
    els.moves      = rootEl.querySelector('[data-role="moves"]');
    els.timer      = rootEl.querySelector('[data-role="timer"]');
    els.matched    = rootEl.querySelector('[data-role="matched"]');
    els.restart    = rootEl.querySelector('[data-role="restart"]');
    els.playAgain  = rootEl.querySelector('[data-role="play-again"]');
    els.winOverlay = rootEl.querySelector('[data-role="win-overlay"]');
    els.winMoves   = rootEl.querySelector('[data-role="win-moves"]');
    els.winTime    = rootEl.querySelector('[data-role="win-time"]');

    // Attach DOM listeners.
    els.board.addEventListener('click', onBoardClick);
    els.restart.addEventListener('click', onRestartClick);
    els.playAgain.addEventListener('click', onRestartClick);

    // Subscribe to service events.
    wireSubscriptions();
  }

  function unmount() {
    // Detach DOM listeners.
    els.board.removeEventListener('click', onBoardClick);
    els.restart.removeEventListener('click', onRestartClick);
    els.playAgain.removeEventListener('click', onRestartClick);

    // Detach all bus subscriptions we created.
    subscriptions.forEach(({ event, handler }) => eventBus.off(event, handler));
    subscriptions.length = 0;
  }

  return Object.freeze({ mount, unmount });
}
