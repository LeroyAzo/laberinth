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
let lampOnAudio = null;
let lampOffAudio = null;
let oneKeyAudio = null;
let twoKeyAudio = null;
let threeKeyAudio = null;
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
  lampOnAudio = new Audio('assets/audio/lamp_on.mp3');
  lampOnAudio.volume = 0.3;
  lampOnAudio.preload = 'auto';
  lampOffAudio = new Audio('assets/audio/lamp_off.mp3');
  lampOffAudio.volume = 0.3;
  lampOffAudio.preload = 'auto';
  oneKeyAudio = new Audio('assets/audio/one_key_sound.mp3');
  oneKeyAudio.volume = 0.4;
  oneKeyAudio.preload = 'auto';
  twoKeyAudio = new Audio('assets/audio/two_key_sound.mp3');
  twoKeyAudio.volume = 0.4;
  twoKeyAudio.preload = 'auto';
  threeKeyAudio = new Audio('assets/audio/three_key_sound.mp3');
  threeKeyAudio.volume = 0.4;
  threeKeyAudio.preload = 'auto';
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
let lampOffX = -5, lampOffY = -400;
let footprints = [];
let dust = [];
let items = [];
let inventory = { keys: 0, batteries: 0, maps: 0 };
let notifications = [];

const player = {
  x: 1.5, y: 1.5, dir: 0, pitch: 0,
  won: false, winTime: 0,
};

const stamina = { cur: 100, max: 100 };
let staminaAlpha = 0;
let lampOn = true;
let prevLampOn = true;
let lampMult = 1;
let lampFlickerTimer = 0;
let lampFlickerCooldown = 0;
let lampBattery = 10;
let lampBatteryTimer = 0;
let isSprinting = false;
let isHoldingBreath = false;
let wasHoldingBreath = false;
let staminaCD = false;
let handAnim = 0;
let shakeX = 0, shakeY = 0;
let gameState = 'menu';
let gamePhase = 'survivor';
let hunterMode = false;
let hunterRoarTimer = 15 + Math.random() * 45;
let monsterStepT = 0;
let radarBlackout = 0;
let respawnFlash = 0;
let survFootprints = [];
const survFootImg = new Image();
survFootImg.src = 'assets/images/survivor_foot.png';

const survivor = {
  x: 1.5, y: 1.5, dir: 0,
  keys: 0, maps: 0,
  stamina: { cur: 100, max: 100 },
  lampOn: true, lampBattery: 10,
  state: 'explore', holdBreathTimer: 0,
  targetCell: null, targetSubCell: null, patrolWait: 0, cellTimer: 0,
  moveT: 0, stepT: 0, walkStep: 0,
  isSprinting: false, isHoldingBreath: false,
  staminaCD: false, huntT: 0,
  stepDelay: 0,
  pidIntegral: 0, pidPrevError: 0,
};

function startHunterPhase() {
  gamePhase = 'hunter';
  // Position player (monster) where the enemy was
  player.x = enemy.x; player.y = enemy.y;
  player.dir = enemy.dir; player.pitch = 0;
  // Spawn survivor at farthest point from exit (39.5, 29.5)
  const exCX = CELLS_X * 2 - 1 + 0.5, exCY = CELLS_Y * 2 - 1 + 0.5;
  let bestDist = -1, bestX = 1.5, bestY = 1.5;
  for (let y = 2; y < MAP_H - 2; y++) {
    for (let x = 2; x < MAP_W - 2; x++) {
      if (maze[y][x] === 0) {
        const d = Math.hypot(x + 0.5 - exCX, y + 0.5 - exCY);
        if (d > bestDist) { bestDist = d; bestX = x + 0.5; bestY = y + 0.5; }
      }
    }
  }
  survivor.x = bestX; survivor.y = bestY;
  survivor.dir = Math.random() * Math.PI * 2;
  survivor.keys = 0; survivor.maps = 0;
  survivor.stamina.cur = 100;
  survivor.lampOn = true; survivor.lampBattery = 10;
  survivor.state = 'explore';
  survivor.targetCell = null; survivor.targetSubCell = null; survivor.patrolWait = 0; survivor.cellTimer = 0;
  survivor.holdBreathTimer = 0;
  survivor.moveT = 0; survivor.stepT = 0; survivor.walkStep = 0;
  survivor.isSprinting = false; survivor.isHoldingBreath = false;
  survivor.staminaCD = false; survivor.huntT = 0;
  survivor.pidIntegral = 0; survivor.pidPrevError = 0;
  hunterRoarTimer = 15 + Math.random() * 45;
  monsterStepT = 0;
  radarBlackout = 0;
  respawnFlash = 0;
  survFootprints = [];
  // Give survivor initial keys matching what player had
  survivor.keys = inventory.keys;
  inventory.keys = 0;
}

function respawnAsSurvivor() {
  gamePhase = 'survivor';
  player.x = 1.5; player.y = 1.5; player.dir = 0; player.pitch = 0;
  player.won = false; player.winTime = 0;
  stamina.cur = stamina.max;
  lampOn = true; lampBattery = 10; lampBatteryTimer = 0;
  lampMult = 1; lampFlickerTimer = 0; lampFlickerCooldown = 0;
  isSprinting = false; isHoldingBreath = false; staminaCD = false;
  inventory = { keys: 0, batteries: 0, maps: 0 };
  for (const d of exitDoors) { d.state = 'closed'; d.timer = 0; d.timerMax = 0; }
  spawnKey();
  notifications.unshift({ text: 'Tienes otra oportunidad', timer: 3 });
  if (notifications.length > 4) notifications.pop();
  respawnFlash = 0.6;
}

function enterFullscreen() { try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); } catch(e) {} }
function exitFullscreen() { try { if (document.fullscreenElement) document.exitFullscreen(); } catch(e) {} }

