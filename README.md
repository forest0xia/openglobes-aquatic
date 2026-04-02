# 深海探索 AquaticGlobe

全球海洋生物3D互动地球 — 228种海洋生物在深海中游动，不是地图上的图标，而是活的生命。

**Live:** [aquatic.openglobes.com](https://aquatic.openglobes.com)

**水下直达:** [aquatic.openglobes.com/?v=uw](https://aquatic.openglobes.com/?v=uw)

Part of [OpenGlobes](https://openglobes.com) — open-source 3D data globe visualizations.

## Features

### 3D Globe
- 228种海洋生物按真实地理坐标分布
- 物种 sprite 按 5 种动画模式游动（巡游、群游、悬停、漂浮、疾冲）
- 81条洄游路线（带闪光流动效果）
- 珊瑚选择性 bloom 光晕（UnrealBloomPass）
- 2000+ 闪烁星空背景
- 白天/夜晚主题切换

### 沉浸式水下场景
- 双击海面（仅限海洋区域）潜入水下 — NASA 海洋遮罩自动判断海/陆
- 600×600 海底地形：Perlin noise 起伏 + 海底山脊/悬崖
- 1000 个珊瑚/海葵装饰（80 个自然聚落），闪光 shader
- 鱼类分左右朝向两组 InstancedMesh，围绕摄像机做圆周轨道游动
- 鲸鱼、鲨鱼、海豚等大型生物始终出现
- 动画水面折射光纹（从水底仰望可见）
- 深海环境背景音乐 + 水下环境音效

### 真实海洋声音
- 13 个 NOAA 公共领域录音：座头鲸歌声、抹香鲸回声定位、宽吻海豚哨声等
- 虎鲸、白鲸专属录音
- 鱼类/虾类保留程序合成声音

### 操控
- **PC:** WASD 移动 + 鼠标拖拽环顾 + 虚拟摇杆
- **手机:** 触摸旋转 + 左侧移动摇杆 + 右侧升降滑杆 + 「潜入水下」按钮
- **URL 参数:** `?v=uw` 直接进入水下场景

## Development

```bash
# Symlink data from ETL output
ln -s ../openglobes-etl/output/aquatic data

# Install and run
pnpm install
pnpm dev
```

### Sprite 朝向校准工具

`docs/sprite-facing-tool.html` — 浏览器打开可逐个确认/修正 sprite 的左右朝向，导出 `facing.json`。

## Architecture

### Rendering (plain Three.js, no three-globe)

Custom rendering stack in `src/globe/`:

| File | Purpose |
|------|---------|
| `GlobeRenderer.ts` | Scene, camera, RAF loop, ACES tone mapping, selective bloom pipeline, underwater mode |
| `EarthMesh.ts` | Textured sphere with bump maps |
| `AtmosphereShader.ts` | Dual-layer fresnel glow |
| `SpeciesLayer.ts` | `InstancedMesh` for all species sprites (1 draw call) + coral bloom glow mesh |
| `SpeciesShader.ts` | GLSL: billboard, 5 swim animations, body wave, scatter offset |
| `TrailLayer.ts` | Line2 migration trails + shimmer highlight |
| `UnderwaterScene.ts` | Seabed, fish (left/right groups), coral decorations, particles, lighting |
| `UnderwaterShader.ts` | Seabed terrain displacement, fish orbit, coral sparkle, surface caustics |
| `constants.ts` | Shared constants (BLOOM_LAYER) |
| `coordUtils.ts` | lat/lng → Three.js Vector3 |

### Data model

| File | Contents |
|------|----------|
| `final.json` | 228 species, 1000+ viewing spots, bilingual names |
| `hotspots.json` | 25 marine hotspots |
| `migration_routes.json` | 81 migration corridors |
| `sprites/spritesheet-0.webp` | 450 species sprites atlas (~3MB) |
| `sprites/spritesheet.json` | Atlas manifest (UV coordinates) |
| `facing.json` | Sprite facing direction (left/right per species) |
| `textures/ocean-mask.png` | NASA land/ocean mask for dive restriction |
| `audio/*.mp3` | 13 NOAA marine animal recordings |

### Audio

| Category | Source | Count |
|----------|--------|-------|
| 鲸歌 (whale song) | NOAA recordings | 3 variants |
| 回声定位 (whale clicks) | NOAA recordings | 2 variants |
| 海豚哨声/咔嗒 | NOAA recordings | 4 variants |
| 虎鲸/白鲸 | NOAA recordings | 2 species-specific |
| 海豹 | NOAA recordings | 2 variants |
| 鱼类/虾类 | Web Audio synthesis | 7 categories |
| 背景音乐 | Synthesized deep-sea drone | Looping |
| 水下环境音 | Synthesized ocean rumble | Looping |

### Performance

- **1 draw call** for all globe species (InstancedMesh)
- **2 draw calls** for underwater fish (left + right facing groups)
- **Selective bloom** — only coral glow objects go through UnrealBloomPass
- **Custom camera** with split exponential damping
- **Zero React re-renders** on hover (DOM-managed tooltips)
- **Tab visibility pause** — stops RAF when tab hidden

## Tech stack

- **Vite** + **React 19** + **TypeScript**
- **Three.js 0.183** (direct, no wrappers)
- **Custom GLSL shaders** (species, underwater terrain, coral sparkle, surface caustics)
- **UnrealBloomPass** (selective, additive overlay)
- **Web Audio API** (NOAA recordings + synthesis)
- **Tailwind 4** for UI styling

## Data sources

- [OBIS](https://obis.org) (CC-BY 4.0)
- [FishBase](https://www.fishbase.se) (CC-BY-NC 4.0)
- [GBIF](https://www.gbif.org) (CC0 / CC-BY 4.0)
- [NOAA Fisheries](https://www.fisheries.noaa.gov/national/science-data/sounds-ocean) (Public Domain)
- [NASA Blue Marble](https://visibleearth.nasa.gov) (Public Domain)

## License

Code: AGPL-3.0. Data: inherits source licenses.
