# 标签真相局 LabelLens

“食品货架对比器”的本地全栈原型。用户可以录入 2—4 款包装食品，先完成可解释的确定性比较，再按需调用 InfiniSynapse 生成综合选购建议。

## 本地运行

环境建议：Node.js 20 或更高版本。

1. 安装依赖：

```bash
npm install
```

2. 在项目根目录创建 `.env.local`（不要提交）：

```dotenv
INFINISYNAPSE_API_KEY=your_real_server_side_key
```

包装标签图片识别在正式版本中始终启用。真实密钥需手动写入 `.env.local`。
包装标签识别与最终 AI 选购报告均由本项目 Node 服务端调用 InfiniSynapse，但会创建两个
彼此独立的任务。API Key 只由服务端读取，不要使用 `VITE_` 前缀保存密钥，也不要把密钥
放入 React、浏览器存储或聊天内容。

3. 同时启动前端和后端：

```bash
npm run dev
```

- 前端：http://127.0.0.1:5173
- 后端：http://127.0.0.1:8787
- 浏览器只请求本项目的 `/api/analyze` 和 `/api/ocr/label`；Vite 在开发环境转发到本地后端。

也可以分别运行：

```bash
npm run dev:web
npm run dev:server
```

测试与生产构建：

```bash
npm test
npm run build
```

构建后使用以下命令启动单端口生产服务：

```bash
npm run start
```

本地生产地址为 http://127.0.0.1:3000。该 Node 服务同时提供：

- `/api/*` 后端接口
- `dist/` 前端静态文件
- 非 `/api` 路径的 `dist/index.html` 回退，刷新页面不会出现 404

平台传入 `PORT` 时会优先使用该端口；服务监听 `0.0.0.0`。前端静态文件输出到
`dist/`，服务端输出到 `dist-server/`。

## 技术与接入边界

- React + Vite + TypeScript
- Tailwind CSS
- lucide-react
- Node.js 原生 HTTP 服务和原生 `fetch`
- Vitest
- InfiniSynapse Server API（服务端 Bearer 鉴权、SSE 长任务）

## 主要目录

```text
src/
├─ components/        通用界面组件、AI 报告展示、照片识别与人工确认
├─ data/              虚构演示商品
├─ features/          四步主流程页面
├─ lib/               计算、排名、宣传核对、图片压缩、识别请求与校验
├─ types/             共享 TypeScript 类型
├─ App.tsx            流程状态与模块组合
└─ main.tsx           应用入口

server/
├─ index.ts                         开发与生产 Node 服务入口
├─ app.ts                           健康检查、API 和前端静态路由
├─ staticFiles.ts                   静态文件与 SPA 回退
├─ routes/analyze.ts                创建、查询和主动取消任务的接口
├─ routes/recognize.ts              标签图片识别任务创建与状态查询
├─ services/
│  ├─ analysisTasks.ts              内存任务状态、恢复查询与输入摘要
│  ├─ recognitionTasks.ts           单商品识别任务状态与只读恢复
│  ├─ infinisynapse.ts              InfiniSynapse Server API / SSE 适配层
│  └─ reportExtraction.ts           最终 Markdown 提取、净化与格式校验
├─ multipart.ts                     图片上传解析、类型签名与大小限制
├─ recognitionSchema.ts             识别 JSON 的严格结构校验
├─ compactPayload.ts                发给 InfiniSynapse 的精简数据
├─ prompts/labelRecognition.ts      标签识别任务提示词与 JSON 契约
├─ prompts/productComparison.ts     稳定的食品比较任务提示词
├─ validation.ts                    服务端输入校验
├─ rateLimit.ts                     浏览器级短时限流
└─ types.ts                         服务端输入、精简载荷与任务类型

vendor/InfinisynapseAssistant/      官方开发规则与 Server API 参考资料
Dockerfile                          CloudBase Run 多阶段容器构建
.dockerignore                       容器构建排除规则
```

## 当前边界

- 所有数值计算、排名和宣传语核对仍在浏览器本地确定性完成；标签图片识别只生成待人工确认的录入草稿。
- “自定义购买要求”先由透明本地规则提取价格、热量、蛋白质、钠和配料等约束；
  无法识别的自然语言保留为偏好，不会被伪造成确定性指标。
- 未配置 API Key 时，后端返回清晰的 503 错误，不会用模拟报告冒充真实结果。
- 每次最多提交 4 款商品；本地图片字段会在前端剔除，并由服务端再次拒绝。
- 同一浏览器同一时间只能运行一个任务，60 秒内最多启动两次。
- 提交成功后会立即返回真实 `taskId`；前端约每 9 秒查询状态，并在当前会话刷新后继续恢复。
- `GET /api/analyze/status/:taskId` 可在没有当前进程内存记录时直接从 InfiniSynapse
  只读恢复；容器重启或缩容不会把 Node 内存作为恢复前提。
- 比较数据、taskId 和已完成报告继续保存在用户浏览器的 `sessionStorage`，不写入服务端数据库。
- 本地 SSE 等待与上游任务状态分离：本地最长等待 12 分钟，停止等待不会取消或重建上游任务。
- 上游载荷会移除公式、UUID、图片、空字段和重复对象，并记录字符数、估算 token 数及压缩比例；不会记录完整内容。
- 图片识别 Beta 通过 InfiniSynapse 的官方主动附件链路异步处理，每次只处理一款商品、
  最多两张标签图片，也不识别价格；只有用户点击
  “确认并填入商品”后才写入现有表单。
- 图片在浏览器端压缩后经自有后端上传，不进入比较 payload，也不会写入
  `sessionStorage`；排队期间仅将图片 Blob 暂存在浏览器 IndexedDB，识别队列、`taskId`、
  `connId`、状态和通过严格 schema 的结构化文字结果可刷新恢复。
