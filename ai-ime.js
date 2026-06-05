/**
 * AI 候选词增强模块 - 独立版本
 * 可以添加到任何 RIME Web 输入法中
 */

(function () {
  'use strict'

  const STORAGE_KEY = 'aiime_config'
  const CACHE_SIZE = 100
  const DEFAULT_API_URL = 'https://openrouter.ai/api/v1'
  const DEFAULT_MODEL = 'deepseek/deepseek-chat'

  // 配置管理
  function getConfig () {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('Failed to load AI config:', e)
    }
    return {
      enabled: false,
      apiKey: '',
      apiUrl: DEFAULT_API_URL,
      model: DEFAULT_MODEL
    }
  }

  function saveConfig (config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }

  // 缓存
  const cache = new Map()
  let contextText = ''

  function getCacheKey (input, context) {
    return input + '|' + context.slice(-20)
  }

  // AI 候选词生成
  const SYSTEM_PROMPT = `你是中文输入法的候选词生成引擎。

规则：
1. 根据用户输入的拼音生成 5-10 个中文候选词/短语
2. 根据上文语境选择语义最连贯的
3. 包含常见词、口语表达
4. 按语境适配度从高到低排序
5. 只返回最可能的词，不要生僻词

输出格式（严格JSON，不要其他内容）:
{"candidates": ["候选1", "候选2", ...]}`

  async function generateAICandidates (input, context) {
    const config = getConfig()
    if (!config.enabled || !config.apiKey) {
      return []
    }

    const cacheKey = getCacheKey(input, context)
    const cached = cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const contextPart = context ? '\n上文: ' + context : ''
    const userMessage = '拼音: ' + input + contextPart

    try {
      // 构建正确的 API URL
      let apiUrl = config.apiUrl || DEFAULT_API_URL
      if (apiUrl.endsWith('/v1')) {
        apiUrl = apiUrl + '/chat/completions'
      } else if (apiUrl.endsWith('/v1/')) {
        apiUrl = apiUrl + 'chat/completions'
      } else {
        apiUrl = apiUrl + '/v1/chat/completions'
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + config.apiKey
        },
        body: JSON.stringify({
          model: config.model || DEFAULT_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.3,
          max_tokens: 200
        })
      })

      if (!response.ok) {
        console.error('AI API error:', response.status)
        return []
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || '{"candidates":[]}'

      const parsed = JSON.parse(content)
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed.candidates || []

      // 缓存结果
      if (cache.size >= CACHE_SIZE) {
        const firstKey = cache.keys().next().value
        if (firstKey) cache.delete(firstKey)
      }
      cache.set(cacheKey, candidates)

      return candidates
    } catch (error) {
      console.error('AI API call failed:', error)
      return []
    }
  }

  // 更新上下文
  function updateContext (text) {
    contextText = text.slice(-100)
  }

  // 创建设置面板
  function createSettingsPanel () {
    const panel = document.createElement('div')
    panel.id = 'ai-settings-panel'
    panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      max-width: 300px;
      display: none;
    `

    const config = getConfig()

    panel.innerHTML = `
      <h3 style="margin: 0 0 10px 0; font-size: 16px;">🤖 AI 候选词设置</h3>
      <div style="margin-bottom: 10px;">
        <label style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="ai-enabled" ${config.enabled ? 'checked' : ''}>
          启用 AI 候选词
        </label>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 4px;">API Key</label>
        <input type="password" id="ai-apikey" value="${config.apiKey || ''}" 
          style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;"
          placeholder="sk-...">
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 4px;">API URL</label>
        <input type="text" id="ai-apiurl" value="${config.apiUrl || DEFAULT_API_URL}" 
          style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;"
          placeholder="https://openrouter.ai/api/v1">
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 4px;">模型</label>
        <input type="text" id="ai-model" value="${config.model || DEFAULT_MODEL}" 
          style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;"
          placeholder="deepseek/deepseek-chat">
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="ai-test" style="padding: 6px 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
          测试连接
        </button>
        <button id="ai-close" style="padding: 6px 12px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">
          关闭
        </button>
      </div>
      <div id="ai-status" style="margin-top: 10px; font-size: 12px; color: #666;"></div>
    `

    document.body.appendChild(panel)

    // 事件绑定
    const enabledCheckbox = panel.querySelector('#ai-enabled')
    const apiKeyInput = panel.querySelector('#ai-apikey')
    const apiUrlInput = panel.querySelector('#ai-apiurl')
    const modelInput = panel.querySelector('#ai-model')
    const testButton = panel.querySelector('#ai-test')
    const closeButton = panel.querySelector('#ai-close')
    const statusDiv = panel.querySelector('#ai-status')

    function saveCurrentConfig () {
      saveConfig({
        enabled: enabledCheckbox.checked,
        apiKey: apiKeyInput.value,
        apiUrl: apiUrlInput.value,
        model: modelInput.value
      })
    }

    enabledCheckbox.addEventListener('change', saveCurrentConfig)
    apiKeyInput.addEventListener('change', saveCurrentConfig)
    apiUrlInput.addEventListener('change', saveCurrentConfig)
    modelInput.addEventListener('change', saveCurrentConfig)

    testButton.addEventListener('click', async () => {
      statusDiv.textContent = '测试中...'
      statusDiv.style.color = '#666'
      try {
        const candidates = await generateAICandidates('nh', '')
        if (candidates.length > 0) {
          statusDiv.textContent = '✓ 连接成功! 测试结果: ' + candidates.slice(0, 3).join(', ')
          statusDiv.style.color = '#4CAF50'
        } else {
          statusDiv.textContent = '✗ 连接失败，请检查配置'
          statusDiv.style.color = '#f44336'
        }
      } catch (e) {
        statusDiv.textContent = '✗ 错误: ' + e.message
        statusDiv.style.color = '#f44336'
      }
    })

    closeButton.addEventListener('click', () => {
      panel.style.display = 'none'
    })

    return panel
  }

  // 创建设置按钮
  function createSettingsButton () {
    const button = document.createElement('button')
    button.textContent = '🤖 AI'
    button.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      padding: 8px 12px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      z-index: 9999;
      font-size: 14px;
    `
    button.addEventListener('click', () => {
      const panel = document.getElementById('ai-settings-panel')
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
      }
    })
    document.body.appendChild(button)
  }

  // 初始化
  function init () {
    console.log('AI 候选词模块已加载')
    createSettingsPanel()
    createSettingsButton()
  }

  // 等待页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  // 导出 API 供外部使用
  window.AIIME = {
    generateAICandidates,
    updateContext,
    getConfig,
    saveConfig
  }
})()
