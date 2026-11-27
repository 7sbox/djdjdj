# CC0 素材站核查：哪些贴图是真 CC0、能不能提交进本仓库

> **一句话结论**：**Poly Haven 和 ambientCG 是仅有的两家「真 CC0 + 明确允许把原始文件随产品分发 + 条款里查不到任何附加限制」的站点**，可以直接入库；Kenney 也是真 CC0，但它的贴图是卡通/复古风格、没有可用的写实石砖地面与青石墙面，且整包必须走签名链接手动下载；OpenGameArt 的 CC0 是真的，但内容由个人投稿、要逐个文件核对、且站点对 AI 抓取做了全站 Disallow；Wikimedia Commons 只能逐文件确认、且在当前环境无法直连核查。**推荐路径：地面与墙面各从 ambientCG / Poly Haven 取一张 1K 的 base color，重命名为语义化文件名后提交进 `src/assets/tex/`，并在同目录放一份 `CREDITS.md` 记录 asset id 与条款链接。**

本文所有结论都来自各家当前的一手条款页与实测命令；每条后面附出处。核查时间：2026-11-28。

---

## 0. 结论表（先看这张）

| 站点 | 条款出处链接 | 是否真 CC0 | 是否允许入库 | 下载方式 | 有无附带限制 |
| --- | --- | --- | --- | --- | --- |
| **Poly Haven** | <https://polyhaven.com/license> ／ API 条款 <https://github.com/Poly-Haven/Public-API/blob/master/ToS.md> | ✅ 真 CC0（站点自有资产，逐件标 CC0） | ✅ **明确允许**：「You can redistribute them … or even in a product you sell」 | API：`api.polyhaven.com/assets?t=textures` → `/files/{id}` 拿直链；也可网页下 | ⚠️ **禁止 web scraping / data mining**（ToS 3.2），必须走 API；ToS 4.1 声明站点 logo/预览图/文案非 CC0；Vaults 内容收费 |
| **ambientCG** | <https://docs.ambientcg.com/license/>（由 <https://ambientcg.com/license> 302 而来） | ✅ 真 CC0（含预览渲染图） | ✅ **明确允许**：「You can include the raw files in your project, for example a video game」 | 直链 `ambientcg.com/get?file=<ID>_1K-JPG.zip`；API `/api/v3/assets` | ✅ **无**（robots.txt 全放行，无 NFT/AI/反抓取条款，无署名义务） |
| **Kenney.nl** | <https://kenney.nl/support> ／ 包内 `License.txt` ／ <https://kenney.nl/terms-of-service> | ✅ 真 CC0（实测下载整包核对过 License.txt） | ✅ 实质允许（CC0 覆盖，且无附加限制；措辞未直说「再分发原始文件」） | **必须走签名链接**：`GET kenney.nl/download-link/{hexId}`（**不带 Referer 会 403**）→ 拿 `?expires=` 签名 URL → zip | ⚠️ 有 AI/TDM 保留声明：`<meta name="tdm-reservation" content="1">`、`<meta name="robots" content="noai, noimageai">`；robots.txt 对 GPTBot/ClaudeBot/CCBot 等 `Disallow: /`。**只针对训练/抓取，不针对做游戏** |
| **OpenGameArt** | <https://opengameart.org/content/faq> | ✅ 真 CC0（每张图 License(s) 直接标 CC0 并链到 CC 官方文本） | ⚠️ **含糊**：FAQ 只承诺「可按许可证使用」，站点无 ToS 明文覆盖「把你的仓库当分发渠道」；且 CC0 标注为投稿者自述、站点仅「努力核实」 | 网页直链 `opengameart.org/sites/default/files/xxx.zip`；**无 API**（`/api` `/jsonapi` 均 404，只有 `/rss.xml`） | ⚠️ **有**：robots.txt 里 202 个 AI/爬虫 UA 同组 `Disallow: /`；`User-agent: *` 受 `Crawl-delay: 10`；站点尊重作者下架请求 |
| **Wikimedia Commons** | <https://commons.wikimedia.org/wiki/Commons:Licensing> ／ <https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia> | ✅ 真 CC0（站点只收自由内容，四条硬条件 CC0 全满足） | ⚠️ **政策上允许，实操需逐件自证**：「you should make your own determination of the copyright status of each image」 | MediaWiki API `/w/api.php`（**本次环境无法直连，改用 beta 镜像读取政策原文**） | ⚠️ 不做任何版权担保；「inalienable moral rights and other restrictions may still apply」；无 NFT/AI/反抓取条款 |
| **CC0 Textures** | **站点已不存在**：`cc0textures.com` 实测 301 → `ambientcg.com` | —（按 ambientCG 计） | 按 ambientCG | 按 ambientCG | 按 ambientCG |

> **本次核查最反直觉的一项发现**：题面预设的「禁止再分发原始文件 / 禁止用于 NFT / 禁止用于 AI 训练」这三类附加条款，在六家里**一条都没有出现**。真正存在且会挡住我们的是**「禁止抓站」**（Poly Haven ToS 与 OGA robots.txt）—— 而它挡的是自动化抓取，不是「把素材做进游戏」。详见 §4。

---

## 1. 先厘清：CC0 在法律上到底给了什么

CC0 1.0 不是「一个宽松的许可证」，它是**权利放弃声明**。读法条原文：

