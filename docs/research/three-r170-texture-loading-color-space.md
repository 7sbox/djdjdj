# Three.js r170 + Vite 6：本地图片当贴图的正确加载路径与色彩空间

> **一句话结论**：在 `src/render/` 里用 `import url from '../assets/xxx.png'`（走 Vite 的静态资源图，带 hash 指纹）拿到 URL，交给一个共享的 `THREE.TextureLoader`；颜色贴图**必须**显式设 `texture.colorSpace = THREE.SRGBColorSpace`（r170 的 `TextureLoader` 给的是 `NoColorSpace`，不设就是错的），再设 `wrapS/wrapT = RepeatWrapping` 与 `repeat`；`repeat` 按「平面尺寸 / 单张图覆盖米数」算，26×30 的平面铺 6 米就是 `(26/6, 30/6)`；真实 `Mesh` 在构造函数里就建好并用调色板纯色兜底，贴图在 `onLoad` 里换 `material.map` 并置 `material.needsUpdate = true`，因此不闪、不阻塞首帧。

---

## 0. 结论速览（TL;DR）

| 问题 | 结论 | 出处 |
| --- | --- | --- |
| 加载方式 | `new THREE.TextureLoader().load(url)`，同步返回一个 `Texture` 实例，`image` 稍后才填 | `node_modules/.pnpm/three@0.170.0/node_modules/three/src/loaders/TextureLoader.js:13-36` |
| `colorSpace` | 颜色贴图（`.map`）→ `SRGBColorSpace`；法线/粗糙度等非颜色数据 → `NoColorSpace`；`LinearSRGBColorSpace` 是给 EXR/HDR 这类线性数据用的 | `docs/manual/en/introduction/Color-management.html:181-187`（three r170 官方手册） |
| 不设的后果 | r170 `Texture` 默认 `NoColorSpace`（空字符串），GPU 侧 sRGB 解码完全不发生 → 地面偏亮、暗部发灰 | `three/src/textures/Texture.js:22,65`；实测 `new THREE.Texture().colorSpace === ""` |
| 平铺 | `wrapS = wrapT = RepeatWrapping` + `texture.repeat.set(u, v)` | `docs/api/en/textures/Texture.html:177-184` |
| `PlaneGeometry(26, 30)` 上「一张图铺 6 米」 | `repeat.set(26 / 6, 30 / 6) = (4.3333…, 5)`，**不要取整** | §3.3 推导 |
| anisotropy | 上限取自 `renderer.capabilities.getMaxAnisotropy()`；设 `Math.min(8, max)` 合理 | `three/src/renderers/webgl/WebGLCapabilities.js:7-25` |
| Vite 两种放法 | `public/wall.png` → 构建后原样落在 `dist/wall.png`（**无 hash**）；`import u from './floor.png'` → `dist/assets/floor-<hash>.png`（**有 hash**） | §4 实测 |
| 「4MB 的 assetsInlineLimit」 | 默认是 **4096 字节**，不是 4MB；判定用 `content.length < limit`（严格小于）。4MB 的图**不会**被 inline | `vite/dist/node/constants.js:143`；`vite/dist/node/chunks/dep-Cohbwjf9.js:10619` |
| 显存口径 | 1024² RGBA8 + 完整 mipmap 链 = **5,592,404 B ≈ 5.33 MiB**；无 mipmap = 4.00 MiB | §6.3 实算 |
| 异步不闪 | 构造里建好带纯色的 `MeshLambertMaterial`（**不带 `map`**），`onLoad` 里再挂 `map` 并置 `needsUpdate`；不要 await、不要 `compileAsync` 挡首帧。**别提前挂空 `Texture`**，那会让首帧变全黑 | §7.1b、§7.2 |

---

## 1. `TextureLoader` 在 r170 的用法（读源码）

`TextureLoader.load()` 是**同步返回**的：先 `new Texture()`，再交给 `ImageLoader` 异步拉图，图到了才写 `texture.image` 并置 `needsUpdate`。

```js
// three/src/loaders/TextureLoader.js:13-36
load( url, onLoad, onProgress, onError ) {

	const texture = new Texture();

	const loader = new ImageLoader( this.manager );
	loader.setCrossOrigin( this.crossOrigin );
	loader.setPath( this.path );

	loader.load( url, function ( image ) {

		texture.image = image;
		texture.needsUpdate = true;

		if ( onLoad !== undefined ) {

			onLoad( texture );

		}

	}, onProgress, onError );

	return texture;

}
```

这条源码直接决定三件事：

1. **`onLoad` 收到的就是刚返回的那个 `texture`**，不是另一个对象。所以可以先拿住 `texture` 改 `wrapS/repeat/colorSpace`，图到了自动生效。
2. **`texture.image` 在 `load()` 返回时是 `null`**。此刻把它挂到 `material.map` 上**不会崩，但会渲染成黑色**：`WebGLTextures.setTexture2D` 走 `image === null` 分支打一行 warn 后跳过上传（`three/src/renderers/webgl/WebGLTextures.js:520-528`），随后 bind 到 1×1 全零兜底纹理。**具体链路与正确做法见 §7.1b。**
3. **`TextureLoader` 一个字都没设 `colorSpace`**。整个 `src/loaders/` 里只有 `CubeTextureLoader.js:17` 主动写了 `texture.colorSpace = SRGBColorSpace`。

### 1.1 共享一个 loader 实例

`TextureLoader` 无状态（只是转发给 `new ImageLoader(this.manager)`），共享或每次 new 行为一致。共享的收益是 `LoadingManager` 能统一挂 `onLoad/onError` 做加载遮罩与失败兜底。

### 1.2 与 `new URL(..., import.meta.url)` 的关系

Vite 会把静态的 `new URL('./floor.png', import.meta.url)` 改写成 import（官方文档 "How it works" 一节）。本项目没必要用它：`import url from './floor.png'` 更短，且 `tsconfig.json:19` 已经有 `'types': ['vite/client']`，`*.png` 的模块声明现成（`vite/client.d.ts:61-64`）。

---

## 2. `colorSpace`：设 `SRGBColorSpace`，以及它到底在哪一步参与转换

### 2.1 官方定性

`docs/manual/en/introduction/Color-management.html:181-187`（three r170 内置手册，"Color textures" 条目原文）：

> **Color textures:** PNG or JPEG Textures containing color information (like .map or .emissiveMap) use the closed domain sRGB color space, and must be annotated with `texture.colorSpace = SRGBColorSpace`. Formats like OpenEXR (sometimes used for .envMap or .lightMap) use the Linear-sRGB color space indicated with `texture.colorSpace = LinearSRGBColorSpace`, and may contain values in the open domain [0,∞].

同一页 `:154-162`：「Colors supplied to three.js — from color pickers, textures, 3D models, and other sources — each have an associated color space.」

