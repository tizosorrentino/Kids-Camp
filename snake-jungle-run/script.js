(() => {
  'use strict';

  // ---------- Tunable settings ----------
  const GRID_SIZE = 22;           // 22x22 cubes on the board
  const CELL_PX = 528 / GRID_SIZE;
  const MIN_SNAKE_LENGTH = 3;     // snake can never shrink smaller than this
  const START_LENGTH = 4;
  const QUIZ_EVERY_N_BITES = 3;   // pause for a question every 3 cubes eaten
  const STREAK_BONUS_EVERY = 5;   // every 5-in-a-row => bigger shrink
  const STREAK_BONUS_SHRINK = 5;
  const NORMAL_SHRINK = 1;
  const WRONG_ANSWER_GROWTH = 2;
  const BASE_POINTS_PER_BITE = 10;
  const MULTIPLIER_STREAK_STEP = 5; // +1x multiplier every 5-in-a-row
  const MULTIPLIER_CAP = 5;
  const START_TICK_MS = 150;      // how often the snake moves, in milliseconds
  const MIN_TICK_MS = 90;         // fastest the game is allowed to get
  const SPEEDUP_PER_BITE = 1.5;   // ms shaved off per bite eaten
  const HIGH_SCORE_KEY = 'snakeJungleRun.highScore';
  const GEMS_KEY = 'snakeJungleRun.gems';
  const OWNED_SKINS_KEY = 'snakeJungleRun.ownedSkins';
  const SELECTED_SKIN_KEY = 'snakeJungleRun.selectedSkin';
  const ELA_QUESTION_CHANCE = 0.25; // about 1 in 4 questions is an easy word question instead of math

  const DIFFICULTY_RANGES = {
    easy: { min: 1, max: 5 },
    medium: { min: 2, max: 9 },
    hard: { min: 6, max: 12 },
    impossible: { min: 12, max: 20 },
  };

  // Different gem colors a pickup can randomly appear as. Purely visual
  // variety -- every gem is worth the same 1 currency toward the store.
  const GEM_COLORS = [
    { fill: '#ff5c5c', shine: '#ffc2c2' },
    { fill: '#4fa8ff', shine: '#c2e2ff' },
    { fill: '#4fd67a', shine: '#c2f5d4' },
    { fill: '#c26bff', shine: '#e6c9ff' },
    { fill: '#ffd23f', shine: '#fff0b8' },
  ];

  // Snake color skins, bought in the lobby store with gems collected in-game.
  // The starter yellow skin is free and always owned. Red/Blue/Green also
  // grant a power: press Space during play to instantly shrink the snake.
  const SKINS = [
    { id: 'yellow', name: 'Jungle Yellow', price: 0, body: '#ffd23f', head: '#fff3c4', power: 0, powerLabel: 'No power' },
    { id: 'red', name: 'Ruby Red', price: 25, body: '#e8483f', head: '#ffbcb8', power: 2, powerLabel: 'Space Bar: -2 blocks' },
    { id: 'blue', name: 'Ocean Blue', price: 40, body: '#3f8fe8', head: '#bfe0ff', power: 4, powerLabel: 'Space Bar: -4 blocks' },
    { id: 'green', name: 'Jungle Green', price: 60, body: '#3fbf5f', head: '#c2f2cc', power: 7, powerLabel: 'Space Bar: -7 blocks' },
  ];

  // ---------- DOM references ----------
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const scoreValueEl = document.getElementById('score-value');
  const highScoreValueEl = document.getElementById('high-score-value');
  const streakValueEl = document.getElementById('streak-value');
  const multiplierValueEl = document.getElementById('multiplier-value');
  const gemsValueEl = document.getElementById('gems-value');
  const progressDots = Array.from(document.querySelectorAll('.progress-dot'));
  const progressLabel = document.getElementById('quiz-progress-label');
  const fxLayer = document.getElementById('fx-layer');

  const startOverlay = document.getElementById('start-overlay');
  const startButton = document.getElementById('start-button');
  const storeButton = document.getElementById('store-button');

  const storeOverlay = document.getElementById('store-overlay');
  const storeBalanceEl = document.getElementById('store-balance');
  const skinGridEl = document.getElementById('skin-grid');
  const storeCloseButton = document.getElementById('store-close-button');

  const quizOverlay = document.getElementById('quiz-overlay');
  const quizKickerEl = document.getElementById('quiz-kicker');
  const quizQuestionEl = document.getElementById('quiz-question');
  const quizChoicesEl = document.getElementById('quiz-choices');
  const quizSwapButton = document.getElementById('quiz-swap-button');
  const difficultyButtons = Array.from(document.querySelectorAll('.difficulty-button'));

  const gameOverOverlay = document.getElementById('gameover-overlay');
  const finalScoreEl = document.getElementById('final-score');
  const newBestEl = document.getElementById('gameover-new-best');
  const restartButton = document.getElementById('restart-button');
  const lobbyButton = document.getElementById('lobby-button');

  // ---------- Game state ----------
  const STATES = { START: 'START', PLAYING: 'PLAYING', QUIZ: 'QUIZ', GAME_OVER: 'GAME_OVER', STORE: 'STORE' };

  let state = STATES.START;
  let snake = [];
  let direction = { x: 1, y: 0 };
  // Up to 2 buffered turns, so quick double key-taps can't sneak a reversal
  // in before the snake has actually moved (the classic "turned into my own
  // neck" bug).
  let directionQueue = [];
  let food = { x: 0, y: 0, colorIndex: 0 };
  let cubesEaten = 0;
  let score = 0;
  let highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  let streak = 0;
  let tickMs = START_TICK_MS;
  let msSinceLastTick = 0;
  let lastFrameTime = 0;
  let currentQuestion = null;
  let difficulty = 'medium';

  // Gems are a permanent currency (1 per gem collected, saved across games)
  // spent in the lobby store on snake color skins.
  let totalGems = Number(localStorage.getItem(GEMS_KEY)) || 0;

  let ownedSkins = ['yellow'];
  try {
    const storedSkins = JSON.parse(localStorage.getItem(OWNED_SKINS_KEY));
    if (Array.isArray(storedSkins) && storedSkins.length) ownedSkins = storedSkins;
  } catch (e) {
    // Ignore corrupted storage and fall back to the default.
  }

  let selectedSkinId = localStorage.getItem(SELECTED_SKIN_KEY) || 'yellow';
  if (!SKINS.some((s) => s.id === selectedSkinId)) selectedSkinId = 'yellow';

  // ---------- Question generation ----------
  // Builds a random multiplication question with three plausible wrong
  // answers. The factor range scales with the chosen difficulty.
  function generateMathQuestion(diffKey) {
    const range = DIFFICULTY_RANGES[diffKey] || DIFFICULTY_RANGES.medium;
    const span = range.max - range.min + 1;
    const a = range.min + Math.floor(Math.random() * span);
    const b = range.min + Math.floor(Math.random() * span);
    const correct = a * b;

    const distractorPool = new Set([
      a * (b + 1),
      a * (b - 1),
      (a + 1) * b,
      (a - 1) * b,
      correct + a,
      correct - a,
      correct + b,
      correct - b,
    ].filter((n) => n > 0 && n !== correct));

    const distractors = [];
    const pool = Array.from(distractorPool);
    while (distractors.length < 3 && pool.length > 0) {
      const i = Math.floor(Math.random() * pool.length);
      distractors.push(pool.splice(i, 1)[0]);
    }
    // Fallback in the rare case the pool ran dry (small factors).
    while (distractors.length < 3) {
      const candidate = correct + (distractors.length + 1) * (Math.random() < 0.5 ? -1 : 1);
      if (candidate > 0 && candidate !== correct && !distractors.includes(candidate)) {
        distractors.push(candidate);
      }
    }

    const choices = shuffle([correct, ...distractors]);
    return { subject: 'math', text: `${a} × ${b} = ?`, correct, choices };
  }

  // Easy 5th-grade word questions: synonyms, antonyms, plurals, parts of
  // speech, rhymes, and spelling. Mixed in alongside the math questions.
  const ELA_QUESTIONS = [
    { text: 'Which word means the same as "happy"?', correct: 'glad', choices: ['glad', 'sad', 'tired', 'angry'] },
    { text: 'Which word means the same as "quick"?', correct: 'fast', choices: ['fast', 'slow', 'quiet', 'loud'] },
    { text: 'Which word means the same as "small"?', correct: 'tiny', choices: ['tiny', 'giant', 'wide', 'loud'] },
    { text: 'Which word means the same as "smart"?', correct: 'clever', choices: ['clever', 'silly', 'slow', 'weak'] },
    { text: 'Which word is the opposite of "big"?', correct: 'small', choices: ['small', 'huge', 'tall', 'wide'] },
    { text: 'Which word is the opposite of "begin"?', correct: 'end', choices: ['end', 'start', 'open', 'continue'] },
    { text: 'Which word is the opposite of "up"?', correct: 'down', choices: ['down', 'high', 'top', 'over'] },
    { text: 'Which word is the opposite of "loud"?', correct: 'quiet', choices: ['quiet', 'big', 'fast', 'happy'] },
    { text: 'What is the plural of "mouse"?', correct: 'mice', choices: ['mice', 'mouses', 'mices', 'mouse'] },
    { text: 'What is the plural of "child"?', correct: 'children', choices: ['children', 'childs', 'childes', 'childrens'] },
    { text: 'What is the plural of "leaf"?', correct: 'leaves', choices: ['leaves', 'leafs', 'leafes', 'leaf'] },
    { text: 'Which word is the noun in "The dog ran fast"?', correct: 'dog', choices: ['dog', 'ran', 'fast', 'the'] },
    { text: 'Which word is the verb in "She sings a song"?', correct: 'sings', choices: ['sings', 'song', 'she', 'a'] },
    { text: 'Which word is the adjective in "The bright sun rose"?', correct: 'bright', choices: ['bright', 'sun', 'rose', 'the'] },
    { text: 'Which word rhymes with "cat"?', correct: 'hat', choices: ['hat', 'dog', 'sun', 'cup'] },
    { text: 'Which word rhymes with "light"?', correct: 'night', choices: ['night', 'table', 'spoon', 'chair'] },
    { text: 'Which word rhymes with "star"?', correct: 'car', choices: ['car', 'moon', 'tree', 'book'] },
    { text: 'Which word is spelled correctly?', correct: 'friend', choices: ['friend', 'freind', 'frend', 'friende'] },
    { text: 'Which word is spelled correctly?', correct: 'because', choices: ['because', 'becuase', 'becouse', 'beacause'] },
    { text: 'Which word is spelled correctly?', correct: 'definitely', choices: ['definitely', 'definately', 'definitly', 'defenitely'] },
  ];
  let elaQueue = [];

  function generateElaQuestion() {
    if (elaQueue.length === 0) {
      elaQueue = shuffle(ELA_QUESTIONS.map((_, i) => i));
    }
    const q = ELA_QUESTIONS[elaQueue.pop()];
    return { subject: 'ela', text: q.text, correct: q.correct, choices: shuffle(q.choices) };
  }

  function generateQuestion() {
    return Math.random() < ELA_QUESTION_CHANCE ? generateElaQuestion() : generateMathQuestion(difficulty);
  }

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // ---------- Setup / reset ----------
  function resetGame() {
    const startX = Math.floor(GRID_SIZE / 2);
    const startY = Math.floor(GRID_SIZE / 2);
    snake = [];
    for (let i = 0; i < START_LENGTH; i++) {
      snake.push({ x: startX - i, y: startY });
    }
    direction = { x: 1, y: 0 };
    directionQueue = [];
    cubesEaten = 0;
    score = 0;
    streak = 0;
    tickMs = START_TICK_MS;
    msSinceLastTick = 0;
    updateHud();
    placeFood();
  }

  function placeFood() {
    let candidate;
    do {
      candidate = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
        colorIndex: Math.floor(Math.random() * GEM_COLORS.length),
      };
    } while (snake.some((seg) => seg.x === candidate.x && seg.y === candidate.y));
    food = candidate;
  }

  // ---------- HUD ----------
  function currentMultiplier() {
    return Math.min(1 + Math.floor(streak / MULTIPLIER_STREAK_STEP), MULTIPLIER_CAP);
  }

  function updateHud() {
    scoreValueEl.textContent = score;
    highScoreValueEl.textContent = highScore;
    streakValueEl.textContent = streak;
    multiplierValueEl.textContent = `x${currentMultiplier()}`;
    gemsValueEl.textContent = totalGems;

    const bitesIntoCycle = cubesEaten % QUIZ_EVERY_N_BITES;
    progressDots.forEach((dot, i) => dot.classList.toggle('filled', i < bitesIntoCycle));
    const remaining = QUIZ_EVERY_N_BITES - bitesIntoCycle;
    progressLabel.textContent = `${remaining} bite${remaining === 1 ? '' : 's'} until your next question`;
  }

  // ---------- Input ----------
  const KEY_TO_DIR = {
    ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
  };

  window.addEventListener('keydown', (e) => {
    if (state !== STATES.PLAYING) return;

    if (e.code === 'Space') {
      e.preventDefault();
      activateSkinPower();
      return;
    }

    const dir = KEY_TO_DIR[e.key];
    if (!dir) return;

    // Compare against the last buffered turn (not the on-screen direction),
    // so a fast second key-press can't queue a flip that only looks safe
    // because the first turn hasn't been applied to the snake yet.
    const lastQueued = directionQueue.length
      ? directionQueue[directionQueue.length - 1]
      : direction;
    const isReversal = dir.x === -lastQueued.x && dir.y === -lastQueued.y;
    const isSameDirection = dir.x === lastQueued.x && dir.y === lastQueued.y;
    if (isReversal || isSameDirection) return;

    if (directionQueue.length < 2) directionQueue.push(dir);
    e.preventDefault();
  });

  startButton.addEventListener('click', () => {
    resetGame();
    setState(STATES.PLAYING);
  });

  restartButton.addEventListener('click', () => {
    resetGame();
    setState(STATES.PLAYING);
  });

  lobbyButton.addEventListener('click', () => {
    setState(STATES.START);
  });

  quizSwapButton.addEventListener('click', () => {
    currentQuestion = generateQuestion();
    renderQuiz();
  });

  difficultyButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      difficulty = btn.dataset.difficulty;
      difficultyButtons.forEach((b) => b.classList.toggle('selected', b === btn));
    });
  });

  storeButton.addEventListener('click', () => {
    renderStore();
    setState(STATES.STORE);
  });

  storeCloseButton.addEventListener('click', () => {
    setState(STATES.START);
  });

  // ---------- Skin store ----------
  function renderStore() {
    storeBalanceEl.textContent = totalGems;
    skinGridEl.innerHTML = '';

    SKINS.forEach((skin) => {
      const owned = ownedSkins.includes(skin.id);
      const equipped = selectedSkinId === skin.id;

      const card = document.createElement('div');
      card.className = 'skin-card';

      const swatch = document.createElement('div');
      swatch.className = 'skin-swatch';
      swatch.style.background = skin.body;

      const name = document.createElement('div');
      name.className = 'skin-name';
      name.textContent = skin.name;

      const powerLine = document.createElement('div');
      powerLine.className = 'skin-power';
      powerLine.textContent = skin.powerLabel;

      const priceLine = document.createElement('div');
      priceLine.className = 'skin-price';
      priceLine.textContent = owned ? (equipped ? 'Equipped' : 'Owned') : `${skin.price} 💎`;

      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'skin-action-button';

      if (equipped) {
        actionBtn.textContent = 'Equipped';
        actionBtn.classList.add('equipped');
        actionBtn.disabled = true;
      } else if (owned) {
        actionBtn.textContent = 'Equip';
        actionBtn.addEventListener('click', () => {
          selectedSkinId = skin.id;
          localStorage.setItem(SELECTED_SKIN_KEY, selectedSkinId);
          renderStore();
        });
      } else {
        actionBtn.textContent = 'Buy';
        actionBtn.disabled = totalGems < skin.price;
        actionBtn.addEventListener('click', () => {
          if (totalGems < skin.price) return;
          totalGems -= skin.price;
          ownedSkins.push(skin.id);
          selectedSkinId = skin.id;
          localStorage.setItem(GEMS_KEY, String(totalGems));
          localStorage.setItem(OWNED_SKINS_KEY, JSON.stringify(ownedSkins));
          localStorage.setItem(SELECTED_SKIN_KEY, selectedSkinId);
          renderStore();
          updateHud();
        });
      }

      card.appendChild(swatch);
      card.appendChild(name);
      card.appendChild(powerLine);
      card.appendChild(priceLine);
      card.appendChild(actionBtn);
      skinGridEl.appendChild(card);
    });
  }

  // ---------- State machine ----------
  function setState(next) {
    state = next;
    startOverlay.classList.toggle('hidden', state !== STATES.START);
    quizOverlay.classList.toggle('hidden', state !== STATES.QUIZ);
    gameOverOverlay.classList.toggle('hidden', state !== STATES.GAME_OVER);
    storeOverlay.classList.toggle('hidden', state !== STATES.STORE);
  }

  // ---------- Game loop (fixed-step, frame-rate independent) ----------
  function frame(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const delta = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    if (state === STATES.PLAYING) {
      msSinceLastTick += delta;
      while (state === STATES.PLAYING && msSinceLastTick >= tickMs) {
        msSinceLastTick -= tickMs;
        step();
      }
    }

    draw();
    requestAnimationFrame(frame);
  }

  function step() {
    if (directionQueue.length) direction = directionQueue.shift();
    const head = snake[0];
    const nextHead = { x: head.x + direction.x, y: head.y + direction.y };
    const ateFood = nextHead.x === food.x && nextHead.y === food.y;

    // If we're not eating, the tail cell is about to be vacated, so moving
    // into it is a legal tight turn, not a collision.
    const bodyToCheck = ateFood ? snake : snake.slice(0, -1);

    if (
      nextHead.x < 0 || nextHead.x >= GRID_SIZE ||
      nextHead.y < 0 || nextHead.y >= GRID_SIZE ||
      bodyToCheck.some((seg) => seg.x === nextHead.x && seg.y === nextHead.y)
    ) {
      endGame();
      return;
    }

    snake.unshift(nextHead);

    if (ateFood) {
      cubesEaten += 1;
      score += BASE_POINTS_PER_BITE * currentMultiplier();
      totalGems += 1;
      localStorage.setItem(GEMS_KEY, String(totalGems));
      tickMs = Math.max(MIN_TICK_MS, tickMs - SPEEDUP_PER_BITE);
      placeFood();
      updateHud();

      if (cubesEaten > 0 && cubesEaten % QUIZ_EVERY_N_BITES === 0) {
        openQuiz();
        return; // don't pop the tail this tick; snake "holds" its new length
      }
    } else {
      snake.pop();
    }
  }

  function endGame() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
      newBestEl.classList.remove('hidden');
    } else {
      newBestEl.classList.add('hidden');
    }
    finalScoreEl.textContent = score;
    setState(STATES.GAME_OVER);
  }

  // ---------- Quiz flow ----------
  function openQuiz() {
    currentQuestion = generateQuestion();
    renderQuiz();
    setState(STATES.QUIZ);
  }

  function renderQuiz() {
    quizKickerEl.textContent = currentQuestion.subject === 'ela' ? 'Word Challenge!' : 'Math Challenge!';
    quizQuestionEl.textContent = currentQuestion.text;
    quizChoicesEl.innerHTML = '';
    currentQuestion.choices.forEach((choiceValue) => {
      const btn = document.createElement('button');
      btn.className = 'choice-button';
      btn.type = 'button';
      btn.textContent = choiceValue;
      btn.addEventListener('click', () => handleAnswer(choiceValue, btn));
      quizChoicesEl.appendChild(btn);
    });
  }

  function handleAnswer(chosenValue, chosenButton) {
    const buttons = Array.from(quizChoicesEl.querySelectorAll('.choice-button'));
    buttons.forEach((b) => (b.disabled = true));

    const isCorrect = chosenValue === currentQuestion.correct;
    if (isCorrect) {
      chosenButton.classList.add('correct');
      streak += 1;
      const shrinkAmount = streak % STREAK_BONUS_EVERY === 0 ? STREAK_BONUS_SHRINK : NORMAL_SHRINK;
      shrinkSnake(shrinkAmount);
      showFx('💪', streak % STREAK_BONUS_EVERY === 0 ? 'MEGA SMASH!' : 'SMASH!');
    } else {
      chosenButton.classList.add('wrong');
      buttons.forEach((b) => {
        if (b.textContent === String(currentQuestion.correct)) b.classList.add('correct');
      });
      streak = 0;
      growSnake(WRONG_ANSWER_GROWTH);
      showFx('🧙', 'Too bad!');
    }

    updateHud();

    setTimeout(() => {
      setState(STATES.PLAYING);
    }, 900);
  }

  // ---------- Skin power ----------
  function activateSkinPower() {
    const skin = SKINS.find((s) => s.id === selectedSkinId) || SKINS[0];
    if (!skin.power) return;
    shrinkSnake(skin.power);
    showFx('⚡', `${skin.name} Power! -${skin.power}`);
    updateHud();
  }

  function shrinkSnake(amount) {
    const removable = Math.max(0, snake.length - MIN_SNAKE_LENGTH);
    const toRemove = Math.min(amount, removable);
    for (let i = 0; i < toRemove; i++) snake.pop();
  }

  function growSnake(amount) {
    const tail = snake[snake.length - 1];
    for (let i = 0; i < amount; i++) snake.push({ x: tail.x, y: tail.y });
  }

  function showFx(emoji, text) {
    const burst = document.createElement('div');
    burst.className = 'fx-burst';
    burst.innerHTML = `<div class="fx-emoji">${emoji}</div><div class="fx-text">${text}</div>`;
    fxLayer.appendChild(burst);
    setTimeout(() => burst.remove(), 900);
  }

  // ---------- Rendering ----------
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawFood();
    drawSnake();
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 210, 63, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_PX, 0);
      ctx.lineTo(i * CELL_PX, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_PX);
      ctx.lineTo(canvas.width, i * CELL_PX);
      ctx.stroke();
    }
  }

  function drawFood() {
    const gem = GEM_COLORS[food.colorIndex] || GEM_COLORS[0];
    const cx = food.x * CELL_PX + CELL_PX / 2;
    const cy = food.y * CELL_PX + CELL_PX / 2;
    const r = CELL_PX * 0.4;

    ctx.save();
    ctx.translate(cx, cy);

    // Diamond-cut gem silhouette.
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.8, -r * 0.15);
    ctx.lineTo(r * 0.5, r * 0.85);
    ctx.lineTo(-r * 0.5, r * 0.85);
    ctx.lineTo(-r * 0.8, -r * 0.15);
    ctx.closePath();
    ctx.fillStyle = gem.fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Shine facet.
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.8, -r * 0.15);
    ctx.lineTo(0, r * 0.05);
    ctx.closePath();
    ctx.fillStyle = gem.shine;
    ctx.globalAlpha = 0.75;
    ctx.fill();

    ctx.restore();
  }

  function drawSnake() {
    const skin = SKINS.find((s) => s.id === selectedSkinId) || SKINS[0];
    snake.forEach((seg, i) => {
      const x = seg.x * CELL_PX;
      const y = seg.y * CELL_PX;
      const pad = 2;
      ctx.fillStyle = i === 0 ? skin.head : skin.body;
      roundRect(ctx, x + pad, y + pad, CELL_PX - pad * 2, CELL_PX - pad * 2, 5);
      ctx.fill();
      ctx.strokeStyle = '#6e1423';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  // ---------- Boot ----------
  setState(STATES.START);
  updateHud();
  requestAnimationFrame(frame);
})();