const keys = {};
let mouseLocked = false;
let ignoreNextMove = false;

const handImg = new Image();
handImg.src = 'assets/images/hand_horror_2.png';
const clawImg = new Image();
clawImg.src = 'assets/images/claw3.png';
const keyImg = new Image();
keyImg.src = 'assets/images/key_horror1.png';
const batImg = new Image();
batImg.src = 'assets/images/battery_horror1.png';
const mapImg = new Image();
mapImg.src = 'assets/images/minimap_1.png';
const lampImg = new Image();
lampImg.src = 'assets/images/lamp_wo_everything.png';
const lampBtnImg = new Image();
lampBtnImg.src = 'assets/images/lamp_button_off.png';
const lampBtnOnImg = new Image();
lampBtnOnImg.src = 'assets/images/lamp_button_on.png';
const batteryImgs = [];
for (let i = 0; i <= 10; i++) {
  const img = new Image();
  img.src = 'assets/images/battery_' + i + '.png';
  batteryImgs.push(img);
}
const keyImgs = [];
keyImgs.push(new Image()); keyImgs[0].src = 'assets/images/no_keys.png';
keyImgs.push(new Image()); keyImgs[1].src = 'assets/images/one_key.png';
keyImgs.push(new Image()); keyImgs[2].src = 'assets/images/two_keys.png';
keyImgs.push(new Image()); keyImgs[3].src = 'assets/images/three_keys.png';

const doorTex = new Image();
doorTex.src = 'assets/images/green_door_closed.png';
const doorMidTex = new Image();
doorMidTex.src = 'assets/images/door_mid.png';
const doorOpenTex = new Image();
doorOpenTex.src = 'assets/images/door_open.png';

let exitDoors = [];

function findExitDoors() {
  const candidates = [];
  for (let y = 2; y < MAP_H - 2; y++) {
    for (let x = 2; x < MAP_W - 2; x++) {
      if (maze[y][x] === 1) {
        const adjacent = (maze[y-1][x] === 0) + (maze[y+1][x] === 0) + (maze[y][x-1] === 0) + (maze[y][x+1] === 0);
        if (adjacent > 0) {
          const dist = Math.hypot(x + 0.5 - 1.5, y + 0.5 - 1.5);
          if (dist > 6) candidates.push({ x, y });
        }
      }
    }
  }
  exitDoors = [];
  const shuffled = candidates.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < 3 && i < shuffled.length; i++) {
    exitDoors.push({
      x: shuffled[i].x, y: shuffled[i].y,
      state: 'closed', timer: 0, timerMax: 0,
      isReal: i === 0
    });
  }
}

function spawnKey() {
  items = [];
  const cells = [];
  for (let y = 1; y < MAP_H; y += 2) {
    for (let x = 1; x < MAP_W; x += 2) {
      if (maze[y][x] === 0) {
        const dist = Math.hypot(x + 0.5 - 1.5, y + 0.5 - 1.5);
        if (dist > 3) cells.push({ x, y });
      }
    }
  }
  if (cells.length) {
    const c = cells[Math.random() * cells.length | 0];
    items.push({ x: c.x + 0.5, y: c.y + 0.5, type: 'key_exit', collected: false });
  }
}



const handCanvas = document.createElement('canvas');
handCanvas.width = W;
handCanvas.height = H;
const hCtx = handCanvas.getContext('2d');
const lampCanvas = document.createElement('canvas');
lampCanvas.width = W;
lampCanvas.height = H;
const lCtx = lampCanvas.getContext('2d');

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
  if (!mouseLocked && gameState === 'playing') { gameState = 'paused'; exitFullscreen(); }
  if (mouseLocked && gameState === 'paused') { gameState = 'playing'; enterFullscreen(); }
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

function findDoorFace(door) {
  const wallCX = door.x + 0.5, wallCY = door.y + 0.5;
  const dx = player.x - wallCX, dy = player.y - wallCY;
  let fx, fy;
  if (Math.abs(dx) > Math.abs(dy)) {
    fx = door.x + (dx > 0 ? 1 : 0);
    fy = wallCY;
  } else {
    fx = wallCX;
    fy = door.y + (dy > 0 ? 1 : 0);
  }
  return { x: fx, y: fy };
}

