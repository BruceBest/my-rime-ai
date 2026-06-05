# My RIME + AI 候选词增强

基于 [my_rime](https://github.com/LibreService/my_rime) 的 AI 增强版本。

## 在线体验

访问 https://your-project.vercel.app

## 功能特点

### 🤖 AI 候选词生成

在原有 RIME 候选词基础上，使用 DeepSeek 大模型生成额外的候选词。

**特点：**
- 上下文感知 — 根据已输入的文字生成更合适的候选词
- 实时生成 — 输入拼音时自动请求 AI 候选词
- 智能合并 — AI 候选词带 🤖 标记，与 RIME 候选词去重后合并显示
- 本地缓存 — 相同输入不重复请求 API

### 设置界面

点击页面右下角的 "🤖 AI" 按钮进行配置：
- 启用/禁用 AI 候选词
- 配置 API Key
- 选择 API 提供商（DeepSeek / OpenRouter）
- 选择模型

## API 配置

### OpenRouter（推荐）

- API URL: `https://openrouter.ai/api/v1`
- 模型: `deepseek/deepseek-chat`
- 获取 API Key: https://openrouter.ai/keys

### DeepSeek 直连

- API URL: `https://api.deepseek.com/v1`
- 模型: `deepseek-chat`
- 获取 API Key: https://platform.deepseek.com

## 部署到 Vercel

1. Fork 本项目
2. 在 Vercel 中导入项目
3. 部署即可

## 本地运行

```bash
# 安装依赖
npm install -g serve

# 启动本地服务器
serve -s .
```

## 技术实现

- 基于 my_rime 的预构建版本
- AI 模块通过 `<script>` 标签注入
- 使用 localStorage 存储配置
- 使用 Map 进行本地缓存

## 许可证

AGPL-3.0+（与原版 my_rime 一致）
