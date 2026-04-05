// ---------------------------------------------------------------------------
// speciesSizes — approximate real-world body size for display purposes.
//
// Maps species by Chinese name or falls back to scale-category estimates.
// Lengths in cm, used for the detail panel and encyclopedia.
// ---------------------------------------------------------------------------

export interface SpeciesSize {
  lengthCm: number; // typical adult body length in cm
  widthCm: number;  // typical body width/height in cm
}

/** Known species sizes (Chinese name → size). */
const KNOWN_SIZES: Record<string, SpeciesSize> = {
  // Whales
  '蓝鲸': { lengthCm: 2500, widthCm: 450 },
  '座头鲸': { lengthCm: 1500, widthCm: 400 },
  '灰鲸': { lengthCm: 1400, widthCm: 350 },
  '虎鲸': { lengthCm: 800, widthCm: 250 },
  '抹香鲸': { lengthCm: 1800, widthCm: 400 },
  '小须鲸': { lengthCm: 900, widthCm: 220 },
  '白鲸': { lengthCm: 500, widthCm: 140 },
  '独角鲸': { lengthCm: 500, widthCm: 130 },
  '南露脊鲸': { lengthCm: 1500, widthCm: 400 },
  // Sharks
  '鲸鲨': { lengthCm: 1200, widthCm: 300 },
  '大白鲨': { lengthCm: 500, widthCm: 150 },
  '姥鲨': { lengthCm: 800, widthCm: 200 },
  '双髻鲨': { lengthCm: 400, widthCm: 100 },
  '虎鲨': { lengthCm: 450, widthCm: 120 },
  '牛鲨': { lengthCm: 340, widthCm: 100 },
  '灰鲭鲨': { lengthCm: 350, widthCm: 80 },
  '长尾鲨': { lengthCm: 400, widthCm: 80 },
  '锤头鲨': { lengthCm: 350, widthCm: 90 },
  '礁鲨': { lengthCm: 200, widthCm: 50 },
  '白鳍鲨': { lengthCm: 180, widthCm: 45 },
  '黑鳍鲨': { lengthCm: 160, widthCm: 40 },
  '护士鲨': { lengthCm: 300, widthCm: 70 },
  // Rays
  '蝠鲼': { lengthCm: 500, widthCm: 700 },
  '鬼蝠鲼': { lengthCm: 450, widthCm: 600 },
  '魔鬼鱼': { lengthCm: 200, widthCm: 250 },
  // Dolphins & marine mammals
  '宽吻海豚': { lengthCm: 350, widthCm: 80 },
  '海豚': { lengthCm: 250, widthCm: 60 },
  '海狮': { lengthCm: 250, widthCm: 80 },
  '海豹': { lengthCm: 200, widthCm: 60 },
  '海象': { lengthCm: 350, widthCm: 140 },
  '海獭': { lengthCm: 120, widthCm: 30 },
  '儒艮': { lengthCm: 300, widthCm: 90 },
  '海牛': { lengthCm: 350, widthCm: 110 },
  // Large fish
  '翻车鲀': { lengthCm: 300, widthCm: 250 },
  '旗鱼': { lengthCm: 300, widthCm: 60 },
  '剑鱼': { lengthCm: 350, widthCm: 70 },
  '蓝枪鱼': { lengthCm: 400, widthCm: 80 },
  '金枪鱼': { lengthCm: 250, widthCm: 60 },
  '大西洋蓝鳍金枪鱼': { lengthCm: 300, widthCm: 70 },
  '大西洋鲟': { lengthCm: 300, widthCm: 50 },
  '欧洲鳗鲡': { lengthCm: 100, widthCm: 8 },
  // Medium fish
  '拿破仑鱼': { lengthCm: 200, widthCm: 70 },
  '鹦鹉鱼': { lengthCm: 50, widthCm: 20 },
  '石斑鱼': { lengthCm: 80, widthCm: 30 },
  '巨石斑鱼': { lengthCm: 250, widthCm: 80 },
  '狮子鱼': { lengthCm: 38, widthCm: 20 },
  '小丑鱼': { lengthCm: 11, widthCm: 5 },
  '河豚': { lengthCm: 30, widthCm: 20 },
  '海马': { lengthCm: 15, widthCm: 5 },
  '叶海龙': { lengthCm: 35, widthCm: 8 },
  // Turtles
  '绿海龟': { lengthCm: 120, widthCm: 100 },
  '棱皮龟': { lengthCm: 200, widthCm: 150 },
  '玳瑁': { lengthCm: 90, widthCm: 75 },
  // Invertebrates
  '大砗磲': { lengthCm: 120, widthCm: 60 },
  '巨型章鱼': { lengthCm: 300, widthCm: 200 },
  '大王乌贼': { lengthCm: 1300, widthCm: 100 },
  '蓝环章鱼': { lengthCm: 12, widthCm: 8 },
  '鹦鹉螺': { lengthCm: 20, widthCm: 18 },
  '帝王蟹': { lengthCm: 25, widthCm: 150 },
  // Small schooling
  '南极磷虾': { lengthCm: 6, widthCm: 1 },
  '沙丁鱼': { lengthCm: 25, widthCm: 5 },
  '凤尾鱼': { lengthCm: 15, widthCm: 3 },
  '美洲西鲱': { lengthCm: 35, widthCm: 8 },
  '飞鱼': { lengthCm: 25, widthCm: 5 },
  // Jellyfish
  '月亮水母': { lengthCm: 40, widthCm: 40 },
  '狮鬃水母': { lengthCm: 200, widthCm: 200 },
  '箱形水母': { lengthCm: 30, widthCm: 25 },
  // Coral
  '迷宫脑珊瑚': { lengthCm: 50, widthCm: 50 },
  '叶片脑珊瑚': { lengthCm: 40, widthCm: 40 },
  '团块滨珊瑚': { lengthCm: 60, widthCm: 60 },
  '火珊瑚': { lengthCm: 30, widthCm: 30 },
  '棘冠海星': { lengthCm: 35, widthCm: 35 },
};