function nearestDoor() {
  let best = null, bestDist = Infinity;
  for (const d of exitDoors) {
    if (d.state !== 'closed') continue;
    const face = findDoorFace(d);
    const dist = Math.hypot(player.x - face.x, player.y - face.y);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return bestDist < 2 ? { door: best, dist: bestDist, face: findDoorFace(best) } : null;
}

let moveT = 0;

function updateSurvivor(dt) {
  if (gamePhase !== 'hunter' || gameOver || player.won) return;
  const s = survivor;
  const monDist = Math.hypot(player.x - s.x, player.y - s.y);
  const monLos = hasLineOfSight(player.x, player.y, s.x, s.y);
  let bestKeyDist = Infinity;

  if (s.stamina.cur < s.stamina.max) s.stamina.cur = Math.min(s.stamina.max, s.stamina.cur + dt * 8);
  if (s.staminaCD && s.stamina.cur > 50) s.staminaCD = false;

  if (s.isSprinting) {
    s.stamina.cur = Math.max(0, s.stamina.cur - 35 * dt);
    if (s.stamina.cur <= 0) { s.isSprinting = false; s.staminaCD = true; }
  }

  if (s.lampOn && s.lampBattery > 0) {
    s.stepT += dt;
    if (s.stepT >= 40) { s.stepT = 0; s.lampBattery--; if (s.lampBattery <= 0) s.lampOn = false; }
  }

  // Detection
  const alarmed = monDist < 10 && monLos;
  const tooClose = monDist < 5 && monLos;

  if (s.lampOn && (alarmed || tooClose)) s.lampOn = false;
  if (!s.lampOn && monDist > 15 && s.lampBattery > 0) s.lampOn = true;

  // Survivor holds breath for 2s then flees
  if (tooClose && s.holdBreathTimer <= 0) s.holdBreathTimer = 2;
  if (s.holdBreathTimer > 0) {
    s.holdBreathTimer -= dt;
    s.isHoldingBreath = true;
    s.isSprinting = false;
    if (s.holdBreathTimer <= 0) {
      s.holdBreathTimer = 0;
      s.isHoldingBreath = false;
      s.isSprinting = true;
    }
    if (s.isHoldingBreath) radarBlackout = 5;
  } else {
    s.isHoldingBreath = false;
    s.isSprinting = monDist < 10 && monLos && s.stamina.cur > 0 && !s.staminaCD;
  }
  if (radarBlackout > 0) radarBlackout -= dt;

  // State machine - flee when monster is close (or after hold breath ends)
  if (s.isSprinting || tooClose || (monDist < 10 && monLos)) {
    s.state = 'flee';
    const fleeAng = Math.atan2(s.y - player.y, s.x - player.x);
    let bestFleeCell = null, bestFleeScore = -Infinity;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const fx = toCell(s.x) + dx, fy = toCell(s.y) + dy;
        if (fx < 2 || fx >= MAP_W - 2 || fy < 2 || fy >= MAP_H - 2) continue;
        if (maze[fy][fx] !== 0 || navIndex[fy][fx] < 0) continue;
        const cellAng = Math.atan2(fy + 0.5 - s.y, fx + 0.5 - s.x);
        let diff = cellAng - fleeAng;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        const score = Math.cos(diff) * 2 - Math.hypot(fx + 0.5 - s.x, fy + 0.5 - s.y) * 0.1;
        if (score > bestFleeScore) { bestFleeScore = score; bestFleeCell = { x: fx, y: fy }; }
      }
    }
    if (bestFleeCell) { s.targetCell = bestFleeCell; s.cellTimer = 0; }
    else { s.targetCell = null; }
  } else if (s.state === 'flee') {
    s.state = 'explore';
  }

  // Normal exploration (only when not fleeing)
  if (s.state === 'explore' || s.state === 'seekKey') {
    let foundKey = null;
    for (const item of items) {
      if (item.collected || item.type !== 'key_exit') continue;
      const d = Math.hypot(item.x - s.x, item.y - s.y);
      if (d < bestKeyDist) { bestKeyDist = d; foundKey = item; }
    }
    const nearDoor = exitDoors.some(d => d.state === 'closed' && Math.hypot(d.x + 0.5 - s.x, d.y + 0.5 - s.y) < 8);
    if (foundKey && (bestKeyDist < 8 || (!nearDoor && s.keys === 0))) {
      s.targetCell = { x: foundKey.x | 0, y: foundKey.y | 0 }; s.cellTimer = 0;
    } else if (s.keys > 0 && nearDoor) {
      s.state = 'goToDoor';
    } else {
      if (!s.targetCell || s.cellTimer > 4) {
        const cells = [];
        for (let y = 2; y < MAP_H - 2; y++) {
          for (let x = 2; x < MAP_W - 2; x++) {
            if (maze[y][x] === 0 && navIndex[y][x] >= 0) cells.push({ x, y });
          }
        }
        if (cells.length) s.targetCell = cells[Math.random() * cells.length | 0];
        s.cellTimer = 0;
      }
    }
  }
  if (s.state === 'goToDoor') {
    let bestDoor = null, bestDoorDist = Infinity;
    for (const d of exitDoors) {
      if (d.state !== 'closed') continue;
      const dd = Math.hypot(d.x + 0.5 - s.x, d.y + 0.5 - s.y);
      if (dd < bestDoorDist) { bestDoorDist = dd; bestDoor = d; }
    }
    if (!bestDoor || s.keys === 0) { s.state = 'explore'; s.targetCell = null; }
    else {
      if (bestDoorDist < 2) {
        s.keys--; bestDoor.state = 'mid'; bestDoor.timer = 0.5;
        s.state = 'explore'; s.targetCell = null;
      } else {
        s.targetCell = { x: bestDoor.x, y: bestDoor.y }; s.cellTimer = 0;
      }
    }
  }

  // Movement (always move, even when holding breath — flee)
  s.cellTimer += dt;
  if (s.cellTimer > 6) { s.cellTimer = 0; s.targetCell = null; }
  if (!s.targetCell) { if (s.state !== 'flee') s.state = 'explore'; return; }
  const sCx = toCell(s.x), sCy = toCell(s.y);
  const tgx = s.targetCell.x, tgy = s.targetCell.y;
  if (sCx === tgx && sCy === tgy) { s.targetCell = null; return; }
  const sIdx = navIndex[sCy][sCx];
  const tIdx = navIndex[tgy][tgx];
  if (sIdx >= 0 && tIdx >= 0) {
    const dir = routeTable[sIdx * NAV_N + tIdx];
    if (dir !== DIR_NONE) {
      if (!s.targetSubCell || (sCx === s.targetSubCell.x && sCy === s.targetSubCell.y)) {
        let nx = sCx, ny = sCy;
        if (dir === DIR_E) nx++; else if (dir === DIR_W) nx--; else if (dir === DIR_S) ny++; else ny--;
        s.targetSubCell = { x: nx, y: ny };
      }
      if (s.targetSubCell) {
        const tscx = s.targetSubCell.x + 0.5, tscy = s.targetSubCell.y + 0.5;
        const ang = Math.atan2(tscy - s.y, tscx - s.x);
        const spd = (s.isSprinting ? 2.0 : 1.0) * dt;
        const nx = s.x + Math.cos(ang) * spd;
        const ny = s.y + Math.sin(ang) * spd;
        if (!isWall(nx, ny)) { s.x = nx; s.y = ny; s.dir = ang; }
        else if (!isWall(nx, s.y)) { s.x = nx; s.dir = ang; }
        else if (!isWall(s.x, ny)) { s.y = ny; s.dir = ang; }
      }
    } else {
      const ang = Math.atan2(tgy + 0.5 - s.y, tgx + 0.5 - s.x);
      const spd = (s.isSprinting ? 2.0 : 1.0) * dt;
      const nx = s.x + Math.cos(ang) * spd;
      const ny = s.y + Math.sin(ang) * spd;
      if (!isWall(nx, ny)) { s.x = nx; s.y = ny; s.dir = ang; }
      else if (!isWall(nx, s.y)) { s.x = nx; s.dir = ang; }
      else if (!isWall(s.x, ny)) { s.y = ny; s.dir = ang; }
    }
  } else { s.targetCell = null; }

  // Visual footprints & footstep sounds
  const prevX = s.lastX || s.x, prevY = s.lastY || s.y;
  const moving2 = Math.hypot(s.x - prevX, s.y - prevY) > 0.001;
  s.lastX = s.x; s.lastY = s.y;
  if (moving2) {
    // Visual footprint every few steps
    s.stepDelay -= dt;
    if (s.stepDelay <= 0) {
      s.stepDelay = s.isSprinting ? 0.3 : 0.5;
      s.walkStep++;
      // Add visual footprint
      if (s.walkStep % 2 === 0) survFootprints.push({ x: s.x, y: s.y, dir: s.dir, life: 8 });
      // Footstep sound (only audible when NOT holding breath)
      if (!s.isHoldingBreath) {
        const vol = Math.max(0, Math.min(1, 1 - monDist / 12));
        const a2 = (s.walkStep % 2 === 0) ? walkLAudio : walkRAudio;
        if (a2 && vol > 0.02) { a2.currentTime = 0; a2.volume = vol * 0.3; a2.play().catch(() => {}); }
      }
    }
  } else {
    s.stepDelay = 0;
  }

  // Collect key if overlapping
  for (const item of items) {
    if (item.collected || item.type !== 'key_exit') continue;
    if (Math.hypot(item.x - s.x, item.y - s.y) < 0.5) {
      item.collected = true; s.keys++;
    }
  }
}

