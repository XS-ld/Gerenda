# 个人档案 · 简历站点

一个可以直接部署的个人简历 / 档案网站：前台是干净的简历页面，后台登录后可以增删改全部内容。

- 前台：`/`
- 后台：`/admin`（登录后可编辑）
- 技术栈：Node.js 原生 HTTP 服务 + 静态前端，**零第三方依赖**，不需要 `npm install`
- 数据存储：本地 JSON 文件 `data/profile.json`，方便备份和迁移

---

## 一、本地运行

```bash
node server.js
```

打开 http://localhost:3000

首次启动会自动生成：

- `data/auth.json` —— 管理员账号（密码 scrypt 加盐哈希存储）
- `data/profile.json` —— 简历内容（带一份示例数据，直接改就行）

默认账号：

```
用户名：admin
密码：  admin888
```

> 登录后请立刻点右上角「修改密码」改掉默认密码。修改成功后所有会话失效，需要重新登录。

## 二、环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `ADMIN_USER` | `admin` | 首次生成账号时的用户名 |
| `ADMIN_PASSWORD` | `admin888` | 首次生成账号时的密码 |
| `DATA_DIR` | `./data` | 数据文件目录，部署到容器时建议挂载 |
| `COOKIE_SECURE` | 未设置 | 设为 `1` 时 Cookie 带 `Secure`（**全站 HTTPS 时必须开启**） |

首次启动前设置，即可用自定义密码初始化：

```bash
ADMIN_USER=me ADMIN_PASSWORD='换成你的密码' node server.js
```

注意：`ADMIN_USER` / `ADMIN_PASSWORD` 只在**第一次**生成 `data/auth.json` 时生效；文件已存在时改环境变量不会改密码，请用后台的「修改密码」。

## 三、部署

### 方式 1：任意 Node 主机 + systemd

```bash
# 上传项目到服务器，例如 /var/www/resume
cd /var/www/resume
sudo mkdir -p /var/lib/resume
sudo chown -R $USER /var/lib/resume
```

`/etc/systemd/system/resume.service`：

```ini
[Unit]
Description=Personal Profile Site
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/resume
ExecStart=/usr/bin/node /var/www/resume/server.js
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATA_DIR=/var/lib/resume
Environment=COOKIE_SECURE=1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now resume
sudo systemctl status resume
```

### 方式 2：Docker

```bash
docker build -t resume-site .
docker run -d --name resume -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e ADMIN_PASSWORD='换成你的密码' \
  -e COOKIE_SECURE=1 \
  resume-site
```

`-v` 必须挂载，否则容器重建会丢数据。

### 方式 3：云平台（Railway / Render / Fly.io / 宝塔等）

- 启动命令：`node server.js`
- 端口：读取平台注入的 `PORT`
- **注意磁盘持久化**：这类平台默认文件系统是临时的，必须挂载持久卷并把 `DATA_DIR` 指向挂载路径，否则重启后内容会回到初始状态。

## 四、反向代理（Nginx）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 强制 HTTPS（配好证书后去掉这段）
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

走 HTTPS 时记得给服务加 `COOKIE_SECURE=1`。

## 五、怎么改内容

登录 `/admin`，左侧切换分区：

| 分区 | 内容 |
| --- | --- |
| 基本信息 | 姓名、职位、简介、邮箱、电话、城市、网站、GitHub、照片 |
| 教育经历 | 学校、学历、专业、起止时间、说明 |
| 工作经历 | 公司、职位、起止时间、工作内容（每行一条 → 前台显示成列表） |
| 奖项与荣誉 | 奖项名称、颁发单位、时间、说明 |
| 专业技能 | 分组名 + 条目 |

- 工作经历 / 奖项 支持 ↑ ↓ 调整顺序
- 删除会二次确认，不可撤销
- 个人简介用**空行分段**，前台按段落显示

## 六、备份与迁移

内容全部在 `data/` 目录：

```bash
tar czf resume-backup-$(date +%F).tar.gz data/
```

恢复：把 `data/` 放回项目根目录（或 `DATA_DIR` 指向的目录）再重启。

也可以直接编辑 `data/profile.json`，格式很直白；改完重启服务生效。

## 七、接口一览

公开：

- `GET /api/profile` —— 全部简历数据
- `GET /api/session` —— 当前登录状态

需要登录（Cookie 会话）：

- `POST /api/login` `{username, password}`
- `POST /api/logout`
- `POST /api/password` `{current, next}`
- `PUT  /api/profile` `{basic: {...}}` —— 保存基本信息
- `POST /api/{section}` —— 新增记录，`section` ∈ `education|experience|awards|skills`
- `PUT  /api/{section}/{id}` —— 修改记录
- `DELETE /api/{section}/{id}` —— 删除记录
- `POST /api/{section}/{id}/move` `{direction: "up"|"down"}` —— 排序

## 八、安全设计

- 密码用 `scrypt` 加盐哈希存储，不落明文
- 会话为随机 token + HttpOnly Cookie，12 小时滑动过期，服务重启后失效
- 登录失败同一 IP 10 分钟内超过 10 次会被限流
- 所有写接口都要登录；前端渲染统一做 HTML 转义，防止内容里插入脚本
- 上传长度限制 256KB，字段长度在服务端二次校验

单人维护的站点，这套强度足够。若要多人协作或对外提供注册，需另加用户体系。

## 九、目录结构

```
.
├── server.js            # 后端：路由、鉴权、数据读写
├── package.json
├── Dockerfile
├── public/
│   ├── index.html       # 前台
│   ├── style.css
│   ├── app.js
│   ├── admin.html       # 后台
│   ├── admin.css
│   ├── admin.js
│   └── favicon.svg
└── data/                # 运行时生成，注意备份
    ├── profile.json
    └── auth.json
```

## 十、打印 / 导出 PDF

前台右下角「打印 / 存为 PDF」，已内置 A4 打印样式：去掉交互元素、控制分页，直接打印或存 PDF 就是一份排版规整的简历。
