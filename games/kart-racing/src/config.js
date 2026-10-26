// Shared tuning + content tables (roster, items, classes, tracks, cups, paints). Every module reads from here.

export const GAME_TITLE = 'Zoomies GP';

export const RACE = {
  laps: 3,
  racers: 8,
  countdownSeconds: 3,
};

// World scale: 1 unit = 1 meter. Y is up. Track lies roughly in the XZ plane.
export const PHYSICS = {
  gravity: 38,
  kartRadius: 1.3,          // collision radius (kart vs kart / wall / items)
  maxSpeed: 38,             // base top speed on road (units/s) before stat modifiers
  reverseMaxSpeed: 12,
  accel: 22,
  brakeDecel: 45,
  coastDecel: 8,
  offroadMaxSpeedFactor: 0.45,
  splashMaxSpeedFactor: 0.78,  // shallow water fords
  iceGrip: 0.22,               // fraction of normal lateral grip on ice
  boostSpeedBonus: 16,      // added to max speed while boosting
  miniTurboTimes: [0.55, 0.45, 0.5], // blue, orange, purple boost durations (s)
  driftChargeThresholds: [0.9, 1.9, 3.0], // seconds of drifting needed to reach each level
  fizzBoostTime: 1.3,
  prismTime: 7.5,
  spinOutTime: 1.1,
  tumbleTime: 1.6,
  bellShrinkTime: 5,
};

// stats are 1..5. speed -> top speed, accel -> acceleration, handling -> turn rate/drift,
// weight -> bump resolution (heavier pushes lighter). `paint` = kart body colours in the model (for paint jobs).
export const CHARACTERS = [
  { id: 'fennix',  name: 'Fennix',  zh: '芬尼克斯', species: 'Fennec fox', speciesZh: '耳廓狐', kart: 'Dune Hopper', kartZh: '沙丘跳跳车', color: 0xf26b1d, accent: 0x19b5a5, stats: { speed: 3, accel: 3, handling: 3, weight: 3 } },
  { id: 'bolt',    name: 'Bolt-9',  zh: '波特9号',  species: 'Tin robot', speciesZh: '铁皮机器人', kart: 'Toaster', kartZh: '烤面包机', color: 0x19b5a5, accent: 0xaab4bf, stats: { speed: 3, accel: 4, handling: 3, weight: 3 } },
  { id: 'mochi',   name: 'Mochi',   zh: '麻糬',     species: 'Hamster', speciesZh: '仓鼠', kart: 'Pod', kartZh: '泡泡舱', color: 0xff6fa3, accent: 0xfff0d6, stats: { speed: 2, accel: 5, handling: 4, weight: 1 } },
  { id: 'tusk',    name: 'Tusk',    zh: '塔斯克',   species: 'Walrus', speciesZh: '海象', kart: 'Tugboat', kartZh: '拖船', color: 0x24345e, accent: 0xc4473a, stats: { speed: 5, accel: 1, handling: 2, weight: 5 } },
  { id: 'juniper', name: 'Juniper', zh: '杜松',     species: 'Owl', speciesZh: '猫头鹰', kart: 'Biplane', kartZh: '双翼机', color: 0x6b4bc4, accent: 0xffd23f, stats: { speed: 3, accel: 3, handling: 5, weight: 2 } },
  { id: 'bramble', name: 'Bramble', zh: '布兰布',   species: 'Ram', speciesZh: '公羊', kart: 'Tractor', kartZh: '拖拉机', color: 0x4f8a3a, accent: 0xd8c08a, stats: { speed: 4, accel: 2, handling: 2, weight: 4 } },
  { id: 'octavia', name: 'Octavia', zh: '奥塔维娅', species: 'Octopus', speciesZh: '章鱼', kart: 'Sub', kartZh: '潜水艇', color: 0xd63c8c, accent: 0x19b5a5, stats: { speed: 3, accel: 4, handling: 4, weight: 2 } },
  { id: 'pepper',  name: 'Pepper',  zh: '胡椒',     species: 'Penguin', speciesZh: '企鹅', kart: 'Bobsled', kartZh: '雪橇', color: 0xe2363f, accent: 0xf4f1ea, stats: { speed: 2, accel: 5, handling: 3, weight: 2 } },
  { id: 'axel',    name: 'Axel',    zh: '阿克塞',   species: 'Axolotl', speciesZh: '六角恐龙', kart: 'Jet Ski', kartZh: '水上摩托', color: 0xff8cc0, accent: 0x33d1c9, stats: { speed: 4, accel: 3, handling: 4, weight: 2 }, unlock: { stars: 8 } },
  { id: 'rascal',  name: 'Rascal',  zh: '小浣熊',   species: 'Raccoon', speciesZh: '浣熊', kart: 'Hot Rod', kartZh: '热棒赛车', color: 0x5a5a66, accent: 0x9be03c, stats: { speed: 4, accel: 4, handling: 2, weight: 3 }, unlock: { trophy: 'critter' } },
];
export const characterById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