对地面/墙面这种 PNG 固有色贴图，答案毫无歧义：**`SRGBColorSpace`**。`LinearSRGBColorSpace` 是给**已经是线性**的 EXR/HDR 数据用的；给 PNG 套它，等于把 gamma 编码的像素当成线性值用，画面偏亮发灰。

`docs/api/en/textures/Texture.html:256-261` 同款说法：「`NoColorSpace` is the default. Textures containing color data should be annotated with `SRGBColorSpace` or `LinearSRGBColorSpace`.」

### 2.2 源码：转换分**两级**，而且不在 `map_fragment` 里

**(a) 采样后不解码，直接乘** —— `three/src/renderers/shaders/ShaderChunk/map_fragment.glsl.js:1-17`：

```glsl
#ifdef USE_MAP

	vec4 sampledDiffuseColor = texture2D( map, vMapUv );

	#ifdef DECODE_VIDEO_TEXTURE

		// use inline sRGB decode until browsers properly support SRGB8_ALPHA8 with video textures (#26516)

		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );

	#endif

	diffuseColor *= sampledDiffuseColor;

#endif
```

注意：只有**视频纹理**才在这里做内联解码。普通图片纹理**不走这里**。

**(b) 真正的解码交给 GPU 的 sRGB 内部格式** —— `three/src/renderers/webgl/WebGLTextures.js:207-213`：

```js
if ( glFormat === _gl.RGBA ) {

	const transfer = forceLinearTransfer ? LinearTransfer : ColorManagement.getTransfer( colorSpace );

	if ( glType === _gl.FLOAT ) internalFormat = _gl.RGBA32F;
	if ( glType === _gl.HALF_FLOAT ) internalFormat = _gl.RGBA16F;
	if ( glType === _gl.UNSIGNED_BYTE ) internalFormat = ( transfer === SRGBTransfer ) ? _gl.SRGB8_ALPHA8 : _gl.RGBA8;
```

也就是说 `colorSpace` 决定的是 `gl.texImage2D` 的 internalFormat 用 `SRGB8_ALPHA8` 还是 `RGBA8` —— 采样时由硬件做 EOTF（sRGB→线性），这次转换**完全免费**，不在 shader 里加指令。

**(c) 输出端再转回去** —— `three/src/renderers/shaders/ShaderChunk/colorspace_fragment.glsl.js:1-3`：

```glsl
gl_FragColor = linearToOutputTexel( gl_FragColor );
```

`linearToOutputTexel` 由 `WebGLProgram` 按 `renderer.outputColorSpace` 生成（`three/src/renderers/webgl/WebGLProgram.js:35-55,81-95`），r170 的 `WebGLRenderer` 默认 `_outputColorSpace = SRGBColorSpace`（`three/src/renderers/WebGLRenderer.js:145`）。

**完整链路**：

```
PNG 字节（sRGB 编码）
  → texImage2D(internalFormat = SRGB8_ALPHA8)   ← colorSpace = SRGBColorSpace 决定这一步
  → 采样时硬件 EOTF，得到线性值
  → diffuseColor *= sampledDiffuseColor          ← Lambert 光照在线性空间里算
  → linearToOutputTexel() 做 OETF                ← outputColorSpace = SRGBColorSpace
  → 显示器
```

**若 `colorSpace` 留 `NoColorSpace`**：internalFormat 走 `RGBA8`，采样值被**当作线性值**直接参与光照。sRGB 编码的 0.5 灰（实际线性约 0.214）被当成 0.5 用，随后输出端再套一次 OETF —— 整张图**偏亮、对比度塌陷**，暗部细节发灰。

### 2.3 实测：默认值确实是 `NoColorSpace`

在 `node` 里直接跑 `three@0.170.0`：

```
REVISION 170
defaults {"wrapS":1001,"wrapT":1001,"magFilter":1006,"minFilter":1008,
          "generateMipmaps":true,"colorSpace":"","anisotropy":1,
          "format":1023,"type":1009,"flipY":true,"premultiplyAlpha":false}
consts   {"RepeatWrapping":1000,"ClampToEdgeWrapping":1001,
          "SRGBColorSpace":"srgb","LinearSRGBColorSpace":"srgb-linear","NoColorSpace":""}
DEFAULT_ANISOTROPY 1
```

对应源码：`three/src/textures/Texture.js:22`（构造签名末尾 `colorSpace = NoColorSpace`）、`:65`（`this.colorSpace = colorSpace`）、`:318`（`Texture.DEFAULT_ANISOTROPY = 1`）。常量值 `'srgb'` / `'srgb-linear'` 在 `three/src/constants.js:164-165`。

### 2.4 兼容性坑：sRGB 纹理必须 RGBA8

`three/src/renderers/webgl/WebGLTextures.js:2107-2139`（`verifyColorSpace`）：

```js
if ( ColorManagement.getTransfer( colorSpace ) === SRGBTransfer ) {

	// in WebGL 2 uncompressed textures can only be sRGB encoded if they have the RGBA8 format

	if ( format !== RGBAFormat || type !== UnsignedByteType ) {

		console.warn( 'THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.' );

	}

}
```

好消息：`Texture` 默认就是 `RGBAFormat` + `UnsignedByteType`（实测 `1023` / `1009`）。所以**别手动设 `texture.format = THREE.RGBFormat` 想省显存** —— 那会触发这条 warn，而且 `RGBFormat` 在 `getInternalFormat` 的 `glFormat === _gl.RGB` 分支里只处理 `UNSIGNED_INT_5_9_9_9_REV`（`WebGLTextures.js:201-205`），8 位 RGB 根本落不到 sRGB 内部格式上，省不下来。

---

## 3. `RepeatWrapping` + `repeat`：`PlaneGeometry(26, 30)` 上「一张图铺 6 米」

### 3.1 写法

`docs/api/en/textures/Texture.html:23-31` 的 Code Example：

```js
const texture = new THREE.TextureLoader().load( "textures/water.jpg" );
texture.wrapS = THREE.RepeatWrapping;
texture.wrapT = THREE.RepeatWrapping;
texture.repeat.set( 4, 4 );
```

`repeat` 语义（`docs/api/en/textures/Texture.html:177-184`）：「How many times the texture is repeated across the surface, in each direction U and V. If repeat is set greater than 1 in either direction, the corresponding Wrap parameter should also be set to `RepeatWrapping` or `MirroredRepeatWrapping`.」

### 3.2 `repeat` 怎么进 shader

`repeat` 不是 uniform，它被烘进 3×3 矩阵 `mapTransform`：

