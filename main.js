'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const W = 960, H = 600;
canvas.width = W;
canvas.height = H;

const FOV = Math.PI / 3;
const HALF_FOV = FOV / 2;
const RAYS = 120;
const COL_W = W / RAYS;
const MOVE_SPEED = 1.0;
const STRAFE_SPEED = 0.8;
const ROT_SPEED = 2.0;
const MOUSE_SENS = 0.002;
const FOG_START = 2.0;
const FOG_END = 8.0;
const CELLS_X = 20;
const CELLS_Y = 15;
const TOTAL_CELLS = CELLS_X * CELLS_Y;
const MAP_W = CELLS_X * 2 + 1;
const MAP_H = CELLS_Y * 2 + 1;
const MINIMAP_CELL = 4;
const MINIMAP_X = 4;
const MINIMAP_Y = 4;
const HORIZON = H >> 1;
const FOCAL = (H / 2) / Math.tan(HALF_FOV);

const DIR_N = 0, DIR_S = 1, DIR_E = 2, DIR_W = 3, DIR_NONE = 255;
let routeTable;

const CHK_COS = [1, 0.707, 0, -0.707, -1, -0.707, 0, 0.707];
const CHK_SIN = [0, 0.707, 1, 0.707, 0, -0.707, -1, -0.707];

let audioInit = false;
let audioCtx = null;

function initAudio() {
  if (audioInit) return;
  audioInit = true;
  loadInhale();
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const master = audioCtx.createGain();
    master.gain.value = 0.04;
    master.connect(audioCtx.destination);
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 160;
    filter.Q.value = 2.5;
    const freqs = [42, 52, 67];
    for (const f of freqs) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const g = audioCtx.createGain();
      g.gain.value = 0.25 / freqs.length;
      osc.connect(g);
      g.connect(filter);
      osc.start();
    }
    filter.connect(master);
    const loadBuf = (url, arr) => {
      fetch(url).then(r => r.arrayBuffer()).then(b => audioCtx.decodeAudioData(b).then(d => arr.push(d)).catch(()=>{}));
    };
    for (let i = 1; i <= 3; i++) {
      loadBuf('assets/audio/monster_seen' + i + '.mp3', seenBuffers);
      loadBuf('assets/audio/monster_roar' + i + '.mp3', roarBuffers);
    }
  } catch (_) {}
}

function playFootstep(vol, speed) {
  if (!audioCtx) return;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.08, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3) * 0.5;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const g = audioCtx.createGain();
  g.gain.value = Math.min(1, vol) * 0.5;
  const f = audioCtx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 300 + speed * 200;
  src.connect(f);
  f.connect(g);
  g.connect(audioCtx.destination);
  src.start();
}

function playPositionalSound(buf, vol) {
  if (!audioCtx || !buf) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const g = audioCtx.createGain();
  g.gain.value = Math.min(1, vol) * 0.4;
  const panner = audioCtx.createStereoPanner();
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  let a = Math.atan2(dy, dx) - player.dir;
  while (a < -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  panner.pan.value = Math.max(-1, Math.min(1, a / (Math.PI / 2)));
  src.connect(g);
  g.connect(panner);
  panner.connect(audioCtx.destination);
  src.start();
}


let inhaleAudio = null;
let exhaleLight = null;
let exhaleHorror = null;
let exhalePlaying = false;
let breathingAudio = null;
let sprintAudio = null;
let stopRunAudio = null;
let runAudio = null;
let walkDelay = 0;
let walkStep = 0;
let walkTimer = 0;
let walkLAudio = null;
let walkRAudio = null;
let monsterSeen = [];
let monsterRoar = [];
let seenBuffers = [];
let roarBuffers = [];

function loadInhale() {
  inhaleAudio = new Audio('assets/audio/inhalo_horror1.mp3');
  inhaleAudio.volume = 0.3;
  inhaleAudio.preload = 'auto';
  exhaleLight = new Audio('assets/audio/exhale_light.mp3');
  exhaleLight.volume = 0.4;
  exhaleLight.preload = 'auto';
  exhaleLight.addEventListener('ended', () => { exhalePlaying = false; });
  exhaleHorror = new Audio('assets/audio/exhale_horror1.mp3');
  exhaleHorror.volume = 0.5;
  exhaleHorror.preload = 'auto';
  exhaleHorror.addEventListener('ended', () => { exhalePlaying = false; });
  breathingAudio = new Audio('assets/audio/breathing1.mp3');
  breathingAudio.volume = 0.30;
  breathingAudio.loop = true;
  breathingAudio.preload = 'auto';
  sprintAudio = new Audio('assets/audio/sprint1.mp3');
  sprintAudio.volume = 0.4;
  sprintAudio.loop = true;
  sprintAudio.preload = 'auto';
  stopRunAudio = new Audio('assets/audio/stop_run1.mp3');
  stopRunAudio.volume = 0.3;
  stopRunAudio.preload = 'auto';
  for (let i = 1; i <= 3; i++) {
    const a = new Audio('assets/audio/monster_seen' + i + '.mp3');
    a.preload = 'auto';
    monsterSeen.push(a);
  }
  for (let i = 1; i <= 3; i++) {
    const a = new Audio('assets/audio/monster_roar' + i + '.mp3');
    a.preload = 'auto';
    monsterRoar.push(a);
  }
  walkLAudio = new Audio('assets/audio/walkl.mp3');
  walkLAudio.volume = 0.3;
  walkLAudio.preload = 'auto';
  walkRAudio = new Audio('assets/audio/walkr.mp3');
  walkRAudio.volume = 0.3;
  walkRAudio.preload = 'auto';
  runAudio = new Audio('assets/audio/running1.mp3');
  runAudio.loop = true;
  runAudio.volume = 0.4;
  runAudio.preload = 'auto';
}

function playInhale() {
  if (inhaleAudio) {
    inhaleAudio.currentTime = 0;
    inhaleAudio.play().catch(() => {});
  }
}

function playExhale(horror) {
  const a = horror ? exhaleHorror : exhaleLight;
  if (a) {
    exhalePlaying = true;
    a.currentTime = 0;
    a.play().catch(() => { exhalePlaying = false; });
  }
}

let maze;
let revealed = [];
let revealRadius = 1;
let navCells = [];
let navIndex = [];
let NAV_N = 0;

function generateMaze() {
  maze = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(1));
  maze[1][1] = 0;
  const visited = Array.from({ length: CELLS_Y }, () => Array(CELLS_X).fill(false));
  const stack = [{ x: 0, y: 0 }];
  visited[0][0] = true;
  const dirs = [
    { dx: 0, dy: -1, wx: 0, wy: -1 },
    { dx: 1, dy: 0,  wx: 1, wy: 0 },
    { dx: 0, dy: 1,  wx: 0, wy: 1 },
    { dx: -1, dy: 0, wx: -1, wy: 0 },
  ];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const neigh = [];
    for (const d of dirs) {
      const nx = cur.x + d.dx;
      const ny = cur.y + d.dy;
      if (nx >= 0 && nx < CELLS_X && ny >= 0 && ny < CELLS_Y && !visited[ny][nx]) {
        neigh.push({ x: nx, y: ny, wx: d.wx, wy: d.wy });
      }
    }
    if (neigh.length) {
      const next = neigh[Math.random() * neigh.length | 0];
      visited[next.y][next.x] = true;
      maze[cur.y * 2 + 1 + next.wy][cur.x * 2 + 1 + next.wx] = 0;
      maze[next.y * 2 + 1][next.x * 2 + 1] = 0;
      stack.push({ x: next.x, y: next.y });
    } else {
      stack.pop();
    }
  }
  maze[CELLS_Y * 2 - 1][CELLS_X * 2 - 1] = 2;
}

