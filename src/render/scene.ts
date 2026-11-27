import * as THREE from 'three';
import type { Monster, Vec2, WorldState } from '../sim/world';
import { monsterById } from '../data/combat-defs';
import floorTextureUrl from '../assets/stone_tiles_02.webp?url';
import wallTextureUrl from '../assets/stone_tile_wall.webp?url';

/**
 * 灰盒渲染层。
 *
 * 硬约束（设计讨论 Q8）：这一层不允许把模型名、贴图名泄漏给逻辑层。
 * 逻辑层只给 Vec2 + defId，渲染层决定长什么样。
 */

/** 性能红线：同屏 60 只小怪 @60fps。 */
const MAX_INSTANCES = 96;

/**
 * 贴图：**当前是生成的占位图**，不是 Poly Haven 原件。
 *
 * 规格见 docs/design/lighting-and-textures.md：那两张真正的 CC0 原件
 * （303,178 B + 185,774 B，q90）因本环境拿不到下载，暂以脚本生成的
 * 石砖纹理占位（各约 18–20 KB，均值对齐规格里的 0x7a7a72 / 0xa9a5a0）。
 *
 * 换真件时只需替换 src/assets/ 下同名文件，代码与染色系数都不用动 ——
 * TINT 是按「贴图均值 → 目标 albedo」算的，均值一致即结果一致。
 *
 * 贴图名只许活在这一层：src/sim/ 与 src/types.ts 里不得出现任何贴图名。
 */
const TEXTURE_URL = {
  floor: floorTextureUrl,
  wall: wallTextureUrl,
};

/**
 * 染色系数：把贴图均值拉到目标 albedo，线性空间相乘。
 * 地面均值 0x7a7a72 → 目标 0x3a444d 得 0x8094b1；
 * 墙面均值 0xa9a5a0 → 目标 0x2c343b 得 0x475563。
 * 两端精确还原，所以贴图前后共用同一套目标 albedo。
 */
const TINT = {
  floor: 0x8094b1,
  wall: 0x475563,
};

/** 单张图覆盖 4 米。地面 26×30 即 repeat (6.5, 7.5)。 */
const METERS_PER_TILE = 4;

/** 传奇味配色：青灰 + 暗红 + 一点金。 */
const PALETTE = {
  // 目标 albedo，来自 docs/design/lighting-and-textures.md：
  // 地面提亮 1.86×、墙 1.92×、雾 2.69×。判据只有「地面线性亮度 1.86 倍」这一条。
  floor: 0x3a444d,
  wall: 0x2c343b,
  fog: 0x151b23,
  gold: 0xd8b46a,
  bloodRed: 0x7a2b28,
  player: 0xc9b48a,
  enemyNormal: 0x5a6a6a,
  enemyElite: 0x8a6a3a,
  enemyBoss: 0x8a3a34,
  common: 0xb9c0cc,
  green: 0x56c27a,
  blue: 0x4e9fe0,
  purple: 0xa874e6,
  orange: 0xe08a3c,
  commonLoot: 0xb9c0cc,
};