- 矩阵来源：`three/src/textures/Texture.js:89-93` 的 `updateMatrix()` → `matrix.setUvTransform(offset.x, offset.y, repeat.x, repeat.y, rotation, center.x, center.y)`
- 每帧刷新：`three/src/renderers/webgl/WebGLMaterials.js:140` → `refreshTransformUniform( material.map, uniforms.mapTransform )`
- 顶点着色器 `three/src/renderers/shaders/ShaderChunk/uv_vertex.glsl.js:9`：
  ```glsl
  vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
  ```
- 片元着色器拿 `vMapUv` 去 `texture2D( map, vMapUv )`（见 §2.2）

所以改 `texture.repeat` 是**零额外开销**的（每帧一个矩阵 uniform），不需要重建几何、不需要重建纹理。

### 3.3 「一张图铺 6 米」的 repeat 该取多少

前提：`PlaneGeometry` 的 UV 是 0..1 铺满整面（`three/src/geometries/PlaneGeometry.js:50-51`）：

```js
uvs.push( ix / gridX );
uvs.push( 1 - ( iy / gridY ) );
```

不管 `width/height` 多大，UV 都归一化到 [0,1]。于是：

```
repeat.u = 平面宽 / 单张图覆盖的米数
repeat.v = 平面高 / 单张图覆盖的米数
```

本工程 `PlaneGeometry(26, 30, 1, 1)`（`src/render/scene.ts:163`），目标 6 m/张：

| 方向 | 计算 | 值 |
| --- | --- | --- |
| U（26 m 宽） | `26 / 6` | **`4.333333…`** |
| V（30 m 深） | `30 / 6` | **`5`** |

node 实算输出：`repeat 4.333333 5.000000`。

**代码里写 `repeat.set(26 / 6, 30 / 6)`，不要写 `(4, 5)`。** 取 4 会让单 tile 变成 6.5 m，与 6 m 差 8.3%，和固定的 26×30 房间尺寸一乘就会对不上板地缝。写成除法还有个附带好处：将来改房间尺寸时 `repeat` 自动跟着走。

**共享实例的限制**：`repeat` **不在** `getTextureCacheKey` 里（key 只含 `wrapS/wrapT/wrapR/magFilter/minFilter/anisotropy/internalFormat/format/type/generateMipmaps/premultiplyAlpha/flipY/unpackAlignment/colorSpace`，`WebGLTextures.js:487-508`）。所以同一个 `Texture` 实例不能同时当「6 米铺」和「4 米铺」用，必须两个实例。用 `texture.clone()` 即可 —— `copy()` 里 `this.source = source.source`（`Texture.js:105`），**底层像素数据共享，显存只有一份**。

### 3.4 平铺的 POT 前提（以及文档为什么过时）

`docs/api/en/textures/Texture.html:108-111` 写着「tiling of images in textures only functions if image dimensions are powers of two ... This is a limitation of WebGL, not three.js」。

**这句话在 r170 已经过时**：r170 的 `WebGLRenderer` 只创建 `webgl2` 上下文（`three/src/renderers/WebGLRenderer.js:248-266`，`const contextName = 'webgl2';`，无 WebGL1 回退），而 WebGL 2.0 规范取消了 NPOT 限制（`KhronosGroup/WebGL` 仓库 `specs/latest/2.0/index.html`，"Non-Power-of-Two Texture Access" 一节）：

> unlike the WebGL 1.0 API, there are no special restrictions on non power of 2 textures. All mipmapping and all wrapping modes are supported for non-power-of-two images.

**实践结论**：非二次幂也能 `RepeatWrapping` + mipmap。但**仍然建议用二次幂**（512²/1024²）：一是 mipmap 链层数是 `Math.log2( Math.max( width, height ) ) + 1`（`WebGLTextures.js:273-297`），非二次幂的 `log2` 不是整数，链尾浪费；二是 tiling 类 CC0 贴图本来就按 1024²/2048² 发布。

---

## 4. Vite 6 下静态资源的两种放法（含构建实测）

### 4.1 实测环境

- vite 实际安装版本 **6.4.6**（`node_modules/.pnpm/vite@6.4.6`；`package.json:21` 声明 `^6.0.3`）
- 临时工程含 `src/floor.png`（1024²，3,147,775 B ≈ 3.0 MiB）、`src/small.png`（8²，74 B）、`public/wall.png`（512²，1,496 B）
- 真实 `vite build` 产出：

```
dist/index.html                     0.19 kB
dist/assets/floor-Brl2uVgq.png  3,147.78 kB     ← import 方式，带 hash
dist/assets/index-BbKP_hlh.js       1.58 kB
dist/wall.png                       1,496 B      ← public 方式，无 hash
```

### 4.2 方式 A：`public/` 目录

**放文件** `public/wall.png`，**引用**写根绝对路径 `'/wall.png'`。

`https://vite.dev/guide/assets`（"The public Directory" 一节）：

> Assets in this directory will be served at root path `/` during dev, and copied to the root of the `dist` directory as-is. ... Note that you should always reference public assets using root absolute path - for example, `public/icon.png` should be referenced in source code as `/icon.png`.

- **构建产物路径**：`dist/wall.png`（原样拷到 `dist` 根，保留文件名）。源码依据 `vite/dist/node/chunks/dep-Cohbwjf9.js:46599-46616` 的 `copyDir(publicDir, outDir)`。
- **缓存指纹**：**没有**。文件名不含 hash，只能靠 `Cache-Control` 或手工改文件名（`wall.v2.png`）。单机游戏影响不大，但换图后玩家可能拿到旧缓存。
- **会不会被 inline**：**不会**。`public` 根本不进模块图，`assetsInlineLimit` 管不到。
- **`base` 配置**：`publicFileToBuiltUrl`（`dep-Cohbwjf9.js:10524-10538`）在 `command === 'build'` 时把路径替换成占位符 `__VITE_PUBLIC_ASSET__<hash8>__`，最终由 `toOutputFilePathInJS` 拼上 `base`（`:10363-10381`）。实测 `base: '/game/'` 时，`import u from '/wall.png'` 被改写成 `'/game/wall.png'`。
  **但纯字符串字面量 `'/wall.png'`（不经过 import）Vite 认不出来，会原样保留** —— 若将来把站点部署到子路径，那条引用会 404。本工程当前 `vite.config.ts` 没设 `base`（默认 `'/'`），所以暂时无影响；**一旦引入 `base`，写死字符串的地方都要改成 import 形式**。

### 4.3 方式 B：`import url from './x.png'`

**放文件** `src/assets/floor.png`（任意源码目录），**引用** `import floorUrl from './floor.png'` 或显式加 `?url`。

`https://vite.dev/guide/assets`（"Importing Asset as URL" 一节）：

> For example, `imgUrl` will be `/src/img.png` during development, and become `/assets/img.2d8efhg.png` in the production build. ... Referenced assets are included as part of the build assets graph, will get hashed file names, and can be processed by plugins for optimization.