function spawnEnemy() {
  const cells = [];
  for (let y = 1; y < MAP_H; y += 2) {
    for (let x = 1; x < MAP_W; x += 2) {
      if (maze[y][x] === 0) cells.push({ x, y });
    }
  }
  const close = cells.reduce((a, b) => {
    const da = Math.abs(Math.hypot(a.x - 1.5, a.y - 1.5) - 10);
    const db = Math.abs(Math.hypot(b.x - 1.5, b.y - 1.5) - 10);
    return da < db ? a : b;
  });
  enemy.x = close.x + 0.5;
  enemy.y = close.y + 0.5;
}

function spawnTestItems() {
  items = [];
  const types = ['key_exit', 'key_fake1', 'key_fake2', 'battery', 'map_piece'];
  for (let i = 0; i < types.length; i++) {
    const a = Math.random() * Math.PI * 2;
    const dist = 2 + Math.random() * 3;
    let x = player.x + Math.cos(a) * dist;
    let y = player.y + Math.sin(a) * dist;
    if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H && !isWall(x, y)) {
      items.push({ x, y, type: types[i], collected: false });
    }
  }
}

function hasLineOfSight(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.3) return true;
  const steps = Math.ceil(dist * 6);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    if (isWall(cx, cy)) return false;
  }
  return true;
}

function buildNavGrid() {
  navIndex = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(-1));
  navCells = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (maze[y][x] === 0 || maze[y][x] === 2) {
        navIndex[y][x] = navCells.length;
        navCells.push({ x, y });
      }
    }
  }
  NAV_N = navCells.length;
  revealed = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
}

function toCell(v) { return Math.floor(v); }

function cellNeighbors(x, y) {
  const n = [];
  if (x + 1 < MAP_W && (maze[y][x+1] === 0 || maze[y][x+1] === 2)) n.push({ x: x+1, y });
  if (x - 1 >= 0 && (maze[y][x-1] === 0 || maze[y][x-1] === 2)) n.push({ x: x-1, y });
  if (y + 1 < MAP_H && (maze[y+1][x] === 0 || maze[y+1][x] === 2)) n.push({ x, y: y+1 });
  if (y - 1 >= 0 && (maze[y-1][x] === 0 || maze[y-1][x] === 2)) n.push({ x, y: y-1 });
  return n;
}

function buildRouteTable() {
  routeTable = new Uint8Array(NAV_N * NAV_N);
  routeTable.fill(DIR_NONE);
  for (let si = 0; si < NAV_N; si++) {
    const sc = navCells[si];
    const visited = new Array(NAV_N).fill(false);
    const q = [sc];
    visited[si] = true;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const curIdx = navIndex[cur.y][cur.x];
      for (const nb of cellNeighbors(cur.x, cur.y)) {
        const nbIdx = navIndex[nb.y][nb.x];
        if (visited[nbIdx]) continue;
        visited[nbIdx] = true;
        if (curIdx === si) {
          routeTable[si * NAV_N + nbIdx] = nb.x > cur.x ? DIR_E : nb.x < cur.x ? DIR_W : nb.y > cur.y ? DIR_S : DIR_N;
        } else {
          routeTable[si * NAV_N + nbIdx] = routeTable[si * NAV_N + curIdx];
        }
        q.push(nb);
      }
    }
  }
}

const enemy = {
  x: 0, y: 0, dir: 0,
  state: 'patrol',
  stepT: 0, stepI: 0.8,
  huntT: 0,
  speed: 0.7,
  patrolTarget: null,
  patrolWait: 0,
  targetCell: null,
  stuckTimer: 0,
  cellTimer: 0,
  roarTimer: 15 + Math.random() * 45,
  prevDist: undefined,
  pidIntegral: 0,
  pidPrevError: 0,
  routeDir: 0,
};
let gameOver = false;
let gameOverTime = 0;
let debug = false;
let footprints = [];
let dust = [];
let items = [];
let inventory = { keys: 0, batteries: 0, maps: 0 };

const player = {
  x: 1.5, y: 1.5, dir: 0, pitch: 0,
  won: false, winTime: 0,
};

const stamina = { cur: 100, max: 100 };
let staminaAlpha = 0;
let lampOn = true;
let lampMult = 1;
let lampFlickerTimer = 0;
let lampFlickerCooldown = 0;
let isSprinting = false;
let isHoldingBreath = false;
let wasHoldingBreath = false;
let staminaCD = false;
let handAnim = 0;
let shakeX = 0, shakeY = 0;
let gameState = 'menu';

const keys = {};
let mouseLocked = false;
let ignoreNextMove = false;

const handImg = new Image();
handImg.src = 'assets/images/hand_horror_2.png';
const clawImg = new Image();
clawImg.src = 'assets/images/claw3.png';

const handCanvas = document.createElement('canvas');
handCanvas.width = W;
handCanvas.height = H;
const hCtx = handCanvas.getContext('2d');

document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') e.preventDefault();
  if (e.key === '0') { debug = !debug; keys['0'] = false; }
});
document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

document.addEventListener('pointerlockchange', () => {
  mouseLocked = document.pointerLockElement === canvas;
  canvas.style.cursor = mouseLocked ? 'none' : 'default';
  if (!mouseLocked && gameState === 'playing') gameState = 'paused';
  if (mouseLocked && gameState === 'paused') gameState = 'playing';
});

document.addEventListener('mousemove', (e) => {
  if (ignoreNextMove) { ignoreNextMove = false; return; }
  if (mouseLocked && gameState === 'playing') {
    player.dir += Math.max(-100, Math.min(100, e.movementX)) * MOUSE_SENS;
    player.pitch = Math.max(-120, Math.min(120, player.pitch - Math.max(-100, Math.min(100, e.movementY)) * 0.3));
  }
});

let touchX = null;
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  touchX = e.touches[0].clientX;
  initAudio();
});
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (touchX !== null) {
    player.dir += (e.touches[0].clientX - touchX) * MOUSE_SENS * 2;
    touchX = e.touches[0].clientX;
  }
});
canvas.addEventListener('touchend', () => { touchX = null; });

function isWall(x, y) {
  const mx = x | 0, my = y | 0;
  if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return true;
  return maze[my][mx] === 1;
}

function isExit(x, y) {
  const mx = x | 0, my = y | 0;
  if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return false;
  return maze[my][mx] === 2;
}

let moveT = 0;

