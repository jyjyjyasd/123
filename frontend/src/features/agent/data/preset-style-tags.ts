export interface PresetStyleTag {
  id: string;
  name: string;        // 标签显示名称 (如: 国风水墨)
  category: string;    // 分类名称 (如: 国风/东方)
  description: string; // 简短描述 (如: 水墨渲染、金箔点缀)
  prompt: string;      // 预制的专业英文 Prompt
}

export const PRESET_STYLE_CATEGORIES = ["全部", "国风/东方", "3D/现代", "摄影/真实", "插画/手绘"];

export const PRESET_STYLE_TAGS: PresetStyleTag[] = [
  {
    id: "guofeng-ink",
    name: "国风水墨",
    category: "国风/东方",
    description: "写意水墨、金箔点缀、诗意留白",
    prompt: "Traditional Chinese ink wash painting style, atmospheric ethereal background, gold leaf foil accents, delicate brushwork, elegant composition, high-end poster aesthetic."
  },
  {
    id: "dunhuang-mural",
    name: "敦煌壁画重彩",
    category: "国风/东方",
    description: "飞天重彩、壁画风化、矿物颜料",
    prompt: "Dunhuang mural art style, mineral pigment colors, intricate gold linework, weathered ancient wall texture, majestic oriental aesthetic."
  },
  {
    id: "clay-3d",
    name: "粘土拟真",
    category: "3D/现代",
    description: "软萌粘土、柔光灯影、C4D渲染",
    prompt: "Cute 3D clay animation style, soft tactile plasticine material, isometric studio lighting, vibrant pastel palette, highly detailed 8k render."
  },
  {
    id: "cyberpunk",
    name: "赛博朋克",
    category: "3D/现代",
    description: "霓虹光影、夜幕城市、科技质感",
    prompt: "Cyberpunk aesthetic, glowing neon cyan and magenta lighting, rain-slicked dark futuristic street, glossy metallic textures, high contrast poster."
  },
  {
    id: "glassmorphism",
    name: "玻璃磨砂拟物",
    category: "3D/现代",
    description: "通透玻璃、渐变磨砂、悬浮层次",
    prompt: "Modern glassmorphism 3D render, translucent frosted glass UI elements, vibrant gradient background light, futuristic clean layout."
  },
  {
    id: "minimalist-photo",
    name: "极简商用摄影",
    category: "摄影/真实",
    description: "静物棚拍、自然柔光、莫兰迪色",
    prompt: "Minimalist commercial product photography, soft natural studio lighting, clean solid background, sharp focus, Hasselblad medium format camera style."
  },
  {
    id: "vintage-film",
    name: "复古胶片感",
    category: "摄影/真实",
    description: "胶片颗粒、暖调采光、怀旧感",
    prompt: "Vintage 35mm film photography grain, warm retro tone, soft sunlight flare, nostalgic emotional atmosphere, Leica lens quality."
  },
  {
    id: "bauhaus-flat",
    name: "包豪斯几何",
    category: "插画/手绘",
    description: "经典包豪斯色块、红黄蓝撞色",
    prompt: "Bauhaus style poster, bold red blue yellow color block composition, geometric shapes, retro textured paper, minimalist modern art."
  },
  {
    id: "watercolor-doodle",
    name: "温暖绘本涂鸦",
    category: "插画/手绘",
    description: "温馨手绘线条、水彩晕染",
    prompt: "Warm hand-drawn children book illustration, soft watercolor textures, cozy comforting colors, whimsical doodle details."
  }
];