实测：产物 `dist/assets/floor-Brl2uVgq.png`，源码 JS 里变成 `const floorUrl = "/assets/floor-Brl2uVgq.png";`。

- `.png/.jpg/.jpeg/.gif/.svg/.webp/.avif` 在 Vite 默认资源类型表里（`vite/dist/node/constants.js:125-128` 的 `DEFAULT_ASSETS_RE`），**裸 import 就够，`?url` 可省**。实测两者产出同一个 URL。
- **缓存指纹**：文件名 hash 基于**内容**，换图即换名，天然 cache-busting。这是相对 `public/` 的核心优势。
- **`base` 感知**：实测 `base: '/game/'` 时产出 `"/game/assets/floor-Brl2uVgq.png"`。

### 4.4 该选哪个

- **游戏内运行时贴图（地面/墙面/UI 图）→ 方式 B（import）**：要 hash、要 `base` 自动正确、要进构建图。
- **必须固定文件名的东西**（`favicon.ico`、`robots.txt`、外部工具按名访问）→ 方式 A（public）。

Vite 官方同页 "Choosing between imports and the public directory" 也是这个口径：

> In general, prefer importing assets unless you specifically need the guarantees provided by the public directory.

**关于「能否 import `public/` 下的文件」—— 分类型，别一刀切**：

- **JS / CSS 等非资源文件**：**不能** import，resolve 阶段直接抛错（`dep-Cohbwjf9.js:40937-40944`）：

  > Cannot import non-asset file `/xxx.js` which is inside /public. JS/CSS files inside /public are copied as-is on build and can only be referenced via `<script src>` or `<link href>` in html. If you want to get the URL of that file, use `?url` instead.

  这个 throw 的条件是 `!config.assetsInclude(cleanUrl(specifier)) && !urlRE.test(specifier) && checkPublicFile(...)`，**资源类文件不满足该条件，因此不会抛**。

- **图片等资源文件**（`.png` 等）：**技术上能 import，但不推荐**。实测 `import wallFromPublic from '/wall.png'` 与 `import u from '/wall.png?url'` 在构建产物里都得到 `"/game/wall.png"`（`base: '/game/'` 下）—— 能拿到 URL、也享受 `base` 前缀，但**仍然拿不到 hash 指纹、也不会被 inline**，因为这些文件由 `publicFileToBuiltUrl` 原样处理（`dep-Cohbwjf9.js:10524-10538`），不走资源图。

- 加载失败时的兜底报错仍是 `dep-Cohbwjf9.js:36042-36053` 那条 —— 文件名在 public 里但路径没解析到时才会出现。

**对本工程的实操结论**：地面/墙面贴图**别放 `public/`**，走 `src/assets/` + import（§4.3）。放 public 的唯一正当理由是「必须固定文件名」。

### 4.5 关于「4MB 的 assetsInlineLimit」

**默认值不是 4MB，是 4096 字节**：

- `vite/dist/node/constants.js:143`：`const DEFAULT_ASSETS_INLINE_LIMIT = 4096;`
- 判定逻辑 `vite/dist/node/chunks/dep-Cohbwjf9.js:10600-10620`：

```js
function shouldInline(environment, file, id, content, buildPluginContext, forceInline) {
  if (noInlineRE.test(id)) return false;
  if (inlineRE$3.test(id)) return true;
  ...
  return content.length < limit && !isGitLfsPlaceholder(content);
}
```

两点要注意：
1. **`content.length < limit` 是严格小于**，恰好 4096 B 的文件**不**内联。
2. `content.length` 是 **Buffer 字节数**，不是字符数。

**4MB 的图会不会被 inline？不会** —— 只要 `assetsInlineLimit` 没被显式调大。本工程 `vite.config.ts:3-6` 只设了 `server.port` / `build.target` / `build.outDir`，**没设 `assetsInlineLimit`**，走默认 4096。

**同工程实测**（`assetsInlineLimit: 4096`）：

| 引用写法 | 文件 | 产物 |
| --- | --- | --- |
| `import a from './small.png?url'` | 74 B | `data:image/png;base64,iVBORw0KGgo...`（inline） |
| `import b from './small.png?no-inline'` | 74 B | `"/assets/small-CKRdecR1.png"`（落盘） |
| `import c from './small.png?inline'` | 74 B | `data:...`（inline） |
| `import d from './floor.png?inline'` | 3.0 MiB | `data:image/png;base64,...`（JS 从 1.58 kB 涨到 **4,198.81 kB**） |
| `import e from './floor.png?no-inline'` | 3.0 MiB | `"/assets/floor-Brl2uVgq.png"`（落盘） |

**结论与建议**：

- **大贴图绝对不要调大 `assetsInlineLimit`**。base64 比二进制大 4/3（实测 3.0 MiB 的图让 JS 涨了 4.2 MB），且 base64 让整个 bundle 无法分段流式解析、无法独立缓存，`TextureLoader` 拿到的 `data:` URL 还要多一次解码与内存拷贝。
- **小图（< 4 KiB）被 inline 是好事**，省一次请求。UI 图标受益。
- **要保证某张图一定落盘**：加 `?no-inline` 后缀，类型声明现成（`vite/client.d.ts:258-261`）。

> **可执行性说明**：本机沙箱禁止 `child_process.spawn`，esbuild 无法启动，`vite build` 直接 `EPERM`。上面的实测是把配置改成 `configFile: false` 的 JS API 调用、并 `esbuild: false` 关闭转译后跑通的；资源管线行为（`assetsInlineLimit` / `publicDir` / hash 命名）与正常构建一致，只有 JS 转译被跳过。正常环境下 `pnpm build` 应当能直接跑，但本轮无法在本沙箱内验证。

---

## 5. anisotropy：上限从哪来、设多少

### 5.1 上限来源

`three/src/renderers/webgl/WebGLCapabilities.js:7-25`：

```js
function getMaxAnisotropy() {

	if ( maxAnisotropy !== undefined ) return maxAnisotropy;

	if ( extensions.has( 'EXT_texture_filter_anisotropic' ) === true ) {

		const extension = extensions.get( 'EXT_texture_filter_anisotropic' );

		maxAnisotropy = gl.getParameter( extension.MAX_TEXTURE_MAX_ANISOTROPY_EXT );

	} else {

		maxAnisotropy = 0;

	}

	return maxAnisotropy;

}
```

即 **GPU 自己报的值**，读一次就缓存。`renderer.capabilities` 在 `WebGLRenderer.js:324` 暴露（`_this.capabilities = capabilities;`），`getMaxAnisotropy` 在 `WebGLCapabilities.js:115` 挂到返回对象上。API 文档同款（`docs/api/en/textures/Texture.html:133-140`）：

