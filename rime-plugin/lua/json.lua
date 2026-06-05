-- json.lua - 简易 JSON 解析/编码库（兼容 RIME Lua 环境）
-- 支持 decode 和 encode，足够处理 DeepSeek API 响应

local M = {}

-- 跳过空白
local function skip_ws(s, i)
  return s:match("^%s*()", i)
end

-- 解析字符串
local function parse_string(s, i)
  i = i or 1
  if s:sub(i, i) ~= '"' then return nil, i end
  i = i + 1
  local result = {}
  while i <= #s do
    local c = s:sub(i, i)
    if c == '"' then
      return table.concat(result), i + 1
    elseif c == '\\' then
      i = i + 1
      local esc = s:sub(i, i)
      if esc == '"' then result[#result+1] = '"'
      elseif esc == '\\' then result[#result+1] = '\\'
      elseif esc == '/' then result[#result+1] = '/'
      elseif esc == 'n' then result[#result+1] = '\n'
      elseif esc == 'r' then result[#result+1] = '\r'
      elseif esc == 't' then result[#result+1] = '\t'
      elseif esc == 'b' then result[#result+1] = '\b'
      elseif esc == 'f' then result[#result+1] = '\f'
      elseif esc == 'u' then
        -- Unicode escape: \uXXXX
        local hex = s:sub(i+1, i+4)
        local codepoint = tonumber(hex, 16)
        if codepoint then
          if codepoint < 128 then
            result[#result+1] = string.char(codepoint)
          elseif codepoint < 2048 then
            result[#result+1] = string.char(192 + math.floor(codepoint/64), 128 + codepoint%64)
          else
            result[#result+1] = string.char(224 + math.floor(codepoint/4096), 128 + math.floor(codepoint/64)%64, 128 + codepoint%64)
          end
          i = i + 4
        end
      end
      i = i + 1
    else
      result[#result+1] = c
      i = i + 1
    end
  end
  return nil, i
end

-- 解析数字
local function parse_number(s, i)
  local num_str = s:match("^-?%d+%.?%d*[eE]?[+-]?%d*", i)
  if num_str then
    return tonumber(num_str), i + #num_str
  end
  return nil, i
end

-- 前向声明
local parse_value

-- 解析数组
local function parse_array(s, i)
  i = skip_ws(s, i + 1)  -- skip [
  local arr = {}
  if s:sub(i, i) == ']' then return arr, i + 1 end
  while true do
    local val
    val, i = parse_value(s, i)
    if val == nil then return nil, i end
    arr[#arr+1] = val
    i = skip_ws(s, i)
    if s:sub(i, i) == ']' then return arr, i + 1 end
    if s:sub(i, i) ~= ',' then return nil, i end
    i = skip_ws(s, i + 1)
  end
end

-- 解析对象
local function parse_object(s, i)
  i = skip_ws(s, i + 1)  -- skip {
  local obj = {}
  if s:sub(i, i) == '}' then return obj, i + 1 end
  while true do
    local key
    key, i = parse_string(s, i)
    if key == nil then return nil, i end
    i = skip_ws(s, i)
    if s:sub(i, i) ~= ':' then return nil, i end
    i = skip_ws(s, i + 1)
    local val
    val, i = parse_value(s, i)
    if val == nil then return nil, i end
    obj[key] = val
    i = skip_ws(s, i)
    if s:sub(i, i) == '}' then return obj, i + 1 end
    if s:sub(i, i) ~= ',' then return nil, i end
    i = skip_ws(s, i + 1)
  end
end

-- 解析值
parse_value = function(s, i)
  i = skip_ws(s, i)
  if i > #s then return nil, i end
  local c = s:sub(i, i)
  if c == '"' then return parse_string(s, i)
  elseif c == '{' then return parse_object(s, i)
  elseif c == '[' then return parse_array(s, i)
  elseif c == 't' and s:sub(i, i+3) == 'true' then return true, i + 4
  elseif c == 'f' and s:sub(i, i+4) == 'false' then return false, i + 5
  elseif c == 'n' and s:sub(i, i+3) == 'null' then return nil, i + 4
  elseif c == '-' or (c >= '0' and c <= '9') then return parse_number(s, i)
  end
  return nil, i
end

-- 公开 API
function M.decode(s)
  if not s or s == "" then return nil end
  local result, _ = parse_value(s, 1)
  return result
end

function M.encode(val)
  if val == nil then return "null" end
  local t = type(val)
  if t == "boolean" then return val and "true" or "false" end
  if t == "number" then return tostring(val) end
  if t == "string" then
    return '"' .. val:gsub('[\\"%c]', function(c)
      if c == '\\' then return '\\\\'
      elseif c == '"' then return '\\"'
      elseif c == '\n' then return '\\n'
      elseif c == '\r' then return '\\r'
      elseif c == '\t' then return '\\t'
      else return string.format('\\u%04x', string.byte(c))
      end
    end) .. '"'
  end
  if t == "table" then
    -- 检查是数组还是对象
    local is_arr = (#val > 0)
    if is_arr then
      local parts = {}
      for _, v in ipairs(val) do
        parts[#parts+1] = M.encode(v)
      end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      local parts = {}
      for k, v in pairs(val) do
        if type(k) == "string" then
          parts[#parts+1] = M.encode(k) .. ":" .. M.encode(v)
        end
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end

return M