export class SceneView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  private playerMesh: THREE.Mesh;
  private monsterMeshes: THREE.InstancedMesh;
  private eliteRing: THREE.InstancedMesh;
  private bossMesh: THREE.InstancedMesh;
  private lootMesh: THREE.InstancedMesh;
  private lootColors: Float32Array;

  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();

  /** 假阴影贴片：实时阴影关掉，用一张椭圆暗色面代替。 */
  private shadowPlane: THREE.Mesh;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false; // 性能红线：不用实时阴影
    this.renderer.setClearColor(PALETTE.fog);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    // 固定视角：45° 斜俯视，锁死不可旋转
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.camera.position.set(0, 15, 17);
    this.camera.lookAt(0, 0, 1);

    // 雾距松到 (26, 60)：中段雾化系数 0.255 → 0.018，远端 0.590 → 0.275。
    // 这是性价比最高的一改 —— 不碰任何 albedo，整个纵深方向一起变亮。
    this.scene.fog = new THREE.Fog(PALETTE.fog, 26, 60);

    // 半球光代替环境光：上冷下暖，暗面有方向而不是平的死灰。
    // 整体亮度靠它撑，不靠点光 —— decay:2 的点光在 10 米处已衰减到 1/100。
    const hemi = new THREE.HemisphereLight(0x9fb0c4, 0x2e2620, 0.9);
    this.scene.add(hemi);

    const torch = new THREE.PointLight(PALETTE.gold, 2.2, 34, 2);
    torch.position.set(0, 7, 4);
    this.scene.add(torch);

    const coldFill = new THREE.PointLight(0x3a5a72, 1.2, 40, 2.5);
    coldFill.position.set(-8, 6, -10);
    this.scene.add(coldFill);

    this.buildRoom();

    // 玩家
    const playerGeo = new THREE.CapsuleGeometry(0.42, 1.0, 4, 8);
    const playerMat = new THREE.MeshLambertMaterial({ color: PALETTE.player });
    this.playerMesh = new THREE.Mesh(playerGeo, playerMat);
    this.playerMesh.position.set(0, 0.92, 6);
    this.scene.add(this.playerMesh);

    // 玩家脚下的假阴影
    const shadowGeo = new THREE.CircleGeometry(0.62, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.position.set(0, 0.02, 6);
    this.scene.add(this.shadowPlane);

    // 怪物：InstancedMesh，一次 draw call 画全部
    const enemyGeo = new THREE.ConeGeometry(0.5, 1.4, 6);
    const enemyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.monsterMeshes = new THREE.InstancedMesh(enemyGeo, enemyMat, MAX_INSTANCES);
    this.monsterMeshes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.monsterMeshes.count = 0;
    this.scene.add(this.monsterMeshes);

    // 精英脚下光环
    const ringGeo = new THREE.RingGeometry(0.55, 0.78, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.enemyElite,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.eliteRing = new THREE.InstancedMesh(ringGeo, ringMat, MAX_INSTANCES);
    this.eliteRing.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eliteRing.count = 0;
    this.scene.add(this.eliteRing);

    // Boss 用单独的 InstancedMesh（更大，颜色不同）
    const bossGeo = new THREE.IcosahedronGeometry(0.95, 0);
    const bossMat = new THREE.MeshLambertMaterial({ color: PALETTE.enemyBoss });
    this.bossMesh = new THREE.InstancedMesh(bossGeo, bossMat, 4);
    this.bossMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bossMesh.count = 0;
    this.scene.add(this.bossMesh);

    // 掉落物：小方块，按品质染色
    const lootGeo = new THREE.OctahedronGeometry(0.22, 0);
    const lootMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.lootMesh = new THREE.InstancedMesh(lootGeo, lootMat, 64);
    this.lootMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.lootMesh.count = 0;
    this.lootColors = new Float32Array(64 * 3);
    this.lootMesh.instanceColor = new THREE.InstancedBufferAttribute(this.lootColors, 3);
    this.scene.add(this.lootMesh);

    // 火把柱，给场景一点纵向节奏
    for (const [x, z] of [[-9, -2], [9, -2], [-9, -14], [9, -14]] as const) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 3.2, 0.5),
        new THREE.MeshLambertMaterial({ color: PALETTE.wall }),
      );
      pillar.position.set(x, 1.6, z);
      this.scene.add(pillar);

      const flame = new THREE.PointLight(PALETTE.gold, 1.1, 9, 2);
      flame.position.set(x, 3.4, z);
      this.scene.add(flame);
    }

    this.resize();
  }

  /**
   * 异步加载一张色贴图，到位后挂到材质上。
   *
   * 贴图到位前材质保持**目标 albedo 纯色**；到位后才换成「贴图 × 染色」，
   * 两者在观感上是同一块亮度，所以不闪也不卡首帧。
   * 三条必须的：设 sRGB 色彩空间、repeat 按米数算、只在 onLoad 里挂 map。
   * **不要提前挂空 Texture** —— 那会 bind 到一张 1×1 全零纹理，首帧渲染成纯黑。
   */
  private applyTexture(
    mat: THREE.MeshLambertMaterial,
    url: string,
    tint: number,
    repeatX: number,
    repeatY: number,
  ): void {
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        // r170 默认 NoColorSpace，不显式设成 sRGB 就是错的。
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
        tex.anisotropy = anisotropy;
        mat.map = tex;
        mat.color.setHex(tint);
        mat.needsUpdate = true;
      },
      undefined,
      () => {
        // 加载失败就留在纯色兜底上，不抛错、不黑屏。
        mat.color.setHex(tint);
        mat.needsUpdate = true;
      },
    );
  }

  /**
   * 一个房间：地面 + 四面墙。灰盒期所有层共用同一套几何。
   *
   * 四面墙是**朝内的 PlaneGeometry**，不是 BoxGeometry：BoxGeometry 六个面的
   * UV 一律归一化到 0..1，与物理尺寸无关，而一个 material 只有一个 repeat，
   * 四面尺寸不同的墙共用必然错位；相机 y=15 俯视时墙顶还全可见、会被拉伸 6.5 倍。
   */
  private buildRoom(): void {
    // 地面
    const floorGeo = new THREE.PlaneGeometry(26, 30, 1, 1);
    const floorMat = new THREE.MeshLambertMaterial({ color: PALETTE.floor });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.applyTexture(floorMat, TEXTURE_URL.floor, TINT.floor, 26 / METERS_PER_TILE, 30 / METERS_PER_TILE);

    // 地面缝隙线，让平面不至于看不出移动
    const grid = new THREE.GridHelper(30, 15, 0x3a424c, 0x333a43);
    grid.position.y = 0.01;
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.35;
    this.scene.add(grid);

    // 墙：四面各一片，朝向房间内部。长短边平铺次数不同，故分两个材质。
    const wallMatLong = new THREE.MeshLambertMaterial({ color: PALETTE.wall });
    const wallMatShort = new THREE.MeshLambertMaterial({ color: PALETTE.wall });
    this.applyTexture(wallMatLong, TEXTURE_URL.wall, TINT.wall, 26 / METERS_PER_TILE, 4 / METERS_PER_TILE);
    this.applyTexture(wallMatShort, TEXTURE_URL.wall, TINT.wall, 30 / METERS_PER_TILE, 4 / METERS_PER_TILE);

    // [宽, 高, 中心 x, 中心 y, 中心 z, 绕 y 旋转, 材质]
    const walls: [number, number, number, number, number, number, THREE.Material][] = [
      [26, 4, 0, 2, -15, 0, wallMatLong],              // 前墙，面向 +z
      [26, 4, 0, 2, 21, Math.PI, wallMatLong],         // 后墙，面向 -z
      [30, 4, -13, 2, 3, Math.PI / 2, wallMatShort],   // 左墙，面向 +x
      [30, 4, 13, 2, 3, -Math.PI / 2, wallMatShort],   // 右墙，面向 -x
    ];
    for (const [w, h, x, y, z, ry, mat] of walls) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      wall.position.set(x, y, z);
      wall.rotation.y = ry;
      this.scene.add(wall);
    }

    // 断碑：剧情钩子的视觉锚点。本版不换材质。
    const stele = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 3.0, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x3c4650 }),
    );
    stele.position.set(0, 1.5, -13);
    stele.rotation.z = 0.12;
    this.scene.add(stele);
  }

  /** 把逻辑层的世界状态同步到场景。每帧调用。 */
  sync(state: WorldState, dt: number): void {
    const t = performance.now() / 1000;

    // 玩家：朝向最近怪，血少时微微下沉
    this.playerMesh.position.set(state.player.pos.x, 0.92, state.player.pos.z);
    this.shadowPlane.position.set(state.player.pos.x, 0.02, state.player.pos.z);
    const hpRatio = state.player.maxHp > 0 ? state.player.hp / state.player.maxHp : 1;
    this.playerMesh.scale.set(1, 0.94 + hpRatio * 0.06, 1);
    this.playerMesh.visible = state.player.alive;

    if (state.monsters.length > 0) {
      const nearest = nearestTo(state.monsters, state.player.pos);
      if (nearest) {
        this.playerMesh.rotation.y = Math.atan2(
          nearest.pos.x - state.player.pos.x,
          nearest.pos.z - state.player.pos.z,
        );
      }
    }

    // 怪物
    let normalCount = 0;
    let eliteCount = 0;
    let bossCount = 0;

    for (const m of state.monsters) {
      if (m.hp <= 0) continue;
      const def = monsterById(m.defId);

      if (def.tier === 'boss') {
        if (bossCount >= 4) continue;
        this.dummy.position.set(m.pos.x, 1.0 + Math.sin(t * 1.4) * 0.06, m.pos.z);
        this.dummy.rotation.set(0, t * 0.4, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.bossMesh.setMatrixAt(bossCount, this.dummy.matrix);
        bossCount++;
        continue;
      }

      if (normalCount >= MAX_INSTANCES) break;

      // 追击时有个轻微前倾，制造「动感」而不需要动画骨骼
      const lean = m.state === 1 ? 0.22 : m.state === 2 ? -0.1 : 0;
      const bob = m.state === 0 ? Math.sin(t * 1.6 + m.uid) * 0.05 : 0;

      this.dummy.position.set(m.pos.x, 0.7 + bob, m.pos.z);
      this.dummy.rotation.set(lean, Math.atan2(state.player.pos.x - m.pos.x, state.player.pos.z - m.pos.z), 0);
      this.dummy.scale.setScalar(m.elite ? 1.5 : 1);
      this.dummy.updateMatrix();
      this.monsterMeshes.setMatrixAt(normalCount, this.dummy.matrix);

      this.tmpColor.set(m.elite ? PALETTE.enemyElite : PALETTE.enemyNormal);
      this.monsterMeshes.setColorAt(normalCount, this.tmpColor);
      normalCount++;

      if (m.elite) {
        this.dummy.position.set(m.pos.x, 0.03, m.pos.z);
        this.dummy.rotation.set(-Math.PI / 2, 0, 0);
        this.dummy.scale.setScalar(1.6);
        this.dummy.updateMatrix();
        this.eliteRing.setMatrixAt(eliteCount, this.dummy.matrix);
        eliteCount++;
      }
    }

    this.monsterMeshes.count = normalCount;
    this.monsterMeshes.instanceMatrix.needsUpdate = true;
    if (this.monsterMeshes.instanceColor) this.monsterMeshes.instanceColor.needsUpdate = true;

    this.eliteRing.count = eliteCount;
    this.eliteRing.instanceMatrix.needsUpdate = true;

    this.bossMesh.count = bossCount;
    this.bossMesh.instanceMatrix.needsUpdate = true;

    // 掉落物：旋转上升的八面体
    let lootCount = 0;
    for (const l of state.loot) {
      if (lootCount >= 64) break;
      this.dummy.position.set(l.pos.x, 0.35 + Math.sin(t * 2 + l.uid) * 0.1, l.pos.z);
      this.dummy.rotation.set(t * 0.8, t * 1.6, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.lootMesh.setMatrixAt(lootCount, this.dummy.matrix);

      const c = lootColor(l.item.rarity);
      this.tmpColor.set(c);
      this.tmpColor.toArray(this.lootColors, lootCount * 3);
      lootCount++;
    }
    this.lootMesh.count = lootCount;
    this.lootMesh.instanceMatrix.needsUpdate = true;
    if (this.lootMesh.instanceColor) this.lootMesh.instanceColor.needsUpdate = true;

    // 相机轻微跟随玩家（固定视角，只平移不旋转）
    const camTargetX = state.player.pos.x * 0.35;
    this.camera.position.x += (camTargetX - this.camera.position.x) * Math.min(1, dt * 3);
    this.camera.lookAt(camTargetX * 0.6, 0, 1);

    void hpRatio;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function nearestTo(monsters: readonly Monster[], from: Vec2): Monster | null {
  let best: Monster | null = null;
  let bestD = Infinity;
  for (const m of monsters) {
    const d = Math.hypot(m.pos.x - from.x, m.pos.z - from.z);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

function lootColor(rarity: string): number {
  switch (rarity) {
    case 'green': return PALETTE.green;
    case 'blue': return PALETTE.blue;
    case 'purple': return PALETTE.purple;
    case 'orange': return PALETTE.orange;
    default: return PALETTE.common;
  }
}