- **第 2 条 Waiver**：Affirmer「overtly, fully, permanently, irrevocably and unconditionally waives, abandons, and surrenders all of Affirmer's Copyright and Related Rights」，范围是 worldwide、最大法定期限、任意媒介、任意目的 —— 明确包含「commercial, advertising or promotional purposes」。→ <https://creativecommons.org/publicdomain/zero/1.0/legalcode.en>（Section 2. Waiver）
- **第 3 条 Public License Fallback**：万一某司法辖区认定放弃无效，自动降级为一个 royalty-free、irrevocable 的许可，效果等价。所以「放弃」在两类法域都兜得住。
- **第 4 条 Limitations**：明确写着商标权与专利权**不**被放弃，且 Affirmer 不做任何权利瑕疵担保。这一条很重要 —— 它意味着站点贴的「CC0」只覆盖著作权，**不覆盖**商标、肖像权，也不约束站点自己额外加的服务条款。

因此本文的核查标准是**两个独立层次**：

1. **著作权层**：这个文件是不是真的被放弃著作权？（看站点是否把 CC0 打在了文件本身）
2. **合同层**：站点自己的 ToS 有没有在 CC0 之外附加限制？（这一层不做数 —— 违反了不能告你侵权，但能告你违约，一样要下架）

> 关键判据：**CC0 只约束著作权，站点 ToS 是另一份合同。** 只要 ToS 里出现「禁止再分发原始文件 / 禁止用于 NFT / 禁止 AI 训练」这类条款，即使文件本身是 CC0，我们入库也有风险 —— 这正是本议题要专门点出来的地方。

---

## 2. 逐个站点核查

### 2.1 Poly Haven —— 真 CC0，允许入库，条款最干净

**条款原文**（<https://polyhaven.com/license>）：

> All assets (HDRIs, textures and 3D models) on this site are the original work of Poly Haven staff, or artists who willingly and directly donate/sell their work to Poly Haven.
> Our assets are all licensed as **CC0**, which is effectively **Public Domain** even in jurisdictions that do not support the Public Domain.
> …
> You can use our assets for **any purpose**, including commercial work.
> You do **not need to give credit** or attribution when using them (although it is appreciated).
> You can **redistribute them**, share them around, include them when sharing your own work, **or even in a product you sell**.

**「把贴图提交进 git 仓库」这件事**，上面那句「You can redistribute them … or even in a product you sell」就是明文授权，范围比「入库」还宽。

**附加限制核查**：把 license 页全文按 NFT / blockchain / AI training / resell / scraping 逐个关键词扫了一遍：

| 关键词 | 是否出现 | 原文位置 |
| --- | --- | --- |
| NFT / blockchain | **无** | — |
| 禁止 AI 训练 | **无**，反而明确允许 | FAQ：「Can I train an AI with your content? **Yes.**」<https://docs.polyhaven.com/en/faq> |
| 禁止再分发 | **无**，反而明确允许 | 见上「You can redistribute them」 |
| 禁止 resell | 只描述现象，不是限制 | 「Yes it's possible that unethical users can (and do) resell our work」—— 这是感慨，不是条款 |
| **禁止 web scraping / data mining** | **有，且这条是真限制** | 「You must not engage in any activity that may disrupt or interfere with the proper functioning of the website, including but not limited to: **Web scraping or data mining without express permission.**」 |

最后一条要专门点出来：**Poly Haven 禁止抓站，但禁的是抓 HTML 页面，不是禁止下载素材**。站点自己给了替代方案（<https://polyhaven.com/llms.txt>）：

> If you want lists of assets, their metadata or their download links, please use the API rather than scraping the site. The library pages … build their grids in the browser with JavaScript, so fetching one without running scripts gives you an empty list.

所以正确的批量获取方式是走 API，不是爬页面。另外注意：**Vaults 里的资源不是免费的**（<https://polyhaven.com/vaults>：「we have locked some new collections of assets behind a temporary paywall」），用 API 时要排除 vault 资产。

**下载方式与限速**（均为实测）：

- **API**：`/assets?t=textures`（全量元数据，实测 873 条、859,140 字节一次取回）、`/files/{id}`（下载直链 + md5 + 体积）、`/info/{id}`、`/search?q=…&t=textures`。规范在 <https://api.polyhaven.com/api-docs/swagger.json>。
- **鉴权**：API 条款 2.4 要求带能识别应用的 User-Agent 或 Referer ——「all API calls must be made with a unique "Referer" header or user-agent that matches your software name」。<https://github.com/Poly-Haven/Public-API/blob/master/ToS.md>
- **限速**：OpenAPI 规范里只有 `/v2/search` 写了限速 ——「Rate limited per client IP (150 a minute), which answers `429` with `Retry-After`」。`/assets` 与 `/files/{id}` 未见明文限速，**也没有「每天/每月总量」这类配额条款**。
- **直链实测可用**：`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_pavement_02/brick_pavement_02_diff_1k.jpg` → HTTP 200，`image/jpeg`，961,154 字节，1024×1024。
- **单个 zip 包**：`/files/{id}` 返回的 map 列表里**没有** zip 键（实测只有 Diffuse / nor_dx / nor_gl / blend / gltf / arm / AO / Displacement / Rough / mtlx 十项），要整包得走网页的 ZIP 按钮。我们只要 base color，逐张直链就够。

⚠️ **一个必须点出的细节**：API 条款 2.5 说「if you use the live API inside your software, website or service to surface Poly Haven content, you must make it clear to your users where that content comes from」。但同一条紧跟着写：「**This clause applies only to use of the live API service - it does not apply to the CC0 assets themselves once downloaded or self-hosted. CC0 assets carry no attribution requirement whatsoever, now or ever.**」—— **下载后入库、随产品分发，不需要署名**。这条把「用 API 时要署名」和「用素材本身不要署名」分得很清楚。

**结论**：真 CC0 ✅ / 允许入库 ✅ / 无附加限制 ✅ / 有 API ✅。

---

### 2.2 ambientCG —— 真 CC0，允许入库，条款里连「禁止抓站」都没有

**条款原文**（<https://ambientcg.com/license> 会 302 跳到 <https://docs.ambientcg.com/license/>，实测）：