function updateEnemy(dt) {
  if (gameOver || player.won || gamePhase === 'hunter') return;
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

  if (inventory.maps > 0) {
    const mw = MAP_W * MINIMAP_CELL, mh = MAP_H * MINIMAP_CELL;
    const mx = W - mw - 6, my = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (!revealed[y][x]) {
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(mx + x * MINIMAP_CELL, my + y * MINIMAP_CELL, MINIMAP_CELL, MINIMAP_CELL);
        } else {
          const v = maze[y][x];
          if (v === 1) {
            ctx.fillStyle = '#333';
            ctx.fillRect(mx + x * MINIMAP_CELL, my + y * MINIMAP_CELL, MINIMAP_CELL, MINIMAP_CELL);
          } else if (v === 2) {
            ctx.fillStyle = '#282';
            ctx.fillRect(mx + x * MINIMAP_CELL, my + y * MINIMAP_CELL, MINIMAP_CELL, MINIMAP_CELL);
          }
        }
      }
    }
    ctx.fillStyle = isHoldingBreath ? '#66a' : '#d44';
    ctx.fillRect(mx + (player.x | 0) * MINIMAP_CELL - 1, my + (player.y | 0) * MINIMAP_CELL - 1, MINIMAP_CELL + 1, MINIMAP_CELL + 1);
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
  if (gamePhase !== 'hunter') {
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
  }
  if (gameState !== 'playing') return;
  if (gameOver || player.won) return;
  const sin = Math.sin(player.dir);
  const cos = Math.cos(player.dir);
  isHoldingBreath = gamePhase !== 'hunter' && keys['c'] && !staminaCD && stamina.cur > 0 && !exhalePlaying;
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
  if (gamePhase !== 'hunter' && keys['q']) { keys['q'] = false; lampOn = !lampOn; }
  if (lampOn !== prevLampOn) {
    if (lampOn && lampOnAudio) { lampOnAudio.currentTime = 0; lampOnAudio.play().catch(() => {}); }
    if (!lampOn && lampOffAudio) { lampOffAudio.currentTime = 0; lampOffAudio.play().catch(() => {}); }
    prevLampOn = lampOn;
  }
  if (gamePhase !== 'hunter') {
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
    if (lampOn && lampBattery > 0) {
      lampBatteryTimer += dt;
      if (lampBatteryTimer >= 40) {
        lampBatteryTimer = 0;
        lampBattery--;
        if (lampBattery <= 0) { lampOn = false; }
      }
    }
  }
  player.dir %= Math.PI * 2;
  if (player.dir < 0) player.dir += Math.PI * 2;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const moving = mx !== 0 || my !== 0;

  if (gamePhase === 'hunter') {
    isSprinting = moving && keys['shift'];
  } else {
    isSprinting = moving && keys['shift'] && stamina.cur > 0 && !staminaCD;
  }
  const sprintMul = isSprinting ? (gamePhase === 'hunter' ? 2.0 : 2.4) : (gamePhase === 'hunter' ? 1.2 : 1);
  if (isSprinting) {
    if (gamePhase !== 'hunter') {
      stamina.cur = Math.max(0, stamina.cur - 35 * dt);
      if (stamina.cur <= 0) {
        staminaCD = true;
        walkDelay = 0.5;
        if (stopRunAudio) { stopRunAudio.currentTime = 0; stopRunAudio.play().catch(() => {}); }
      }
    }
  } else if (!isHoldingBreath && gamePhase !== 'hunter') {
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
  if (gamePhase === 'hunter') {
    monsterStepT += dt;
    const stepI = isSprinting ? 0.35 : 0.5;
    if (moving && monsterStepT >= stepI) {
      monsterStepT = 0;
      footprints.push({ x: player.x, y: player.y, dir: player.dir, life: 10 });
      playFootstep(keys['c'] ? 0.1 : 1, isSprinting ? 2.0 : 1.2);
    }
  }
  if (keys['e']) {
    keys['e'] = false;
    const near = nearestDoor();
    if (near && near.door.state === 'closed' && inventory.keys > 0) {
      inventory.keys--;
      near.door.state = 'mid';
      near.door.timer = 0.5;
    } else if (near && near.door.state === 'closed') {
      notifications.unshift({ text: 'Necesitas una llave', timer: 2 });
      if (notifications.length > 4) notifications.pop();
    }
  }
  for (const d of exitDoors) {
    if (d.state === 'mid') {
      d.timer -= dt;
      if (d.timer <= 0) {
        d.state = 'open';
        d.timer = 0.6;
        d.timerMax = 0.6;
      }
    } else if (d.state === 'open') {
      d.timer -= dt;
      if (d.timer <= 0) {
        if (d.isReal) {
          player.won = true;
          player.winTime = performance.now();
        } else {
          const r = Math.random();
          if (r < 0.33) { inventory.maps++; notifications.unshift({ text: 'Mapa encontrado', timer: 2 }); }
          else if (r < 0.66) { lampBattery = Math.min(10, lampBattery + 2); notifications.unshift({ text: 'Batería encontrada', timer: 2 }); }
          else {
            inventory.keys++;
            notifications.unshift({ text: 'Llave encontrada', timer: 2 });
            const bonus = Math.random();
            const bonusCount = bonus < 0.005 ? 2 : bonus < 0.055 ? 1 : 0;
            for (let b = 0; b < bonusCount; b++) {
              const cells = [];
              for (let by = 1; by < MAP_H; by += 2) {
                for (let bx = 1; bx < MAP_W; bx += 2) {
                  if (maze[by][bx] === 0) cells.push({ x: bx, y: by });
                }
              }
              if (cells.length) {
                const c = cells[Math.random() * cells.length | 0];
                items.push({ x: c.x + 0.5, y: c.y + 0.5, type: 'key_exit', collected: false });
              }
            }
          }
          if (notifications.length > 4) notifications.pop();
          d.timer = 0; d.timerMax = 0;
        }
      }
    }
  }
  if (respawnFlash > 0) respawnFlash -= dt;


  if (moving && !isSprinting) {
    if (walkDelay > 0) {
      walkDelay -= dt;
    } else {
      walkTimer += dt;
      const interval = (walkStep % 2 === 0) ? 0.32 : 0.68;
      if (walkTimer >= interval) {
        walkTimer = 0;
        walkStep++;
        if (gamePhase !== 'hunter') {
          const a = (walkStep % 2 === 0) ? walkLAudio : walkRAudio;
          if (a && a.paused) { a.currentTime = 0; a.play().catch(() => {}); }
        }
      }
    }
  }

  if (inventory.maps > 0) {
  const px = player.x | 0, py = player.y | 0;
  for (let dy = -revealRadius; dy <= revealRadius; dy++) {
    for (let dx = -revealRadius; dx <= revealRadius; dx++) {
      if (dx * dx + dy * dy <= revealRadius * revealRadius) {
        const rx = px + dx, ry = py + dy;
        if (rx >= 0 && rx < MAP_W && ry >= 0 && ry < MAP_H) revealed[ry][rx] = true;
      }
    }
  }
  }

  for (const item of items) {
    if (item.collected) continue;
    const d = Math.hypot(player.x - item.x, player.y - item.y);
    if (d < 0.5) {
      item.collected = true;
      let name = '';
      if (item.type === 'key_exit' || item.type === 'key_fake1' || item.type === 'key_fake2') {
        inventory.keys++;
        name = 'Llave';
        const ka = inventory.keys === 1 ? oneKeyAudio : inventory.keys === 2 ? twoKeyAudio : threeKeyAudio;
        if (ka) { ka.currentTime = 0; ka.play().catch(() => {}); }
      }
      else if (item.type === 'battery') { lampBattery = Math.min(10, lampBattery + 2); name = 'Batería'; }
      else if (item.type === 'map_piece') { inventory.maps++; name = 'Mapa'; }
      notifications.unshift({ text: name + ' recogido', timer: 3 });
      if (notifications.length > 4) notifications.pop();
    }
  }

  for (let i = notifications.length - 1; i >= 0; i--) {
    notifications[i].timer -= dt;
    if (notifications[i].timer <= 0) notifications.splice(i, 1);
  }

  if (gamePhase === 'hunter') {
    try{updateSurvivor(dt)}catch(e){console.error('updateSurvivor:',e)}
    // Monster roars
    hunterRoarTimer -= dt;
    if (hunterRoarTimer <= 0) {
      hunterRoarTimer = 15 + Math.random() * 45;
      const sDist = Math.hypot(survivor.x - player.x, survivor.y - player.y);
      const vol = Math.max(0, 1 - sDist / 12);
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
    // Check if monster catches survivor → respawn as survivor
    if (Math.hypot(player.x - survivor.x, player.y - survivor.y) < 0.4) {
      respawnAsSurvivor();
    }
  } else {
    // Check transition: all doors open, no keys, no key items on map
    const allOpen = exitDoors.every(d => d.state === 'open');
    const noKeysInv = inventory.keys === 0;
    const noKeyItems = !items.some(i => i.type === 'key_exit' && !i.collected);
    if (allOpen && noKeysInv && noKeyItems) {
      startHunterPhase();
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
    const s = h * 0.7;
    const drawItemSprite = (img) => {
      if (!img || !img.complete || img.naturalWidth <= 0) return;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const scale = s * 2 / Math.max(iw, ih);
      const dw = iw * scale, dh = ih * scale;
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    };
    if (item.type.startsWith('key')) {
      drawItemSprite(keyImg);
    } else if (item.type === 'battery') {
      drawItemSprite(batImg);
    } else if (item.type === 'map_piece') {
      drawItemSprite(mapImg);
    }
  }
  ctx.globalAlpha = 1;
}


function renderExitEIcon() {
  const near = nearestDoor();
  if (!near) return;
  const face = near.face;
  const dist = near.dist;
  const angle = Math.atan2(face.y - player.y, face.x - player.x);
  let rel = angle - pDir;
  while (rel < -Math.PI) rel += Math.PI * 2;
  while (rel > Math.PI) rel -= Math.PI * 2;
  if (Math.abs(rel) > HALF_FOV + 0.2) return;
  const screenX = (rel / HALF_FOV + 1) / 2 * W;
  const pitchRad = player.pitch / FOCAL;
  const screenY = HORIZON + FOCAL * Math.tan(pitchRad);
  const s = Math.max(16, Math.min(48, 60 / dist));
  const bx = screenX - s * 0.5;
  const by = screenY - s * 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(bx, by, s, s);
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, s, s);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${(s * 0.55) | 0}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', screenX, screenY);
  ctx.textBaseline = 'alphabetic';
}

function renderHunter(hz) {
  const s = survivor;
  const dx = s.x - player.x, dy = s.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.3 || dist > 12) return;
  const angle = Math.atan2(dy, dx);
  let rel = angle - pDir;
  while (rel < -Math.PI) rel += Math.PI * 2;
  while (rel > Math.PI) rel -= Math.PI * 2;
  if (Math.abs(rel) > HALF_FOV + 0.2) return;
  // Check if survivor's flashlight is pointing at monster (with LOS)
  const survAngle = Math.atan2(player.y - s.y, player.x - s.x);
  let survRel = survAngle - s.dir;
  while (survRel < -Math.PI) survRel += Math.PI * 2;
  while (survRel > Math.PI) survRel -= Math.PI * 2;
  const illum = Math.abs(survRel) < HALF_FOV && hasLineOfSight(s.x, s.y, player.x, player.y);
  const hasLOS = hasLineOfSight(player.x, player.y, s.x, s.y);
  const visAlpha = illum ? Math.min(1, 0.3 + 0.7 * (1 - dist / 12)) : (hasLOS ? 0.03 : 0);
  if (visAlpha < 0.01) return;
  const screenX = (rel / HALF_FOV + 1) / 2 * W;
  const pitchRad = player.pitch / FOCAL;
  const screenY = HORIZON + FOCAL * Math.tan(pitchRad);
  const sSize = Math.max(8, Math.min(40, 30 / Math.max(dist, 0.3)));
  ctx.globalAlpha = 1;
}

