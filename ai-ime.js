/**
 * AI 候选词增强模块 - 中英双语版
 * 支持中文拼音候选词 + 英文单词预测
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
        const cfg = JSON.parse(saved)
        // 兼容旧配置
        if (!cfg.mode) cfg.mode = 'auto'
        return cfg
      }
    } catch (e) {
      console.error('Failed to load AI config:', e)
    }
    return {
      enabled: false,
      apiKey: '',
      apiUrl: DEFAULT_API_URL,
      model: DEFAULT_MODEL,
      mode: 'auto' // 'zh' | 'en' | 'auto'
    }
  }

  function saveConfig (config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }

  // 缓存
  const cache = new Map()
  let contextText = ''

  function getCacheKey (input, context, mode) {
    return mode + '|' + input + '|' + context.slice(-20)
  }

  // ===== 语言检测 =====
  // 检测输入是否更像是英文还是拼音
  const PINYIN_RE = /^[a-z]{1,6}$/
  const COMMON_PINYIN = new Set([
    'a','o','e','i','u','v','ai','ei','ao','ou','an','en','ang','eng',
    'ba','bo','bi','bu','bei','ban','ben','bang','beng','bian','bin','bing','biao',
    'pa','po','pi','pu','pei','pan','pen','pang','peng','pian','pin','ping','piao',
    'ma','mo','mi','mu','mei','man','men','mang','meng','mian','min','ming','miao','miu','mie',
    'fa','fo','fu','fei','fan','fen','fang','feng',
    'da','de','di','du','dai','dei','dao','dou','dan','den','dang','deng','dong',
    'dian','din','ding','diao','diu','die','duan','dun','dui','duo',
    'ta','te','ti','tu','tai','tei','tao','tou','tan','tang','teng','tong',
    'tian','ting','tiao','tie','tuan','tun','tui','tuo',
    'na','ne','ni','nu','nv','nai','nei','nao','nou','nan','nen','nang','neng','nong',
    'nian','nin','ning','niang','niao','niu','nie','nue','nuan','nuo',
    'la','le','li','lu','lv','lai','lei','lao','lou','lan','lang','leng','long',
    'lian','lin','ling','liang','liao','liu','lie','lue','luan','lun','luo',
    'ga','ge','gu','gai','gei','gao','gou','gan','gen','gang','geng','gong',
    'guan','gun','gui','guo','gua',
    'ka','ke','ku','kai','kei','kao','kou','kan','ken','kang','keng','kong',
    'kuan','kun','kui','kuo','kua',
    'ha','he','hu','hai','hei','hao','hou','han','hen','hang','heng','hong',
    'huan','hun','hui','huo','hua',
    'ji','ju','jia','jiao','jiu','jian','jin','jiang','jing','jue','juan','jun','jie',
    'qi','qu','qia','qiao','qiu','qian','qin','qiang','qing','que','quan','qun','qie',
    'xi','xu','xia','xiao','xiu','xian','xin','xiang','xing','xue','xuan','xun','xie',
    'zhi','zha','zhe','zhu','zhai','zhei','zhao','zhou','zhan','zhen','zhang','zheng','zhong',
    'zhuan','zhun','zhui','zhuo','zhuai','zhua',
    'chi','cha','che','chu','chai','chao','chou','chan','chen','chang','cheng','chong',
    'chuan','chun','chui','chuo','chuai','chua',
    'shi','sha','she','shu','shai','shei','shao','shou','shan','shen','shang','sheng',
    'shuan','shun','shui','shuo','shuai','shua',
    'ri','re','ru','rao','rou','ran','ren','rang','reng','rong','ruan','run','rui','ruo',
    'za','ze','zu','zai','zei','zao','zou','zan','zen','zang','zeng','zong',
    'zuan','zun','zui','zuo',
    'ca','ce','cu','cai','cao','cou','can','cen','cang','ceng','cong',
    'cuan','cun','cui','cuo',
    'sa','se','su','sai','sao','sou','san','sen','sang','seng','song',
    'suan','sun','sui','suo',
    'ya','yo','yu','ye','yao','you','yan','yin','yang','ying','yong',
    'yuan','yun','yue',
    'wa','wo','wu','wai','wei','wan','wen','wang','weng',
    'er','n','m','ng'
  ])

  function detectLanguage (input) {
    // 如果包含空格，很可能是英文短语/句子
    if (input.includes(' ')) return 'en'

    // 如果包含大写，是英文
    if (/[A-Z]/.test(input)) return 'en'

    // 长度超过6个字符的连续小写大概率是英文单词
    if (input.length > 6 && /^[a-z]+$/.test(input)) return 'en'

    // 检查是否是已知拼音音节
    if (COMMON_PINYIN.has(input.toLowerCase())) return 'zh'

    // 4-6个字符，不在拼音表中，可能是英文
    if (input.length >= 4 && /^[a-z]+$/.test(input)) return 'en'

    // 短的默认拼音
    if (PINYIN_RE.test(input)) return 'zh'

    return 'en'
  }

  // ===== Prompt 定义 =====
  const ZH_SYSTEM_PROMPT = `你是中文输入法的候选词生成引擎。

规则：
1. 根据用户输入的拼音生成 5-10 个中文候选词/短语
2. 根据上文语境选择语义最连贯的
3. 包含常见词、口语表达
4. 按语境适配度从高到低排序
5. 只返回最可能的词，不要生僻词

输出格式（严格JSON，不要其他内容）:
{"candidates": ["候选1", "候选2", ...]}`

  const EN_SYSTEM_PROMPT = `You are an intelligent English autocomplete engine for an input method.

Rules:
1. Given the user's partial word or phrase, predict 5-10 likely next words or phrase completions
2. Consider the preceding context for coherence
3. Include common words, idioms, and natural expressions
4. Sort by likelihood (most probable first)
5. If the input is a partial word, complete it; if it's a full word, suggest what comes next
6. Mix of: word completions, next-word predictions, and phrase suggestions
7. Keep suggestions practical and commonly used

Output format (strict JSON, no other content):
{"candidates": ["word1", "word2", ...]}`

  // ===== AI 候选词生成 =====
  async function generateAICandidates (input, context) {
    const config = getConfig()
    if (!config.enabled || !config.apiKey) {
      return []
    }

    // 确定语言模式
    let mode = config.mode
    if (mode === 'auto') {
      mode = detectLanguage(input)
    }

    const cacheKey = getCacheKey(input, context, mode)
    const cached = cache.get(cacheKey)
    if (cached) {
      return cached
    }

    let systemPrompt, userMessage

    if (mode === 'en') {
      systemPrompt = EN_SYSTEM_PROMPT
      const contextPart = context ? '\nContext: ' + context : ''
      userMessage = 'Input: ' + input + contextPart
    } else {
      systemPrompt = ZH_SYSTEM_PROMPT
      const contextPart = context ? '\n上文: ' + context : ''
      userMessage = '拼音: ' + input + contextPart
    }

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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: mode === 'en' ? 0.5 : 0.3,
          max_tokens: 200
        })
      })

      if (!response.ok) {
        console.error('AI API error:', response.status)
        return []
      }

      const data = await response.json()
      console.log('[AI IME] Full API response data:', JSON.stringify(data, null, 2))
      const content = data.choices?.[0]?.message?.content || '{"candidates":[]}'

      console.log('[AI IME] Raw API response:', content)

      // 提取 JSON（兼容 markdown code block、前后多余文字）
      let jsonStr = content.trim()

      // 尝试 markdown code block
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim()
      }

      // 尝试找第一个 { 到最后一个 }
      if (!jsonStr.startsWith('{')) {
        const start = jsonStr.indexOf('{')
        const end = jsonStr.lastIndexOf('}')
        if (start !== -1 && end !== -1 && end > start) {
          jsonStr = jsonStr.slice(start, end + 1)
        }
      }

      let parsed
      try {
        parsed = JSON.parse(jsonStr)
      } catch (parseErr) {
        console.warn('[AI IME] JSON parse failed, trying array extraction:', parseErr.message)
        console.warn('[AI IME] Raw content was:', content)
        // 尝试直接提取 JSON 数组
        const arrMatch = content.match(/\[[\s\S]*?\]/)
        if (arrMatch) {
          parsed = { candidates: JSON.parse(arrMatch[0]) }
        } else {
          // 最后尝试：按行/逗号分割文本作为候选
          const words = content.split(/[,\n]+/).map(s => s.replace(/["\[\]{}]/g, '').trim()).filter(Boolean)
          if (words.length > 0) {
            parsed = { candidates: words }
          } else {
            console.error('[AI IME] Could not extract any candidates from response')
            return []
          }
        }
      }

      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed.candidates || []

      console.log('[AI IME] Parsed candidates:', candidates)

      // 英文模式下添加 🤖 标记
      const marked = mode === 'en'
        ? candidates.map(c => ({ text: c, isAI: true, lang: 'en' }))
        : candidates

      // 缓存结果
      if (cache.size >= CACHE_SIZE) {
        const firstKey = cache.keys().next().value
        if (firstKey) cache.delete(firstKey)
      }
      cache.set(cacheKey, marked)

      return marked
    } catch (error) {
      console.error('AI API call failed:', error)
      return []
    }
  }

  // 更新上下文
  function updateContext (text) {
    contextText = text.slice(-100)
  }

  // ===== 设置面板 =====
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
      max-width: 320px;
      display: none;
    `

    const config = getConfig()

    panel.innerHTML = `
      <h3 style="margin: 0 0 10px 0; font-size: 16px;">🤖 AI Settings</h3>
      <div style="margin-bottom: 10px;">
        <label style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="ai-enabled" ${config.enabled ? 'checked' : ''}>
          Enable AI Candidates
        </label>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 4px; font-weight: 500;">Language Mode</label>
        <div style="display: flex; gap: 4px;">
          <button id="ai-mode-auto" class="ai-mode-btn" data-mode="auto"
            style="flex:1; padding: 6px; border: 2px solid ${config.mode === 'auto' ? '#4CAF50' : '#ccc'}; 
            background: ${config.mode === 'auto' ? '#e8f5e9' : '#fff'}; border-radius: 4px; cursor: pointer; font-size: 12px;">
            🔄 Auto
          </button>
          <button id="ai-mode-zh" class="ai-mode-btn" data-mode="zh"
            style="flex:1; padding: 6px; border: 2px solid ${config.mode === 'zh' ? '#4CAF50' : '#ccc'}; 
            background: ${config.mode === 'zh' ? '#e8f5e9' : '#fff'}; border-radius: 4px; cursor: pointer; font-size: 12px;">
            中文
          </button>
          <button id="ai-mode-en" class="ai-mode-btn" data-mode="en"
            style="flex:1; padding: 6px; border: 2px solid ${config.mode === 'en' ? '#4CAF50' : '#ccc'}; 
            background: ${config.mode === 'en' ? '#e8f5e9' : '#fff'}; border-radius: 4px; cursor: pointer; font-size: 12px;">
            English
          </button>
        </div>
        <div id="ai-mode-desc" style="font-size: 11px; color: #888; margin-top: 4px;">
          ${config.mode === 'auto' ? 'Auto-detect: Chinese pinyin → 中文, English words → English' :
            config.mode === 'zh' ? '中文模式: 拼音输入生成中文候选词' :
            'English mode: word prediction and autocomplete'}
        </div>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 4px;">API Key</label>
        <input type="password" id="ai-apikey" value="${config.apiKey || ''}" 
          style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;"
          placeholder="sk-...">
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 4px;">API URL</label>
        <input type="text" id="ai-apiurl" value="${config.apiUrl || DEFAULT_API_URL}" 
          style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;"
          placeholder="https://openrouter.ai/api/v1">
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 4px;">Model</label>
        <input type="text" id="ai-model" value="${config.model || DEFAULT_MODEL}" 
          style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;"
          placeholder="deepseek/deepseek-chat">
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="ai-test" style="padding: 6px 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Test Connection
        </button>
        <button id="ai-close" style="padding: 6px 12px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Close
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
    const modeDesc = panel.querySelector('#ai-mode-desc')
    const modeButtons = panel.querySelectorAll('.ai-mode-btn')

    const modeDescriptions = {
      auto: 'Auto-detect: Chinese pinyin → 中文, English words → English',
      zh: '中文模式: 拼音输入生成中文候选词',
      en: 'English mode: word prediction and autocomplete'
    }

    function saveCurrentConfig () {
      const currentConfig = getConfig()
      saveConfig({
        enabled: enabledCheckbox.checked,
        apiKey: apiKeyInput.value,
        apiUrl: apiUrlInput.value,
        model: modelInput.value,
        mode: currentConfig.mode
      })
    }

    function setMode (mode) {
      const currentConfig = getConfig()
      currentConfig.mode = mode
      saveConfig(currentConfig)

      // 更新按钮样式
      modeButtons.forEach(btn => {
        const isActive = btn.dataset.mode === mode
        btn.style.borderColor = isActive ? '#4CAF50' : '#ccc'
        btn.style.background = isActive ? '#e8f5e9' : '#fff'
      })
      modeDesc.textContent = modeDescriptions[mode]
    }

    enabledCheckbox.addEventListener('change', saveCurrentConfig)
    apiKeyInput.addEventListener('change', saveCurrentConfig)
    apiUrlInput.addEventListener('change', saveCurrentConfig)
    modelInput.addEventListener('change', saveCurrentConfig)

    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode))
    })

    testButton.addEventListener('click', async () => {
      statusDiv.textContent = 'Testing...'
      statusDiv.style.color = '#666'

      const currentConfig = getConfig()
      if (!currentConfig.apiKey) {
        statusDiv.textContent = '✗ Please enter an API Key first'
        statusDiv.style.color = '#f44336'
        return
      }

      let testInput
      if (currentConfig.mode === 'en') {
        testInput = 'hello wor'
      } else if (currentConfig.mode === 'zh') {
        testInput = 'nh'
      } else {
        testInput = 'hello wor'
      }

      try {
        const candidates = await generateAICandidates(testInput, '')
        if (candidates.length > 0) {
          const preview = candidates.slice(0, 3).map(c => c.text || c).join(', ')
          statusDiv.textContent = `✓ Connected! (${candidates.length} results) Preview: ${preview}`
          statusDiv.style.color = '#4CAF50'
        } else {
          statusDiv.innerHTML = '✗ No candidates returned.<br><span style="font-size:11px">Check console (F12) for [AI IME] logs</span>'
          statusDiv.style.color = '#f44336'
        }
      } catch (e) {
        statusDiv.textContent = '✗ Error: ' + e.message
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
    button.title = 'AI Candidate Settings'
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
    console.log('AI IME module loaded (Chinese + English)')
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
    saveConfig,
    detectLanguage
  }
})()