// Paint jobs recolour the model's kart body colours (meta.paint in the GLB) -> these two colours.
export const PAINTS = [
  { id: 'stock', name: 'Stock', zh: '原厂', colors: null },
  { id: 'midnight', name: 'Midnight', zh: '午夜', colors: [0x2f3270, 0x1c1d45], unlock: { stars: 12 } },
  { id: 'candy', name: 'Candy', zh: '糖果', colors: [0xff8cc6, 0xe2366f], unlock: { trophy: 'critter', minClass: 'zoom' } },
  { id: 'gold', name: 'Gold', zh: '黄金', colors: [0xffcf3a, 0xc8901a], unlock: { trophy: 'critter', minClass: 'turbo', gold: true } },
];

// Items (same gameplay roles as classic kart racers, our own designs).
export const ITEMS = ['fizz', 'fizz3', 'gum', 'ball', 'bee', 'prism', 'bell', 'comet'];
export const ITEM_INFO = {
  fizz:  { name: 'Fizz Rocket',   zh: '汽水火箭', icon: 'ui/icons/fizz.webp' },
  fizz3: { name: 'Fizz Six-Pack', zh: '汽水三连', icon: 'ui/icons/fizz3.webp' },
  gum:   { name: 'Gum Blob',      zh: '泡泡糖',   icon: 'ui/icons/gum.webp' },
  ball:  { name: 'Bouncer Ball',  zh: '弹弹球',   icon: 'ui/icons/ball.webp' },
  bee:   { name: 'Buzz Drone',    zh: '追踪蜂',   icon: 'ui/icons/bee.webp' },
  prism: { name: 'Prism Shield',  zh: '棱彩护盾', icon: 'ui/icons/prism.webp' },
  bell:  { name: 'Shrink Bell',   zh: '缩小铃',   icon: 'ui/icons/bell.webp' },
  comet: { name: 'Crown Comet',   zh: '王冠彗星', icon: 'ui/icons/comet.webp' },
};

// Classes (difficulty). aiSpeedFactor scales AI top speed, aiSkill = line accuracy / drift / item smarts.
export const DIFFICULTY = {
  chill: { aiSpeedFactor: 0.86, aiSkill: 0.55, rubberBand: 0.08, name: 'Chill', zh: '悠闲', cc: 'CHILL' },
  zoom:  { aiSpeedFactor: 0.95, aiSkill: 0.78, rubberBand: 0.12, name: 'Zoom', zh: '飞驰', cc: 'ZOOM' },
  turbo: { aiSpeedFactor: 1.01, aiSkill: 0.96, rubberBand: 0.16, name: 'Turbo', zh: '涡轮', cc: 'TURBO' },
};
export const CLASS_ORDER = ['chill', 'zoom', 'turbo'];
// legacy aliases used by older modules
DIFFICULTY.easy = DIFFICULTY.chill; DIFFICULTY.normal = DIFFICULTY.zoom; DIFFICULTY.hard = DIFFICULTY.turbo;

// Track keys: '<trackId>' or '<trackId>:<variant>'.
export const TRACKS = [
  { key: 'harbor', id: 'harbor', name: 'Harborlight Bay', zh: '灯塔湾', music: 'harbor', thumb: 'harbor' },
  { key: 'canyon', id: 'canyon', name: 'Sunset Canyon', zh: '日落峡谷', music: 'canyon', thumb: 'canyon' },
  { key: 'frost', id: 'frost', name: 'Aurora Pines', zh: '极光松林', music: 'frost', thumb: 'frost' },
  { key: 'harbor:night', id: 'harbor', variant: 'night', name: 'Lantern Night Bay', zh: '灯笼夜湾', music: 'night', thumb: 'harbor-night', unlock: { trophy: 'critter' } },
];
export const trackByKey = (key) => TRACKS.find((t) => t.key === key) || TRACKS[0];

export const CUPS = [
  { id: 'critter', name: 'Critter Cup', zh: '萌宠杯', races: ['harbor', 'canyon', 'frost'] },
  { id: 'moonlight', name: 'Moonlight Cup', zh: '月光杯', races: ['harbor:night', 'frost', 'canyon'], unlock: { trophy: 'critter' } },
];
export const GP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

export const KEYS = {
  accelerate: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  drift: ['Space', 'ShiftRight'],
  item: ['KeyE', 'ShiftLeft', 'KeyX'],
  lookBack: ['KeyC'],
  pause: ['Escape', 'KeyP'],
};
