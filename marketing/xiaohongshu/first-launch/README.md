# LabelLens 小红书首发内容包

这套内容按“小红书个人开发学习记录”的语气制作，使用项目现有米白、橙色和浅绿色视觉。所有商品名称、营养数字和逐要求结论均来自项目内置虚构示例；没有调用真实 InfiniSynapse API，也没有创建图片识别任务。

## 发布顺序

1. `01_cover.png`：第一次把想法做成网页，建立个人学习记录语境。
2. `02_why_i_made_it.png`：从买酸奶时看不懂包装背面说起。
3. `03_what_it_does.png`：说明它不是“健康打分”，而是比较要求与取舍。
4. `04_image_recognition.png`：展示上传、人工检查、确认填入的流程。
5. `05_custom_requirements.png`：展示自定义购买要求与规则拆分。
6. `06_comparison_results.png`：使用真实计算结果呈现三款示例的差异。
7. `07_ai_suggestion.png`：说明确定性计算与 InfiniSynapse 整理建议的边界。
8. `08_feedback_invitation.png`：邀请用户直接反馈测试版问题。

## 文件结构

- `assets/`：最终 1080 × 1440 PNG。
- `source/cards.html`：8 张卡片的可编辑 HTML，通过 `#card1` 至 `#card8` 切换。
- `source/cards.css`：完整样式，使用系统中文字体，不包含下载字体。
- `source/screenshots/`：从本地稳定构建中截取的真实产品页面。
- `post_copy.md`：标题、正文、置顶评论、标签、备用标题与回复模板。
- `posting_checklist.md`：发布前后检查清单。

## 截图与报告来源

- 首页、要求编辑器、商品录入、图片上传、数据检查、逐要求结果和 AI 功能区域均来自本地真实页面截图。
- 图片识别的“人工确认”小面板按项目当前 `LabelRecognitionPanel` 的真实字段与文案排版，示例值来自 `src/data/mockProducts.ts`；没有在线提交图片。
- 第 7 张报告摘录来自 `server/fixtures/mixed-sse-response.json` 中已验证、脱敏的 A/B/C 示例报告，并在图片上明确标注来源。
- 所有截图均不含 API Key、taskId、后台日志、用户账号或本地路径。

## 导出方法

Windows 环境可直接运行 `source/export_cards.ps1`。脚本使用项目环境中已有的 Playwright 与本机 Microsoft Edge，将设备缩放固定为 1，并自动输出 8 张 1080 × 1440 PNG。

也可以启动本地静态服务器，使 `source/cards.html` 可访问。将浏览器视口设为 1080 × 1440，依次打开：

```text
.../source/cards.html#card1
.../source/cards.html#card2
...
.../source/cards.html#card8
```

每个地址截取当前视口并按 `assets/` 中的既定文件名保存。导出后检查像素尺寸，并以约 360 × 480 的缩略图复核手机阅读效果。

## 发布前仍需手工完成

- 验证公网体验地址稳定后，替换 `post_copy.md` 中的 `【体验地址待填写】`。
- 按 `posting_checklist.md` 使用手机流量走通一次真实公网流程。