function updateEnemy(dt) {
  if (gameOver || player.won) return;
  const prevX = enemy.x, prevY = enemy.y;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  const los = hasLineOfSight(enemy.x, enemy.y, player.x, player.y);
  const noise = lampOn && dist < 10 || dist < 2.5;
  const pCx = toCell(player.x), pCy = toCell(player.y);
  if (isHoldingBreath) {
    if (enemy.state === 'hunt') {
      enemy.state = 'patrol';
      enemy.huntT = 0;
      enemy.patrolTarget = null;
      enemy.patrolWait = 0;
      enemy.targetCell = null;
      enemy.cellTimer = 0;
      enemy.stuckTimer = 0;
      enemy.roarTimer = 15 + Math.random() * 45;
    }
  } else if (isSprinting && dist < 10) {
    enemy.patrolTarget = { x: pCx, y: pCy };
    enemy.patrolWait = 0;
    enemy.targetCell = null;
    enemy.cellTimer = 0;
  } else if (noise && los) {
    const wasHunt = enemy.state === 'hunt';
    enemy.state = 'hunt';
    enemy.huntT = 5;
    if (!wasHunt) {
      const vol = Math.max(0, 1 - dist / 12);
      if (seenBuffers.length) {
        const buf = seenBuffers[Math.random() * seenBuffers.length | 0];
        playPositionalSound(buf, vol);
      } else if (monsterSeen.length) {
        const a = monsterSeen[Math.random() * monsterSeen.length | 0];
        a.currentTime = 0;
        a.volume = vol * 0.5;
        a.play().catch(() => {});
      }
    }
  } else {
    if (enemy.huntT > 0) enemy.huntT -= dt;
    if (enemy.huntT <= 0) {
      if (enemy.state === 'hunt') {
        enemy.patrolTarget = null;
        enemy.patrolWait = 0;
        enemy.targetCell = null;
        enemy.cellTimer = 0;
        enemy.stuckTimer = 0;
        enemy.roarTimer = 15 + Math.random() * 45;
      }
    }
  }

  const spd = enemy.speed * dt;
  let moved = false;

  // PID: mide distancia a paredes L/R perpendiculares a una dirección dada
  function measureWallDist(angle, maxDist = 2) {
    const step = 0.05;
    let x = enemy.x, y = enemy.y;
    for (let d = 0; d < maxDist; d += step) {
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      if (isWall(x, y)) return d;
    }
    return maxDist;
  }

  function getCenteringAngle(corridorDir) {
    const leftAngle = corridorDir - Math.PI / 2;
    const rightAngle = corridorDir + Math.PI / 2;
    let distL = measureWallDist(leftAngle);
    let distR = measureWallDist(rightAngle);
    if (distL < 0.3 || distR < 0.3) return 0;
    const error = distR - distL;
    const Kp = 0.6, Ki = 0.01, Kd = 0.1;
    enemy.pidIntegral = (enemy.pidIntegral || 0) + error * dt;
    enemy.pidIntegral = Math.max(-0.5, Math.min(0.5, enemy.pidIntegral));
    const d = (error - (enemy.pidPrevError || 0)) / Math.max(dt, 0.001);
    enemy.pidPrevError = error;
    return Math.max(-0.3, Math.min(0.3, Kp * error + Ki * enemy.pidIntegral + Kd * d));
  }

  function eCan(x, y) {
    const r = 0.2;
    for (let i = 0; i < 8; i++) {
      if (isWall(x + CHK_COS[i] * r, y + CHK_SIN[i] * r)) return false;
    }
    return true;
  }

  function tryMove(angle) {
    const nx = enemy.x + Math.cos(angle) * spd;
    const ny = enemy.y + Math.sin(angle) * spd;
    if (eCan(nx, ny)) { enemy.x = nx; enemy.y = ny; enemy.dir = angle; return true; }
    const sx = enemy.x + Math.cos(angle) * spd;
    if (eCan(sx, enemy.y)) { enemy.x = sx; enemy.dir = angle; return true; }
    const sy = enemy.y + Math.sin(angle) * spd;
    if (eCan(enemy.x, sy)) { enemy.y = sy; enemy.dir = angle; return true; }
    return false;
  }

  function navigateTo(tgx, tgy) {
    const ecx = toCell(enemy.x), ecy = toCell(enemy.y);
    if (ecx === tgx && ecy === tgy) { enemy.targetCell = null; return true; }
    if (!enemy.targetCell || (ecx === enemy.targetCell.x && ecy === enemy.targetCell.y)) {
      const idx = navIndex[ecy][ecx];
      const tIdx = navIndex[tgy][tgx];
      if (idx < 0 || tIdx < 0) return false;
      const dir = routeTable[idx * NAV_N + tIdx];
      if (dir === DIR_NONE) return false;
      enemy.routeDir = dir;
      let nx = ecx, ny = ecy;
      if (dir === DIR_E) nx++;
      else if (dir === DIR_W) nx--;
      else if (dir === DIR_S) ny++;
      else ny--;
      enemy.targetCell = { x: nx, y: ny };
      enemy.prevDist = undefined;
    }
    const cx = enemy.targetCell.x + 0.5;
    const cy = enemy.targetCell.y + 0.5;
    const angle = Math.atan2(cy - enemy.y, cx - enemy.x);
    const corridorAngle = enemy.routeDir === DIR_E || enemy.routeDir === DIR_W ? 0 : Math.PI / 2;
    const correction = getCenteringAngle(corridorAngle);
    const finalAngle = angle + correction;
    if (!tryMove(finalAngle)) {
      const perp = angle + Math.PI / 2;
      if (!tryMove(perp)) tryMove(perp - Math.PI);
    }
    return false;
  }

  if (enemy.state === 'hunt') {
    enemy.speed = 1.0;
    enemy.stepI = 0.35;
    const eCx = toCell(enemy.x), eCy = toCell(enemy.y);

    if (los) {
      const a = Math.atan2(dy, dx);
      const corr = getCenteringAngle(a);
      tryMove(a + corr);
    } else {
      const eIdx = navIndex[eCy][eCx];
      const pIdx = navIndex[pCy][pCx];
      if (eIdx !== pIdx) {
        const dir = routeTable[eIdx * NAV_N + pIdx];
        if (dir !== DIR_NONE) {
          if (!enemy.targetCell || (eCx === enemy.targetCell.x && eCy === enemy.targetCell.y)) {
            enemy.routeDir = dir;
            let nx = eCx, ny = eCy;
            if (dir === DIR_E) nx++;
            else if (dir === DIR_W) nx--;
            else if (dir === DIR_S) ny++;
            else ny--;
            enemy.targetCell = { x: nx, y: ny };
            enemy.prevDist = undefined;
          }
          if (enemy.targetCell) {
            const cx = enemy.targetCell.x + 0.5;
            const cy = enemy.targetCell.y + 0.5;
            const angle = Math.atan2(cy - enemy.y, cx - enemy.x);
            const corridorAngle = enemy.routeDir === DIR_E || enemy.routeDir === DIR_W ? 0 : Math.PI / 2;
            const correction = getCenteringAngle(corridorAngle);
            const finalAngle = angle + correction;
            if (!tryMove(finalAngle)) {
              const perp = angle + Math.PI / 2;
              if (!tryMove(perp)) tryMove(perp - Math.PI);
            }
          }
        } else {
          tryMove(Math.atan2(dy, dx));
        }
      } else {
        tryMove(Math.atan2(dy, dx));
      }
    }
    if (dist < 0.4) { gameOver = true; gameOverTime = performance.now(); }
  } else {
    enemy.speed = 1.2;
    enemy.stepI = 0.5;

    if (enemy.patrolWait > 0) {
      enemy.patrolWait -= dt;
    } else {
      const ecx = toCell(enemy.x), ecy = toCell(enemy.y);
      if (!enemy.patrolTarget) {
        const avail = [];
        for (const c of navCells) {
          if (c.x !== ecx || c.y !== ecy) avail.push(c);
        }
        if (avail.length > 0) {
          let best;
          let bestScore = Infinity;
          for (const c of avail) {
            const md = Math.abs(c.x - ecx) + Math.abs(c.y - ecy);
            if (md > 5 && md + Math.random() < bestScore) {
              bestScore = md + Math.random();
              best = c;
            }
          }
          if (!best) {
            for (const c of avail) {
              const md = Math.abs(c.x - ecx) + Math.abs(c.y - ecy);
              if (md > 0 && md + Math.random() < (bestScore === Infinity ? Infinity : bestScore)) {
                bestScore = md + Math.random();
                best = c;
              }
            }
          }
          if (best) {
            enemy.patrolTarget = best;
          }
        }
      }
      if (enemy.patrolTarget) {
        if (toCell(enemy.x) === enemy.patrolTarget.x && toCell(enemy.y) === enemy.patrolTarget.y) {
          enemy.patrolTarget = null;
          enemy.patrolWait = 1.5 + Math.random();
          enemy.targetCell = null;
          enemy.cellTimer = 0;
        } else {
          navigateTo(enemy.patrolTarget.x, enemy.patrolTarget.y);
        }
      }
    }
  }

  if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < 0.4) {
    gameOver = true;
    gameOverTime = performance.now();
  }

  enemy.stepT += dt;
  if (enemy.stepT >= enemy.stepI) {
    enemy.stepT = 0;
    footprints.push({ x: enemy.x, y: enemy.y, dir: enemy.dir, life: 10 });
    const eDist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (eDist < 12) {
      const vol = Math.max(0, 1 - eDist / 12);
      playFootstep(vol, enemy.speed);
    }
  }

  for (let i = footprints.length - 1; i >= 0; i--) {
    footprints[i].life -= dt;
    if (footprints[i].life <= 0) footprints.splice(i, 1);
  }

  if (lampOn && Math.random() < 0.2 && dust.length < 30) {
    const a = player.dir - HALF_FOV + Math.random() * FOV;
    const r = 0.5 + Math.random() * 3;
    dust.push({
      x: player.x + Math.cos(a) * r,
      y: player.y + Math.sin(a) * r,
      z: Math.random(),
      vx: (Math.random() - 0.5) * 0.1,
      vy: (Math.random() - 0.5) * 0.1,
      vz: -0.1 - Math.random() * 0.2,
      life: 2 + Math.random() * 2,
    });
  }
  for (let i = dust.length - 1; i >= 0; i--) {
    const p = dust[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.life -= dt;
    if (p.life <= 0 || p.z < -2) dust.splice(i, 1);
  }

  if (enemy.targetCell) {
    const dcx = enemy.targetCell.x + 0.5;
    const dcy = enemy.targetCell.y + 0.5;
    const d = Math.hypot(enemy.x - dcx, enemy.y - dcy);
    if (enemy.prevDist !== undefined && d >= enemy.prevDist - 0.01) {
      enemy.cellTimer += dt;
    } else {
      enemy.cellTimer = 0;
    }
    enemy.prevDist = d;
  }
  if (enemy.cellTimer > 5 && !enemy.patrolWait) {
    enemy.patrolTarget = null;
    enemy.targetCell = null;
    enemy.cellTimer = 0;
    enemy.stuckTimer = 1;
  }
  enemy.stuckTimer = enemy.cellTimer > 5 ? 1 : 0;

  if (enemy.state !== 'hunt') {
    enemy.roarTimer -= dt;
    if (enemy.roarTimer <= 0) {
      enemy.roarTimer = 15 + Math.random() * 45;
      const vol = Math.max(0, 1 - dist / 12);
      if (roarBuffers.length) {
        const buf = roarBuffers[Math.random() * roarBuffers.length | 0];
        playPositionalSound(buf, vol);
      } else if (monsterRoar.length) {
        const a = monsterRoar[Math.random() * monsterRoar.length | 0];
        a.currentTime = 0;
        a.volume = vol * 0.4;
        a.play().catch(() => {});
      }
    }
  }
}