> Use `renderer.capabilities.getMaxAnisotropy()` to find the maximum valid anisotropy value for the GPU; this value is usually a power of 2.

### 5.2 设了会被 clamp，但仍要小心

`three/src/renderers/webgl/WebGLTextures.js:650-655`：

```js
if ( texture.anisotropy > 1 || properties.get( texture ).__currentAnisotropy ) {

	const extension = extensions.get( 'EXT_texture_filter_anisotropic' );
	_gl.texParameterf( textureType, extension.TEXTURE_MAX_ANISOTROPY_EXT, Math.min( texture.anisotropy, capabilities.getMaxAnisotropy() ) );
	properties.get( texture ).__currentAnisotropy = texture.anisotropy;

}
```

**`Math.min` 兜底**，写死偏大的值不会崩。但别依赖它：`anisotropy` **在** `getTextureCacheKey` 里（`WebGLTextures.js:496` `array.push( texture.anisotropy );`）。改 `anisotropy` 会让缓存 key 变，`initTexture` 因此认为需要一张**新的** `WebGLTexture`（`:688-706`），旧的等 `usedTimes` 归零才释放 —— 运行期反复改会白占显存。**只在 `onLoad` 里设一次。**

### 5.3 设多少

本项目是**固定 45° 斜俯视**（`src/render/scene.ts:63-66`：`camera.position.set(0, 15, 17)`、`lookAt(0, 0, 1)`），地面占屏幕大半，斜视角下各向异性过滤是这个场景里收益最大的那项设置。

| 值 | 评价 |
| --- | --- |
| `1`（默认） | 远处地面有明显横向糊条，26×30 的房间里看得见 |
| `4` | 已消掉大部分糊条，成本低 |
| **`8`** | **推荐**。多数 GPU 报 16，取 8 拿到大部分收益，斜俯视下与 16 的肉眼差已很小 |
| `16`（= `getMaxAnisotropy()` 常见值） | 收益递减，采样成本翻倍。显卡只报 4 时写 16 也会被 clamp 到 4 |

写法：

```ts
const maxAniso = renderer.capabilities.getMaxAnisotropy();
texture.anisotropy = Math.min(8, maxAniso);
```

**兼容性前提**：anisotropy 只在 minFilter 带 mipmap 的线性过滤时生效 —— `WebGLTextures.js:644-648`：

```js
if ( texture.magFilter === NearestFilter ) return;
if ( texture.minFilter !== NearestMipmapLinearFilter && texture.minFilter !== LinearMipmapLinearFilter ) return;
```

默认 `minFilter` 就是 `LinearMipmapLinearFilter`（实测 `1008`），所以 §6 里**别关 mipmap**，否则 anisotropy 一起失效。

---

## 6. `generateMipmaps` / `minFilter` 与 1024² 贴图的显存口径

### 6.1 默认值（实测 + 源码）

| 属性 | 默认 | 源码 |
| --- | --- | --- |
| `generateMipmaps` | `true` | `three/src/textures/Texture.js:60` |
| `minFilter` | `LinearMipmapLinearFilter`（`1008`） | `Texture.js:22` |
| `magFilter` | `LinearFilter`（`1006`） | `Texture.js:22` |

### 6.2 mipmap 生成路径

`three/src/renderers/webgl/WebGLTextures.js:1160-1164`：

```js
if ( textureNeedsGenerateMipmaps( texture ) ) {

	generateMipmap( textureType );

}
```

`textureNeedsGenerateMipmaps` 直接返回 `texture.generateMipmaps`（`:108-112`），`generateMipmap` 就是一句 `_gl.generateMipmap( target )`（`:114-118`）。是 **GPU 侧一次性生成**，JS 不参与。

层数（`:273-297`）：

```js
if ( textureNeedsGenerateMipmaps( texture ) === true || ... ) {

	return Math.log2( Math.max( image.width, image.height ) ) + 1;

}
...
// texture without mipmaps (only base level)
return 1;
```

### 6.3 1024² 贴图显存估算

**口径**：`width × height × 每像素字节数`；mipmap 链按 1/4 + 1/16 + … 等比收敛到基级的 **4/3**（精确 `1.333…`，有限项和略小）。

node 实算（逐级 `s >>= 1` 到 1）：`rgba8_1024_mipchain_bytes 5592404`

| 情况 | 字节 | MiB |
| --- | --- | --- |
| 1024² 基级，RGBA8 | `1024*1024*4 = 4,194,304` | 4.00 |
| **+ 完整 mipmap 链** | `5,592,404` | **5.33** |
| 关 mipmap（`generateMipmaps = false`） | `4,194,304` | 4.00 |
| 1024²「RGB8」理论值（**实际用不了**，见 §2.4） | `4,194,303` | 4.00 |

### 6.4 `generateMipmaps = false` 划算吗

**不划算，别关。** 三个理由：

1. **只省 25%**（5.33 → 4.00 MiB），一张 1024² 图的绝对量才 1.33 MiB。
2. **会同时废掉 anisotropy**（`WebGLTextures.js:647` 要求 minFilter 带 mipmap）。而地面斜俯视最需要它。
3. **会糊 + 闪**：无 mipmap 时远距离采样落到一两个 texel，minification 严重走样（摩尔纹），斜视下尤其明显。

**真正该做的省显存手段**（按性价比）：

1. **降尺寸**。地面 1024² 够用（26 m 房间、一张图铺 6 m，屏幕像素密度远低于 1024/6 ≈ 170 texel/m）。
2. **`texture.clone()` 共享 `source`**。clone 后 `this.source = source.source`（`Texture.js:105`），`WebGLTextures` 用 `_sources` Map 按 `source` 索引（`:676-706`），**底层 `WebGLTexture` 复用，显存只有一份**。
3. **别在运行期改 `anisotropy` / `wrapS` / `minFilter`**，都会改缓存 key 触发新分配（§5.2）。
4. 真正的解放是压缩纹理（KTX2/Basis），但那是另一件事，`TextureLoader` 不做。

---

## 7. 异步加载：怎么做到不闪、不阻塞首帧

### 7.1 关键事实：`material.map` 的有无会触发**着色器重编**

`three/src/renderers/webgl/WebGLPrograms.js:116`：

```js
const HAS_MAP = !! material.map;
```

`HAS_MAP` 进 `parameters.map`（`:205`），进而决定 `USE_MAP` 是否定义 —— 而 `map_fragment` 整块被 `#ifdef USE_MAP` 包着（§2.2）。

`WebGLRenderer` 何时重编（`WebGLRenderer.js:1837-1946`）：

