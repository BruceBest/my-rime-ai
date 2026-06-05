-- ai_candidate.lua
-- RIME Lua 插件：AI 候选词生成（DeepSeek API）
-- 
-- 工作原理：
-- 1. 拦截 RIME 候选词列表
-- 2. 提取拼音输入，调用 DeepSeek API 生成 AI 候选
-- 3. 将 AI 候选合并到候选词列表末尾
--
-- 安装：
-- 1. 将此文件放到 RIME 配置目录的 lua/ 文件夹
-- 2. 在 rime.lua 中添加：ai_candidate = require("ai_candidate")
-- 3. 在 schema 的 engine/filters 中添加：- lua_filter@ai_candidate
-- 4. 创建 ai_candidate_config.yaml 配置 API

local json = require("json")  -- 需要 json 库，或使用内置解析

-- 配置
local config = {
  api_url = "https://api.deepseek.com/v1/chat/completions",
  api_key = "",
  model = "deepseek-chat",
  enabled = true,
  max_candidates = 5,
  timeout = 3,      -- curl 趃时秒数
  min_input_len = 1, -- 最少输入长度
  cache_size = 200,
}

-- 缓存
local cache = {}
local cache_order = {}

-- 读取配置
local function load_config()
  local config_path = rime_api.get_user_data_dir() .. "/ai_candidate_config.yaml"
  local f = io.open(config_path, "r")
  if not f then
    -- 尝试从环境变量读取
    config.api_key = os.getenv("DEEPSEEK_API_KEY") or ""
    return
  end
  local content = f:read("*a")
  f:close()
  
  -- 简单 YAML 解析
  for key, value in content:gmatch("(%w+)%s*:%s*([^\n]+)") do
    value = value:gsub("^%s+", ""):gsub("%s+$", ""):gsub('^"', ""):gsub('"$', "")
    if key == "api_url" then config.api_url = value
    elseif key == "api_key" then config.api_key = value
    elseif key == "model" then config.model = value
    elseif key == "enabled" then config.enabled = (value == "true")
    elseif key == "max_candidates" then config.max_candidates = tonumber(value) or 5
    elseif key == "timeout" then config.timeout = tonumber(value) or 3
    elseif key == "min_input_len" then config.min_input_len = tonumber(value) or 1
    end
  end
end

-- 缓存管理
local function cache_get(key)
  return cache[key]
end

local function cache_set(key, value)
  if #cache_order >= config.cache_size then
    local old_key = table.remove(cache_order, 1)
    cache[old_key] = nil
  end
  table.insert(cache_order, key)
  cache[key] = value
end

-- URL 编码
local function url_encode(str)
  return str:gsub("([^%w%-%.%_%~])", function(c)
    return string.format("%%%02X", string.byte(c))
  end)
end

-- JSON 解析（简易版，兼容 DeepSeek 响应）
local function parse_candidates_json(json_str)
  if not json_str or json_str == "" then return {} end
  
  -- 尝试用 json 库解析
  local ok, result = pcall(json.decode, json_str)
  if ok and result then
    if type(result) == "table" then
      if result.candidates then
        return result.candidates
      end
      if #result > 0 then
        return result
      end
    end
  end
  
  -- fallback: 提取引号字符串
  local candidates = {}
  for word in json_str:gmatch('"([^"]+)"') do
    if #word >= 1 and not word:match("^[%{%[%]{}]") then
      table.insert(candidates, word)
    end
  end
  return candidates
end

-- 从推理文本中提取候选词
local function extract_from_reasoning(text)
  if not text or text == "" then return {} end
  local seen = {}
  local results = {}
  
  -- 提取引号词
  for word in text:gmatch('[""\'\']([^""\'\']+)[""\'\']') do
    word = word:gsub("^%s+", ""):gsub("%s+$", "")
    if #word >= 1 and not seen[word:lower()] then
      seen[word:lower()] = true
      table.insert(results, word)
    end
  end
  
  return results
end