> All ambientCG assets are provided under the **Creative Commons CC0 1.0 Universal License**.
> This applies to the downloadable asset files **and the material preview renders** shown for each asset on the site.
> …
> You can copy, modify, distribute and perform the assets, even for commercial purposes, all without asking permission.
> **You can include the raw files in your project, for example a video game.**

「**You can include the raw files in your project, for example a video game**」—— 这是六家里**对「入库并随产品分发」表述最直接的一条**，比 Poly Haven 的措辞还贴题。

首页也再次确认（<https://ambientcg.com>）：

> Yes. All assets are released under the Creative Commons CC0 license, making them free to use without attribution - even in commercial circumstances.

还有一句说明建站动机的原文：

> I started this website in 2018 to provide freely shareable 3D textures because I had become frustrated with the **licensing policies of many other texturing platforms, which limit or forbid texture redistribution**.

**附加限制核查**：license 页 / asset-types 页 / updates 页全扫过 NFT、blockchain、AI training、redistribution、resell、scraping 六个关键词 —— **一个都没有**。连 robots.txt 都是全放行（<https://ambientcg.com/robots.txt>，只挡了一个内部 HTMX 端点）：

```
User-agent: *
Allow: /

User-agent: *
Disallow: /hx/
```

**这是六个候选里条款最干净的**：没有 NFT 禁令、没有 AI 训练禁令、没有反抓取条款、没有署名义务。

**下载方式与限速**：

- **直链模式极稳**：`https://ambientcg.com/get?file=<AssetID>_1K-JPG.zip`，实测 302 到 CDN 后返回 `application/zip`。下载下来是标准 PBR 包，实测 `PavingStones036_1K-JPG.zip` 解包 11 个文件：`_Color.jpg` / `_NormalGL.jpg` / `_NormalDX.jpg` / `_Roughness.jpg` / `_AmbientOcclusion.jpg` / `_Displacement.jpg` / `.blend` / `.mtlx` / `.tres` / `.usdc` / 一张预览 png。**我们只要 base color，就是那个 `_Color.jpg`。**
- **API**：v3，`https://ambientcg.com/api/v3/assets`。只有 GET，没有写操作。关键参数：`q`、`type=material`、`limit`（**1–500，超范围会被 clamp 或回落默认 100**）、`offset`、`include=downloads,title,…`。→ <https://docs.ambientcg.com/api/v3/assets/>
- **限速**：**文档里没有任何速率或配额数字**。API 首页只有一句提醒：这个站是「just one person」在维护，「the API is therefore potentially not as reliable or stable as needed for an 'enterprise-level' application」（<https://docs.ambientcg.com/api/>）。**没有硬性限速，但也没有可用性承诺 —— 应按礼貌速率抓并自行缓存。**
- **批量下载**：全量镜像走 Patreon 的 Nextcloud（`access.ambientcg.com`），属付费层级；文档另警告「Trying to batch-download a large volume of files (like an entire category) via the web-browser is not recommended due to extremely poor performance」（<https://docs.ambientcg.com/patreon-rewards/nextcloud/>）。**我们只要两张图，不需要批量通道。**

**结论**：真 CC0 ✅ / 允许入库 ✅（措辞最明确）/ 无附加限制 ✅ / 有 API ✅。

---

### 2.3 Kenney.nl —— 真 CC0，允许入库，但没有我们要的写实石砖

**条款原文**（<https://kenney.nl/support>）：

> Yes, all game assets on the asset pages are **public domain licensed (CC0)**. You're free to use them, even in commercial projects.
> **Is attribution required when using the game assets? Attribution is not required.** If you want to support us mention "Kenney" or use one of the badges. Refrain from using the 'Kenney' logo seen on top of the page separately.

实测下载整包，验证条款是否与站点一致。过程本身有信息量 —— 下载要走**签名链接**：

1. 资产页的下载按钮带一个十六进制 id（`data-download-id='6173…6c'`，其实就是 `assets/retro-textures-liminal` 的 hex）；
2. 前端调 `https://kenney.nl/download-link/{id}`，**必须带 Referer，否则 403**（实测：不带 Referer 返回 `{"error":"forbidden"}`；带 `Referer: https://kenney.nl/assets/retro-textures-liminal` 返回 200 + 一个带 `expires=` 的签名地址）；
3. 签名地址 GET 回来是 `application/zip`，`content-disposition: attachment; filename="kenney_retro-textures-liminal_1.0.zip"`，987,629 字节，108 个条目。

包里的 `License.txt` 原文（最终一手证据）：

> Retro Textures Liminal (1.0)
> Created/distributed by Kenney (www.kenney.nl)
> Creation date: 22-11-2026
> **License: (Creative Commons Zero, CC0)**
> <http://creativecommons.org/publicdomain/zero/1.0/>
> You can use this content for personal, educational, and commercial purposes.
> Support by crediting 'Kenney' or 'www.kenney.nl' (**this is not a requirement**)

**条款与站点一致，没有暗坑。**

不过 Kenney 有两个必须点出的问题：

1. **有 AI / 抓取保留声明**。资产页 head 里有：
   `<meta name="robots" content="noai, noimageai">` 与 `<meta name="tdm-reservation" content="1">`
   
   `tdm-reservation: 1` 是 EU DSM 指令第 4 条文本与数据挖掘例外的**机器可读保留声明**，意为「本页内容不授予 TDM 例外」。robots.txt 更严（<https://kenney.nl/robots.txt>）：`GPTBot` / `ClaudeBot` / `CCBot` / `Bytespider` 等一律 `Disallow: /`，`User-agent: *` 挡 `/assets/`、`/downloads/`、`/files/`。
   
   **对我们的意义**：这些是**针对训练/抓取**的保留，不是针对「用素材做游戏」的限制。素材本身是 CC0，License.txt 明说可商用。但**自动化批量拉取会踩 robots.txt** —— 手工下几张没问题，写脚本批量抓不礼貌也不合规。
