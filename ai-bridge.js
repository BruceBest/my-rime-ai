/**
 * AI Bridge - 连接 RIME 输入法面板与 AI 候选词模块
 * 监听 RIME 面板 DOM 变化，自动注入 AI 候选词
 */
;(function () {
  'use strict'

  let aiContainer = null
  let lastInput = ''
  let debounceTimer = null
  let panelObserver = null

  // 从 RIME 面板提取当前拼音输入
  function getPinyinInput () {
    // naive-ui n-popover > n-text[type="info"] 包含 preEditBody
    const popover = document.querySelector('.n-popover')
    if (!popover) return ''

    // 找 type="info" 的 span (preEditBody)
    const infoEls = popover.querySelectorAll('.n-text--info')
    for (const el of infoEls) {
      const text = el.textContent?.trim()
      if (text) return text
    }

    // fallback: 找第二个 n-text
    const textEls = popover.querySelectorAll('[class*="n-text"]')
    if (textEls.length >= 2) {
      return textEls[1].textContent?.trim() || ''
    }

    return ''
  }

  // 创建 AI 候选词容器
  function createAIContainer (menuEl) {
    if (aiContainer && aiContainer.parentNode) {
      aiContainer.remove()
    }

    aiContainer = document.createElement('div')
    aiContainer.id = 'ai-candidates'
    aiContainer.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      padding: 4px 0;
      border-top: 1px dashed rgba(76, 175, 80, 0.3);
      margin-top: 4px;
    `

    // 插入到菜单后面
    menuEl.parentNode.insertBefore(aiContainer, menuEl.nextSibling)
    return aiContainer
  }

  // 显示 AI 候选词
  function showAICandidates (container, candidates) {
    container.innerHTML = ''

    if (!candidates || candidates.length === 0) {
      container.style.display = 'none'
      return
    }

    container.style.display = 'flex'

    candidates.forEach(candidate => {
      const text = typeof candidate === 'string' ? candidate : (candidate.text || candidate)
      const btn = document.createElement('span')
      btn.textContent = '🤖 ' + text
      btn.style.cssText = `
        display: inline-block;
        padding: 2px 8px;
        margin: 1px 2px;
        background: rgba(76, 175, 80, 0.1);
        border: 1px solid rgba(76, 175, 80, 0.3);
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        color: #4CAF50;
        white-space: nowrap;
        transition: background 0.15s;
      `
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(76, 175, 80, 0.25)'
      })
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(76, 175, 80, 0.1)'
      })
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        insertText(text)
      })
      container.appendChild(btn)
    })
  }

  // 插入文本到 textarea
  function insertText (text) {
    const textarea = document.querySelector('textarea')
    if (!textarea) return

    const { selectionStart, selectionEnd, value } = textarea
    const newValue = value.slice(0, selectionStart) + text + value.slice(selectionEnd)

    // 触发 Vue 的 v-model 更新
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    ).set
    nativeInputValueSetter.call(textarea, newValue)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))

    // 设置光标位置
    const newPos = selectionStart + text.length
    textarea.selectionStart = newPos
    textarea.selectionEnd = newPos
    textarea.focus()

    // 清除 AI 候选
    if (aiContainer) {
      aiContainer.innerHTML = ''
      aiContainer.style.display = 'none'
    }

    // 更新 AI 上下文
    if (window.AIIME && window.AIIME.updateContext) {
      window.AIIME.updateContext(newValue)
    }
  }

  // 处理输入变化
  function handleInputChange (pinyinInput) {
    if (!window.AIIME) return

    const config = window.AIIME.getConfig()
    if (!config.enabled || !config.apiKey) return

    if (!pinyinInput || pinyinInput === lastInput) return
    lastInput = pinyinInput

    // debounce: 等用户停顿 300ms 再请求
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      const menuEl = document.querySelector('.n-popover .n-menu')
      if (!menuEl) return

      const container = createAIContainer(menuEl)
      container.innerHTML = '<span style="color:#888;font-size:12px;padding:2px 8px;">🤖 AI thinking...</span>'
      container.style.display = 'flex'

      try {
        const textarea = document.querySelector('textarea')
        const context = textarea ? textarea.value.slice(-50) : ''
        const candidates = await window.AIIME.generateAICandidates(pinyinInput, context)
        showAICandidates(container, candidates)
      } catch (err) {
        console.error('[AI Bridge] Error:', err)
        container.innerHTML = '<span style="color:#f44336;font-size:12px;padding:2px 8px;">🤖 AI error</span>'
      }
    }, 300)
  }

  // 观察 RIME 面板
  function observePanel () {
    // 监听整个 body 的子树变化，检测 RIME 面板出现/内容更新
    const bodyObserver = new MutationObserver((mutations) => {
      const popover = document.querySelector('.n-popover')
      if (!popover) {
        lastInput = ''
        return
      }

      // 检查 preEditBody 是否变化
      const pinyinInput = getPinyinInput()
      if (pinyinInput && pinyinInput !== lastInput) {
        handleInputChange(pinyinInput)
      }

      // 如果面板关闭（不可见），清理
      const style = window.getComputedStyle(popover)
      if (style.display === 'none' || style.visibility === 'hidden') {
        lastInput = ''
        if (aiContainer) {
          aiContainer.innerHTML = ''
          aiContainer.style.display = 'none'
        }
      }
    })

    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    })

    return bodyObserver
  }

  // 也监听 textarea 的输入事件（补充）
  function observeTextarea () {
    const textarea = document.querySelector('textarea')
    if (!textarea) return

    textarea.addEventListener('input', () => {
      // textarea 输入时，检查 RIME 面板是否有 pinyin
      setTimeout(() => {
        const pinyinInput = getPinyinInput()
        if (pinyinInput) {
          handleInputChange(pinyinInput)
        }
      }, 100)
    })
  }

  // 初始化
  function init () {
    console.log('[AI Bridge] Initializing...')

    // 等 AI IME 模块加载
    const checkAI = setInterval(() => {
      if (window.AIIME) {
        clearInterval(checkAI)
        console.log('[AI Bridge] AI IME module found, starting observation')
        observePanel()
        // 延迟绑定 textarea（等 Vue 渲染完）
        setTimeout(observeTextarea, 2000)
      }
    }, 500)

    // 10秒后如果还没找到，放弃
    setTimeout(() => clearInterval(checkAI), 10000)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