-- 调用 DeepSeek API
local function call_api(input, context)
  if config.api_key == "" then return {} end
  
  local cache_key = input .. "|" .. (context or ""):sub(-20)
  local cached = cache_get(cache_key)
  if cached then return cached end
  
  -- 构建 prompt
  local system_prompt = "你是中文输入法的候选词生成引擎。\n" ..
    "规则：\n" ..
    "1. 根据用户输入的拼音生成 5 个中文候选词/短语\n" ..
    "2. 根据上文语境选择语义最连贯的\n" ..
    "3. 包含常见词、口语表达\n" ..
    "4. 按语境适配度从高到低排序\n" ..
    "5. 只返回最可能的词，不要生僻词\n\n" ..
    '输出格式（严格JSON）：{"candidates": ["候选1", "候选2", ...]}'
  
  local context_part = ""
  if context and context ~= "" then
    context_part = '\n上文: ' .. context:sub(-50)
  end
  local user_message = "拼音: " .. input .. context_part
  
  -- 构建 JSON 请求体
  local request_body = string.format(
    '{"model":"%s","messages":[{"role":"system","content":%s},{"role":"user","content":%s}],"temperature":0.3,"max_tokens":%d}',
    config.model,
    json.encode(system_prompt),
    json.encode(user_message),
    -- 推理模型需要更多 token
    config.model:match("pro") and 4096 or 300
  )
  
  -- 写入请求体临时文件
  local tmp_body = os.tmpname()
  local f = io.open(tmp_body, "w")
  if not f then return {} end
  f:write(request_body)
  f:close()
  
  -- 写入 header 临时文件（避免 shell 注入）
  local tmp_header = os.tmpname()
  local hf = io.open(tmp_header, "w")
  if not hf then os.remove(tmp_body); return {} end
  hf:write("Content-Type: application/json\n")
  hf:write("Authorization: Bearer " .. config.api_key .. "\n")
  hf:close()
  
  -- 调用 curl（用 -K 读 header，避免 shell 转义问题）
  local tmp_response = os.tmpname()
  local cmd = string.format(
    "curl -s -m %d -X POST -K '%s' -d @'%s' -o '%s' '%s' 2>/dev/null",
    config.timeout,
    tmp_header,
    tmp_body,
    tmp_response,
    config.api_url
  )
  
  os.execute(cmd)
  
  -- 清理 header 临时文件
  os.remove(tmp_header)
  os.remove(tmp_body)
  
  -- 读取响应
  local rf = io.open(tmp_response, "r")
  if not rf then
    os.remove(tmp_response)
    return {}
  end
  local response = rf:read("*a")
  rf:close()
  
  -- 清理临时文件
  os.remove(tmp_response)
  
  if not response or response == "" then return {} end
  
  -- 解析响应
  local resp_ok, resp = pcall(json.decode, response)
  if not resp_ok or not resp then return {} end
  
  local content = ""
  local reasoning = ""
  
  if resp.choices and resp.choices[1] then
    local msg = resp.choices[1].message or {}
    content = msg.content or ""
    reasoning = msg.reasoning_content or ""
  end
  
  local candidates = {}
  
  -- 有正常 content
  if content ~= "" then
    candidates = parse_candidates_json(content)
  end
  
  -- content 为空，尝试从 reasoning 提取
  if #candidates == 0 and reasoning ~= "" then
    candidates = parse_candidates_json(reasoning)
    if #candidates == 0 then
      candidates = extract_from_reasoning(reasoning)
    end
  end
  
  -- 缓存
  if #candidates > 0 then
    cache_set(cache_key, candidates)
  end
  
  return candidates
end

-- RIME filter 入口
local function init(env)
  load_config()
  env.ai_candidates = {}
  env.last_input = ""
end

local function func(input, env)
  local ctx = env.engine.context
  local input_str = ctx.input
  
  -- 输入太短，跳过 AI
  if #input_str < config.min_input_len then
    for cand in input:iter() do
      yield(cand)
    end
    return
  end
  
  -- 未启用或无 API Key，直接透传
  if not config.enabled or config.api_key == "" then
    for cand in input:iter() do
      yield(cand)
    end
    return
  end
  
  -- 收集 RIME 原生候选
  local rime_candidates = {}
  local rime_texts = {}
  for cand in input:iter() do
    table.insert(rime_candidates, cand)
    rime_texts[cand.text] = true
    yield(cand)  -- 先输出 RIME 候选
  end
  
  -- 获取上下文（已提交的文字）
  local context = ""
  if ctx.get_preedit then
    context = ctx:get_preedit().text or ""
  end
  
  -- 调用 AI 生成候选
  local ai_candidates = call_api(input_str, context)
  
  -- 合并 AI 候选（去重，标记）
  local added = 0
  for _, ai_text in ipairs(ai_candidates) do
    if added >= config.max_candidates then break end
    if not rime_texts[ai_text] then
      -- 创建自定义候选
      local cand = Candidate("ai", 0, #input_str, ai_text, "🤖")
      yield(cand)
      added = added + 1
    end
  end
end

local function fini(env)
  -- 清理
end

return {
  init = init,
  func = func,
  fini = fini,
}