2. **没有我们要的写实素材**。`https://kenney.nl/assets/category:Textures` 实测共 11 个包，全数列一遍：`Retro Textures Liminal` / `Skyboxes Space` / `Pattern Pack Extra` / `Skyboxes` / `Retro Textures Fantasy` / `Development Essentials` / `Pattern Pack` / `Pattern Pack Pixel` / `Pattern Pack Lines` / `Prototype Textures` / `Road Textures`。**没有一个是写实石砖或石墙**；实测下载的 `Retro Textures Liminal` 包里 103 张 PNG 全是 `carpet_green.png`、`ceiling_large.png` 这类室内卡通贴图。`Road Textures` 是俯视道路标线，也不是我们要的石砖地面。**结论：Kenney 没有可用的石砖地面与青石墙面。**

**结论**：真 CC0 ✅ / 允许入库 ✅ / 无附加限制 ⚠️（有 TDM/AI 保留声明，只针对训练与批量抓取，不针对用它做游戏）/ **内容不匹配，不采用**。

---

### 2.4 OpenGameArt.org —— CC0 是真的，但内容质量不可控，且站点明确不欢迎 AI 抓取

**CC0 的界定**（<https://opengameart.org/content/faq>）：

> **Creative Commons 0 ("CC0")** — This license is the creative commons team's equivalent of public domain. Works released under this license may be copied, modified, distributed, performed or otherwise used **in anyway without asking, crediting or notifying the creating artist**.
> If you are using art, this license means **commercial use is ok**.

以及站点层面的许可政策：

> Yes, you can use any of the art submitted to this site. Even in commercial projects. Just be sure to adhere to the license terms.

**「能不能入库」这件事 OGA 没有正面回答** —— 站点没有一条 ToS 明文说「你可以把文件提交到你的 git 仓库」，只承诺「可以按许可证使用」。因为 OGA 的 CC0 就是标准 CC0 1.0 文本（每张图页面的 License(s) 字段直接写 `CC0` 并链到 CC 官方文本），**著作权层面与前两家等价**。

但 OGA 有三个具体问题：

1. **内容是个人投稿，授权链不可控**。FAQ 里有专门一节讲「有人没经我同意就把我的图传上来了」，还有「if the artist has specifically requested that their work not be distributed from other websites, Open Game Art honors those requests」。也就是说 **OGA 上的 CC0 标注是投稿者自述，站点只做「努力核实」**：「We make an effort to verify that PD content is actually in the public domain before we approve it for the archive」。这比 Poly Haven（自家员工作品）与 ambientCG（站长一人制作）的授权链弱一个量级。
2. **站点对 AI 爬虫做了全站级 Disallow**。<https://opengameart.org/robots.txt> 里，**202 条 `User-agent:` 行**（`anthropic-ai`、`ClaudeBot`、`ChatGPT-User`、`GPTBot`、`CCBot`、`DeepSeekBot`、`Bytespider`、`cohere-training-data-crawler`、`img2dataset` 等）被打包在**同一个 group** 里，底下只有一条 `Disallow: /`。也就是说这些 UA 一律不得抓取本站任何路径。
   紧接着的 `User-agent: *` group 则给了普通人 `Crawl-delay: 10` —— **这就是 OGA 的「批量下载限速」：通用爬虫每 10 秒只能请求一次。****用脚本抓 OGA 会直接撞规则。**
3. **没有 API**。实测 `/api` 与 `/jsonapi` 都是 404，只有 `/rss.xml` 可用。高级搜索页能按 `field_art_licenses_tid=4`（CC0）过滤，但那是 HTML 页面，不是接口。

**素材匹配度**：按 CC0 + Texture 过滤后搜 `cobblestone` 得 14 条、`stone wall` 得 36 条。看得到实物的典型条目：

- <https://opengameart.org/content/seamless-cobblestone-texture> —— CC0，`cobblestone.zip` 11 Mb，作者自述「A tool generated seamless cobblestone texture」；实测直链 `https://opengameart.org/sites/default/files/cobblestone.zip` HEAD 返回 200、`application/zip`、10,983,016 字节。
- <https://opengameart.org/content/cobblestone-wall-texture> —— CC0，作者自述「default grey colour … This is not a PBR texture」，32/64/1024px PNG。

**能凑合用，但都是「工具生成」或「手绘复古」级别，不是扫描级 PBR 底图。**

**结论**：真 CC0 ✅ / 允许入库 ⚠️（著作权上可以，但站点无明文，且内容为第三方投稿，需逐件复核）/ 有附加限制 ⚠️（反 AI 抓取全站生效）/ **不推荐作为首选**。

---

### 2.5 Wikimedia Commons —— 只接受自由内容，但必须逐文件核实，本环境无法直连

**站点政策**（<https://commons.wikimedia.org/wiki/Commons:Licensing>，本次经 beta 集群镜像 <https://commons.wikimedia.beta.wmcloud.org/wiki/Commons:Licensing> 读取，原因见下）：

> Wikimedia Commons accepts only **free content**, that is, images and other media files that can be used **by anyone, anytime, for any purpose**.
> All copyrighted material on Commons must be licensed under a free license that allows anyone to use the material for any purpose. In particular, the license **must** meet the following conditions:
> - **Republication and distribution must be allowed.**
> - **Publication of derivative work must be allowed.**
> - **Commercial use of the work must be allowed.**
> - The license must be perpetual (non-expiring) and non-revocable.

CC0 满足这四条，所以 **Commons 上的 CC0 文件确实是真 CC0**。复用指引（<https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia>）也写明：