- 快速比较的多商品识别按 A→B→C→D 全局串行执行；429 只恢复当前任务，遵循
  `Retry-After` 或 5/10/20 秒有限退避，不会并发或盲目重复创建 `newTask`。
- 包装标签图片识别在正式版本中始终显示，不依赖 Docker 构建参数；识别结果仍需人工确认。
- 没有数据库、登录、Partner SSO、付费、条形码或商品数据库。
- 包装宣传核对是透明的本地启发式规则，不构成法律或医疗判断。

## 生产健康检查

```text
GET /api/health
```

示例：

```json
{
  "status": "ok",
  "service": "label-lens",
  "apiKeyConfigured": true
}
```

`apiKeyConfigured` 只表示服务端环境变量是否存在，不返回密钥内容。容器运行时仅从
`INFINISYNAPSE_API_KEY` 环境变量读取密钥；不要把 `.env.local` 上传或复制进镜像。

## Docker 本地构建

```bash
docker build -t label-lens .
docker run --rm -p 3000:3000 \
  -e INFINISYNAPSE_API_KEY=your_server_side_key \
  label-lens
```

不要把真实密钥写进 Dockerfile、镜像、README 或构建参数。生产容器默认使用端口
3000，并尊重平台传入的 `PORT`。包装标签图片识别不依赖构建参数；服务端只在运行时读取
`INFINISYNAPSE_API_KEY`。

## 腾讯云 CloudBase Run 部署

本项目只完成部署适配，不会自动登录腾讯云、创建服务或产生付费资源。控制台部署步骤：

1. 登录腾讯云控制台并进入 CloudBase。
2. 创建或选择一个云开发环境。
3. 进入“云托管”，新建服务。
4. 部署方式选择“本地代码”或“上传项目文件夹”。
5. 上传项目根目录；确认根目录中包含 `Dockerfile`，不要上传 `.env.local`。
6. 服务端口填写 `3000`。
7. 访问类型选择 `WEB` / 公网访问。
8. 在服务端运行时环境变量中添加 `INFINISYNAPSE_API_KEY`。
9. 最小实例数先设置为 `0`；其余 CPU、内存和最大实例数按试运行流量选择。
10. 发起部署并等待镜像构建、实例启动和公网域名生成。
11. 部署后访问 `https://你的域名/api/health`，确认 `status` 为 `ok` 且
    `apiKeyConfigured` 为 `true`。
12. 再访问公网首页，确认前端与 `/api` 使用同一域名；刷新页面应继续返回前端。

CloudBase 需要填写的核心值：

| 配置项 | 值 |
| --- | --- |
| 构建方式 | 根目录 `Dockerfile` |
| 服务端口 | `3000` |
| 访问类型 | `WEB` / 公网访问 |
| 最小实例数 | `0` |
| 环境变量名 | `INFINISYNAPSE_API_KEY` |
| 健康检查路径 | `/api/health` |

包装标签图片识别在正式版本中始终启用，CloudBase 无需配置前端构建开关。只需把
`INFINISYNAPSE_API_KEY` 配置为服务端运行时环境变量。

## 验证一次真实任务

1. 只在根目录 `.env.local` 设置有效的 `INFINISYNAPSE_API_KEY`。
2. 重启 `npm run dev`。
3. 打开前端，加载酸奶示例并走到结果页。
4. 点击“生成AI综合选购建议”。
5. 成功后页面会显示 Markdown 报告和真实 `taskId`。如果上游失败，只显示真实错误，
   现有确定性比较仍保留。

任务较慢时无需重新生成。页面会继续轮询，也可点击“检查结果”。只要有真实 `taskId`，
就可在浏览器访问以下本地接口恢复状态：

```text
GET http://127.0.0.1:8787/api/analyze/status/<taskId>
```

只有用户点击“取消任务”时，服务端才会向 InfiniSynapse 发送 `cancelTask`。

## 图片识别 Beta

```text
POST /api/ocr/label
GET  /api/recognize/status/:taskId
```

前端只向本项目后端发送压缩后的 JPEG、PNG 或 WebP。后端预生成 `taskId`，按图片顺序调用
官方 `POST /api/tools/taskUpload/:taskId?subdir=label_inputs&naming=original`，再建立 SSE，
把上传响应中的 `name`、`size`、`logicalPath`、`assetId` 映射进 `newTask.files[]`。
该链路不等待 `upload_file_to_sandbox`，也不发送 `askResponse`。最终优先读取
`final/label-extraction.json`，没有工作区结果时才接受通过严格 schema 的最终可见 JSON。
状态查询只做官方 GET 恢复，不发送 `newTask`。

识别任务只提取字段，不生成报告、购买建议或商品比较；最终选购建议必须由用户在比较结果页
另行创建独立任务。单图和双图都支持，看不清的字段必须为 `null` 或 `unknown`。

## 后续接入位置

- 图片识别规则：前端入口在 `src/components/LabelRecognitionPanel.tsx`，服务端提示词在
  `server/prompts/labelRecognition.ts`，结果 schema 在 `server/recognitionSchema.ts`。
  `src/lib/aiAnalysis.ts` 仍明确不会把图片发送到购买建议任务。
- InfiniSynapse 接口变更：集中修改 `server/services/infinisynapse.ts`；提示词修改集中在
  `server/prompts/productComparison.ts`；不要把 SDK 或密钥移入前端。
- 确定性计算：继续复用 `src/lib/calculations.ts`，不要把可解释计算迁移到模型输出。
- 宣传核对：可在 `src/lib/claimChecks.ts` 中扩充规则，并保留“相对观察、非法律结论”的表达。
