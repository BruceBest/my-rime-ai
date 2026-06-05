/**
 * AI Bridge v2 - 独立浮动面板
 * 监听 textarea 键盘输入，独立显示 AI 候选词
 * 与 RIME 共存：RIME 处理中文，AI 处理英文预测
 */
;(function () {
  'use strict'

  let panel = null
  let inputBuffer = ''
  let debounceTimer = null
  let isActive = false

  // 创建独立的 AI 候选面板
  function createPanel () {
    if (panel) return panel

    panel = document.createElement('div')
    panel.id = 'ai-float-panel'
    panel.style.cssText = `
      position: fixed;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      max-width: 600px;
      min-width: 200px;
      background: #fff;
      border: 2px solid #4CAF50;
      border-radius: 8px;
      padding: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      display: none;
      flex-wrap: wrap;
      gap: 4px;
    `
    document.body.appendChild(panel)
    return panel
  }

  // 显示候选词
  function showCandidates (candidates) {
    const p = createPanel()
    p.innerHTML = ''

    if (!candidates || candidates.length === 0) {
      p.style.display = 'none'
      return
    }

    p.style.display = 'flex'

    // 标题
    const title = document.createElement('span')
    title.textContent = '🤖'
    title.style.cssText = 'color:#4CAF50;font-weight:bold;padding:2px 4px;align-self:center;'
    p.appendChild(title)

    candidates.forEach(candidate => {
      const text = typeof candidate === 'string' ? candidate : (candidate.text || candidate)
      const btn = document.createElement('span')
      btn.textContent = text
      btn.style.cssText = `
        display: inline-block;
        padding: 4px 10px;
        background: #f0faf4;
        border: 1px solid #c8e6c9;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        color: #2e7d32;
        white-space: nowrap;
        transition: all 0.15s;
      `
      btn.onmouseenter = () => { btn.style.background = '#c8e6c9' }
      btn.onmouseleave = () => { btn.style.background = '#f0faf4' }
      btn.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        selectCandidate(text)
      }
      p.appendChild(btn)
    })

    // 关闭按钮
    const close = document.createElement('span')
    close.textContent = '✕'
    close.style.cssText = 'cursor:pointer;color:#999;padding:2px 4px;font-size:12px;align-self:center;'
    close.onclick = () => {
      p.style.display = 'none'
      isActive = false
      inputBuffer = ''
    }
    p.appendChild(close)
  }

  // 选择候选词
  function selectCandidate (text) {
    const textarea = document.querySelector('textarea')
    if (!textarea) return

    // 先给 RIME 发 Escape 清除未提交的拼音
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    // 等 RIME 处理完 Escape
    setTimeout(() => {
      // 插入 AI 候选文本
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      ).set
      setter.call(textarea, textarea.value + text)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))

      // 更新上下文
      if (window.AIIME && window.AIIME.updateContext) {
        window.AIIME.updateContext(textarea.value)
      }

      // 清理
      inputBuffer = ''
      isActive = false
      if (panel) panel.style.display = 'none'
      textarea.focus()
    }, 50)
  }

  // 检测是否是拼音输入
  function isPinyinChar (key) {
    return /^[a-z]$/.test(key)
  }

  // 处理键盘事件
  function handleKeydown (e) {
    if (!window.AIIME) return
    const config = window.AIIME.getConfig()
    if (!config.enabled || !config.apiKey) return

    const textarea = e.target
    if (textarea.tagName !== 'TEXTAREA') return

    const { key } = e

    // 字母键：累积输入缓冲
    if (isPinyinChar(key)) {
      inputBuffer += key
      isActive = true
      scheduleRequest()
      return
    }

    // 空格/回车/数字/标点：提交
    if (key === ' ' || key === 'Enter' || key === 'Tab' ||
        /^[0-9]$/.test(key) || key.length === 1) {
      if (isActive) {
        inputBuffer = ''
        isActive = false
        if (panel) panel.style.display = 'none'
      }
      return
    }

    // 退格
    if (key === 'Backspace') {
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1)
        if (inputBuffer.length === 0) {
          isActive = false
          if (panel) panel.style.display = 'none'
        } else {
          scheduleRequest()
        }
      }
      return
    }

    // Escape
    if (key === 'Escape') {
      inputBuffer = ''
      isActive = false
      if (panel) panel.style.display = 'none'
      return
    }
  }

  // composition events（中文输入法）
  function handleCompositionEnd (e) {
    inputBuffer = ''
    isActive = false
    if (panel) panel.style.display = 'none'

    if (window.AIIME && window.AIIME.updateContext) {
      const textarea = e.target
      if (textarea.tagName === 'TEXTAREA') {
        window.AIIME.updateContext(textarea.value)
      }
    }
  }

  // 防抖请求
  function scheduleRequest () {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (inputBuffer.length >= 1) {
        requestAICandidates()
      }
    }, 400)
  }

  // 请求 AI 候选词
  async function requestAICandidates () {
    if (!window.AIIME || inputBuffer.length === 0) return

    const config = window.AIIME.getConfig()
    if (!config.enabled || !config.apiKey) return

    const p = createPanel()
    p.innerHTML = '<span style="color:#888;font-size:12px;padding:4px 8px;">🤖 thinking...</span>'
    p.style.display = 'flex'

    try {
      const textarea = document.querySelector('textarea')
      const context = textarea ? textarea.value.slice(-50) : ''
      const candidates = await window.AIIME.generateAICandidates(inputBuffer, context)
      showCandidates(candidates)
    } catch (err) {
      console.error('[AI Bridge v2] Error:', err)
      p.innerHTML = '<span style="color:#f44336;font-size:12px;padding:4px 8px;">🤖 error</span>'
    }
  }

  // 初始化
  function init () {
    console.log('[AI Bridge v2] Initializing...')

    const checkAI = setInterval(() => {
      if (window.AIIME) {
        clearInterval(checkAI)
        console.log('[AI Bridge v2] AI IME module found, attaching listeners')
        document.addEventListener('keydown', handleKeydown, true)
        document.addEventListener('compositionend', handleCompositionEnd, true)
      }
    }, 500)

    setTimeout(() => clearInterval(checkAI), 10000)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