> Content marked as public domain (or local equivalent, e.g. "may be used for any purpose") is material believed to be out of copyright …
> Note that **inalienable moral rights and other restrictions may still apply in some countries for some uses.**

⚠️ **两个必须点出的风险**：

1. **Commons 不做任何担保**。「the Wikimedia Foundation does not provide any warranty regarding the copyright status or correctness of licensing terms. If you decide to reuse files from Commons, **you should make your own determination of the copyright status of each image** just as you would when obtaining images from other sources.」—— 等于把核实责任完全推给复用者。**逐文件核 `source` 字段是硬性动作**，不能只看页面底部的 CC0 徽章。
2. **本次核查无法直连**。实测：`commons.wikimedia.org` 与 `upload.wikimedia.org` 在本机 TCP 443 可通（`Test-NetConnection` 返回 True），但 TLS 握手超时（Node fetch 报 `ConnectTimeoutError`，curl 报 schannel `SEC_E_NO_CREDENTIALS`）—— **这是本机网络环境问题，不是站点问题**。改走 beta 集群镜像读到并引用了上面的政策原文；`wikimediafoundation.org` 可直连。**若要用 Commons，需在能正常访问的环境里重做一次逐文件核对。**

**素材匹配度**：beta 集群的 search API 返回 0 命中（该镜像不索引主集群内容，`list=search` 结果为空），所以**本次无法给出 Commons 上的具体候选清单**。Commons 的图以照片为主，做可平铺贴图通常要自己裁切接缝，**不是拿 tileable base color 的好来源**。

**结论**：真 CC0 ✅（若文件确实标 CC0）/ 允许入库 ✅（著作权上可以）/ 附加限制 ⚠️（无担保，须逐件核实；本环境无法直连）/ **不作为首选**。

---

### 2.6 CC0 Textures —— 已并入 ambientCG，不再是独立站点

实测 `https://cc0textures.com` 与 `http://cc0textures.com` 均返回 **301 → `http://ambientcg.com/`**；`https://cc0textures.com/license` → **301 → `http://ambientcg.com/license`**。

即 **CC0 Textures 这个站已不存在，全部内容迁到 ambientCG**。查它的条款 = 查 ambientCG 的条款（见 §2.2）。不需要单独列一行。

---

## 3. 「把贴图提交进 git 仓库并随产品分发」：谁明确允许、谁含糊、谁禁止

| 站点 | 对这一件事的表述 | 判定 |
| --- | --- | --- |
| **ambientCG** | 「**You can include the raw files in your project, for example a video game.**」 | **明确允许**（最直接） |
| **Poly Haven** | 「You can **redistribute them**, share them around, include them when sharing your own work, or even **in a product you sell**.」 | **明确允许** |
| **Kenney** | 站点只写「all game assets … are public domain licensed (CC0)」，包内 License.txt 写「You can use this content for personal, educational, and commercial purposes」。没有单独提「再分发原始文件」。 | **实质允许，措辞未直说**（CC0 本身已覆盖，且无附加限制） |
| **OpenGameArt** | FAQ 只写「you can use any of the art submitted to this site. Even in commercial projects. Just be sure to adhere to the license terms.」站点层面无 ToS 明文覆盖「把你的仓库当分发渠道」。 | **含糊**（依赖具体文件的 CC0，且授权链为投稿者自述） |
| **Wikimedia Commons** | 政策要求许可证必须允许「Republication and distribution」，但复用指引同时声明「you should make your own determination of the copyright status of each image」。 | **政策上允许，实操上需逐件自证** |
| **CC0 Textures** | 站点已 301 到 ambientCG | **按 ambientCG 处理** |

**没有一家明确禁止。** 这个结果必须强调 —— 题面预设的「哪几家禁止」在本次核查里**答案是零**，真正要防的是**附加条款**，不是「禁止入库」。

---

## 4. 附加条款专项：有没有「CC0 之外还加了一条」

这是本议题的核心风险点。逐个扫过：

| 站点 | 禁止再分发原始文件 | 禁止用于 NFT | 禁止用于 AI 训练 | 禁止抓站/爬虫 | 其它 |
| --- | --- | --- | --- | --- | --- |
| **Poly Haven** | ❌ 无（明文允许再分发） | ❌ 无 | ❌ 无（FAQ 明文「Yes」） | ✅ **有**：ToS 3.2「Web scraping or data mining without express permission」 | 自家 ToS 4.1 声明站点内容（logo/示例渲染/文案）**不属于** CC0；Vaults 内容收费 |
| **ambientCG** | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无（robots.txt 全放行） | 无 |
| **Kenney** | ❌ 无 | ❌ 无 | ⚠️ **有保留声明**（非禁令）：`<meta name="tdm-reservation" content="1">` + `<meta name="robots" content="noai, noimageai">` | ⚠️ robots.txt 对 GPTBot/ClaudeBot/CCBot 等 `Disallow: /`；对 `*` 挡 `/assets/ /downloads/ /files/` | ToS 明确「the materials … are protected by applicable copyright and trademark law **unless marked otherwise**」 |
| **OpenGameArt** | ❌ 无 | ❌ 无 | ⚠️ **有**：robots.txt 里 202 个 AI/爬虫 UA 同组 `Disallow: /` | ✅ **有**（同上）；通用 UA 另受 `Crawl-delay: 10` | 站点会**尊重作者的下架请求**，即使作品是自由许可 |
| **Wikimedia Commons** | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 | ⚠️ 不做版权担保；「inalienable moral rights and other restrictions may still apply」 |
| **CC0 Textures** | — | — | — | — | 站点已并入 ambientCG |

**几点必须说清楚**：

