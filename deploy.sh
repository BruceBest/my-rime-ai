#!/bin/bash

# My RIME AI 部署脚本

echo "=== My RIME AI 部署脚本 ==="
echo ""

# 检查是否安装了 Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "正在安装 Vercel CLI..."
    npm install -g vercel
fi

# 登录 Vercel
echo "请登录 Vercel..."
vercel login

# 部署项目
echo "正在部署到 Vercel..."
vercel --prod

echo ""
echo "部署完成！"
echo "请访问 https://vercel.com/dashboard 查看您的项目。"
