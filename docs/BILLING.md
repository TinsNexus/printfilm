# PRINTFILM 计费说明

## 原则

- 按上游 **真实 token 用量**（或无法拿到 usage 时的保守估价）计费。
- 用户支付价 = 上游成本 × **1.5**（`BILLING_MARKUP`）。
- 钱包单位：**分（fen）**。
- 充值：易支付 [pay.gitcc.com](https://pay.gitcc.com/)，支付宝 `alipay` / 微信 `wxpay`。

## 公式

```
charge_fen = ceil(tokens / 1e6 * provider_yuan_per_m * markup * 100)
```

默认成本价（元/百万 tokens，可环境覆盖）：

| billing_key | 成本 |
|-------------|------|
| seedance2:video0 | 46 |
| seedance2:video1 | 28 |
| llm_chat | 5 |
| seedream | 8（按次折合约；有 usage 则用 usage） |
| tts | 2（按次估价） |

## 预扣 / 结算

1. `POST /generate`：按阶段估算并 `freeze`（含约 20% buffer）。
2. 流水线写入 `UsageEvent`。
3. 阶段结束（`SCRIPT_READY` / `DONE` / `FAILED` / `CANCELLED`）：按本项目未结算 usage `settle`，多退少补冻结额。

## 易支付

环境变量（密钥勿提交仓库）：

```
BILLING_ENABLED=true
BILLING_MARKUP=1.5
EPAY_API_URL=https://pay.gitcc.com
EPAY_PID=your-epay-pid
EPAY_KEY=***
EPAY_NOTIFY_URL=https://your-site.example.com/epay/notify
EPAY_RETURN_URL=https://your-site.example.com/pricing?paid=1
```

下单：服务端 `POST {EPAY_API_URL}/mapi.php`（扫码），MD5 签名（参数 ASCII 排序，排除 sign/sign_type，末尾拼 KEY）。返回 `qrcode` / `payurl` 供前端弹窗展示二维码。

异步 notify 验签成功且支付成功 → 订单入账（幂等）。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/billing/usage/summary` | 本月 token / 费用 / 余额 |
| GET | `/api/billing/orders` | 充值订单列表 |
| POST | `/api/billing/orders` | `{sku_id, pay_type}` → 扫码支付载荷（含 `qr_payload`） |
| POST | `/api/billing/epay/notify` | 易支付回调 |
| GET | `/api/billing/orders/{out_trade_no}` | 订单状态 |

Demo 账号可设 `billing_unlimited=true` 跳过扣费。