function update(dt) {
  try {
  if (breathingAudio) {
    if (breathingAudio.paused) {
      if (gameState === 'playing' && !isHoldingBreath && !exhalePlaying && !isSprinting && !(stopRunAudio && !stopRunAudio.paused) && !gameOver && !player.won) {
        breathingAudio.play().catch(() => {});
      }
    } else {
      if (gameState !== 'playing' || isHoldingBreath || isSprinting || (stopRunAudio && !stopRunAudio.paused) || gameOver || player.won) {
        breathingAudio.pause();
      }
    }
  }
  if (sprintAudio) {
    const shouldSprint = gameState === 'playing' && isSprinting && !gameOver && !player.won;
    if (shouldSprint && sprintAudio.paused) {
      if (stopRunAudio && !stopRunAudio.paused) { stopRunAudio.pause(); stopRunAudio.currentTime = 0; }
      if (breathingAudio && !breathingAudio.paused) breathingAudio.pause();
      sprintAudio.play().catch(() => {});
      if (runAudio) { runAudio.currentTime = 0; runAudio.play().catch(() => {}); }
    } else if (!shouldSprint && !sprintAudio.paused) {
      sprintAudio.pause();
      sprintAudio.currentTime = 0;
      if (runAudio) { runAudio.pause(); runAudio.currentTime = 0; }
      walkDelay = 0.5;
    }
  }
  if (gameState !== 'playing') return;
  if (gameOver || player.won) return;
  const sin = Math.sin(player.dir);
  const cos = Math.cos(player.dir);
  isHoldingBreath = keys['c'] && !staminaCD && stamina.cur > 0 && !exhalePlaying;
  if (isHoldingBreath && !wasHoldingBreath) {
    if (stopRunAudio && !stopRunAudio.paused) { stopRunAudio.pause(); stopRunAudio.currentTime = 0; }
    if (sprintAudio && !sprintAudio.paused) { sprintAudio.pause(); sprintAudio.currentTime = 0; }
    playInhale();
  }
  if (isHoldingBreath) {
    stamina.cur = Math.max(0, stamina.cur - 18 * dt);
    if (stamina.cur <= 0) { isHoldingBreath = false; staminaCD = true; }
  }
  if (wasHoldingBreath && !isHoldingBreath && !exhalePlaying) playExhale(stamina.cur <= 0);
  wasHoldingBreath = isHoldingBreath;
  let mx = 0, my = 0;
  if (!isHoldingBreath) {
    if (keys['w'] || keys['arrowup'])    { mx += cos; my += sin; }
    if (keys['s'] || keys['arrowdown'])  { mx -= cos; my -= sin; }
    if (keys['a'] || keys['arrowleft'])  { mx += sin; my -= cos; }
    if (keys['d'] || keys['arrowright']) { mx -= sin; my += cos; }
  }
  if (keys['q']) { keys['q'] = false; lampOn = !lampOn; }
  if (lampOn) {
    if (lampFlickerTimer > 0) {
      lampFlickerTimer -= dt;
      lampMult = 0.15 + Math.random() * 0.2;
    } else {
      lampMult += (1 - lampMult) * 5 * dt;
      if (lampMult > 0.99) lampMult = 1;
      if (lampFlickerCooldown > 0) {
        lampFlickerCooldown -= dt;
      } else {
        lampFlickerTimer = 0.04 + Math.random() * 0.1;
        lampFlickerCooldown = 1 + Math.random() * 3;
      }
    }
  } else {
    lampMult = 1;
    lampFlickerTimer = 0;
    lampFlickerCooldown = 0;
  }
  player.dir %= Math.PI * 2;
  if (player.dir < 0) player.dir += Math.PI * 2;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const moving = mx !== 0 || my !== 0;

  isSprinting = moving && keys['shift'] && stamina.cur > 0 && !staminaCD;
  const sprintMul = isSprinting ? 2.4 : 1;
  if (isSprinting) {
    stamina.cur = Math.max(0, stamina.cur - 35 * dt);
    if (stamina.cur <= 0) {
      staminaCD = true;
      walkDelay = 0.5;
      if (stopRunAudio) { stopRunAudio.currentTime = 0; stopRunAudio.play().catch(() => {}); }
    }
  } else if (!isHoldingBreath) {
    stamina.cur = Math.min(stamina.max, stamina.cur + 25 * dt);
  }

  if (!isSprinting && !isHoldingBreath) staminaCD = staminaCD && stamina.cur < stamina.max / 2;

  handAnim += (isHoldingBreath ? 1 : -1) * 4 * dt;
  if (handAnim < 0) handAnim = 0;
  if (handAnim > 1) handAnim = 1;

  const targetAlpha = stamina.cur < stamina.max ? 1 : 0;
  staminaAlpha += (targetAlpha - staminaAlpha) * 4 * dt;

  const speed = MOVE_SPEED * sprintMul;
  const dx = mx * speed * dt;
  const dy = my * speed * dt;

  const moveD = Math.hypot(dx, dy);
  if (moving) {
    moveT += moveD * (isSprinting ? 10 : 6);
  } else {
    moveT *= 0.9;
  }

  if (isSprinting) {
    shakeX = (Math.random() - 0.5) * 2.5;
    shakeY = (Math.random() - 0.5) * 2.5;
  } else {
    shakeX *= 0.85;
    shakeY *= 0.85;
  }

  function canMove(x, y, r) {
    r = r || 0.2;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      if (isWall(x + Math.cos(a) * r, y + Math.sin(a) * r)) return false;
    }
    return true;
  }

  const nx = player.x + dx;
  const ny = player.y + dy;
  if (canMove(nx, ny)) { player.x = nx; player.y = ny; }
  else if (canMove(nx, player.y)) { player.x = nx; }
  else if (canMove(player.x, ny)) { player.y = ny; }
  if (isExit(player.x, player.y) && !player.won) {
    player.won = true;
    player.winTime = performance.now();
  }

  if (moving && !isSprinting) {
    if (walkDelay > 0) {
      walkDelay -= dt;
    } else {
      walkTimer += dt;
      const interval = (walkStep % 2 === 0) ? 0.32 : 0.68;
      if (walkTimer >= interval) {
        walkTimer = 0;
        const a = (walkStep % 2 === 0) ? walkLAudio : walkRAudio;
        walkStep++;
        if (a && a.paused) { a.currentTime = 0; a.play().catch(() => {}); }
      }
    }
  }

  const px = player.x | 0, py = player.y | 0;
  for (let dy = -revealRadius; dy <= revealRadius; dy++) {
    for (let dx = -revealRadius; dx <= revealRadius; dx++) {
      if (dx * dx + dy * dy <= revealRadius * revealRadius) {
        const rx = px + dx, ry = py + dy;
        if (rx >= 0 && rx < MAP_W && ry >= 0 && ry < MAP_H) revealed[ry][rx] = true;
      }
    }
  }

  for (const item of items) {
    if (item.collected) continue;
    const d = Math.hypot(player.x - item.x, player.y - item.y);
    if (d < 0.5) {
      item.collected = true;
      if (item.type === 'key_exit' || item.type === 'key_fake1' || item.type === 'key_fake2') inventory.keys++;
      else if (item.type === 'battery') inventory.batteries++;
      else if (item.type === 'map_piece') inventory.maps++;
    }
  }

  try{updateEnemy(dt)}catch(e){console.error('updateEnemy:',e)}
  }catch(e){console.error('update:',e)}
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function edgeDither(g, w, h) {
  const id = g.getImageData(0, 0, w, h);
  const d = id.data;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const iL = (y * w + x - 1) * 4;
      const iR = (y * w + x + 1) * 4;
      const iU = ((y - 1) * w + x) * 4;
      const iD = ((y + 1) * w + x) * 4;
      let edge = 0;
      for (let c = 0; c < 3; c++) {
        const l = Math.abs(d[i + c] - d[iL + c]);
        const r = Math.abs(d[i + c] - d[iR + c]);
        const u = Math.abs(d[i + c] - d[iU + c]);
        const dd = Math.abs(d[i + c] - d[iD + c]);
        edge += l + r + u + dd;
      }
      if (edge > 20) {
        const b = BAYER[y & 3][x & 3];
        d[i]     = Math.max(0, Math.min(255, d[i]     + b - 7));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + b - 7));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + b - 7));
      }
    }
  }
  g.putImageData(id, 0, 0);
}

