# My RIME AI 部署指南

## 方法一：通过 Vercel 网站部署（推荐）

1. 访问 https://vercel.com/login
2. 使用 GitHub 账号登录
3. 点击 "New Project"
4. 选择 "Import Git Repository"
5. 输入仓库地址: `https://github.com/BruceBest/my-rime-ai`
6. 点击 "Deploy"
7. 等待部署完成

## 方法二：使用 Vercel CLI

### 1. 安装 Vercel CLI
```bash
npm install -g vercel
```

### 2. 登录 Vercel
```bash
vercel login
```

### 3. 部署项目
```bash
cd ~/ai-ime/vercel-deploy
vercel --prod
```

## 部署后配置

部署完成后，您需要：

1. 访问部署的 URL
2. 点击右下角的 "🤖 AI" 按钮
3. 配置 API Key（推荐使用 OpenRouter）
4. 测试连接
5. 开始使用

## API 配置

### OpenRouter（推荐）
- API URL: `https://openrouter.ai/api/v1`
- 模型: `deepseek/deepseek-chat`
- 获取 API Key: https://openrouter.ai/keys

### DeepSeek 直连
- API URL: `https://api.deepseek.com/v1`
- 模型: `deepseek-chat`
- 获取 API Key: https://platform.deepseek.com

## 故障排除

### 问题：部署失败
**解决方案：**
1. 检查 GitHub 仓库是否公开
2. 确认 Vercel 有权限访问仓库
3. 查看 Vercel 部署日志

### 问题：AI 候选词不显示
**解决方案：**
1. 检查 API Key 是否正确
2. 确认网络连接正常
3. 查看浏览器控制台错误信息

### 问题：输入法不工作
**解决方案：**
1. 刷新页面
2. 清除浏览器缓存
3. 检查浏览器控制台错误信息
