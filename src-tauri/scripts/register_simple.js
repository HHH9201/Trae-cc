// 注册辅助脚本 - 简化版
// 端口: __PORT__

(function() {
    if (window.__registerHelperInstalled) return;
    window.__registerHelperInstalled = true;
    
    var callbackUrl = 'http://127.0.0.1:__PORT__/callback';
    
    console.log('[RegisterHelper] 脚本已加载，端口: __PORT__');
    
    // 发送消息到 Rust
    var sendMessage = function(type, data) {
        var fullUrl = callbackUrl + '?log=' + encodeURIComponent('[' + type + '] ' + JSON.stringify(data));
        if (navigator.sendBeacon) {
            navigator.sendBeacon(fullUrl);
        } else {
            fetch(fullUrl, { mode: 'no-cors' });
        }
    };
    
    // 监听页面变化
    var observer = new MutationObserver(function(mutations) {
        // 检查是否有邮箱输入框
        var emailInput = document.querySelector('input[type="email"]') || document.querySelector('input[name="email"]');
        if (emailInput) {
            sendMessage('EmailInput', { found: true });
        }
        
        // 检查是否有验证码输入框
        var codeInput = document.querySelector('input[placeholder*="Verification"]') || document.querySelector('input[maxlength="6"]');
        if (codeInput) {
            sendMessage('CodeInput', { found: true });
        }
        
        // 检查是否有密码输入框
        var passInput = document.querySelector('input[type="password"]');
        if (passInput) {
            sendMessage('PasswordInput', { found: true });
        }
    });
    
    // 开始监听
    observer.observe(document.body, { childList: true, subtree: true });
    
    // 拦截 fetch 请求
    var originalFetch = window.fetch;
    window.fetch = async function() {
        var url = arguments[0];
        var urlStr = typeof url === 'string' ? url : (url.url || '');
        
        try {
            var response = await originalFetch.apply(this, arguments);
            
            // 检查是否包含 token
            if (urlStr.includes('GetUserToken') || urlStr.includes('token')) {
                var cloned = response.clone();
                var data = await cloned.json();
                sendMessage('TokenResponse', { url: urlStr, data: data });
            }
            
            return response;
        } catch (e) {
            throw e;
        }
    };
    
    console.log('[RegisterHelper] 初始化完成');
})();
