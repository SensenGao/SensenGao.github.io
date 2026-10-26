// Tiny English / 中文 string table. t('key', {param}) -> string; t.label(obj) picks obj.name / obj.zh.
import { settings } from './save.js';

const EN = {
  'title.press': 'PRESS ENTER / TAP TO START',
  'title.tag': 'Critter Kart Carnival',
  'menu.gp': 'Grand Prix', 'menu.gp.sub': 'Race a 3-track cup for points and a trophy',
  'menu.quick': 'Quick Race', 'menu.quick.sub': 'Pick any track and race 7 rivals',
  'menu.tt': 'Time Trial', 'menu.tt.sub': 'Race the clock and your best-lap ghost',
  'menu.missions': 'Missions', 'menu.missions.sub': 'Short challenges with 1–3 stars',
  'menu.settings': 'Settings', 'menu.credits': 'Credits',
  'menu.stars': '{n} STARS', 'menu.trophies': 'TROPHIES',
  'back': 'BACK', 'select': 'SELECT', 'start': 'START', 'locked': 'LOCKED', 'next': 'NEXT', 'retry': 'RETRY', 'menu': 'MENU', 'continue': 'CONTINUE',
  'choose.cup': 'CHOOSE A CUP', 'choose.track': 'CHOOSE A TRACK', 'choose.class': 'CHOOSE A CLASS', 'choose.racer': 'CHOOSE YOUR RACER',
  'class.chill': 'Chill', 'class.zoom': 'Zoom', 'class.turbo': 'Turbo',
  'class.chill.sub': 'Relaxed rivals', 'class.zoom.sub': 'Sharp rivals', 'class.turbo.sub': 'Ruthless rivals',
  'laps': 'LAPS', 'paint': 'PAINT', 'stat.speed': 'SPEED', 'stat.accel': 'ACCEL', 'stat.handling': 'HANDLING', 'stat.weight': 'WEIGHT',
  'race.n': 'RACE {n} / {of}', 'race.go': 'GO!', 'race.final': 'FINAL LAP!', 'race.wrong': 'WRONG WAY', 'race.finish': 'FINISH!', 'race.lap': 'LAP',
  'race.best': 'BEST', 'race.ghost': 'GHOST', 'race.skip': 'ENTER · SKIP',
  'pause.title': 'PAUSED', 'pause.resume': 'Resume', 'pause.restart': 'Restart', 'pause.settings': 'Settings', 'pause.quit': 'Quit to Menu',
  'res.victory': 'VICTORY!', 'res.podium': 'PODIUM FINISH!', 'res.done': 'RACE COMPLETE', 'res.results': 'RESULTS', 'res.again': 'RACE AGAIN',
  'res.time': 'TIME', 'res.bestlap': 'BEST LAP', 'res.newbest': 'NEW BEST!', 'res.you': 'YOU',
  'gp.standings': 'CUP STANDINGS', 'gp.after': 'AFTER RACE {n} OF {of}', 'gp.next': 'NEXT RACE', 'gp.podium': 'CUP PODIUM', 'gp.pts': 'PTS',
  'gp.trophy.gold': 'GOLD TROPHY!', 'gp.trophy.silver': 'SILVER TROPHY!', 'gp.trophy.bronze': 'BRONZE TROPHY!', 'gp.trophy.none': 'NO TROPHY THIS TIME',
  'tt.best': 'BEST LAP', 'tt.noghost': 'No ghost yet — set a lap!', 'tt.newghost': 'NEW GHOST SAVED!',
  'm.brief': 'MISSION', 'm.goal': 'GOAL', 'm.stars': 'STARS', 'm.complete': 'MISSION COMPLETE', 'm.failed': 'MISSION FAILED', 'm.time': 'TIME',
  'unlock.new': 'NEW UNLOCK!', 'unlock.stars': 'Earn {n} mission stars', 'unlock.trophy': 'Win a trophy in the {cup}', 'unlock.trophyClass': 'Win a {cup} trophy in {cls} class',
  'unlock.gold': 'Win gold in the {cup} ({cls})',
  'set.title': 'SETTINGS', 'set.music': 'Music volume', 'set.sfx': 'Sound volume', 'set.mute': 'Mute all', 'set.quality': 'Graphics quality',
  'set.lang': 'Language', 'set.assist': 'Steering assist', 'assist.auto': 'Auto (Chill)', 'assist.on': 'ON', 'assist.off': 'OFF', 'set.voice': 'Announcer volume', 'set.voiceMute': 'Announcer', 'set.shake': 'Camera shake', 'set.auto': 'Auto-accelerate (touch)', 'set.reset': 'Reset progress', 'set.reset.confirm': 'Press again to erase all progress',
  'q.auto': 'Auto ({p})', 'q.low': 'Low', 'q.medium': 'Medium', 'q.high': 'High', 'on': 'ON', 'off': 'OFF',
  'credits.title': 'CREDITS',
  'loading': 'LOADING', 'loading.track': 'LOADING TRACK',
  'touch.item': 'ITEM', 'touch.drift': 'DRIFT', 'touch.brake': 'BRAKE', 'touch.gas': 'GAS',
  'rotate': 'Rotate your phone to landscape',
  'controls': '←/→ steer · ↑ gas · ↓ brake · SPACE drift · E item · C look back · ESC pause · M mute',
  'unit.drift': 'MINI-TURBOS', 'unit.gems': 'GEMS', 'unit.targets': 'BALLOONS', 'unit.overtake': 'PLACE', 'unit.gates': 'GATES', 'unit.ultra': 'ULTRA TURBOS', 'unit.pads': 'BOOST PADS', 'unit.dodge': 'HITS', 'unit.hits': 'HITS', 'unit.clean': '',
};