/** Fallback size ranges by scale category. */
const SCALE_DEFAULTS: Record<string, SpeciesSize> = {
  tiny:    { lengthCm: 5,   widthCm: 2 },
  small:   { lengthCm: 25,  widthCm: 8 },
  medium:  { lengthCm: 60,  widthCm: 20 },
  large:   { lengthCm: 200, widthCm: 60 },
  massive: { lengthCm: 800, widthCm: 200 },
};

/** Get estimated real-world size for a species. */
export function getSpeciesSize(nameZh: string, scale: string): SpeciesSize {
  return KNOWN_SIZES[nameZh] ?? SCALE_DEFAULTS[scale] ?? SCALE_DEFAULTS.medium;
}

/** Format cm to a human-readable string (m for >= 100cm). */
export function formatLength(cm: number): string {
  if (cm >= 100) return `${(cm / 100).toFixed(1)}m`;
  return `${cm}cm`;
}

/**
 * Body-type grouping for encyclopedia sorting.
 * Returns a category string based on species name patterns.
 */
export function getBodyGroup(nameZh: string, name: string): string {
  const combined = `${nameZh} ${name}`.toLowerCase();
  if (/鲸|whale/.test(combined)) return '鲸类';
  if (/鲨|shark/.test(combined)) return '鲨鱼';
  if (/海豚|dolphin|orca|porpoise/.test(combined)) return '海豚';
  if (/鳐|蝠鲼|魔鬼鱼|ray|manta/.test(combined)) return '鳐类';
  if (/海龟|turtle|tortoise|玳瑁|棱皮龟/.test(combined)) return '海龟';
  if (/珊瑚|coral|海葵|anemone/.test(combined)) return '珊瑚/海葵';
  if (/水母|jellyfish|jelly/.test(combined)) return '水母';
  if (/章鱼|乌贼|squid|octopus|鹦鹉螺|nautilus/.test(combined)) return '头足类';
  if (/蟹|虾|磷虾|crab|shrimp|lobster|krill/.test(combined)) return '甲壳类';
  if (/海星|海胆|海参|starfish|urchin|cucumber/.test(combined)) return '棘皮动物';
  if (/海马|海龙|seahorse|pipefish/.test(combined)) return '海马/海龙';
  if (/海狮|海豹|海象|海獭|海牛|儒艮|seal|walrus|otter|manatee|dugong/.test(combined)) return '海洋哺乳';
  return '硬骨鱼';
}