let pDir = 0;

function renderFootprints(hz) {
  const pH = 0.5;
  for (const fp of footprints) {
    const dx = fp.x - player.x;
    const dy = fp.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) continue;
    const angle = Math.atan2(dy, dx);
    let rel = angle - pDir;
    while (rel < -Math.PI) rel += Math.PI * 2;
    while (rel > Math.PI) rel -= Math.PI * 2;
    if (Math.abs(rel) > HALF_FOV + 0.1) continue;
    if (!hasLineOfSight(player.x, player.y, fp.x, fp.y)) continue;

    const screenX = (rel / HALF_FOV + 1) / 2 * W;
    const floorY = hz + (pH * FOCAL) / dist;
    if (floorY > H) continue;

    const size = Math.max(4, 24 / dist);
    const alpha = (fp.life / 10) * (lampOn ? 0.7 : 0.12);
    if (alpha < 0.01) continue;

    if (clawImg.complete && clawImg.naturalWidth > 0) {
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(screenX, floorY);
      ctx.transform(size / 12, 0, 0, size / 24, 0, 0);
      const dir = fp.dir || 0;
      ctx.rotate(dir - pDir);
      ctx.drawImage(clawImg, -12, -12, 24, 24);
      ctx.restore();
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.ellipse(screenX, floorY, size, size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function renderItems(hz) {
  const pH = 0.5;
  for (const item of items) {
    if (item.collected) continue;
    const dx = item.x - player.x;
    const dy = item.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.3 || dist > 8) continue;
    const angle = Math.atan2(dy, dx);
    let rel = angle - pDir;
    while (rel < -Math.PI) rel += Math.PI * 2;
    while (rel > Math.PI) rel -= Math.PI * 2;
    if (Math.abs(rel) > HALF_FOV + 0.1) continue;
    if (!hasLineOfSight(player.x, player.y, item.x, item.y)) continue;
    const screenX = (rel / HALF_FOV + 1) / 2 * W;
    const floorY = hz + (pH * FOCAL) / dist;
    const h = Math.max(4, 30 / dist);
    const topY = floorY - h;
    if (topY < 0 || floorY > H) continue;
    const alpha = Math.min(1, 1 - dist / 8);
    ctx.globalAlpha = alpha;
    const cx = screenX, cy = topY + h / 2;
    const s = h * 0.5;
    ctx.fillStyle = item.type.startsWith('key') ? '#fd0' : item.type === 'battery' ? '#0d0' : item.type === 'map_piece' ? '#f80' : '#f44';
    ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
    if (item.type.startsWith('key')) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - s * 0.1, cy - s, s * 0.2, s * 0.8);
    } else if (item.type === 'battery') {
      ctx.fillStyle = '#afa';
      ctx.fillRect(cx + s * 0.3, cy - s * 0.6, s * 0.2, s * 0.4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx + s * 0.3, cy + s * 0.2, s * 0.2, s * 0.4);
      ctx.fillStyle = '#888';
      ctx.fillRect(cx - s * 0.3, cy - s * 0.3, s * 0.6, s * 0.6);
    } else if (item.type === 'map_piece') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - s * 0.4, cy - s * 0.4, s * 0.8, s * 0.8);
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.4);
      ctx.lineTo(cx + s * 0.2, cy);
      ctx.lineTo(cx, cy + s * 0.4);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}