1. **「禁止用于 AI 训练」在六家里一条都没有出现。** 题面预设的这个担忧在本次核查里**不成立**。Poly Haven 甚至反过来鼓励（FAQ 专设一节「Can I train an AI with your content? Yes.」）。真正存在的是 Kenney 与 OGA 的**机器可读保留声明**（`tdm-reservation` / robots.txt），那是「不许自动化抓取/训练」，**不是「不许把素材做进游戏」**。
2. **「禁止用于 NFT」在六家里一条都没有出现。** 同样不成立。
3. **「禁止再分发原始文件」在六家里一条都没有出现**，其中两家反而明文允许。
4. **唯一真正会挡住我们的附加条款是「禁止抓站」**，涉及 Poly Haven（ToS）与 OpenGameArt（robots.txt）。**解决办法是走 API 或手工下载，不是不用这些素材。**
5. **一个容易忽略的通用坑**：Poly Haven ToS 4.1 说明「All content on this website, **excluding the CC0 assets themselves**, is protected by intellectual property laws」—— 素材页上的 logo、示例渲染图、文案**都不是 CC0**。入库时只能提交素材文件本身，不能顺手把资产页的预览图一起提交。Kenney ToS 的「unless marked otherwise」是同一个意思。

---

## 5. 「石砖地面」与「青石墙面」的现成素材

**需求口径**：只要 base color（`_Color.jpg` / `_diff_*.jpg`），不要法线、粗糙度。用本仓 `src/render/scene.ts:16-32` 的 `PALETTE` 作色相锚点：地面 `floor: 0x2b3138`（青灰）、墙面 `wall: 0x1f242a`（更深的青）。渲染层实际会乘上这个色调，所以贴图**越接近中性冷灰越好** —— 偏暖的砖石会被调色板拉脏。

用 Pillow 实测候选图平均 RGB（缩到 64×64 取均值），用 `B − R` 判断冷暖（负值越大越暖）：

### 5.1 Poly Haven

| asset id | 分类 | 尺寸 | 平均 RGB | B−R | 适配 |
| --- | --- | --- | --- | --- | --- |
| `brick_pavement_02` | floor / brick / paving | 1024² | (79, 72, 65) | −14 | **地面首选**（描述原文「rough, old gray brick pavement」） |
| `brick_pavement_03` | paving | 1024² | (110, 103, 93) | −17 | 地面备选，略亮 |
| `stone_tile_wall` | wall | 1024² | (169, 165, 160) | **−9** | **墙面首选**（八张里最中性、最接近青灰） |
| `stone_wall_05` | wall / stonework | 1024² | (78, 70, 58) | −20 | 墙面备选，更暗更旧 |
| `cobblestone_floor_09` | floor / cobblestone | 1024² | (94, 82, 68) | −26 | 可作地面，偏暖 |
| `cobblestone_floor_04` | floor / cobblestone | 1024² | (137, 125, 97) | −40 | 偏暖偏亮，不推荐 |
| `medieval_blocks_02` | wall / medieval | 1024² | (171, 135, 106) | −65 | **太暖（米黄），排除** |
| `rock_wall_06` | wall | 1024² | (169, 152, 130) | −39 | 偏暖，不推荐 |

取图直链（实测 200 + `image/jpeg` + 1024×1024）：

```
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_pavement_02/brick_pavement_02_diff_1k.jpg   (961,154 B)
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/stone_tile_wall/stone_tile_wall_diff_1k.jpg                          (640,274 B)
```

### 5.2 ambientCG

| asset id | 尺寸 | 平均 RGB | B−R | 适配 |
| --- | --- | --- | --- | --- |
| `PavingStones046` | 1024² | (153, 155, 153) | **0** | **青灰地面首选**（完美中性灰，乘调色板后就是目标青石色） |
| `PavingStones070` | 1024² | (139, 137, 129) | −10 | 地面备选，略暗 |
| `PavingStones036` | 1024² | (145, 148, 128) | −17 | 偏草绿，一般 |
| `PavingStones151` | 1024² | (118, 110, 98) | −20 | 偏暖，可作深色地面 |
| `Rock051` | 1024² | (117, 114, 97) | −20 | 可作墙面（石块感） |
| `Bricks113A` | 1024² | (127, 116, 98) | −29 | 可作墙面（砖感），但偏暖 |
| `Bricks085` | 1024×**512** | (149, 116, 98) | −51 | **太暖（红砖），排除** |
| `Bricks097` | 1024×**512** | (133, 105, 83) | −50 | **太暖，排除** |
| `Tiles143` | 1024² | (216, 180, 141) | −75 | **太亮太暖，排除** |

⚠️ 注意 **`Bricks*` 系列尺寸不统一**：实测 `Bricks113A` 是 1024²，而 `Bricks085` / `Bricks097` / `Bricks105` / `Bricks100` 都是 1024×512（墙砖本来就是长条形）。长条形拿去铺地面会拉伸，**铺地面请先确认是正方形**（`PavingStones*` 实测均为 1024²）。

取图方式（实测可用。注意这是个 PBR 整包 zip，里面同时有 Color / NormalGL / NormalDX / Roughness / AO / Displacement 六张图 —— **只取文件名单以 `_Color.jpg` 结尾的那一张**）：

```
https://ambientcg.com/get?file=PavingStones046_1K-JPG.zip   (8,341,959 B)
→ PavingStones046_1K-JPG_Color.jpg
```

### 5.3 结论性对照

**「够用」的标准是：正方形、1024、中性冷灰、可平铺、真 CC0。** 同时满足这五条、且最干净的是 **ambientCG 的 `PavingStones046`（地面）** 与 **Poly Haven 的 `stone_tile_wall`（墙面）**；Poly Haven 的 `brick_pavement_02` 是地面第二选择（更有「旧石砖路面」的质感，但 B−R = −14 略暖，靠调色板压得住）。