const ZH = {
  'title.press': '按回车 / 轻触开始',
  'title.tag': '萌宠卡丁车嘉年华',
  'menu.gp': '大奖赛', 'menu.gp.sub': '三条赛道连战，争夺积分与奖杯',
  'menu.quick': '快速比赛', 'menu.quick.sub': '任选赛道，与 7 位对手比赛',
  'menu.tt': '计时赛', 'menu.tt.sub': '挑战时间和你的最佳圈幽灵',
  'menu.missions': '任务挑战', 'menu.missions.sub': '短小挑战，获得 1–3 颗星',
  'menu.settings': '设置', 'menu.credits': '制作名单',
  'menu.stars': '{n} 颗星', 'menu.trophies': '奖杯',
  'back': '返回', 'select': '选择', 'start': '开始', 'locked': '未解锁', 'next': '下一个', 'retry': '重试', 'menu': '菜单', 'continue': '继续',
  'choose.cup': '选择杯赛', 'choose.track': '选择赛道', 'choose.class': '选择难度', 'choose.racer': '选择赛车手',
  'class.chill': '悠闲', 'class.zoom': '飞驰', 'class.turbo': '涡轮',
  'class.chill.sub': '轻松的对手', 'class.zoom.sub': '敏锐的对手', 'class.turbo.sub': '凶猛的对手',
  'laps': '圈数', 'paint': '涂装', 'stat.speed': '速度', 'stat.accel': '加速', 'stat.handling': '操控', 'stat.weight': '重量',
  'race.n': '第 {n} / {of} 场', 'race.go': '出发！', 'race.final': '最后一圈！', 'race.wrong': '方向错误', 'race.finish': '冲线！', 'race.lap': '圈',
  'race.best': '最佳', 'race.ghost': '幽灵', 'race.skip': '回车 · 跳过',
  'pause.title': '暂停', 'pause.resume': '继续', 'pause.restart': '重新开始', 'pause.settings': '设置', 'pause.quit': '返回主菜单',
  'res.victory': '胜利！', 'res.podium': '登上领奖台！', 'res.done': '比赛结束', 'res.results': '成绩', 'res.again': '再来一局',
  'res.time': '时间', 'res.bestlap': '最佳单圈', 'res.newbest': '新纪录！', 'res.you': '你',
  'gp.standings': '杯赛积分榜', 'gp.after': '第 {n} / {of} 场之后', 'gp.next': '下一场', 'gp.podium': '杯赛颁奖台', 'gp.pts': '分',
  'gp.trophy.gold': '金杯！', 'gp.trophy.silver': '银杯！', 'gp.trophy.bronze': '铜杯！', 'gp.trophy.none': '这次没有奖杯',
  'tt.best': '最佳单圈', 'tt.noghost': '还没有幽灵——先跑一圈吧！', 'tt.newghost': '新幽灵已保存！',
  'm.brief': '任务', 'm.goal': '目标', 'm.stars': '星级', 'm.complete': '任务完成', 'm.failed': '任务失败', 'm.time': '时间',
  'unlock.new': '新解锁！', 'unlock.stars': '获得 {n} 颗任务星', 'unlock.trophy': '在{cup}中获得奖杯', 'unlock.trophyClass': '在{cls}难度的{cup}中获得奖杯',
  'unlock.gold': '在{cls}难度的{cup}中夺得金杯',
  'set.title': '设置', 'set.music': '音乐音量', 'set.sfx': '音效音量', 'set.mute': '全部静音', 'set.quality': '画质',
  'set.lang': '语言', 'set.assist': '转向辅助', 'assist.auto': '自动（悠闲）', 'assist.on': '开', 'assist.off': '关', 'set.voice': '播报音量', 'set.voiceMute': '播报员', 'set.shake': '镜头震动', 'set.auto': '自动加速（触屏）', 'set.reset': '重置进度', 'set.reset.confirm': '再按一次清除全部进度',
  'q.auto': '自动（{p}）', 'q.low': '低', 'q.medium': '中', 'q.high': '高', 'on': '开', 'off': '关',
  'credits.title': '制作名单',
  'loading': '加载中', 'loading.track': '赛道加载中',
  'touch.item': '道具', 'touch.drift': '漂移', 'touch.brake': '刹车', 'touch.gas': '油门',
  'rotate': '请将手机横屏',
  'controls': '←/→ 转向 · ↑ 油门 · ↓ 刹车 · 空格 漂移 · E 道具 · C 回看 · ESC 暂停 · M 静音',
  'unit.drift': '次迷你加速', 'unit.gems': '颗宝石', 'unit.targets': '个气球', 'unit.overtake': '名次', 'unit.gates': '道门', 'unit.ultra': '次极限加速', 'unit.pads': '次加速板', 'unit.dodge': '次被撞', 'unit.hits': '次命中', 'unit.clean': '',
};

export function lang() { return (settings() && settings().lang) || 'en'; }
export function t(key, params) {
  const table = lang() === 'zh' ? ZH : EN;
  let s = table[key] ?? EN[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll('{' + k + '}', v);
  return s;
}
/** Localised display name of a content object ({ name, zh }). */
t.label = (o) => (o ? (lang() === 'zh' && o.zh ? o.zh : o.name) : '');
t.field = (o, f) => (o ? (lang() === 'zh' && o[f + 'Zh'] ? o[f + 'Zh'] : o[f]) : '');