```js
let needsProgramChange = false;

if ( material.version === materialProperties.__version ) {

	if ( materialProperties.needsLights && ( materialProperties.lightsStateVersion !== lights.state.version ) ) {
		needsProgramChange = true;
	} else if ( materialProperties.outputColorSpace !== colorSpace ) {
		...
	} else if ( materialProperties.envMap !== envMap ) {
		needsProgramChange = true;
	} else if ( material.fog === true && materialProperties.fog !== fog ) {
	...

} else {

	needsProgramChange = true;
	materialProperties.__version = material.version;

}
```

**这里没有任何 `HAS_MAP` 的比较。** 于是：

> **若先不给 `map`、事后 `material.map = tex`，必须 `material.needsUpdate = true`**（`three/src/materials/Material.js:530-534`：`set needsUpdate( value ) { if ( value === true ) this.version ++; }`）。否则 `material.version === __version` 成立且所有 `else if` 都不成立 → **`needsProgramChange` 保持 `false` → 永远用旧的、没有 `USE_MAP` 的程序 → 贴图永远不显示**。这是个非常安静的坑。

### 7.1b 但**不要**为了「免重编」而提前把空 `Texture` 挂上去 —— 那样首帧会是黑的

「创建时先把 `map` 挂上、图到了自动生效」听起来更优雅，但**在这个工程里是错的**，因为它会让首帧渲染成纯黑而不是调色板色。

链路是这样断的：

1. 挂上去的 `Texture` 的 `image` 是 `null`，而 `load()` 里没有任何地方替它把 `version` 置正；如果这张 texture 从未被写过 `needsUpdate`，`version` 就是 `0`。
2. `WebGLTextures.setTexture2D` 的上传条件是 `texture.version > 0 && __version !== texture.version`（`WebGLTextures.js:518`）。`version === 0` 时**整个 if 被跳过**，直接走到 `:539` 的 `state.bindTexture( _gl.TEXTURE_2D, textureProperties.__webglTexture, ... )`。
3. 此刻 `__webglTexture` 还是 `undefined`，于是 `WebGLState.bindTexture` 走兜底（`WebGLState.js:955`）：`gl.bindTexture( webglType, webglTexture || emptyTextures[ webglType ] )`。
4. `emptyTextures` 是 `WebGLState.js:420-451` 造的 1×1 纹理，内容是 `new Uint8Array( 4 )` —— **四个字节全 0**，即 `RGBA = (0,0,0,0)`。

所以 `USE_MAP` 分支会执行 `diffuseColor *= sampledDiffuseColor`，乘的是 `(0,0,0,0)` → 该 mesh **全黑**（且 Lambert 的 `opacity` 也被 alpha 乘掉）。

> **正确做法是 §7.2 那条：构造函数里先不带 `map`（纯色兜底），`onLoad` 里再挂 `map` + `needsUpdate = true`。** 代价只是一次额外的程序编译（一次性、在加载回调里），换来的是首帧干净、不会出现黑面。
>
> 这条推翻了我最初「提前挂空 texture 更省事」的直觉 —— 是读 `WebGLTextures.js:518-539` 与 `WebGLState.js:420-451,955` 之后改的。**光看 `HAS_MAP` 那一段会得出错误结论，必须连着看纹理绑定兜底。**

### 7.2 不闪、不阻塞首帧的做法

**思路**：`Mesh` 在构造函数里就建好（**不带 `map`**，纯色兜底），首帧照常渲染；图到了只在 `onLoad` 里挂 `material.map` 并置 `needsUpdate`。

**为什么不是「提前挂空 Texture」**：见 §7.1b —— 那会让首帧渲染成 `(0,0,0,0)` 的黑面。宁可付一次加载回调里的程序重编。

**为什么不会闪**：
- 首帧看到的是 `PALETTE.floor` 纯色（`src/render/scene.ts:16-32`），与现有灰盒期观感一致 —— 贴图到位是「渐入」而不是「白块跳变」。
- 不要用 `transparent` + `opacity` 淡入来回避闪烁：Lambert 一旦 `transparent` 就进透明队列、逐帧排序，与「60 只小怪 @60fps」的红线冲突。

**为什么不会阻塞首帧**：
- `TextureLoader.load()` 同步返回（§1），构造函数里不等。
- **不要** `await` loader。`loadAsync` 会让 `SceneView` 构造函数变 async，`src/main.tsx` 的调用链要跟着改，且首帧被推到网络返回之后 —— 慢网下就是几百毫秒白屏。
- **不要**为了「等贴图一起编译」调 `renderer.compileAsync(scene, camera)`（`WebGLRenderer.js:1034-1057`）。它只等**已提交的**材质编译完，不会等 `texture.image`；而且返回 Promise，仍然把首帧往后推。

**首帧之后那次纹理上传的抖动怎么办**：
`gl.texImage2D` + `gl.generateMipmap` 在 1024² 上是几毫秒量级，一次性。要更稳就在 `onLoad` 里立刻调 `renderer.initTexture(texture)`（`WebGLRenderer.js:2797-2812`，内部走 `textures.setTexture2D( texture, 0 )`），把上传从「下一帧首次 draw 时」挪到「加载回调里」，避免与某一帧的 draw call 撞在一起。

**这一步必须在 `onLoad` 里做，不要在构造函数里** —— 那时 `texture.image` 还是 `null`，`initTexture` 会走 `image === null` 分支只打 warn（`WebGLTextures.js:520-528`）。

**颜色空间别忘**：`texture.colorSpace = SRGBColorSpace` 要在 `initTexture` / 首次 draw **之前**设。`colorSpace` 在 `getTextureCacheKey` 里（`WebGLTextures.js:504`），提前设好就不会「先按错的 key 分配一次、再按对的 key 分配第二次」。

**为什么不干脆在 `load()` 返回后就设、然后一路拿到 `onLoad`**：可以，那样也正确（§1 第 1 条）。但为了让「空纹理绝不进 `material.map`」这件事在类型上就做不到，§8.4 的骨架选择**不把未加载的 texture 暴露给调用方** —— 参数全在 `onLoad` 里设。两种写法等价，骨架选了更不容易出错的那种。

---

## 8. 可执行清单

### 8.1 文件放哪

- [ ] 贴图放 `src/assets/`（新建），**不要**放 `public/` —— 要 hash 指纹与 `base` 自动正确（§4.4）。
- [ ] 尺寸取二次幂（512² / 1024²），PNG 或 WebP，**不要**把 `format` 改成 RGB（§2.4）。
- [ ] 文件名只描述**美术用途**（`stone-floor.png`、`brick-wall.png`），且这些名字**只出现在 `src/render/`**，不出现 `src/sim/` 任何地方（仓库硬约束，`src/render/scene.ts:5-10`）。
- [ ] 新建 `src/render/assets.ts`，集中 `import` 所有贴图 URL，作为全工程唯一知道贴图文件存在的地方。

### 8.2 每张贴图要设的参数