Kenney 与 OGA 在这个口径下**出局**：Kenney 没有写实石砖；OGA 的候选是工具生成或手绘复古风，达不到「青石墙面」的质感要求。

---

## 6. 给本仓库的落地约束（两条工程事实）

1. **不能有模型名/贴图名泄漏进逻辑层**。`src/render/scene.ts:5-13` 的注释已写明：「这一层不允许把模型名、贴图名泄漏给逻辑层。逻辑层只给 Vec2 + defId，渲染层决定长什么样。」所以**文件名必须语义化**（如 `floor-cobble.jpg`），不要沿用 `brick_pavement_02_diff_1k.jpg` —— 后者把「哪家、哪张」写进了文件名，等于让素材身份渗透进代码路径。同时按 `docs/research/three-r170-texture-loading-color-space.md` 的做法走 `import url from '../assets/xxx.jpg'`，让 Vite 打 hash。
2. **性能红线不受影响，但要注意贴图内存**。60 只小怪 @60fps + InstancedMesh 单 draw call + 关实时阴影（`src/render/scene.ts:12-13,41-43,58`）—— 加两张 1024² base color 贴图**不增加 draw call**（地面 1 个 mesh、墙面 1 个 mesh，各 1 个 material），显存按 1024² RGBA8 + mipmap 约 **5.33 MiB/张**，两张 ≈ 10.7 MiB，可接受。

另外，**GitHub 有硬性文件大小限制**（<https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github>，数值取自 <https://github.com/github/docs/blob/main/data/variables/large_files.yml>）：

- 单文件超过 **50 MiB** 会收到 Git 警告（`warning_size`）
- 单文件超过 **100 MiB** 会被**直接拒绝 push**（`max_github_size`）
- 仓库建议 **< 1 GB**，强烈建议 **< 5 GB**

我们只要 base color，实测各图 `_Color` / `_diff` 单文件体积：`PavingStones046` = 1,083,584 B、`PavingStones070` = 1,758,823 B、`PavingStones036` = 1,796,007 B、`Rock051` = 1,584,524 B、`brick_pavement_02` = 961,154 B、`stone_tile_wall` = 640,274 B —— 全在 **0.6–1.8 MB** 区间。**离 50 MiB 警告线差两个数量级，完全不需要 Git LFS。** 更要紧的是：**不要提交 8K/16K 原图**，那才是会把仓库撑爆的东西。

---

## 7. 可执行清单

### 7.1 推荐路径（采用这条）

- [ ] **从 ambientCG 取地面**：下载 `https://ambientcg.com/get?file=PavingStones046_1K-JPG.zip`，解包只取 `PavingStones046_1K-JPG_Color.jpg`（1024×1024，平均 RGB 153/155/153，完全中性灰）。
- [ ] **从 Poly Haven 取墙面**：下载 `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/stone_tile_wall/stone_tile_wall_diff_1k.jpg`（640,274 B，1024×1024，平均 RGB 169/165/160，B−R = −9，八张 Poly Haven 候选里最中性）。
- [ ] **重命名成语义化文件名**（不暴露来源）：`src/assets/tex/floor-cobble.jpg`、`src/assets/tex/wall-stone.jpg`。理由见 §6 第 1 条。
- [ ] **在 `src/assets/tex/CREDITS.md` 记录**：asset id、来源 URL、条款页 URL、下载日期。CC0 不强制署名，但这是给未来自己（和 `git log`）留的证据链 —— 一旦有人质疑，能立刻指回条款。
- [ ] **按 `docs/research/three-r170-texture-loading-color-space.md` 的结论挂载**：`import` 拿 URL → 共享 `TextureLoader` → `colorSpace = THREE.SRGBColorSpace` → `wrapS/wrapT = RepeatWrapping` → `repeat` 按「平面米数 / 单张覆盖米数」算。
- [ ] **在 `.gitattributes` 补一条**：现在只有 `* text=auto`，图片会被当文本处理。加 `*.jpg binary` / `*.png binary`，避免行尾转换损坏二进制。
- [ ] **提交前量体积**：两张合计应 < 5 MB。若单张 > 10 MB，说明下错分辨率了。

### 7.2 备选（若上面两张质感不满意）

- [ ] 地面换 `brick_pavement_02`（Poly Haven，更旧更粗，B−R = −14 略暖）。
- [ ] 墙面换 `stone_wall_05`（Poly Haven，更暗，适合墙的暗部）。
- [ ] **不要**用 `medieval_blocks_*` / `Bricks*` / `Tiles143` —— 实测 B−R 在 −50 到 −75，是米黄/红砖色，乘上 `PALETTE` 的冷青会脏。

### 7.3 明确排除

- [ ] **Kenney**：条款最干净之一，但 Textures 分类只有复古卡通（实测整包 103 张 PNG 全是 `carpet_*` / `ceiling_*`），**没有石砖地面与青石墙面**。将来做 UI/图标可以回头找它。
- [ ] **OpenGameArt**：CC0 是真的，但候选是工具生成/手绘复古，且 robots.txt 对 AI 爬虫全站 Disallow，**不要写脚本批量抓**。要用就手工挑单件、逐件核对提交者与许可证。
- [ ] **Wikimedia Commons**：本次环境无法直连（TLS 超时，TCP 却通），且 Commons 的图以照片为主、需自行裁切接缝，**不适合做可平铺贴图**。若日后要用，必须在可达环境下逐件核对 `source` 字段。
- [ ] **CC0 Textures**：站点已 301 到 ambientCG，直接查 ambientCG 条款。

### 7.4 以后若要扩大素材量

