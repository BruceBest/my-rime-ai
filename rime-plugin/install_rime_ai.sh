#!/bin/bash
# RIME AI 候选词插件安装脚本（macOS Squirrel）
# 用法：在终端运行 bash install_rime_ai.sh

RIME_DIR="$HOME/Library/Rime"
REPO_URL="https://raw.githubusercontent.com/BruceBest/my-rime-ai/master/rime-plugin"

echo "=== RIME AI 候选词插件安装 ==="
echo "RIME 目录: $RIME_DIR"

# 检查 RIME 目录
if [ ! -d "$RIME_DIR" ]; then
  echo "❌ 未找到 RIME 目录: $RIME_DIR"
  echo "   请先安装 Squirrel (鼠须管) 输入法"
  exit 1
fi

# 1. 创建 lua 目录
echo ""
echo "📁 创建 lua 目录..."
mkdir -p "$RIME_DIR/lua"

# 2. 下载插件文件
echo "📥 下载插件文件..."
curl -sL "$REPO_URL/lua/ai_candidate.lua" -o "$RIME_DIR/lua/ai_candidate.lua"
curl -sL "$REPO_URL/lua/json.lua" -o "$RIME_DIR/lua/json.lua"

if [ ! -f "$RIME_DIR/lua/ai_candidate.lua" ]; then
  echo "❌ 下载失败，检查网络连接"
  exit 1
fi
echo "   ✅ ai_candidate.lua"
echo "   ✅ json.lua"

# 3. 创建 rime.lua
echo "📝 创建 rime.lua..."
if [ -f "$RIME_DIR/rime.lua" ]; then
  # 检查是否已有这行
  if grep -q "ai_candidate" "$RIME_DIR/rime.lua"; then
    echo "   ⏭️  rime.lua 已包含 ai_candidate"
  else
    echo "" >> "$RIME_DIR/rime.lua"
    echo 'ai_candidate = require("ai_candidate")' >> "$RIME_DIR/rime.lua"
    echo "   ✅ 追加到 rime.lua"
  fi
else
  echo 'ai_candidate = require("ai_candidate")' > "$RIME_DIR/rime.lua"
  echo "   ✅ 创建 rime.lua"
fi

# 4. 创建配置文件
echo "📝 创建 AI 配置文件..."
if [ -f "$RIME_DIR/ai_candidate_config.yaml" ]; then
  echo "   ⏭️  配置文件已存在（保留现有配置）"
else
  cat > "$RIME_DIR/ai_candidate_config.yaml" << 'EOF'
api_url: "https://api.deepseek.com/v1/chat/completions"
api_key: "YOUR_API_KEY_HERE"
model: "deepseek-chat"
enabled: true
max_candidates: 5
timeout: 3
min_input_len: 1
EOF
  echo "   ✅ 创建 ai_candidate_config.yaml"
  echo ""
  echo "⚠️  重要：请编辑 ai_candidate_config.yaml 填入你的 API Key！"
  echo "   文件位置: $RIME_DIR/ai_candidate_config.yaml"
fi

# 5. 修改 schema（luna_pinyin）
echo ""
echo "📝 修改 luna_pinyin schema..."
SCHEMA="$RIME_DIR/luna_pinyin.schema.yaml"

if [ ! -f "$SCHEMA" ]; then
  echo "   ⚠️  未找到 luna_pinyin.schema.yaml"
  echo "   你可能需要手动从 build/ 复制或下载默认 schema"
  echo "   然后在 engine/filters 中添加: - lua_filter@ai_candidate"
else
  # 检查是否已有 ai_candidate
  if grep -q "ai_candidate" "$SCHEMA"; then
    echo "   ⏭️  Schema 已包含 ai_candidate"
  else
    # 在 filters 中添加（在第一个 filter 之前）
    if grep -q "filters:" "$SCHEMA"; then
      # 用 sed 在 filters: 后面第一行插入
      sed -i '' '/filters:/a\
    - lua_filter@ai_candidate
' "$SCHEMA"
      echo "   ✅ 已添加 lua_filter@ai_candidate"
    else
      echo "   ⚠️  Schema 中未找到 filters: 部分"
      echo "   请手动在 engine 下添加:"
      echo "   engine:"
      echo "     filters:"
      echo "       - lua_filter@ai_candidate"
    fi
  fi
fi

# 6. 完成
echo ""
echo "=== 安装完成！==="
echo ""
echo "下一步："
echo "1. 编辑 $RIME_DIR/ai_candidate_config.yaml 填入 API Key"
echo "2. 点击菜单栏 Squirrel 图标 → 重新部署"
echo "3. 打字测试！RIME 候选后面会出现 🤖 AI 候选"
echo ""
echo "文件位置: $RIME_DIR/"
ls -la "$RIME_DIR/lua/"
echo ""
ls "$RIME_DIR/ai_candidate_config.yaml"
ls "$RIME_DIR/rime.lua"