- [ ] `texture.colorSpace = THREE.SRGBColorSpace` —— **必设**，r170 默认 `NoColorSpace`（§2.3）。
- [ ] `texture.wrapS = texture.wrapT = THREE.RepeatWrapping`（§3.1）。
- [ ] `texture.repeat.set(width / TILE_METERS, height / TILE_METERS)`，不写字面量（§3.3）。
- [ ] `texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())`，**只在 `onLoad` 里设一次**（§5.2）。
- [ ] `generateMipmaps` / `minFilter` **保持默认**，否则 anisotropy 失效（§6.4）。
- [ ] `flipY` 保持默认 `true` —— `PlaneGeometry` 的 UV 是 `1 - (iy/gridY)`（`PlaneGeometry.js:51`），已经上下对齐，别再翻一次。
- [ ] **在 `initTexture` / 首次 draw 之前**把这五项设完，别事后再改（§5.2 的缓存 key 说明）。
- [ ] **`material.map` 只在 `onLoad` 里赋值**，且紧跟 `material.needsUpdate = true`。不要在构造函数里挂空 `Texture`（§7.1b）。

### 8.3 本工程的具体数值

| 面 | 几何 | 贴图 | repeat |
| --- | --- | --- | --- |
| 地面 | `PlaneGeometry(26, 30, 1, 1)` @ `scene.ts:163` | `stone-floor.png` | `(26/6, 30/6) = (4.3333, 5)` |
| 长墙（26 m 那面，两道） | `BoxGeometry(26, 4, 0.8)` @ `scene.ts:179-180` | `brick-wall.png` | `(26/6, 4/6) = (4.3333, 0.6667)` |
| 短墙（30 m 那面，两道） | `BoxGeometry(0.8, 4, 30)` @ `scene.ts:181-182` | `brick-wall.png` | `(30/6, 4/6) = (5, 0.6667)` |

> **注意**：`BoxGeometry` 六个面共享同一套 0..1 UV，用 `repeat` 做世界尺度均匀平铺在箱体上做不到「每面都 6 m」—— 长墙用 `(4.3333, 0.6667)` 时宽 26 m 的长边正确、厚 0.8 m 的端面会被拉伸 32 倍。本工程墙体贴在房间边界外、端面基本看不见，可接受；**若要严格均匀，把 `scene.ts:177-188` 那四面墙换成单面 `PlaneGeometry`**，既省几何也省问题。
>
> `BoxGeometry` 的 UV 布局本轮**未读源码核对**（没读 `src/geometries/BoxGeometry.js`），落地前请自行确认。

### 8.4 代码骨架（直接照抄到 `src/render/`）

**`src/render/assets.ts`（新建）**：

```ts
// 唯一允许出现贴图文件名的文件。逻辑层永远不 import 这里。
import floorUrl from '../assets/stone-floor.png';
import wallUrl from '../assets/brick-wall.png';

export const TEXTURE_URLS = {
  floor: floorUrl,
  wall: wallUrl,
} as const;
```

**`src/render/scene.ts` 补丁**：

```ts
import * as THREE from 'three';
import { TEXTURE_URLS } from './assets';

/** 一张贴图在世界里覆盖多少米。地面 26×30 ⇒ repeat = 26/6, 30/6。 */
const TILE_METERS = 6;

/** 各向异性上限。8 已吃掉斜俯视下大部分糊条，再高收益递减。 */
const MAX_ANISOTROPY = 8;

/**
 * 加载一张贴图，按「世界米数」算好平铺参数，图到齐后回调。
 *
 * 关键点全在这里：
 * - TextureLoader.load() 同步返回、onLoad 异步回调（three r170 TextureLoader.js:13-36）；
 * - 所以调用方在回调之前**不持有** texture，也就不会把 image === null 的空纹理
 *   挂到 material.map 上导致首帧全黑（见 §7.1b）；
 * - colorSpace 必须手设：r170 默认 NoColorSpace（Texture.js:65），
 *   不设会让 sRGB 图被当成线性值采样，整面偏亮发灰；
 * - 这些参数在上传**之前**设好，避免按错的 cache key 多分配一次显存（§5.2、§7.2）。
 */
function loadTiled(
  loader: THREE.TextureLoader,
  url: string,
  maxAnisotropy: number,
  sizeX: number,
  sizeY: number,
  onReady: (tex: THREE.Texture) => void,
): void {
  loader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(sizeX / TILE_METERS, sizeY / TILE_METERS);
    tex.anisotropy = Math.min(MAX_ANISOTROPY, maxAnisotropy);
    onReady(tex);
  });
}
```

**接进 `buildRoom()`（替换 `scene.ts:162-198` 里的地面与墙）**：

```ts
  private buildRoom(): void {
    const loader = new THREE.TextureLoader();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // 地面：先给调色板纯色，不带 map。首帧就是灰盒色，不空白也不黑。
    const floorGeo = new THREE.PlaneGeometry(26, 30, 1, 1);
    const floorMat = new THREE.MeshLambertMaterial({ color: PALETTE.floor });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    loadTiled(loader, TEXTURE_URLS.floor, maxAniso, 26, 30, (tex) => {
      floorMat.map = tex;
      floorMat.needsUpdate = true;   // 必须：map 从无到有要重编 USE_MAP（WebGLRenderer.js:1837-1946）
      this.renderer.initTexture(tex); // 上传挪进加载回调，避免撞在某一帧 draw 上
    });

    // 墙：同一张图、两个 repeat。repeat 不在贴图缓存 key 里（WebGLTextures.js:487-508），
    // 所以必须两个 Texture 实例；用 clone() 让它们共享 source，显存只占一份（Texture.js:105）。
    const wallGeo = new Map<string, THREE.BoxGeometry>();

    loadTiled(loader, TEXTURE_URLS.wall, maxAniso, 26, 4, (longTex) => {
      const shortTex = longTex.clone();
      shortTex.repeat.set(30 / TILE_METERS, 4 / TILE_METERS);

      const walls: [number, number, number, number, number, number, boolean][] = [
        [26, 4, 0.8, 0, 2, -15, true],
        [26, 4, 0.8, 0, 2, 21, true],
        [0.8, 4, 30, -13, 2, 3, false],
        [0.8, 4, 30, 13, 2, 3, false],
      ];
      for (const [w, h, d, x, y, z, isLong] of walls) {
        const key = `${w}x${h}x${d}`;
        let geo = wallGeo.get(key);
        if (!geo) { geo = new THREE.BoxGeometry(w, h, d); wallGeo.set(key, geo); }

        // 每面墙独立材质：两张 repeat 不同的贴图不能塞进同一个材质
        const mat = new THREE.MeshLambertMaterial({ color: PALETTE.wall, map: isLong ? longTex : shortTex });
        const wall = new THREE.Mesh(geo, mat);
        wall.position.set(x, y, z);
        this.scene.add(wall);
      }

      this.renderer.initTexture(longTex);
      this.renderer.initTexture(shortTex);
    });

    // …原 GridHelper / 断碑保持不变
  }
```

