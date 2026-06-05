# RIME AI 候选词插件

给 RIME 输入法添加 AI 候选词生成（DeepSeek API）。

## 工作原理

```
打字 → RIME WASM 生成候选 → AI 插件拦截
                           ↓
                    调用 DeepSeek API 生成额外候选
                           ↓
                    合并到候选词列表（🤖 标记）
```

## 安装

### 文件结构

```
你的 RIME 用户目录/
├── lua/
│   ├── ai_candidate.lua    ← 从这里复制
│   └── json.lua            ← 从这里复制
├── rime.lua                ← 追加一行
├── ai_candidate_config.yaml ← 创建配置
└── your_schema.schema.yaml  ← 修改 engine/filters
```

### 步骤 1：复制 Lua 文件

将 `lua/ai_candidate.lua` 和 `lua/json.lua` 复制到 RIME 用户目录的 `lua/` 文件夹。

各平台 RIME 用户目录位置：

| 平台 | 目录 |
|------|------|
| **Trime (Android)** | `/sdcard/rime/` 或 Trime 设置里的「用户数据目录」|
| **fcitx5-rime (Linux)** | `~/.local/share/fcitx5/rime/` |
| **ibus-rime (Linux)** | `~/.config/ibus/rime/` |
| **Squirrel (macOS)** | `~/Library/Rime/` |
| **Weasel (Windows)** | `%APPDATA%\Rime\` |

### 步骤 2：注册插件

在 `rime.lua` 文件末尾追加：

```lua
ai_candidate = require("ai_candidate")
```

如果 `rime.lua` 不存在，创建它。

### 步骤 3：修改 Schema

在你使用的输入方案 `.schema.yaml` 中，找到 `engine/filters`，添加 AI filter：

```yaml
engine:
  filters:
    - lua_filter@ai_candidate    # 添加这行
    - uniquifier
    # ... 其他 filters
```

**注意**：放在 `uniquifier` 之前，这样 AI 候选会被去重处理。

### 步骤 4：配置 API Key

复制 `ai_candidate_config.yaml` 到 RIME 用户目录，修改 `api_key`：

```yaml
api_url: "https://api.deepseek.com/v1/chat/completions"
api_key: "sk-your-key-here"
model: "deepseek-chat"
enabled: true
```

### 步骤 5：重新部署

- Trime：设置 → 重新部署
- fcitx5-rime：`touch ~/.local/share/fcitx5/rime/ && fcitx5-rime -r`
- Squirrel：点击菜单栏图标 → 重新部署

## API 配置示例

### DeepSeek 直连
```yaml
api_url: "https://api.deepseek.com/v1/chat/completions"
api_key: "sk-..."
model: "deepseek-chat"
```

### OpenRouter
```yaml
api_url: "https://openrouter.ai/api/v1/chat/completions"
api_key: "sk-or-..."
model: "deepseek/deepseek-chat"
```

### MiMo (小米)
```yaml
api_url: "https://api.volcengine.com/v1/chat/completions"
api_key: "..."
model: "mimo-v2"   # 非推理模型
```

## 性能说明

- **缓存**：相同拼音+上下文不重复请求 API
- **超时**：默认 3 秒，超时则只显示 RIME 原生候选
- **最小输入**：默认 1 个字符，可配置
- **推理模型**：自动检测 `pro` 模型并增加 max_tokens（但建议用非推理模型）

## 故障排除

1. **没有 AI 候选出现**
   - 检查 `ai_candidate_config.yaml` 的 `api_key` 是否正确
   - 确认 `enabled: true`
   - 检查 `rime.lua` 中是否有 `ai_candidate = require("ai_candidate")`

2. **响应很慢**
   - 减小 `timeout`（如 `timeout: 2`）
   - 换更快的模型（如 `deepseek-chat`）
   - 检查网络连接

3. **候选词不准确**
   - 调整 `min_input_len`（输入更多拼音再触发）
   - 尝试不同的 API/模型

## 文件清单

- `lua/ai_candidate.lua` — 主插件逻辑
- `lua/json.lua` — JSON 解析库
- `ai_candidate_config.yaml` — 配置模板
- `rime.lua.append` — rime.lua 追加内容