- [ ] **Poly Haven 走 API 不爬站**（ToS 3.2 禁止 scraping）：`/assets?t=textures` 一次拿全量元数据，`/files/{id}` 拿直链，带能识别应用的 User-Agent；`/v2/search` 限速 150 次/分钟，其余端点未见限速。
- [ ] **ambientCG 走 v3 API**：`/api/v3/assets?type=material&q=…&include=downloads`，`limit` 上限 500；**文档无速率数字但站点是单人维护**，按礼貌速率抓并缓存。
- [ ] **排除 Vaults 内容**：Poly Haven 的 Vaults 是付费墙内容（<https://polyhaven.com/vaults>），不在免费 CC0 范围内，用 API 时按 `vault` 字段过滤。
- [ ] **只用素材文件本身**：Poly Haven ToS 4.1 明确「excluding the CC0 assets themselves」—— logo、示例渲染图、文案都不是 CC0，**不要顺手提交资产页的预览图**。

---

## 附：本文所有一手来源

**许可证法条**

- <https://creativecommons.org/publicdomain/zero/1.0/legalcode.en> —— CC0 1.0 法律文本；Section 2 Waiver、Section 3 Public License Fallback、Section 4 Limitations（商标/专利不放弃、无担保）
- <https://creativecommons.org/publicdomain/zero/1.0/> —— CC0 1.0 Deed（人类可读摘要）

**Poly Haven**

- <https://polyhaven.com/license> —— 资产 CC0 声明、「You can redistribute them … or even in a product you sell」、ToS 3.2 禁抓站、4.1 站点内容不属 CC0
- <https://docs.polyhaven.com/en/faq> —— 商用、可入产品、**可训练 AI**、不可声称原作者或再许可
- <https://polyhaven.com/llms.txt> —— 官方给 AI/自动化的指引：用 API、别抓站、API 需带 UA/Referer
- <https://polyhaven.com/our-api> —— API 端点清单与示例
- <https://api.polyhaven.com/api-docs/swagger.json> —— OpenAPI 规范；`/v2/search` 限速 150 次/分，429 + Retry-After
- <https://github.com/Poly-Haven/Public-API/blob/master/ToS.md> —— API 条款；2.4 要求 UA/Referer；2.5「CC0 assets carry no attribution requirement whatsoever, now or ever」
- <https://polyhaven.com/vaults> —— Vaults 为付费墙内容
- <https://polyhaven.com/robots.txt> —— 仅挡 `/_next/data/` 与 `/*?s=`，其余全放行

**ambientCG**

- <https://docs.ambientcg.com/license/>（<https://ambientcg.com/license> 302 至此）—— CC0 声明、「You can include the raw files in your project, for example a video game」
- <https://ambientcg.com> —— 首页 FAQ，说明建站动机就是不满其它平台的再分发限制
- <https://docs.ambientcg.com/api/v3/> 与 <https://docs.ambientcg.com/api/v3/assets/> —— 只有 GET、参数表、`limit` 1–500
- <https://docs.ambientcg.com/api/> —— 单人维护、无企业级可用性承诺
- <https://docs.ambientcg.com/patreon-rewards/nextcloud/> —— 批量下载走付费 Nextcloud，且不建议用浏览器批量
- <https://ambientcg.com/robots.txt> —— 全放行（仅挡 `/hx/`）

**Kenney**

- <https://kenney.nl/support> —— 「public domain licensed (CC0)」「Attribution is not required」
- <https://kenney.nl/terms-of-service> —— 站点 ToS；「protected by … copyright and trademark law unless marked otherwise」
- <https://kenney.nl/robots.txt> —— GPTBot/ClaudeBot/CCBot 等 `Disallow: /`；`*` 挡 `/assets/ /downloads/ /files/`
- 资产页 head 的 `<meta name="tdm-reservation" content="1">` 与 `<meta name="robots" content="noai, noimageai">`（实测抓取 <https://kenney.nl/assets/retro-textures-liminal> 原始 HTML）
- 包内 `License.txt`（实测下载 `kenney_retro-textures-liminal_1.0.zip`，987,629 B、108 条目后读取）

**OpenGameArt**

- <https://opengameart.org/content/faq> —— CC0 释义、商用、投稿规则、下架政策
- <https://opengameart.org/robots.txt> —— 202 个 AI/爬虫 UA 同组 `Disallow: /`；`User-agent: *` 受 `Crawl-delay: 10`
- <https://opengameart.org/art-search-advanced?keys=cobblestone&field_art_type_tid%5B%5D=14&field_art_licenses_tid%5B%5D=4> —— CC0 + Texture 过滤搜索
- <https://opengameart.org/content/seamless-cobblestone-texture>、<https://opengameart.org/content/cobblestone-wall-texture> —— 两条具体 CC0 候选

**Wikimedia Commons**

- <https://commons.wikimedia.org/wiki/Commons:Licensing>（经镜像 <https://commons.wikimedia.beta.wmcloud.org/wiki/Commons:Licensing> 读取）—— 只接受自由内容、四条必备条件
- <https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia>（经同一镜像读取）—— 复用指引、不做版权担保、moral rights 提醒

**GitHub**

- <https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github> —— 大文件限制
- <https://github.com/github/docs/blob/main/data/variables/large_files.yml> —— 具体数值：warning 50 MiB / max 100 MiB / browser 25 MiB

**本仓库**

- `src/render/scene.ts:5-13` —— 渲染层不得泄漏模型名/贴图名的硬约束
- `src/render/scene.ts:12-13,41-43,58` —— 性能红线、InstancedMesh、`shadowMap.enabled = false`
- `src/render/scene.ts:16-32` —— `PALETTE` 色板（`floor: 0x2b3138`、`wall: 0x1f242a`），本文选色的锚点
- `.gitattributes:1-2` —— 当前只有 `* text=auto`
- `docs/research/three-r170-texture-loading-color-space.md` —— 贴图加载/色彩空间/平铺的既有结论，本文 §7.1 直接引用