> **这段骨架的三条自证**（都对应 §7）：
> 1. 构造函数里两个 `MeshLambertMaterial` **都没有 `map`** —— 首帧走纯色，不会乘到 `(0,0,0,0)`。
> 2. `material.map` 只在 `onLoad` 回调里赋值，且紧跟 `needsUpdate = true` —— 不漏重编。
> 3. 所有 `colorSpace/wrapS/wrapT/repeat/anisotropy` 都在 `initTexture` **之前**设好 —— 只分配一次显存。

> 骨架按本仓库 `tsconfig.json` 的 `noUnusedLocals` 写过（没留未用变量），并用 `tsc --noEmit --strict` 单独编译验证通过（退出码 0）。

### 8.5 验证

- [ ] `pnpm typecheck` 通过（本轮在 `main` 上跑过：`tsc --noEmit` 退出码 0）。
- [ ] `pnpm build` 后确认 `dist/assets/` 下有带 hash 的 `.png`，且 `dist/assets/*.js` 里**没有**大段 `data:image/png;base64`（§4.5 的检查手法）。
- [ ] 若某张图必须落盘，引用处加 `?no-inline`。
- [ ] 浏览器里做 A/B：把 `tex.colorSpace` 临时改成 `THREE.NoColorSpace`，地面应明显变亮、暗部塌陷 —— 看到差异才说明 §2 的链路是通的。
- [ ] 性能红线复测：60 只小怪 @60fps 不变。贴图**不增加 draw call**（地面 1、四面墙各 1，与现在一样），但四面墙若各用独立材质，会多出 program 编译；骨架里长/短墙各共用一个 `Material` 实例会更省，但 `repeat` 不同的贴图不能共用材质 —— 若要进一步省，可把四面墙换成一圈单面 `PlaneGeometry`（见 §8.3 的注意）。
- [ ] 首帧确认：`onLoad` 之前截图，地面/墙面应是调色板纯色而**不是黑色**。是黑色就说明踩了 §7.1b 那个坑。

---

## 附：本文所有一手来源

**Three.js r170 源码**（`node_modules/.pnpm/three@0.170.0/node_modules/three/`）

- `src/loaders/TextureLoader.js:13-36` —— `load()` 同步返回、不改 `colorSpace`
- `src/textures/Texture.js:22,60,65,89-93,105,318` —— 构造默认值、`updateMatrix`、`copy` 共享 source
- `src/constants.js:96-97,164-165` —— `RGBFormat/RGBAFormat`、`SRGBColorSpace/LinearSRGBColorSpace`
- `src/renderers/webgl/WebGLTextures.js:108-118,201-217,273-297,487-508,520-528,644-655,662-706,1160-1164,2107-2139` —— mipmap、internalFormat、缓存 key、anisotropy clamp、sRGB 格式校验
- `src/renderers/webgl/WebGLCapabilities.js:7-25,115` —— `getMaxAnisotropy`
- `src/renderers/webgl/WebGLPrograms.js:116,205,343` —— `HAS_MAP`
- `src/renderers/webgl/WebGLProgram.js:35-55,81-95` —— `linearToOutputTexel` 生成
- `src/renderers/webgl/WebGLMaterials.js:140` —— `mapTransform`
- `src/renderers/webgl/WebGLState.js:420-451,921-962` —— 空纹理兜底：`createTexture` 造 1×1 `Uint8Array(4)`（全 0），`bindTexture` 在 `webglTexture` 为 `undefined` 时回退到它（§7.1b 的依据）
- `src/renderers/WebGLRenderer.js:145,236-266,324,1034-1057,1837-1946,2797-2812` —— WebGL2 only、`outputColorSpace`、`compileAsync`、程序重编、`initTexture`
- `src/renderers/shaders/ShaderChunk/map_fragment.glsl.js:1-17` / `uv_vertex.glsl.js:9` / `uv_pars_vertex.glsl.js:7-12` / `colorspace_fragment.glsl.js:1-3`
- `src/geometries/PlaneGeometry.js:50-51`、`src/materials/Material.js:530-534`、`src/math/ColorManagement.js:127-137,159-182`

**Three.js r170 官方文档**（`mrdoob/three.js` tag `r170` 的 `docs/` 目录；`threejs.org` 的 `/docs/api/en/...` 路径本次核查返回 404，故直接读 tag 内原文）

- [Color-management.html](https://github.com/mrdoob/three.js/blob/r170/docs/manual/en/introduction/Color-management.html) `:154-193` —— 颜色贴图必须标注 `SRGBColorSpace`
- [Texture.html](https://github.com/mrdoob/three.js/blob/r170/docs/api/en/textures/Texture.html) `:23-31,108-111,133-140,177-184,218-222,256-261` —— 平铺示例、POT 说明（WebGL1 时代遗留）、anisotropy、repeat、generateMipmaps、colorSpace

**Vite 6**

- [vite.dev/guide/assets](https://vite.dev/guide/assets) —— "Importing Asset as URL" / "The public Directory" / "Choosing between imports and the public directory"
- `vite/dist/node/constants.js:125-128,143` —— `DEFAULT_ASSETS_RE`、`DEFAULT_ASSETS_INLINE_LIMIT = 4096`
- `vite/dist/node/chunks/dep-Cohbwjf9.js:10363-10381,10524-10538,10600-10620,36042-36053,46599-46616` —— public asset 占位替换、`shouldInline`、public 目录 import 报错、`copyDir`
- `vite/client.d.ts:61-100,248-271` —— `*.png` 与 `?url/?inline/?no-inline` 的类型声明

**WebGL 2.0 规范**

- [KhronosGroup/WebGL specs/latest/2.0](https://github.com/KhronosGroup/WebGL/blob/main/specs/latest/2.0/index.html) "Non-Power-of-Two Texture Access" —— 取消 NPOT 限制，所有 wrapping 模式与 mipmap 均支持
- 同文件 "Texel Fetches" —— 不完整纹理采样被规定返回 `(0,0,0,1)`，这是 §7「先挂 map、图后到」不会出黑块/花屏的规范依据

**本仓库**

- `src/render/scene.ts:5-13,16-32,53-159,162-198,304-320` —— 现有灰盒实现、`PALETTE`、`buildRoom`、`dispose`
- `vite.config.ts:3-6` —— 未设 `assetsInlineLimit`，走默认 4096
- `tsconfig.json:19` —— `'types': ['vite/client']` 已就位，`*.png` 的 import 有类型
- `package.json:14-23` —— three `^0.170.0` / vite `^0.6`（实际 6.4.6）/ ```types/three ^0.187.0`