function renderDust(hz) {
  if (!lampOn) return;
  const pH = 0.5;
  for (const p of dust) {
    const dx = p.x - player.x;
    const dy = p.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.3 || dist > 5) continue;
    const angle = Math.atan2(dy, dx);
    let rel = angle - pDir;
    while (rel < -Math.PI) rel += Math.PI * 2;
    while (rel > Math.PI) rel -= Math.PI * 2;
    if (Math.abs(rel) > HALF_FOV + 0.05) continue;

    const screenX = (rel / HALF_FOV + 1) / 2 * W;
    const floorY = hz + (pH * FOCAL) / dist;
    const vert = (p.z + 0.5) * 12;
    const screenY = floorY - vert;
    if (screenY < 0 || screenY > H) continue;

    const size = Math.max(1, 4 / dist);
    const alpha = Math.min(1, p.life) * 0.3;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(200,200,190,0.5)';
    ctx.beginPath();
    ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawButton(ctx, x, y, w, h, text) {
  ctx.fillStyle = '#822';
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, 4); }
  else { ctx.rect(x, y, w, h); }
  ctx.fill();
  ctx.strokeStyle = '#c44';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, 4); }
  else { ctx.rect(x, y, w, h); }
  ctx.stroke();
  ctx.fillStyle = '#eee';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y + h / 2 + 7);
}

