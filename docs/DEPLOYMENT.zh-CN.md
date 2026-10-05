# Night of Ninja Online 部署与交接

更新日期：2026-10-05

## 结论与当前状态

- 历史部署平台确认是 **Render**。依据是 Git 历史中的三次 Render 修复提交，以及仓库根目录的 `render.yaml`。
- 历史配置的服务名是 `night-of-ninja-online`。
- 实际在线的 Render 服务地址是 `https://nightofninjaonline.onrender.com`（`render.yaml` 中的服务名与它不同；`night-of-ninja-online.onrender.com` 返回 404）。
- 截至 2026-10-05，该服务运行的是旧提交 `e2b312a`（没有 `/healthz`）。新版部署并验收后，以 README 中写明的网址为准。

## 在 Render 里到哪里看

1. 打开 [Render Dashboard](https://dashboard.render.com/) 并登录原来部署项目所用的账户。
2. 在当前 Workspace 的 **Services** 列表中，查找名称包含 `night-of-ninja` 的 Web Service。
3. 如果名称变过，逐个打开服务，在 Settings 或服务概览里核对关联仓库是否为 `hsuBnOediH/NightOfNinjaOnline`。
4. 打开正确服务后：
   - 页面顶部的 `*.onrender.com` 链接是实际游戏网址；
   - 在 **Deploys / Events** 中查看最上方成功部署的 Git commit；
   - 只有该 commit 与 GitHub `main` 的最新 commit 一致，线上才是最新版。
5. 若找不到关联服务，或旧服务已 Suspended/Deleted，就按下文重新部署，不要继续使用旧网址。

## 代码和配置分别在哪里

| 内容 | 位置 | 用途 |
|---|---|---|
| GitHub 仓库 | `https://github.com/hsuBnOediH/NightOfNinjaOnline` | Render 或其他服务器拉取代码的远端仓库 |
| Git 分支 | `main` | 生产部署分支 |
| Render Blueprint | `render.yaml` | 构建命令、启动命令、健康检查和环境变量定义 |
| Web 入口 | `app.py` | Flask / Socket.IO 应用及 `/healthz` 健康检查 |
| 游戏规则引擎 | `game/engine.py`、`game/models.py` | 服务端权威游戏状态与规则 |
| 浏览器界面 | `templates/`、`static/` | 页面、样式和前端交互 |
| Python 依赖 | `requirements.txt` | 部署时安装的固定版本依赖 |
| 自动化测试 | `tests/` | 部署前规则和实时通信回归测试 |
| 测试手册 | `docs/TESTING.md` | 四浏览器和跨机器验收步骤 |

不要把 SSH 私钥、托管平台登录信息或 `SECRET_KEY` 提交到 Git。部署这个公开项目不需要任何额外凭据。

## 运行参数在哪里

`render.yaml` 已定义：

- Python：`3.11.0`
- 构建：`python -m pip install --disable-pip-version-check -r requirements.txt`
- 启动：`python -m gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT app:app`
- 健康检查：`/healthz`
- `SECRET_KEY`：由 Render 为服务单独生成
- `PORT`：由托管平台注入，不要写死
- `GUNICORN_CMD_ARGS`：设为 `--access-logfile -`。Render 的默认值带 `--preload`，会让 Flask 在 eventlet 打补丁之前加载，启动时打印一串 `monkey_patching` 报错。不要启用 `--preload`。
- `gunicorn.conf.py`：gunicorn 会自动读取。收到停止信号（每次部署）后先停止监听，再主动关闭所有玩家连接，让 worker 在 1–2 秒内干净退出，浏览器自动重连到新实例；不这样做的话，有玩家在线时 worker 会卡到超时被 SIGKILL，日志里出现 `socket shutdown error` 或 `greenlet is being finalized`。

可选环境变量：

- `ALLOWED_ORIGINS`：逗号分隔的允许来源。网站与 Socket.IO 同域部署时通常不需要设置；若前后端分域，应填完整的 HTTPS 来源。
- `FLASK_DEBUG`：只供本机开发，生产环境不要启用。

当前房间状态保存在单个进程的内存中，没有数据库或 Redis。因此：

- 必须保持 **1 个实例、1 个 Gunicorn worker**；
- 服务重启、重新部署或休眠会清空所有房间；
- 不能用负载均衡把玩家随机分到多个应用实例；
- 若以后要水平扩容，先把房间状态、会话映射和 Socket.IO 消息队列迁移到共享存储。

## 重新部署到 Render

### 部署前必须先做

确认要部署的改动已经审查、测试，并提交推送到 `origin/main`。未经确认不要丢弃工作区中其他人的改动，也不要把密钥加入提交。

验证命令：

```bash
python3.11 -m unittest discover -v
git status
git log -1 --oneline
```

不要用 Python 3.13 运行本项目；固定版本的 `eventlet==0.35.1` 与 Python 3.13 不兼容。Render 已通过 `render.yaml` 固定为 Python 3.11.0。

### 新建服务

1. 登录 [Render Dashboard](https://dashboard.render.com/)。
2. 选择 **New → Blueprint**（如果界面名称改变，选择能从仓库读取 `render.yaml` 的入口）。
3. 连接 GitHub 仓库 `hsuBnOediH/NightOfNinjaOnline`，分支选择 `main`。
4. Render 读取根目录的 `render.yaml` 后，创建 Web Service。
5. 等待部署成功，记录页面顶部的公开 HTTPS 地址。
6. 打开 `<公开地址>/healthz`，应返回 `status: ok`。
7. 打开游戏首页，再按 `docs/TESTING.md` 至少完成一次四浏览器建房、加入、开始、轮抽和夜晚出牌测试。
8. 在 README 或 GitHub 仓库 Homepage 中写回已验证的正式网址，避免以后再次丢失。

如果已有正确的 Render 服务，可以不新建：在该服务的 Settings 中确认仓库和 `main` 分支，然后在 Deploys 中从最新 commit 重新部署。

## 部署到其他 Linux 平台

平台需要支持 Python 3.11、持久在线进程、HTTPS 和 WebSocket。通用设置为：

```text
Build command: python -m pip install --disable-pip-version-check -r requirements.txt
Start command: python -m gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT app:app
Health check: /healthz
Required secret: SECRET_KEY=<每个环境独立生成的长随机值>
```

从 GitHub 部署前必须先确认远端 `main` 已包含本地最新版。自行管理的 Linux 服务器还需要让反向代理正确转发 WebSocket，并用服务管理器保证进程异常退出后自动重启。

## 可直接交给别人或另一个 Agent 的部署 Prompt

复制下面整段，并把尖括号中的目标平台替换掉：

```text
请把 Night of Ninja Online 部署到 <Render / 某台 Linux 服务器 / 其他平台>，并完成上线验收。

源代码与版本要求：
1. 公共仓库是 https://github.com/hsuBnOediH/NightOfNinjaOnline，生产分支是 main。
2. 如果本地工作副本有未提交改动：先运行测试并展示 git status、当前 commit 和改动摘要；没有得到明确授权前，不要丢弃改动、不要强推、不要上传任何密钥。只有确认最新版已提交并推送后，才能从 GitHub 部署。

部署配置：
- Python 3.11
- 构建命令：python -m pip install --disable-pip-version-check -r requirements.txt
- 启动命令：python -m gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT app:app
- 健康检查：/healthz
- 设置稳定且随机的 SECRET_KEY；PORT 由平台注入；生产环境不要启用 FLASK_DEBUG。
- 该应用当前使用内存保存房间，必须只有 1 个实例和 1 个 worker，不能水平扩容。
- 必须支持 HTTPS 与 WebSocket。

验收要求：
1. 使用 Python 3.11 运行 `python3.11 -m unittest discover -v`，全部通过后再部署；不要用 Python 3.13。
2. 部署后验证首页和 /healthz。
3. 至少用 4 个独立浏览器会话完成：建房、加入、开始、两轮轮抽、夜晚秘密锁定与统一揭牌、断线重连。
4. 最终只报告：平台/服务名、公开网址、部署 commit SHA、健康检查结果、测试结果、环境变量名称（不要输出值）、已知限制和回滚办法。
5. 把最终网址写回 README 的“在线部署”部分和 GitHub 仓库 Homepage；不要声称未验证的地址可用。
```

## 回滚

- Render：在服务的 Deploys 页面选择上一个已知正常的成功部署重新部署。
- 其他平台：切回上一个已验证的 Git commit 并重新构建。
- 回滚会重启进程并清空所有进行中的房间；执行前先通知正在游戏的玩家。