function renderSurvFootprints(hz) {
  for (let i = survFootprints.length - 1; i >= 0; i--) {
    const f = survFootprints[i];
    f.life -= 0.016;
    if (f.life <= 0) { survFootprints.splice(i, 1); continue; }
    const dx = f.x - player.x, dy = f.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.3 || dist > 8) continue;
    const angle = Math.atan2(dy, dx);
    let rel = angle - pDir;
    while (rel < -Math.PI) rel += Math.PI * 2;
    while (rel > Math.PI) rel -= Math.PI * 2;
    if (Math.abs(rel) > HALF_FOV + 0.1) continue;
    const screenX = (rel / HALF_FOV + 1) / 2 * W;
    const h = Math.max(4, 20 / dist);
    const alpha = Math.min(0.85, f.life / 8 * 0.85);
    const sy = hz - FOCAL * 0.6 / dist;
    ctx.globalAlpha = alpha;
    if (survFootImg.complete && survFootImg.naturalWidth > 0) {
      const s = h * 0.8;
      ctx.save();
      ctx.translate(screenX, sy);
      ctx.rotate(-pDir + f.dir);
      ctx.drawImage(survFootImg, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function renderHunterRadar() {
  if (gamePhase !== 'hunter') return;
  const cx = W - 90, cy = H - 90, r = 70;
  const px = player.x, py = player.y;
  const pDir2 = player.dir;

  if (radarBlackout > 0) {
    ctx.fillStyle = 'rgba(5,5,10,0.6)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#224';
    ctx.lineWidth = 1;
    ctx.stroke();
    return;
  }

  ctx.fillStyle = 'rgba(10,10,20,0.5)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#446';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = '#558';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 4);
  ctx.lineTo(cx, cy - r - 6);
  ctx.stroke();
  const maxDist = 5;
  for (let dy = -maxDist; dy <= maxDist; dy++) {
    for (let dx = -maxDist; dx <= maxDist; dx++) {
      const wx = (px + dx) | 0, wy = (py + dy) | 0;
      if (wx < 0 || wx >= MAP_W || wy < 0 || wy >= MAP_H) continue;
      if (maze[wy][wx] !== 1) continue;
      if (dx * dx + dy * dy > maxDist * maxDist) continue;
      const ddx = wx + 0.5 - px, ddy = wy + 0.5 - py;
      const dist = Math.hypot(ddx, ddy);
      if (dist > maxDist) continue;
      const wallAngle = Math.atan2(ddy, ddx);
      let relAngle = wallAngle - pDir2;
      while (relAngle < -Math.PI) relAngle += Math.PI * 2;
      while (relAngle > Math.PI) relAngle -= Math.PI * 2;
      const radarDist = (dist / maxDist) * r * 0.85;
      const radarX = cx + Math.sin(relAngle) * radarDist;
      const radarY = cy - Math.cos(relAngle) * radarDist;
      const bright = Math.min(0.7, 0.2 + 0.5 * (1 - dist / maxDist));
      ctx.fillStyle = `rgba(100,120,160,${bright})`;
      for (let sub = 0; sub < 4; sub++) {
        const offX = (sub & 1) * 3 - 1.5;
        const offY = (sub >> 1) * 3 - 1.5;
        ctx.fillRect(radarX + offX - 1, radarY + offY - 1, 2, 2);
      }
    }
  }
  ctx.fillStyle = '#68c';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  const sdx = survivor.x - px, sdy = survivor.y - py;
  const sDist = Math.hypot(sdx, sdy);
  if (sDist < maxDist) {
    const sAngle = Math.atan2(sdy, sdx);
    let sRel = sAngle - pDir2;
    while (sRel < -Math.PI) sRel += Math.PI * 2;
    while (sRel > Math.PI) sRel -= Math.PI * 2;
    const sRadarDist = (sDist / maxDist) * r * 0.85;
    const sx2 = cx + Math.sin(sRel) * sRadarDist;
    const sy2 = cy - Math.cos(sRel) * sRadarDist;
    ctx.fillStyle = '#f84';
    ctx.beginPath();
    ctx.arc(sx2, sy2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
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
  ctx.imageSmoothingEnabled = false;
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
    if (gamePhase === 'hunter') {
      const d = hit ? perpDist : 6;
      const a = Math.max(0.001, 0.02 / (1 + d * 0.2));
      wallBr = a; ceilBr = a * 0.3; floorBr = a * 0.3;
    } else if (lampOn) {
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
    const brightness = f * wallBr;

    let wallTex = null;
    if (hit && brightness > 0.005) {
      for (const d of exitDoors) {
        if (mapX === d.x && mapY === d.y) {
          if (d.state === 'closed' && doorTex.complete && doorTex.naturalWidth > 0) wallTex = doorTex;
          else if (d.state === 'mid' && doorMidTex.complete && doorMidTex.naturalWidth > 0) wallTex = doorMidTex;
          else if (d.state === 'open' && doorOpenTex.complete && doorOpenTex.naturalWidth > 0) wallTex = doorOpenTex;
          break;
        }
      }
    }
    if (wallTex) {
      const tw = wallTex.width, th = wallTex.height;
      const texNormW = Math.min(1, tw / th);
      const texNormH = Math.min(1, th / tw);
      const texHOff = (1 - texNormW) / 2;
      const texVOff = (1 - texNormH) / 2;
      const wallX = side === 0 ? py + perpDist * sinR : px + perpDist * cosR;
      const wallFrac = wallX - Math.floor(wallX);
      const relX = (wallFrac - texHOff) / texNormW;
      if (relX >= 0 && relX < 1) {
        const texCol = (relX * tw) | 0;
        const visStart = Math.max(0, drawStart);
        const visEnd = Math.min(H, drawEnd);
        const visH = visEnd - visStart;
        if (visH > 0) {
          const texStartY = (texVOff + ((visStart - drawStart) / wallH) * texNormH) * th;
          const texVisH = (visH / wallH) * texNormH * th;
          ctx.drawImage(wallTex, texCol, texStartY, 1, texVisH, (i * COL_W) | 0, visStart, COL_W | 0, visH);
          ctx.globalAlpha = 1 - brightness;
          ctx.fillStyle = '#000';
          ctx.fillRect((i * COL_W) | 0, visStart, COL_W | 0, visH);
  if (illum) {
    const flashSize = sSize * 3;
    const grd = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, flashSize);
    grd.addColorStop(0, `rgba(255,255,255,${visAlpha * 0.6})`);
    grd.addColorStop(0.3, `rgba(255,255,220,${visAlpha * 0.2})`);
    grd.addColorStop(1, 'rgba(255,255,220,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(screenX - flashSize, screenY - flashSize, flashSize * 2, flashSize * 2);
  }
  ctx.globalAlpha = 1;
}
      } else {
        ctx.fillStyle = `rgb(${(80 * brightness) | 0},${(76 * brightness) | 0},${(72 * brightness) | 0})`;
        ctx.fillRect(i * COL_W | 0, drawStart, COL_W | 0, wallH);
      }
    } else {
      ctx.fillStyle = `rgb(${(80 * brightness) | 0},${(76 * brightness) | 0},${(72 * brightness) | 0})`;
      ctx.fillRect(i * COL_W | 0, drawStart, COL_W | 0, wallH);
    }

    ctx.fillStyle = `rgb(${(5 * ceilBr) | 0},${(5 * ceilBr) | 0},${(5 * ceilBr) | 0})`;
    ctx.fillRect(i * COL_W | 0, 0, COL_W | 0, Math.max(0, drawStart));

    ctx.fillStyle = `rgb(${(240 * floorBr) | 0},${(240 * floorBr) | 0},${(240 * floorBr) | 0})`;
    const floorStart = Math.min(H, drawEnd);
    if (floorStart < H) ctx.fillRect(i * COL_W | 0, floorStart, COL_W | 0, H - floorStart);
  }

  renderFootprints(hz);
  renderItems(hz);
  renderDust(hz);
  renderExitEIcon();
  if (gamePhase === 'hunter') { renderHunter(hz); renderHunterRadar(); renderSurvFootprints(hz); }

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
    if (gamePhase !== 'hunter') {
    const lx = lampOffX;
    const ly = (H >> 1) + lampOffY;
    const ls = 1.6;
    lCtx.clearRect(0, 0, W, H);
    lCtx.imageSmoothingEnabled = false;
    const drawRotated = (ctx2, img) => {
      if (!img || !img.complete || img.naturalWidth <= 0) return;
      const iw = img.naturalWidth * ls, ih = img.naturalHeight * ls;
      ctx2.save();
      ctx2.translate(lx + ih / 2, ly + iw / 2);
      ctx2.rotate(Math.PI / 2);
      ctx2.drawImage(img, -iw / 2, -ih / 2, iw, ih);
      ctx2.restore();
    };
    drawRotated(lCtx, lampImg);
    drawRotated(lCtx, batteryImgs[lampBattery]);
    const ki = Math.min(3, inventory.keys);
    if (keyImgs[ki]) drawRotated(lCtx, keyImgs[ki]);
    drawRotated(lCtx, lampOn ? lampBtnOnImg : lampBtnImg);
    if (!lampOn) {
      lCtx.globalCompositeOperation = 'source-atop';
      lCtx.fillStyle = 'rgba(0,0,0,0.85)';
      lCtx.fillRect(0, 0, W, H);
      lCtx.globalCompositeOperation = 'source-over';
    }
    lCtx.imageSmoothingEnabled = true;
    ctx.drawImage(lampCanvas, 0, 0);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aaa';
    let invY = H - 30;
    ctx.textAlign = 'right';
    const nx = W - 10;
    let ny = 20;
    for (const n of notifications) {
      let offset = 0;
      let a = 1;
      if (n.timer > 1.5) {
        const t = (n.timer - 1.5) / 0.5;
        offset = t * W;
      } else if (n.timer < 0.5) {
        const t = (0.5 - n.timer) / 0.5;
        offset = t * W;
        a = 1 - t;
      }
      ctx.globalAlpha = a;
      ctx.font = 'bold 16px monospace';
      const tw = ctx.measureText(n.text).width;
      const pad = 14;
      const boxW = tw + pad * 2;
      const boxH = 28;
      const boxX = nx - boxW + offset;
      const boxY = ny - boxH / 2;
      ctx.fillStyle = '#000';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, boxH, 4);
      else ctx.rect(boxX, boxY, boxW, boxH);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(n.text, boxX + boxW / 2, ny + 5);
      ctx.textAlign = 'right';
      ny += boxH + 6;
    }
    ctx.globalAlpha = 1;
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
    if (gamePhase === 'hunter') {
      ctx.fillStyle = '#f84';
      ctx.textAlign = 'center';
      const scx = toCell(survivor.x), scy = toCell(survivor.y);
      const stxt = 'SURV: (' + scx + ',' + scy + ')  KEYS: ' + survivor.keys + '  STATE: ' + survivor.state + '  TARGET: ' + (survivor.targetCell ? '(' + survivor.targetCell.x + ',' + survivor.targetCell.y + ')' : 'NONE');
      ctx.fillText(stxt, W >> 1, 36);
    }
    }
  }

  ctx.fillStyle = 'rgba(255,240,200,0.04)';
  ctx.fillRect(0, 0, W, H);

  for (const d of exitDoors) {
    if (d.state === 'open' && d.timer > 0) {
      const flash = 1 - (d.timer / d.timerMax);
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
  }
  if (respawnFlash > 0) {
    const f = 1 - (respawnFlash / 0.6);
    ctx.fillStyle = `rgba(255,255,255,${f})`;
    ctx.fillRect(0, 0, W, H);
  }

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

  if (gamePhase === 'hunter') {
    ctx.fillStyle = '#f84';
    ctx.fillRect(MINIMAP_X + (survivor.x | 0) * MINIMAP_CELL, MINIMAP_Y + (survivor.y | 0) * MINIMAP_CELL, MINIMAP_CELL, MINIMAP_CELL);
  }
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

  if (handAnim > 0.001 && gamePhase !== 'hunter') {
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
  gamePhase = 'survivor';
  hunterRoarTimer = 15 + Math.random() * 45;
  monsterStepT = 0;
  radarBlackout = 0;
  respawnFlash = 0;
  survFootprints = [];
  findExitDoors();
  spawnKey();
  buildNavGrid();
  buildRouteTable();
  player.x = 1.5; player.y = 1.5; player.dir = 0; player.pitch = 0;
  player.won = false; player.winTime = 0;
  stamina.cur = stamina.max;
  moveT = 0;
  walkTimer = 0;
  walkDelay = 0;
  walkStep = 0;
  lampBattery = 10;
  lampBatteryTimer = 0;
  lampOn = true;
  prevLampOn = true;
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
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (W / rect.width);
  const my = (e.clientY - rect.top) * (H / rect.height);

  if (gameOver) {
    const bx = (W >> 1) - 110, by = (H >> 1) + 45, bw = 220, bh = 48;
    if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
      gameState = 'menu';
      exitFullscreen();
      restartGame();
      return;
    }
    return;
  }

  if (gameState === 'menu') {
    const bx = (W >> 1) - 120, by = (H >> 1) + 20, bw = 240, bh = 50;
    if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
      gameState = 'playing';
      enterFullscreen();
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
      enterFullscreen();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      ignoreNextMove = true;
      canvas.requestPointerLock();
      return;
    }
    const sby = (H >> 1) + 80;
    if (mx >= bx && mx <= bx + bw && my >= sby && my <= sby + bh) {
      gameState = 'menu';
      exitFullscreen();
      restartGame();
      return;
    }
    return;
  }

  if (mouseLocked) {
    // (interaction via E key in update)
  } else {
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
findExitDoors();
spawnKey();
buildNavGrid();
buildRouteTable();
spawnEnemy();
hunterMode = true;
if (hunterMode) { startHunterPhase(); gameState = 'playing'; initAudio(); }
requestAnimationFrame((now) => { last = now; loop(now); });
