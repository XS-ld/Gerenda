# 个人档案 · GitHub Pages 静态版

一个部署在 GitHub Pages 上的个人简历 / 档案页，配一个纯浏览器的内容编辑器，不需要服务器，也不需要数据库。

- 首页 `index.html` —— 简历展示
- 编辑页 `edit.html` —— 增删改内容，导出 `data.json`
- 数据 `data.json` —— 所有文字内容都在这里，改它就是改网站

---

## 一、为什么是这样

GitHub Pages 只托管静态文件，不运行 Node 进程，所以没有「登录后台」这种东西可做。替代方案是把 GitHub 仓库本身当作后台：改内容 → 提交 → 网站更新。

为了让你不用直接跟 JSON 搏斗，我做了一个浏览器端的编辑页。改动自动存在本机草稿里，改完导出 `data.json` 覆盖仓库里的同名文件即可。

## 二、部署（修掉现在的 404）

你现在访问 `guanggaohb.asia` 看到的是 GitHub Pages 的 404，说明域名指对了，但仓库里没有可发布的 `index.html`，或者发布源选错了目录。

### 第 1 步：上传文件

把本目录下**所有文件**传到仓库根目录（不要套一层文件夹）：

```
index.html
edit.html
data.json
app.js
editor.js
style.css
editor.css
favicon.svg
404.html
CNAME
.nojekyll
```

`.nojekyll` 是空文件，必须传，否则文件名以下划线开头的资源会被 Jekyll 吞掉。

如果更习惯用 `docs/` 目录，也可以全部放进 `docs/`，后面发布源选 `/docs` 即可。

### 第 2 步：设置发布源

仓库 → Settings → Pages：

- **Source**：选 `Deploy from a branch`
- **Branch**：`main`，目录选 `/ (root)` 或 `/docs`
- 保存，等 1\~2 分钟

页面顶部出现 `Your site is live at ...` 就成功了。

### 第 3 步：确认访问路径

两种情形，别搞混：

| 情形 | 地址 |
|---|---|
| 没绑自定义域名 | `https://用户名.github.io/仓库名/` |
| 绑了 `guanggaohb.asia` | `https://guanggaohb.asia/` |

**不要**访问 `https://guanggaohb.asia/仓库名/` —— 绑了自定义域名后，站点挂在域名根路径，`/Gerenda` 这种子路径不存在，这正是你之前看到 404 的直接原因。

### 第 4 步：自定义域名与 DNS

`CNAME` 文件里已经写了 `guanggaohb.asia`。如果这不是你的域名，改成你自己的；不打算用自定义域名就直接删掉这个文件。

DNS 要在域名服务商处配置（以根域名 `guanggaohb.asia` 为例）：

| 类型 | 主机记录 | 记录值 |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `用户名.github.io` |

四条 A 记录是 GitHub Pages 的官方地址，必须**全部**添加。如果之前只配了一两条，或者还残留别的 A 记录，就会解析到别处去。

配好后回到 Settings → Pages，填 Custom domain 并勾选 **Enforce HTTPS**。证书签发通常要等几分钟到半小时。

> 如果域名之前绑定过别的服务，先在 DNS 里把旧记录清干净，再按上表重建。残留记录是「域名指向错误站点」的最常见原因。

## 三、日常怎么改内容

### 方式 A：用编辑页（推荐）

1. 打开 `你的站点/edit.html`
2. 改文字、点「+ 添加」加条目、点「删除」移除、用 ↑ ↓ 排序
3. 改动会自动存进浏览器草稿，左侧底部会显示「草稿已保存在本机」
4. 点右上角 **导出 data.json**，浏览器会下载一个 `data.json`
5. 到仓库里用这个文件覆盖旧的 `data.json`，提交

约一分钟站点就会更新。

注意几点：

- 编辑页是公开的，但它**改不了线上内容**，只影响你自己的浏览器。真正的写入动作是你在 GitHub 上的那次提交，所以不存在别人乱改的风险。
- 草稿存在 `localStorage`，换浏览器、换手机、清缓存都会丢。改完记得导出。
- 想从线上当前内容重新开始，点「放弃改动」。
- 想粘贴别人给的 JSON，点「导入 JSON」。

### 方式 B：直接改 data.json

文件结构很直白：

```json
{
  "basic": {
    "name": "张明",
    "title": "前端工程师 · 5 年经验",
    "summary": "空行分段",
    "email": "", "phone": "", "city": "",
    "website": "", "github": "", "avatar": ""
  },
  "education": [
    { "id": "edu_1", "school": "", "degree": "", "major": "", "start": "", "end": "", "note": "" }
  ],
  "experience": [
    { "id": "exp_1", "company": "", "role": "", "start": "", "end": "", "note": "每行一条" }
  ],
  "awards": [
    { "id": "award_1", "title": "", "org": "", "date": "", "note": "" }
  ],
  "skills": [
    { "id": "skill_1", "group": "语言", "items": "用顿号分隔" }
  ],
  "updatedAt": "2026-11-17T00:00:00.000Z"
}
```

改的时候注意：

- 每个条目的 `id` 必须唯一，随便起一个就行，比如 `award_4`
- 字符串里的换行要写成 `\n`
- JSON 最后一项后面不能有逗号
- 改完可以用编辑页的「导入 JSON」先验证一下格式，能导入就说明合法

## 四、本地预览

`data.json` 是通过 `fetch` 读取的，直接双击 `index.html` 用 `file://` 打开会被浏览器拦截。起一个本地服务：

```bash
# 在项目目录下
python3 -m http.server 8080
```

然后访问 http://127.0.0.1:8080/

或者用 VS Code 的 Live Server 插件，效果一样。

## 五、打印 / 导出 PDF

首页右下角「打印 / 存为 PDF」，已内置 A4 打印样式：去掉交互元素、避免条目跨页断裂。用来投简历可以直接打印。

## 六、文件说明

```
index.html      首页结构
app.js          读取 data.json 并渲染
style.css       首页样式（含移动端与打印样式）
edit.html       编辑页结构
editor.js       编辑、草稿、导入导出逻辑
editor.css      编辑页样式
data.json       全部内容
favicon.svg     站点图标
404.html        自定义 404 页
CNAME           自定义域名
.nojekyll       关闭 Jekyll 处理
```

## 七、设计说明

排版按纸面阅读来做：米白底、墨黑字、宋体姓名、单点砖红色强调，靠留白和细分隔线组织层级，不用渐变、卡片阴影和图标堆砌。

想微调配色，改 `style.css` 顶部 `:root` 里的变量：

```css
--ink: #1b1c1e;      /* 主文字 */
--muted: #8a857c;    /* 次要文字 */
--line: #e0dcd2;     /* 分隔线 */
--paper: #fbfaf8;    /* 背景 */
--accent: #7c3b2c;   /* 强调色 */
```

字体也可以换，`--font-serif` 控制姓名那行，`--font-sans` 控制正文。