function render(time) {
  const t = time * 0.001;

  let wobbleX = Math.sin(t * 1.3) * 0.008 + shakeX * 0.004;
  let wobbleY = Math.cos(t * 1.7) * 0.008 + shakeY * 0.004;
  let wobbleA = 0;
  if (isHoldingBreath) {
    wobbleX *= 0.08;
    wobbleY *= 0.08;
  }
  const px = player.x + wobbleX;
  const py = player.y + wobbleY;
  pDir = player.dir + wobbleA;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const hz = (HORIZON + player.pitch) | 0;
  let bob = Math.sin(moveT * 0.8) * 0.8;
  if (isHoldingBreath) bob *= 0.1;

  for (let i = 0; i < RAYS; i++) {
    const rayAngle = pDir - HALF_FOV + (i / RAYS) * FOV;
    const sinR = Math.sin(rayAngle);
    const cosR = Math.cos(rayAngle);

    let mapX = px | 0;
    let mapY = py | 0;

    const deltaX = cosR === 0 ? 1e30 : Math.abs(1 / cosR);
    const deltaY = sinR === 0 ? 1e30 : Math.abs(1 / sinR);

    let stepX, stepY, sideX, sideY;
    if (cosR < 0) { stepX = -1; sideX = (px - mapX) * deltaX; }
    else { stepX = 1; sideX = (mapX + 1 - px) * deltaX; }
    if (sinR < 0) { stepY = -1; sideY = (py - mapY) * deltaY; }
    else { stepY = 1; sideY = (mapY + 1 - py) * deltaY; }

    let hit = false, side = 0, maxStep = 64;
    while (!hit && maxStep--) {
      if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
      else { sideY += deltaY; mapY += stepY; side = 1; }
      if (mapX < 0 || mapX >= MAP_W || mapY < 0 || mapY >= MAP_H) break;
      if (maze[mapY][mapX] > 0) hit = true;
    }

    let perpDist = 0;
    if (hit) {
      if (side === 0) perpDist = (mapX - px + (1 - stepX) / 2) / cosR;
      else perpDist = (mapY - py + (1 - stepY) / 2) / sinR;
      if (perpDist <= 0) continue;
    }

    let wallBr, ceilBr, floorBr;
    if (lampOn) {
      const d = hit ? perpDist : 6;
      const b = Math.max(0.04, 1 / (1 + d * 0.5 + d * d * 0.2)) * lampMult;
      wallBr = b;
      ceilBr = b * 0.3;
      floorBr = hit ? b * 0.25 : b * 0.15;
    } else {
      const d = hit ? perpDist : 6;
      const a = Math.max(0.005, 0.08 / (1 + d * 0.2));
      wallBr = a;
      ceilBr = a * 0.3;
      floorBr = a * 0.3;
    }

    if (!hit) {
      const ceilH = Math.max(0, Math.min(H, hz));
      ctx.fillStyle = `rgb(${(5 * ceilBr) | 0},${(5 * ceilBr) | 0},${(5 * ceilBr) | 0})`;
      ctx.fillRect(i * COL_W | 0, 0, COL_W | 0, ceilH);
      const floorY = Math.max(0, Math.min(H, hz));
      ctx.fillStyle = `rgb(${(240 * floorBr) | 0},${(240 * floorBr) | 0},${(240 * floorBr) | 0})`;
      ctx.fillRect(i * COL_W | 0, floorY, COL_W | 0, H - floorY);
      continue;
    }

    const pitchRad = player.pitch / FOCAL;
    const topAngle = Math.atan2(0.5, perpDist);
    const botAngle = Math.atan2(-0.5, perpDist);
    let topY = HORIZON - FOCAL * Math.tan(topAngle - pitchRad);
    let botY = HORIZON - FOCAL * Math.tan(botAngle - pitchRad);
    if (topY > botY) { const t = topY; topY = botY; botY = t; }
    topY += bob;
    botY += bob;
    let drawStart = topY | 0;
    let drawEnd = botY | 0;
    const wallH = drawEnd - drawStart;
    if (drawStart > H || drawEnd < 1) continue;

    const fog = Math.min(1, Math.max(0, (perpDist - FOG_START) / (FOG_END - FOG_START)));
    const f = 1 - fog;

    ctx.fillStyle = `rgb(${(80 * f * wallBr) | 0},${(76 * f * wallBr) | 0},${(72 * f * wallBr) | 0})`;
    ctx.fillRect(i * COL_W | 0, drawStart, COL_W | 0, wallH);

    ctx.fillStyle = `rgb(${(5 * ceilBr) | 0},${(5 * ceilBr) | 0},${(5 * ceilBr) | 0})`;
    ctx.fillRect(i * COL_W | 0, 0, COL_W | 0, Math.max(0, drawStart));

    ctx.fillStyle = `rgb(${(240 * floorBr) | 0},${(240 * floorBr) | 0},${(240 * floorBr) | 0})`;
    const floorStart = Math.min(H, drawEnd);
    if (floorStart < H) ctx.fillRect(i * COL_W | 0, floorStart, COL_W | 0, H - floorStart);
  }

  renderFootprints(hz);
  renderItems(hz);
  renderDust(hz);

  if (lampOn) {
    const cx = W >> 1, cy = HORIZON;
    const r = Math.max(W, H) * 0.6;
    const fl = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    fl.addColorStop(0, 'rgba(0,0,0,0)');
    fl.addColorStop(0.35, 'rgba(0,0,0,0)');
    fl.addColorStop(0.65, 'rgba(0,0,0,0.3)');
    fl.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = fl;
    ctx.fillRect(0, 0, W, H);
  }

  if (isHoldingBreath) {
    const pressure = 1 - stamina.cur / stamina.max;
    if (pressure > 0.01) {
      const cx = W >> 1, cy = HORIZON;
      const r = Math.max(W, H) * 0.35;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const a = pressure * 0.5;
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.5, `rgba(0,0,0,${a * 0.3})`);
      gr.addColorStop(1, `rgba(60,0,0,${a})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
  }

  if (frameCount & 1) edgeDither(ctx, W, H);

  if (gameState === 'playing') {
    ctx.fillStyle = '#666';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(fps + ' FPS', W - 10, H - 10);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aaa';
    let invY = H - 30;
    if (inventory.keys > 0) { ctx.fillStyle = '#fd0'; ctx.fillText('🔑 x' + inventory.keys, 10, invY); invY -= 16; }
    if (inventory.batteries > 0) { ctx.fillStyle = '#0d0'; ctx.fillText('🔋 x' + inventory.batteries, 10, invY); invY -= 16; }
    if (inventory.maps > 0) { ctx.fillStyle = '#f80'; ctx.fillText('🗺 x' + inventory.maps, 10, invY); invY -= 16; }
    if (debug) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#484';
    const ecx = toCell(enemy.x), ecy = toCell(enemy.y);
    const stuckCount = Math.max(0, Math.ceil(5 - enemy.cellTimer));
    const stuckTxt = enemy.cellTimer > 5 ? 'STUCK' : '';
    let txt;
    if (enemy.patrolTarget) {
      txt = 'PAT TARGET: (' + enemy.patrolTarget.x + ',' + enemy.patrolTarget.y + ')  ENEMY CELL: (' + ecx + ',' + ecy + ')  WAIT: ' + enemy.patrolWait.toFixed(2) + '  UNSTICK: ' + stuckCount + 's ' + stuckTxt;
    } else {
      txt = 'NO TARGET  ENEMY CELL: (' + ecx + ',' + ecy + ')  WAIT: ' + enemy.patrolWait.toFixed(2) + '  UNSTICK: ' + stuckCount + 's ' + stuckTxt;
    }
    ctx.fillText(txt, W >> 1, 20);
    const tw = ctx.measureText(txt).width;
    const sx = (W >> 1) + (tw >> 1) + 6;
    ctx.fillStyle = enemy.state === 'hunt' ? '#d33' : '#36d';
    ctx.fillRect(sx, 14, 10, 10);
    }
  }

  ctx.fillStyle = 'rgba(255,240,200,0.04)';
  ctx.fillRect(0, 0, W, H);

  if (gameOver) {
    ctx.fillStyle = 'rgba(80,0,0,0.9)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c33';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TE ENCONTRÓ', W >> 1, (H >> 1) - 50);
    ctx.fillStyle = '#966';
    ctx.font = '18px monospace';
    ctx.fillText('Alguien te encontró en la oscuridad...', W >> 1, (H >> 1) + 5);
    drawButton(ctx, (W >> 1) - 110, (H >> 1) + 45, 220, 48, 'REINTENTAR');
    return;
  }

  if (player.won) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#b22';
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ESCAPASTE...', W >> 1, (H >> 1) - 30);
    ctx.fillStyle = '#844';
    ctx.font = '20px monospace';
    ctx.fillText('por ahora...', W >> 1, (H >> 1) + 25);
    ctx.fillStyle = '#555';
    ctx.font = '14px monospace';
    ctx.fillText('Refresca para volver', W >> 1, (H >> 1) + 60);
    return;
  }

  if (gameState === 'menu') {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#a33';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LABERINTO DEL HORROR', W >> 1, (H >> 1) - 70);
    ctx.fillStyle = '#844';
    ctx.font = '18px monospace';
    ctx.fillText('Encuentra la salida... si puedes', W >> 1, (H >> 1) - 30);
    drawButton(ctx, (W >> 1) - 120, (H >> 1) + 20, 240, 50, 'COMENZAR');
    return;
  }

  if (gameState === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#a33';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSA', W >> 1, (H >> 1) - 50);
    drawButton(ctx, (W >> 1) - 120, (H >> 1) + 10, 240, 50, 'REANUDAR');
    drawButton(ctx, (W >> 1) - 120, (H >> 1) + 80, 240, 50, 'SALIR AL MENÚ');
    return;
  }

  if (debug) {
  const mmw = MAP_W * MINIMAP_CELL;
  const mmh = MAP_H * MINIMAP_CELL;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(MINIMAP_X - 2, MINIMAP_Y - 2, mmw + 4, mmh + 4);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const v = maze[y][x];
      if (v === 1) {
        ctx.fillStyle = '#333';
        ctx.fillRect(MINIMAP_X + x * MINIMAP_CELL, MINIMAP_Y + y * MINIMAP_CELL, MINIMAP_CELL, MINIMAP_CELL);
      } else if (v === 2) {
        ctx.fillStyle = '#282';
        ctx.fillRect(MINIMAP_X + x * MINIMAP_CELL, MINIMAP_Y + y * MINIMAP_CELL, MINIMAP_CELL, MINIMAP_CELL);
      }
    }
  }
  const ey = enemy.y | 0;
  const ex = enemy.x | 0;
  if (!gameOver && !player.won) {
    ctx.fillStyle = enemy.state === 'hunt' ? '#a22' : '#444';
    ctx.fillRect(MINIMAP_X + ex * MINIMAP_CELL - 1, MINIMAP_Y + ey * MINIMAP_CELL - 1, MINIMAP_CELL + 1, MINIMAP_CELL + 1);
  }
  ctx.fillStyle = isHoldingBreath ? '#66a' : '#d44';
  ctx.fillRect(MINIMAP_X + (player.x | 0) * MINIMAP_CELL - 2, MINIMAP_Y + (player.y | 0) * MINIMAP_CELL - 2, MINIMAP_CELL + 2, MINIMAP_CELL + 2);
  const ppx = MINIMAP_X + player.x * MINIMAP_CELL;
  const ppy = MINIMAP_Y + player.y * MINIMAP_CELL;
  ctx.strokeStyle = '#ee6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ppx, ppy);
  ctx.lineTo(ppx + Math.cos(player.dir) * 20, ppy + Math.sin(player.dir) * 20);
  ctx.stroke();

  if (enemy.patrolTarget) {
    const pmx = MINIMAP_X + enemy.patrolTarget.x * MINIMAP_CELL;
    const pmy = MINIMAP_Y + enemy.patrolTarget.y * MINIMAP_CELL;
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(pmx, pmy, MINIMAP_CELL, MINIMAP_CELL);

    const ecx = toCell(enemy.x), ecy = toCell(enemy.y);
    const idx = navIndex[ecy][ecx];
    const tIdx = navIndex[enemy.patrolTarget.y][enemy.patrolTarget.x];
    if (idx >= 0 && tIdx >= 0) {
      const dir = routeTable[idx * NAV_N + tIdx];
      if (dir !== DIR_NONE) {
        let nx = ecx, ny = ecy;
        if (dir === DIR_E) nx++; else if (dir === DIR_W) nx--; else if (dir === DIR_S) ny++; else ny--;
        const hc = MINIMAP_CELL >> 1;
        const nmx = MINIMAP_X + nx * MINIMAP_CELL + hc;
        const nmy = MINIMAP_Y + ny * MINIMAP_CELL + hc;
        ctx.fillStyle = 'rgba(255,255,0,0.5)';
        ctx.fillRect(MINIMAP_X + nx * MINIMAP_CELL, MINIMAP_Y + ny * MINIMAP_CELL, MINIMAP_CELL, MINIMAP_CELL);
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(MINIMAP_X + enemy.x * MINIMAP_CELL, MINIMAP_Y + enemy.y * MINIMAP_CELL);
        ctx.lineTo(nmx, nmy);
        ctx.stroke();
      }
    }
  }
  }
  if (!debug) {
  // Non-debug minimap (fog of war)
  const mmw = MAP_W * MINIMAP_CELL;
  const mmh = MAP_H * MINIMAP_CELL;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(MINIMAP_X - 2, MINIMAP_Y - 2, mmw + 4, mmh + 4);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (!revealed[y][x]) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(MINIMAP_X + x * MINIMAP_CELL, MINIMAP_Y + y * MINIMAP_CELL, MINIMAP_CELL, MINIMAP_CELL);
      } else {
        const v = maze[y][x];
        if (v === 1) {
          ctx.fillStyle = '#333';
          ctx.fillRect(MINIMAP_X + x * MINIMAP_CELL, MINIMAP_Y + y * MINIMAP_CELL, MINIMAP_CELL, MINIMAP_CELL);
        } else if (v === 2) {
          ctx.fillStyle = '#282';
          ctx.fillRect(MINIMAP_X + x * MINIMAP_CELL, MINIMAP_Y + y * MINIMAP_CELL, MINIMAP_CELL, MINIMAP_CELL);
        }
      }
    }
  }
  ctx.fillStyle = isHoldingBreath ? '#66a' : '#d44';
  ctx.fillRect(MINIMAP_X + (player.x | 0) * MINIMAP_CELL - 2, MINIMAP_Y + (player.y | 0) * MINIMAP_CELL - 2, MINIMAP_CELL + 2, MINIMAP_CELL + 2);
  }

  if (staminaAlpha > 0.01) {
    const sbw = 200, sbh = 14;
    const normX = (W - sbw) >> 1, normY = H * 0.72;
    const hideX = W - sbw - 10, hideY = 20;
    const sbx = normX + (hideX - normX) * handAnim;
    const sby = normY + (hideY - normY) * handAnim;
    const ratio = stamina.cur / stamina.max;
    const cx = W >> 1;
    const halfW = sbw >> 1;
    let fillX, fillW;
    if (handAnim > 0.5) {
      fillX = sbx;
      fillW = sbw * ratio;
    } else {
      const fillHalf = halfW * ratio;
      fillX = cx - fillHalf;
      fillW = fillHalf * 2;
    }

    ctx.globalAlpha = staminaAlpha * 0.25;
    ctx.fillStyle = '#222';
    ctx.fillRect(sbx, sby, sbw, sbh);

    ctx.globalAlpha = staminaAlpha;
    ctx.fillStyle = '#eee';
    ctx.fillRect(fillX, sby, fillW, sbh);

    ctx.globalAlpha = 1;
  }

  if (handAnim > 0.001) {
    const hh = H * 1.3;
    const hw = hh * (handImg.naturalWidth / handImg.naturalHeight) || W;
    const targetY = 200;
    const curY = H + (targetY - H) * handAnim;
    hCtx.clearRect(0, 0, W, H);
    hCtx.imageSmoothingEnabled = false;
    hCtx.drawImage(handImg, (W - hw) / 2, curY, hw, hh);
    hCtx.imageSmoothingEnabled = true;
    if (!lampOn) {
      hCtx.globalCompositeOperation = 'source-atop';
      hCtx.fillStyle = 'rgba(0,0,0,0.85)';
      hCtx.fillRect(0, 0, W, H);
      hCtx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(handCanvas, 0, 0);
  }

  ctx.fillStyle = 'rgba(100,25,25,0.5)';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('WASD: mover | Shift: correr | Q: linterna | C: contener respiración', 10, H - 10);

  if (enemy.state === 'hunt') {
    const pulse = 0.6 + Math.sin(time * 0.005) * 0.4;
    ctx.globalAlpha = pulse * 0.12;
    ctx.fillStyle = '#a00';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

function restartGame() {
  generateMaze();
  buildNavGrid();
  buildRouteTable();
  player.x = 1.5; player.y = 1.5; player.dir = 0; player.pitch = 0;
  player.won = false; player.winTime = 0;
  stamina.cur = stamina.max;
  moveT = 0;
  walkTimer = 0;
  walkDelay = 0;
  walkStep = 0;
  footprints = [];
  dust = [];
  revealed = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  gameOver = false;
  enemy.state = 'patrol';
  enemy.huntT = 0;
  enemy.patrolTarget = null;
  enemy.patrolWait = 0;
  enemy.targetCell = null;
  enemy.cellTimer = 0;
  enemy.stuckTimer = 0;
  enemy.roarTimer = 15 + Math.random() * 45;
  enemy.prevDist = undefined;
  enemy.pidIntegral = 0;
  enemy.pidPrevError = 0;
  enemy.routeDir = 0;
  inventory = { keys: 0, batteries: 0, maps: 0 };
  spawnEnemy();
  spawnTestItems();
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (W / rect.width);
  const my = (e.clientY - rect.top) * (H / rect.height);

  if (gameOver) {
    const bx = (W >> 1) - 110, by = (H >> 1) + 45, bw = 220, bh = 48;
    if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
      restartGame();
      return;
    }
    return;
  }

  if (gameState === 'menu') {
    const bx = (W >> 1) - 120, by = (H >> 1) + 20, bw = 240, bh = 50;
    if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
      gameState = 'playing';
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      ignoreNextMove = true;
      canvas.requestPointerLock();
    }
    return;
  }

  if (gameState === 'paused') {
    const bx = (W >> 1) - 120, bw = 240, bh = 50;
    const rby = (H >> 1) + 10;
    if (mx >= bx && mx <= bx + bw && my >= rby && my <= rby + bh) {
      gameState = 'playing';
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      ignoreNextMove = true;
      canvas.requestPointerLock();
      return;
    }
    const sby = (H >> 1) + 80;
    if (mx >= bx && mx <= bx + bw && my >= sby && my <= sby + bh) {
      gameState = 'menu';
      restartGame();
      return;
    }
    return;
  }

  if (!mouseLocked) {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    ignoreNextMove = true;
    canvas.requestPointerLock();
  }
});

let last = 0;
let frameCount = 0;
let fpsTimer = 0;
let fps = 0;

function loop(now) {
  try {
  const dt = Math.min(0.05, (now - last) * 0.001);
  last = now;
  frameCount++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) { fps = Math.round(frameCount / fpsTimer); frameCount = 0; fpsTimer = 0; }
  render(now);
  update(dt);
  } catch(e) { console.error(e); }
  requestAnimationFrame(loop);
}

generateMaze();
buildNavGrid();
buildRouteTable();
spawnEnemy();
spawnTestItems();
requestAnimationFrame((now) => { last = now; loop(now); });
