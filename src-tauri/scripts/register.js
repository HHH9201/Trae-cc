(function() {
  'use strict';
  
  // 立即标记脚本已加载
  if (window.__traeAutoRegisterScriptLoaded) {
    console.log('[TraeAuto] 脚本已加载，跳过重复注入');
    return;
  }
  window.__traeAutoRegisterScriptLoaded = true;

  console.log('[TraeAuto] ========================================');
  console.log('[TraeAuto] 脚本开始注入 - 时间:', new Date().toISOString());
  console.log('[TraeAuto] 当前页面URL:', location.href);
  console.log('[TraeAuto] 当前页面标题:', document.title);
  console.log('[TraeAuto] document.readyState:', document.readyState);
  console.log('[TraeAuto] ========================================');
  
  // 立即发送一条测试日志到 Rust
  setTimeout(() => {
    console.log('[TraeAuto] 脚本注入成功，测试日志发送中...');
  }, 100);

  const callback = "http://127.0.0.1:__PORT__/callback";

  const sendPayload = (payload) => {
    const params = new URLSearchParams();
    Object.keys(payload || {}).forEach((key) => {
      const value = payload[key];
      if (value === undefined || value === null || value === "") return;
      params.append(key, value);
    });
    const url = callback + "?" + params.toString();
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url);
    } else {
      fetch(url, { mode: "no-cors" });
    }
  };

  const sendLog = (msg) => {
    console.log('[TraeAuto] ' + msg);
    sendPayload({ log: msg });
  };

  // ========== 页面导航监控 ==========
  let lastUrl = location.href;
  const checkUrlChange = () => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      sendLog('🔄 页面URL变化: ' + lastUrl + ' -> ' + currentUrl);
      lastUrl = currentUrl;
    }
  };
  setInterval(checkUrlChange, 500);

  // 监控 history 变化
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    sendLog('📜 history.pushState 被调用, 参数: ' + JSON.stringify(args));
    originalPushState.apply(this, args);
    checkUrlChange();
  };
  
  history.replaceState = function(...args) {
    sendLog('📜 history.replaceState 被调用, 参数: ' + JSON.stringify(args));
    originalReplaceState.apply(this, args);
    checkUrlChange();
  };

  window.addEventListener('popstate', () => {
    sendLog('📜 浏览器后退/前进按钮被点击');
    checkUrlChange();
  });

  // ========== DOM 监控 ==========
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            // 监控输入框出现
            if (node.tagName === 'INPUT') {
              sendLog('🆕 DOM新增输入框: type=' + node.type + ', placeholder=' + (node.placeholder || '无') + ', name=' + (node.name || '无'));
            }
            // 监控按钮出现
            if (node.tagName === 'BUTTON' || (node.tagName === 'DIV' && node.getAttribute('role') === 'button')) {
              sendLog('🆕 DOM新增按钮: text=' + (node.innerText || '').substring(0, 50));
            }
          }
        });
      }
    });
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  sendLog('👁️ DOM变化监控已启动');

  const parseToken = (data) => {
    sendLog('🔍 开始解析Token，数据类型: ' + typeof data);
    if (!data) {
      sendLog('⚠️ 解析Token失败: 数据为空');
      return null;
    }
    
    let token = (
      data.result?.token ||
      data.result?.Token ||
      data.Result?.token ||
      data.Result?.Token ||
      data.data?.token ||
      data.Data?.Token ||
      data.token ||
      data.Token ||
      null
    );
    
    if (token) {
      sendLog('✅ Token解析成功: ' + token.substring(0, 20) + '...');
    } else {
      sendLog('⚠️ Token解析失败: 未在数据中找到token字段');
    }
    
    return token;
  };

  const normalizeUrl = (raw) => {
    if (!raw) return "";
    try {
      return new URL(raw, location.href).toString();
    } catch {
      return raw;
    }
  };

  const setValue = (input, value) => {
    if (!input) {
      sendLog('❌ setValue失败: 输入框为空');
      return false;
    }
    
    sendLog('📝 开始设置输入框值:');
    sendLog('   - 输入框类型: ' + input.type);
    sendLog('   - 输入框名称: ' + (input.name || '无'));
    sendLog('   - 输入框placeholder: ' + (input.placeholder || '无'));
    sendLog('   - 目标值长度: ' + value.length);
    sendLog('   - 当前值: ' + (input.value ? input.value.substring(0, 20) + '...' : '空'));
    
    // 聚焦输入框
    sendLog('   - 步骤1: 聚焦输入框');
    input.focus();
    input.click();
    
    // 直接设置 value
    sendLog('   - 步骤2: 直接设置value属性');
    input.value = value;
    
    // 触发 React 的 valueTracker
    sendLog('   - 步骤3: 触发React valueTracker');
    const tracker = input._valueTracker;
    if (tracker) {
      tracker.setValue('');
      sendLog('     ✓ valueTracker已触发');
    } else {
      sendLog('     ⚠️ 未找到valueTracker');
    }
    
    // 触发所有必要的事件
    sendLog('   - 步骤4: 触发DOM事件');
    const events = ["focus", "input", "change", "blur"];
    events.forEach(eventType => {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      input.dispatchEvent(event);
    });
    sendLog('     ✓ 事件已触发: ' + events.join(', '));
    
    // 模拟键盘输入
    sendLog('   - 步骤5: 模拟键盘输入 (' + value.length + '个字符)');
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: 'Key' + char.toUpperCase(), bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: char, charCode: char.charCodeAt(0), bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: char, code: 'Key' + char.toUpperCase(), bubbles: true }));
    }
    
    // 最后触发 blur
    sendLog('   - 步骤6: 触发blur事件');
    input.blur();
    
    // 验证结果
    const success = input.value === value;
    sendLog('   - 设置结果: ' + (success ? '✅ 成功' : '❌ 失败'));
    sendLog('   - 设置后值: ' + (input.value ? input.value.substring(0, 30) + '...' : '空'));
    
    return success;
  };

  const findInputByLabel = (labels) => {
    sendLog('🔍 通过label查找输入框，关键词: ' + labels.join(', '));
    const labelEls = Array.from(document.querySelectorAll("label"));
    for (const label of labelEls) {
      const text = (label.innerText || "").toLowerCase();
      if (!labels.some((l) => text.includes(l))) continue;
      const forId = label.getAttribute("for");
      if (forId) {
        const target = document.getElementById(forId);
        if (target) {
          sendLog('✅ 通过label找到输入框: for=' + forId);
          return target;
        }
      }
      const nested = label.querySelector("input");
      if (nested) {
        sendLog('✅ 在label内找到嵌套输入框');
        return nested;
      }
    }
    sendLog('⚠️ 通过label未找到输入框');
    return null;
  };

  const findInput = (labels, selectors) => {
    sendLog('🔍 开始查找输入框:');
    sendLog('   - 标签关键词: ' + labels.join(', '));
    sendLog('   - CSS选择器: ' + selectors.join(', '));
    
    const byLabel = findInputByLabel(labels);
    if (byLabel) return byLabel;
    
    for (const selector of selectors) {
      sendLog('   - 尝试选择器: ' + selector);
      const el = document.querySelector(selector);
      if (el) {
        sendLog('✅ 找到输入框: ' + selector);
        return el;
      }
    }
    sendLog('❌ 所有选择器都未找到输入框');
    return null;
  };

  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0;
    if (!visible) {
      sendLog('   ⚠️ 元素不可见: width=' + rect.width + ', height=' + rect.height);
    }
    return visible;
  };

  const isClickable = (el) => {
    if (!el || el.disabled) {
      sendLog('   ⚠️ 元素不可点击: disabled=' + (el && el.disabled));
      return false;
    }
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "button" || tag === "a" || tag === "input") return true;
    const role = el.getAttribute && el.getAttribute("role");
    if (role === "button") return true;
    const style = window.getComputedStyle(el);
    if (style && style.cursor === "pointer") return true;
    return !!el.onclick;
  };

  const findClickableAncestor = (el) => {
    let current = el;
    let depth = 0;
    while (current && depth < 4) {
      if (isClickable(current)) {
        sendLog('   ✓ 找到可点击祖先元素 (深度' + depth + '): ' + current.tagName);
        return current;
      }
      current = current.parentElement;
      depth += 1;
    }
    sendLog('   ⚠️ 未找到可点击祖先元素');
    return null;
  };

  const findClickableByText = (labels, scope) => {
    sendLog('🔍 通过文本查找可点击元素: ' + labels.join(', '));
    const root = scope || document;
    const candidates = Array.from(
      root.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit'], a, div, span")
    );
    sendLog('   - 候选元素数量: ' + candidates.length);
    
    const found = candidates.find((el) => {
      if (!isVisible(el)) return false;
      const text = (el.innerText || el.textContent || "").toLowerCase();
      if (!text) return false;
      if (!labels.some((label) => text.includes(label))) return false;
      return isClickable(el);
    });
    
    if (found) {
      sendLog('✅ 通过文本找到元素: "' + (found.innerText || '').substring(0, 30) + '"');
    } else {
      sendLog('⚠️ 通过文本未找到元素');
    }
    return found || null;
  };

  const runWithRetry = (fn, maxTries = 40) => {
    sendLog('🔄 开始重试执行，最大次数: ' + maxTries);
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      sendLog('   - 第 ' + tries + ' 次尝试...');
      const ok = fn();
      if (ok || tries >= maxTries) {
        sendLog('   - 重试结束: ' + (ok ? '成功' : '达到最大次数'));
        clearInterval(timer);
      }
    }, 500);
  };

  const findTextNodeElement = (labels) => {
    sendLog('🔍 通过文本节点查找元素: ' + labels.join(', '));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.nodeValue) continue;
      const text = (node.nodeValue || "").toLowerCase();
      if (!text) continue;
      if (labels.some((label) => text.includes(label))) {
        sendLog('✅ 找到文本节点: "' + text.substring(0, 30) + '"');
        return node.parentElement;
      }
    }
    sendLog('⚠️ 未找到匹配的文本节点');
    return null;
  };

  const clickByText = (labels) => {
    sendLog('🖱️ 通过文本点击元素: ' + labels.join(', '));
    const element = findTextNodeElement(labels);
    if (!element) {
      sendLog('❌ 未找到可点击的文本元素');
      return false;
    }
    const clickable = findClickableAncestor(element) || element;
    sendLog('   - 点击元素: ' + clickable.tagName);
    clickable.click();
    sendLog('✅ 点击完成');
    return true;
  };

  const tryAcceptCookies = () => {
    sendLog('🍪 尝试接受Cookie...');
    const cookieSelectors = [
      'button.cm__btn',
      '.cm__btn[role="button"]',
      '.cm__btn'
    ];
    for (const selector of cookieSelectors) {
      const btn = document.querySelector(selector);
      if (btn && isVisible(btn)) {
        sendLog('✅ 找到Cookie按钮: ' + selector);
        btn.click();
        return true;
      }
    }
    const btn = findClickableByText(["got it", "accept", "agree", "允许", "同意"], document);
    if (btn) {
      sendLog('✅ 通过文本找到Cookie按钮');
      btn.click();
      return true;
    }
    const wrapper = document.querySelector(".cm-wrapper, .cc__wrapper, ".cookie-banner", ".cookie-consent");
    if (wrapper) {
      sendLog('✅ 找到Cookie横幅，直接移除');
      wrapper.remove();
      return true;
    }
    sendLog('⚠️ 未找到Cookie弹窗');
    return false;
  };

  // ========== tryStart: 填入邮箱并点击Send Code ==========
  // 全局状态，用于跟踪是否已点击过 Send Code
  let hasClickedSendCode = false;

  const tryStart = (email) => {
    sendLog('');
    sendLog('========================================');
    sendLog('🚀 tryStart 开始执行');
    sendLog('========================================');
    sendLog('📧 目标邮箱: ' + (email || "null"));
    sendLog('📍 当前页面: ' + location.href);
    sendLog('📄 页面标题: ' + document.title);
    sendLog('⏱️  document.readyState: ' + document.readyState);
    sendLog('🔘 已点击 Send Code: ' + hasClickedSendCode);

    let emailFilled = false;
    let emailInput = null;

    const tryFindAndFill = () => {
      sendLog('');
      sendLog('--- 开始一轮查找和填入 ---');
      
      // 尝试接受Cookie
      const cookieAccepted = tryAcceptCookies();
      if (cookieAccepted) {
        sendLog('✅ Cookie已处理');
      }

      if (document.readyState === "loading") {
        sendLog('⏳ 页面仍在loading，等待...');
        return false;
      }

      // 查找邮箱输入框
      if (!emailInput) {
        sendLog('');
        sendLog('🔍 步骤1: 查找邮箱输入框');
        
        // 方法1: 通过 placeholder 查找
        sendLog('   方法1: 通过placeholder查找...');
        emailInput = document.querySelector('input[placeholder*="Email"]') ||
                     document.querySelector('input[placeholder*="邮箱"]');
        if (emailInput) sendLog('   ✅ 通过placeholder找到');
        
        // 方法2: 通过 type 查找
        if (!emailInput) {
          sendLog('   方法2: 通过type="email"查找...');
          emailInput = document.querySelector('input[type="email"]');
          if (emailInput) sendLog('   ✅ 通过type找到');
        }
        
        // 方法3: 通过 name 查找
        if (!emailInput) {
          sendLog('   方法3: 通过name="email"查找...');
          emailInput = document.querySelector('input[name="email"]');
          if (emailInput) sendLog('   ✅ 通过name找到');
        }
        
        // 方法4: 通过 autocomplete 查找
        if (!emailInput) {
          sendLog('   方法4: 通过autocomplete="email"查找...');
          emailInput = document.querySelector('input[autocomplete="email"]');
          if (emailInput) sendLog('   ✅ 通过autocomplete找到');
        }
        
        // 方法5: 获取所有 input
        if (!emailInput) {
          sendLog('   方法5: 遍历所有text输入框...');
          const inputs = document.querySelectorAll('input[type="text"]');
          sendLog('   - 找到 ' + inputs.length + ' 个text输入框');
          for (const input of inputs) {
            const placeholder = (input.placeholder || "").toLowerCase();
            sendLog('   - 检查: placeholder="' + placeholder + '"');
            if (!placeholder.includes("code") && !placeholder.includes("verification") && !placeholder.includes("验证码")) {
              emailInput = input;
              sendLog('   ✅ 通过遍历找到(非验证码输入框)');
              break;
            }
          }
        }

        if (emailInput) {
          sendLog('');
          sendLog('✅ 成功找到邮箱输入框:');
          sendLog('   - tagName: ' + emailInput.tagName);
          sendLog('   - type: ' + emailInput.type);
          sendLog('   - name: ' + (emailInput.name || '无'));
          sendLog('   - placeholder: ' + (emailInput.placeholder || '无'));
          sendLog('   - id: ' + (emailInput.id || '无'));
          sendLog('   - className: ' + (emailInput.className || '无'));
        } else {
          sendLog('❌ 未找到邮箱输入框');
          return false;
        }
      }

      // 填入邮箱
      sendLog('');
      sendLog('🔍 步骤2: 填入邮箱');
      if (emailInput.value !== email) {
        sendLog('   - 当前值与目标值不同，需要填入');
        const success = setValue(emailInput, email);
        if (!success) {
          sendLog('❌ 填入邮箱失败');
          return false;
        }
      } else {
        sendLog('   - 当前值已与目标值相同，无需填入');
      }
      
      // 验证填入结果
      if (emailInput.value !== email) {
        sendLog('❌ 验证失败: 填入后值仍不匹配');
        sendLog('   - 期望值: ' + email);
        sendLog('   - 实际值: ' + emailInput.value);
        return false;
      }
      
      sendLog('✅ 邮箱已成功填入: ' + emailInput.value);
      emailFilled = true;

      // 查找验证码输入框
      sendLog('');
      sendLog('🔍 步骤3: 查找验证码输入框');
      const codeInput = findInput(["verification", "code", "验证码", "验证"], [
        'input[name="code"]',
        'input[placeholder*="Verification"]',
        'input[placeholder*="Code"]'
      ]);
      sendLog('   结果: ' + (codeInput ? '✅ 已找到' : '❌ 未找到'));

      // 查找Send Code按钮
      sendLog('');
      sendLog('🔍 步骤4: 查找【Send Code】按钮');
      const labels = ["send code", "send verification", "get code", "发送验证码", "获取验证码", "发送码", "send"];
      
      // 根据用户提供的HTML结构，精确匹配选择器
      const sendCodeSelectors = [
        // 最精确的选择器（基于用户提供的HTML）
        ".verification-code .right-part.send-code",
        ".cliMhU.verification-code .right-part.send-code",
        ".sc-eqUAAy.cliMhU.verification-code .right-part",
        // 通过文本内容查找
        ".right-part",
        // 验证码输入框的父元素内的 .right-part
        ".verification-code .input-con .right-part",
        // 通用的 send-code 类
        ".send-code",
        "[class*='send-code']",
        // 通过兄弟元素查找（验证码输入框后面的按钮）
        "input[placeholder='Verification code'] ~ .right-part",
        "input[placeholder*='Verification'] ~ .right-part",
        // 更通用的选择器
        ".input-con .right-part",
        ".sc-dhKdcB .right-part",
        // 基于文本内容的选择器
        "div:contains('Send Code')",
        ".right-part:contains('Send')"
      ];

      sendLog('   - 尝试选择器列表:');
      const scope = codeInput ? codeInput.parentElement || codeInput.closest("div") : null;
      if (scope) {
        sendLog('     搜索范围: 验证码输入框的父元素');
      }
      
      let btn = null;
      for (const selector of sendCodeSelectors) {
        sendLog('     - 尝试选择器: ' + selector);
        try {
          const candidates = document.querySelectorAll(selector);
          sendLog('       找到 ' + candidates.length + ' 个候选');
          for (const candidate of candidates) {
             if (candidate && isVisible(candidate)) {
                const text = (candidate.innerText || candidate.textContent || "").trim();
                sendLog('       检查候选: text="' + text + '", class="' + candidate.className + '"');
                
                // 跳过只有svg图标没有文本的元素（如眼睛图标）
                if (candidate.innerHTML && candidate.innerHTML.includes("svg") && !text) {
                    sendLog('       跳过: 包含svg图标但无文本');
                    continue;
                }
                
                // 优先选择包含 "Send Code" 文本的元素
                if (text.toLowerCase().includes("send code") || text.toLowerCase().includes("send")) {
                  btn = candidate;
                  sendLog('       ✅ 找到包含 "Send Code" 文本的按钮');
                  break;
                }
                
                // 如果没有找到更匹配的，使用第一个有效的
                if (!btn) {
                  btn = findClickableAncestor(candidate) || candidate;
                  sendLog('       ✓ 找到有效按钮（备用）');
                }
             }
          }
          if (btn && (btn.innerText || btn.textContent || "").trim().toLowerCase().includes("send code")) {
            sendLog('     ✅ 已找到最佳匹配，停止搜索');
            break;
          }
        } catch (e) {
          sendLog('       选择器执行错误: ' + e.message);
        }
      }

      if (btn) {
        const btnText = (btn.innerText || btn.textContent || "").trim();
        sendLog('   - 按钮文本: "' + btnText + '"');
        sendLog('   - 按钮标签: ' + btn.tagName);
        sendLog('   - 按钮类名: ' + (btn.className || '无'));
      }

      if (!btn) {
        sendLog('   - 尝试通过文本查找...');
        btn = findClickableByText(labels, scope);
      }
      if (!btn) {
        sendLog('   - 尝试全局文本查找...');
        btn = findClickableByText(labels, document);
      }

      if (btn) {
        const btnText = (btn.innerText || btn.textContent || "").trim();
        if (!btnText && btn.innerHTML && btn.innerHTML.includes("svg") && btn.className.includes("right-part")) {
           sendLog('   ⚠️ 警告: 找到的是小眼睛图标，丢弃！');
           btn = null;
        }
      }

      if (!btn) {
        sendLog('   - 尝试遍历right-part div...');
        const possibleDivs = document.querySelectorAll("div.right-part");
        sendLog('     找到 ' + possibleDivs.length + ' 个right-part div');
        for (const div of possibleDivs) {
           const t = (div.innerText || div.textContent || "").trim().toLowerCase();
           sendLog('     - 检查: "' + t + '"');
           if (t === "send code" || t === "send" || t === "发送验证码") {
              btn = findClickableAncestor(div) || div;
              sendLog('     ✅ 匹配成功！');
              break;
           }
        }
      }

      if (!btn) {
        sendLog('   - 尝试clickByText...');
        if (clickByText(labels)) {
          sendLog('✅ 通过clickByText点击成功');
          return true;
        }
      }

      if (btn) {
        const btnText = (btn.innerText || btn.textContent || "").trim();
        sendLog('');
        sendLog('✅ 最终确认使用按钮:');
        sendLog('   - 文本: "' + btnText + '"');
        sendLog('   - disabled: ' + btn.disabled);
        sendLog('   - className: ' + btn.className);
        sendLog('   - tagName: ' + btn.tagName);
        
        // 检查按钮状态
        if (/\d+s/.test(btnText) || btnText.includes("已发送") || btnText.includes("resend") || btnText.includes("Resend")) {
           sendLog('   ⏱️ 按钮显示倒计时或已发送状态，标记为已点击');
           hasClickedSendCode = true;
           return true;
        }

        sendLog('');
        sendLog('🖱️ 开始点击按钮...');

        // 确保按钮可交互
        if (btn.disabled) {
          sendLog('   按钮被禁用，尝试启用...');
          btn.disabled = false;
          btn.removeAttribute('disabled');
        }

        // 滚动到按钮位置（确保在视口内）
        sendLog('   - 滚动到按钮位置');
        btn.scrollIntoView({ behavior: 'instant', block: 'center' });

        sendLog('   - 分发鼠标事件序列...');
        
        // 完整的鼠标事件序列
        const mouseEvents = [
          new MouseEvent("mouseenter", { bubbles: true, cancelable: true, view: window }),
          new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }),
          new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window, button: 0 }),
          new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window, button: 0 }),
          new MouseEvent("click", { bubbles: true, cancelable: true, view: window, button: 0 })
        ];
        
        mouseEvents.forEach((event, index) => {
          sendLog('     事件 ' + (index + 1) + '/' + mouseEvents.length + ': ' + event.type);
          btn.dispatchEvent(event);
        });
        
        // 直接调用 click 方法
        sendLog('   - 直接调用 click() 方法');
        btn.click();
        
        // 触发表单提交（如果按钮在表单内）
        const form = btn.closest('form');
        if (form) {
          sendLog('   - 触发表单相关事件');
          form.dispatchEvent(new Event('input', { bubbles: true }));
          form.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        sendLog('✅ 主要点击事件完成');
        
        // 标记为已点击
        hasClickedSendCode = true;
        sendLog('🔘 已设置 hasClickedSendCode = true');

        // 多次重试点击
        const retryDelays = [100, 300, 500, 800, 1000];
        retryDelays.forEach((delay, index) => {
          setTimeout(() => {
            sendLog('⏱️ 延迟' + delay + 'ms后第' + (index + 1) + '次重试点击');
            if (btn && !btn.disabled) {
              btn.click();
              btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
            }
          }, delay);
        });
        
        return true;
      }

      sendLog('❌ 未能找到【Send Code】按钮');
      return false;
    };

    const result = tryFindAndFill();
    sendLog('');
    sendLog('========================================');
    sendLog('tryStart 执行结果: ' + (result ? '✅ 成功' : '⏳ 未完成，需要重试'));
    sendLog('========================================');
    return result;
  };

  // ========== tryComplete: 填入验证码和密码 ==========
  const tryComplete = (code, password) => {
    sendLog('');
    sendLog('========================================');
    sendLog('🚀 tryComplete 开始执行');
    sendLog('========================================');
    sendLog('🔢 验证码: ' + (code ? code.substring(0,3) + "***" : "null"));
    sendLog('🔑 密码: 已传入 (长度' + password.length + ')');
    sendLog('📍 当前页面: ' + location.href);
    sendLog('📄 页面标题: ' + document.title);
    sendLog('⏱️  document.readyState: ' + document.readyState);
    
    tryAcceptCookies();

    sendLog('');
    sendLog('🔍 步骤1: 查找验证码输入框');
    let codeInput = document.querySelector('input[placeholder*="Verification code"]') || 
                    document.querySelector('input[placeholder*="验证码"]') ||
                    document.querySelector('input[maxlength="6"]') ||
                    document.querySelector('input[type="text"]:not([name="email"])');
    
    if (!codeInput) {
      sendLog('   基础选择器未找到，使用findInput...');
      codeInput = findInput(["verification", "code"], [
        'input[name="code"]',
        'input[placeholder*="Verification"]',
        'input[placeholder*="Code"]',
        'input[type="text"]',
        'input[maxlength="6"]'
      ]);
    }
    
    sendLog('   结果: ' + (codeInput ? '✅ 已找到' : '❌ 未找到'));
    if (codeInput) {
      sendLog('   - tagName: ' + codeInput.tagName);
      sendLog('   - type: ' + codeInput.type);
      sendLog('   - placeholder: ' + (codeInput.placeholder || '无'));
    }
    
    sendLog('');
    sendLog('🔍 步骤2: 查找密码输入框');
    let passInput = document.querySelector('input[type="password"]') ||
                    document.querySelector('input[name="password"]') ||
                    document.querySelector('input[autocomplete="new-password"]') ||
                    document.querySelector('input[placeholder*="Password"]') ||
                    document.querySelector('input[placeholder*="密码"]');
    
    if (!passInput) {
      sendLog('   基础选择器未找到，使用findInput...');
      passInput = findInput(["password"], [
        'input[type="password"]',
        'input[name="password"]',
        'input[autocomplete="new-password"]'
      ]);
    }
    
    sendLog('   结果: ' + (passInput ? '✅ 已找到' : '❌ 未找到'));
    if (passInput) {
      sendLog('   - tagName: ' + passInput.tagName);
      sendLog('   - type: ' + passInput.type);
      sendLog('   - name: ' + (passInput.name || '无'));
    }

    sendLog('');
    sendLog('🔍 步骤3: 填入验证码');
    if (codeInput) {
      sendLog('   开始填入验证码...');
      const success = setValue(codeInput, code);
      sendLog('   填入结果: ' + (success ? '✅ 成功' : '❌ 失败'));
      sendLog('   填入后值: "' + codeInput.value + '"');
    } else {
      sendLog('❌ 未找到验证码输入框，跳过');
    }
    
    sendLog('');
    sendLog('🔍 步骤4: 填入密码');
    if (passInput) {
      sendLog('   开始填入密码...');
      const success = setValue(passInput, password);
      sendLog('   填入结果: ' + (success ? '✅ 成功' : '❌ 失败'));
      sendLog('   填入后值长度: ' + passInput.value.length);
    } else {
      sendLog('❌ 未找到密码输入框，跳过');
    }

    // 点击提交按钮
    sendLog('');
    sendLog('🔍 步骤5: 查找并点击注册按钮');
    const clickSubmitButton = () => {
      sendLog('   开始查找注册按钮...');
      tryAcceptCookies();
      
      // 重新查找输入框（防止页面刷新后丢失）
      const currentCodeInput = codeInput || findInput(["verification", "code"], [
        'input[name="code"]',
        'input[placeholder*="Verification"]',
        'input[placeholder*="Code"]'
      ]);
      const currentPassInput = passInput || findInput(["password"], [
        'input[type="password"]',
        'input[name="password"]'
      ]);

      if (currentCodeInput && !codeInput) {
        sendLog('   重新找到验证码框，补填...');
        setValue(currentCodeInput, code);
      }
      if (currentPassInput && !passInput) {
        sendLog('   重新找到密码框，补填...');
        setValue(currentPassInput, password);
      }

      // 查找表单
      sendLog('   查找表单...');
      const form = currentPassInput?.closest("form") || currentCodeInput?.closest("form");
      if (form) {
        sendLog('   ✅ 找到表单，触发submit事件');
        const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);
      } else {
        sendLog('   ⚠️ 未找到表单');
      }

      // 查找注册按钮
      sendLog('   查找注册按钮...');
      const signUpSelectors = [
        // 基于用户提供的HTML结构
        ".sc-gEvEer.fQLTLP.btn-submit",
        ".btn-submit.btn-large.trae__btn",
        ".sc-gEvEer .content:contains('Sign Up')",
        // 通用选择器
        ".btn-submit",
        ".trae__btn",
        ".btn-large",
        ".btn-submit.trae__btn",
        "button[type='submit']",
        "button.btn-primary",
        "button.primary",
        "button[class*='submit']",
        "button[class*='primary']",
        // 基于文本
        "div:contains('Sign Up')",
        ".content:contains('Sign Up')"
      ];
      
      let submitBtn = null;
      for (const selector of signUpSelectors) {
        sendLog('     - 尝试: ' + selector);
        const btn = document.querySelector(selector);
        if (btn && isVisible(btn)) {
          submitBtn = btn;
          sendLog('     ✅ 找到按钮: ' + selector);
          break;
        }
      }

      if (!submitBtn) {
        sendLog('   - 通过文本查找...');
        submitBtn = findClickableByText(["sign up", "register", "create account", "注册", "创建账号"], document);
      }

      if (submitBtn) {
        const btnText = (submitBtn.innerText || submitBtn.textContent || "").trim();
        sendLog('   ✅ 找到注册按钮: "' + btnText.substring(0, 30) + '"');
        sendLog('   🖱️ 开始点击...');
        
        submitBtn.focus();
        submitBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        submitBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        submitBtn.click();
        submitBtn.dispatchEvent(new Event("click", { bubbles: true }));
        
        sendLog('   ✅ 点击完成');
        
        setTimeout(() => {
          sendLog('   ⏱️ 延迟300ms后再次点击');
          submitBtn.click();
        }, 300);
        setTimeout(() => {
          sendLog('   ⏱️ 延迟800ms后第三次点击');
          submitBtn.click();
        }, 800);
      } else {
        sendLog('   ❌ 未找到注册按钮');
      }
    };

    setTimeout(clickSubmitButton, 300);
    
    sendLog('');
    sendLog('========================================');
    sendLog('tryComplete 执行完成');
    sendLog('========================================');
  };

  // ========== 初始化 ==========
  console.log('[TraeAuto] 开始初始化...');
  
  window.__traeAutoRegister = {
    start: (email) => {
      sendLog('');
      sendLog('🎯 __traeAutoRegister.start() 被调用');
      sendLog('   参数 email: ' + (email ? email.substring(0, 10) + '...' : 'null'));
      runWithRetry(() => tryStart(email));
    },
    complete: (code, password) => {
      sendLog('');
      sendLog('🎯 __traeAutoRegister.complete() 被调用');
      sendLog('   参数 code: ' + (code ? code.substring(0, 3) + '***' : 'null'));
      sendLog('   参数 password: ' + (password ? '已传入(长度' + password.length + ')' : 'null'));
      tryComplete(code, password);
    }
  };

  // 拦截 fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
    const urlStr = typeof url === 'string' ? url : url.url;
    
    // 只拦截特定API
    if (urlStr && (urlStr.includes('GetUserToken') || urlStr.includes('login') || urlStr.includes('auth'))) {
      sendLog('🌐 fetch拦截: ' + urlStr.substring(0, 100));
      
      try {
        const response = await originalFetch.apply(this, args);
        const cloned = response.clone();
        
        cloned.json().then(data => {
          const token = parseToken(data);
          if (token) {
            sendLog('✅ 从fetch响应中提取到Token');
            sendPayload({ token: token, url: urlStr });
          }
        }).catch(e => {
          sendLog('⚠️ 解析fetch响应失败: ' + e.message);
        });
        
        return response;
      } catch (e) {
        sendLog('❌ fetch执行失败: ' + e.message);
        throw e;
      }
    }
    
    return originalFetch.apply(this, args);
  };

  // 拦截 XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  
  XMLHttpRequest.prototype.send = function(...args) {
    const url = this._url || '';
    
    if (url.includes('GetUserToken') || url.includes('login') || url.includes('auth')) {
      sendLog('🌐 XHR拦截: ' + url.substring(0, 100));
      
      this.addEventListener('load', function() {
        try {
          const data = JSON.parse(this.responseText);
          const token = parseToken(data);
          if (token) {
            sendLog('✅ 从XHR响应中提取到Token');
            sendPayload({ token: token, url: url });
          }
        } catch (e) {
          sendLog('⚠️ 解析XHR响应失败: ' + e.message);
        }
      });
    }
    
    return originalSend.apply(this, args);
  };

  console.log('[TraeAuto] ✅ 初始化完成');
  console.log('[TraeAuto] fetch和XHR拦截器已安装');
  console.log('[TraeAuto] DOM监控已启动');
  console.log('[TraeAuto] URL变化监控已启动');
  console.log('[TraeAuto] ========================================');
  
  sendLog('✅ 脚本初始化完成 - 等待指令');
})();
