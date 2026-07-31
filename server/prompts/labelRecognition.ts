import type { LabelImageKind } from '../types.js'

const fileLabel: Record<LabelImageKind, string> = {
  ingredients: '配料表图片',
  nutrition: '营养成分表图片',
}

export function buildLabelRecognitionPrompt(
  files: Array<{ kind: LabelImageKind; filename: string }>,
): string {
  const uploadList = files
    .map((file, index) => `${index + 1}. ${fileLabel[file.kind]}：${file.filename}`)
    .join('\n')

  return `你正在为“标签真相局 LabelLens”识别一款包装食品的标签图片。

这是一次严格字段抽取任务。不要联网、不要搜索商品、不要使用品牌数据库，也不要推测图片中看不清或没有出现的内容。
任务只做标签字段提取：不要生成长报告，不要给购买建议，不要比较商品，也不要做复杂推理。本任务与最终选购建议是两个独立任务。

下列标签图片已经作为本次任务的 files[] 附件提供：
${uploadList}

请按下面顺序执行：
1. 直接读取 files[] 中已经提供的图片。不得再次要求用户上传文件，不得返回 followup，也不得等待其他图片。
2. 即使只有一张图片也必须继续识别；未提供的图片类型所对应、且无法从现有图片确认的字段返回 null 或 unknown。
3. 只提取下方 JSON schema 指定的字段。
4. 将最终 JSON 写入任务工作区的 final/label-extraction.json。
5. 最终回复只能输出同一份原始 JSON；不得使用 Markdown 代码块，不得添加解释、前后缀或思考过程。

字段规则：
- productName：包装中能明确确认的商品名称，否则 null。
- ingredientsText：按图片可见顺序原样转写配料表，否则 null。不得根据顺序解释营养来源或贡献。
- netContent：仅净含量的数字，否则 null。
- netContentUnit：只能是 "g"、"mL" 或 null。
- nutritionBasis：只能是 "per100g"、"per100ml"、"perServing"、"unknown"。
- energyValue：按营养表标示基准抄录能量数字，否则 null。
- energyUnit：只能是 "kJ"、"kcal" 或 null；不得换算。
- protein、fat、carbohydrate：按同一营养标示基准抄录克数数字，否则 null。
- sodium：按同一营养标示基准抄录毫克数字，否则 null。
- 严格区分 kJ 与 kcal、g 与 mg，不得把单位相互替换。
- 不识别价格，不添加条形码、健康判断、疾病判断或任何 schema 外字段。
- 必须明确区分每100g、每100mL、每份和整包；无法确认时使用 unknown 或 null。
- 看不清、被遮挡、冲突或图片未提供的字段一律使用 null/unknown，不得猜测或自行换算。

必须输出且只允许输出以下结构，所有键都必须出现：
{
  "productName": null,
  "ingredientsText": null,
  "netContent": null,
  "netContentUnit": null,
  "nutritionBasis": "unknown",
  "energyValue": null,
  "energyUnit": null,
  "protein": null,
  "fat": null,
  "carbohydrate": null,
  "sodium": null
}`
}
