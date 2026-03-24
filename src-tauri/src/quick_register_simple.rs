//! 简化版快速注册模块 - 直接使用 eval 执行 DOM 操作

use std::time::Duration;
use anyhow::anyhow;
use reqwest::Url;
use tauri::{AppHandle, Manager, State};
use tokio::sync::oneshot;
use warp::Filter;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;

use crate::{
    tempmail_client::{TempMailClient, generate_password},
    api::login_with_email,
    Account, AppState, ApiError,
};

pub async fn quick_register_simple(
    app: AppHandle,
    show_window: bool,
    state: State<'_, AppState>,
) -> Result<Account, ApiError> {
    println!("\n========================================");
    println!("[quick-register-simple] 开始快速注册流程");
    println!("========================================\n");

    // 检查是否已有浏览器登录在进行中
    if state.browser_login.lock().await.is_some() {
        return Err(ApiError::from(anyhow!("浏览器登录正在进行中，请稍后再试")));
    }

    // 初始化 TempMailClient（使用 tempmail.cn Socket.io）
    println!("[quick-register-simple] 初始化 TempMailClient...");
    let mut mail_client = TempMailClient::new();
    let password = generate_password();
    let email = mail_client.generate_email().await;
    
    if email == "error@tempmail.cn" {
        return Err(ApiError::from(anyhow!("创建临时邮箱失败，请重试")));
    }
    
    println!("[quick-register-simple] 邮箱: {}", email);
    println!("[quick-register-simple] 密码: {}******", &password[..3]);

    // 启动本地回调服务器（用于接收 JS 拦截的 Token）
    let (token_tx, _token_rx) = oneshot::channel::<(String, String)>();
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let token_sender = Arc::new(StdMutex::new(Some(token_tx)));
    let shutdown_sender = Arc::new(StdMutex::new(Some(shutdown_tx)));

    let token_sender_route = token_sender.clone();
    let shutdown_sender_route = shutdown_sender.clone();

    let route = warp::path("callback")
        .and(warp::query::<HashMap<String, String>>())
        .map(move |query: HashMap<String, String>| {
            if let Some(msg) = query.get("log") {
                println!("[quick-register-js] {}", msg);
            }

            let token = query.get("token").cloned().unwrap_or_default();
            let url = query.get("url").cloned().unwrap_or_default();

            if !token.is_empty() {
                if let Some(tx) = token_sender_route.lock().unwrap().take() {
                    let _ = tx.send((token, url));
                }
                if let Some(tx) = shutdown_sender_route.lock().unwrap().take() {
                    let _ = tx.send(());
                }
                warp::reply::html("已收到 Token，注册成功。".to_string())
            } else {
                warp::reply::html("未收到 Token".to_string())
            }
        });

    let (addr, server) = warp::serve(route)
        .bind_with_graceful_shutdown(([127, 0, 0, 1], 0), async move {
            let _ = shutdown_rx.await;
        });
    tokio::spawn(server);

    // 创建浏览器窗口，先关闭已存在的
    if let Some(existing) = app.get_webview_window("trae-register") {
        let _ = existing.destroy();
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    if app.get_webview_window("trae-register").is_some() {
        return Err(anyhow::anyhow!("无法关闭已存在的注册窗口，请重启应用后重试").into());
    }

    // 准备 Token 拦截脚本
    let port = addr.port();
    let init_script = format!(
        r#"
        (function() {{
            if (window.__tokenInterceptorInstalled) return;
            window.__tokenInterceptorInstalled = true;
            
            var callbackUrl = 'http://127.0.0.1:{}/callback';
            
            var sendToken = function(token, url) {{
                if (!token) return;
                console.log('[TokenIntercept] 捕获到 Token:', token.substring(0, 20) + '...');
                var fullUrl = callbackUrl + '?token=' + encodeURIComponent(token) + '&url=' + encodeURIComponent(url);
                if (navigator.sendBeacon) {{
                    navigator.sendBeacon(fullUrl);
                }} else {{
                    fetch(fullUrl, {{ mode: 'no-cors' }});
                }}
            }};
            
            var parseToken = function(data) {{
                if (!data) return null;
                var result = data.result || data.data || data;
                var token = result.token || result.Token || null;
                if (typeof result === 'string' && result.length > 50) {{
                    token = result;
                }}
                if (token && typeof token === 'string' && token.split('.').length === 3) {{
                    return token;
                }}
                return null;
            }};
            
            var originalFetch = window.fetch;
            window.fetch = async function() {{
                var url = arguments[0];
                var urlStr = typeof url === 'string' ? url : (url.url || '');
                console.log('[TokenIntercept] Fetch请求:', urlStr.substring(0, 100));
                
                var response = await originalFetch.apply(this, arguments);
                
                if (urlStr.includes('GetUserToken') || urlStr.includes('token') || urlStr.includes('user')) {{
                    console.log('[TokenIntercept] 捕获到可能的Token接口:', urlStr);
                    try {{
                        var cloned = response.clone();
                        var data = await cloned.json();
                        console.log('[TokenIntercept] 响应数据:', JSON.stringify(data).substring(0, 200));
                        var token = parseToken(data);
                        if (token) {{
                            console.log('[TokenIntercept] 成功提取Token');
                            sendToken(token, urlStr);
                        }}
                    }} catch (e) {{
                        console.log('[TokenIntercept] 解析失败:', e.message);
                    }}
                }}
                return response;
            }};
            
            var originalOpen = XMLHttpRequest.prototype.open;
            var originalSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function(method, url) {{
                this._url = url;
                console.log('[TokenIntercept] XHR请求:', (url || '').substring(0, 100));
                return originalOpen.apply(this, arguments);
            }};
            XMLHttpRequest.prototype.send = function() {{
                var xhr = this;
                var url = this._url || '';
                if (url.includes('GetUserToken') || url.includes('token') || url.includes('user')) {{
                    console.log('[TokenIntercept] 捕获到可能的Token XHR:', url);
                    this.addEventListener('load', function() {{
                        try {{
                            var data = JSON.parse(xhr.responseText);
                            console.log('[TokenIntercept] XHR响应:', JSON.stringify(data).substring(0, 200));
                            var token = parseToken(data);
                            if (token) {{
                                console.log('[TokenIntercept] 成功提取Token');
                                sendToken(token, url);
                            }}
                        }} catch (e) {{
                            console.log('[TokenIntercept] XHR解析失败:', e.message);
                        }}
                    }});
                }}
                return originalSend.apply(this, arguments);
            }};
            
            var checkStorageForToken = function() {{
                console.log('[TokenIntercept] 检查 Storage...');
                var sources = [{{name: 'localStorage', storage: localStorage}}, {{name: 'sessionStorage', storage: sessionStorage}}];
                for (var i = 0; i < sources.length; i++) {{
                    var src = sources[i];
                    try {{
                        for (var key in src.storage) {{
                            var lowerKey = key.toLowerCase();
                            if (lowerKey.includes('token') || lowerKey.includes('jwt') || lowerKey.includes('auth')) {{
                                console.log('[TokenIntercept] 发现token key:', src.name, key);
                                var value = src.storage.getItem(key);
                                // 只发送有效的 JWT Token（包含3个.）
                                if (value && value.length > 50 && value.split('.').length === 3) {{
                                    console.log('[TokenIntercept] 发现有效的 JWT Token in Storage');
                                    sendToken(value, src.name + ':' + key);
                                }}
                            }}
                        }}
                    }} catch(e) {{}}
                }}
            }};
            
            setTimeout(checkStorageForToken, 3000);
            setTimeout(checkStorageForToken, 8000);
            setTimeout(checkStorageForToken, 15000);
            
            setInterval(function() {{
                if (window.__trae_last_token) return;
                checkStorageForToken();
            }}, 5000);
            
            console.log('[TokenIntercept] Token 拦截器已安装');
        }})();
        "#,
        port
    );

    println!("[quick-register-simple] 创建浏览器窗口...");
    let webview = tauri::webview::WebviewWindowBuilder::new(
        &app,
        "trae-register",
        tauri::WebviewUrl::External("https://www.trae.ai/sign-up".parse().unwrap()),
    )
    .title("Trae 注册")
    .inner_size(1000.0, 720.0)
    .visible(show_window)
    .initialization_script(&init_script)
    .build()
    .map_err(|e| ApiError::from(anyhow!("无法打开注册窗口: {}", e)))?;

    // 等待页面加载
    println!("[quick-register-simple] 等待页面加载...");
    tokio::time::sleep(Duration::from_secs(3)).await;

    // 填入邮箱并点击 Send Code
    println!("[quick-register-simple] 填入邮箱并点击 Send Code...");
    let email_escaped = email.replace("\"", "\\\"");
    
    // 先填入邮箱
    for _i in 1..=10 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        
        let fill_email_script = format!(
            r#"(function() {{
                // 尝试多种选择器找到邮箱输入框
                var input = document.querySelector('input[type="email"]') || 
                           document.querySelector('input[name="email"]') ||
                           document.querySelector('input[placeholder*="email" i]') ||
                           document.querySelector('input[id*="email" i]') ||
                           document.querySelector('.email-input input') ||
                           document.querySelector('input');
                if (input) {{
                    input.value = "{}";
                    input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    input.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    input.dispatchEvent(new KeyboardEvent('keydown', {{ bubbles: true }}));
                    input.dispatchEvent(new KeyboardEvent('keyup', {{ bubbles: true }}));
                    console.log('[AutoFill] 邮箱已填入:', input.value);
                    return true;
                }}
                console.log('[AutoFill] 未找到邮箱输入框，尝试 {}');
                return false;
            }})()"#,
            email_escaped, _i
        );
        let _ = webview.eval(fill_email_script);
    }
    
    // 等待一下确保邮箱已填入
    tokio::time::sleep(Duration::from_secs(2)).await;
    
    // 点击 Send Code 按钮
    println!("[quick-register-simple] 点击 Send Code 按钮...");
    for _i in 1..=3 {
        tokio::time::sleep(Duration::from_millis(800)).await;
        
        let click_script = r#"
            (function() {
                // 尝试多种选择器找到 Send Code 按钮
                var selectors = [
                    '.right-part.send-code',
                    '.send-code',
                    'button:contains("Send")',
                    'button:contains("Code")',
                    '[class*="send" i][class*="code" i]',
                    'button[type="button"]',
                    '.btn-send',
                    '.send-btn'
                ];
                
                for (var i = 0; i < selectors.length; i++) {
                    try {
                        var btn = document.querySelector(selectors[i]);
                        if (btn && (btn.innerText.toLowerCase().includes('send') || 
                                   btn.innerText.toLowerCase().includes('code') ||
                                   btn.textContent.toLowerCase().includes('send') ||
                                   btn.textContent.toLowerCase().includes('code'))) {
                            btn.click();
                            console.log('[AutoFill] Send Code 已点击:', selectors[i]);
                            return true;
                        }
                    } catch(e) {}
                }
                
                // 如果没找到，尝试所有 button 元素
                var buttons = document.querySelectorAll('button');
                for (var j = 0; j < buttons.length; j++) {
                    var text = buttons[j].innerText || buttons[j].textContent;
                    if (text && (text.toLowerCase().includes('send') || text.toLowerCase().includes('code'))) {
                        buttons[j].click();
                        console.log('[AutoFill] Send Code 已点击 (通过遍历):', text);
                        return true;
                    }
                }
                
                console.log('[AutoFill] 未找到 Send Code 按钮');
                return false;
            })()
        "#;
        let _ = webview.eval(click_script);
    }

    // 等待验证码邮件 - 使用 TempMailClient 的 Socket.io 实时接收
    println!("[quick-register-simple] 等待验证码邮件...");
    
    let code = match mail_client.wait_for_code(Duration::from_secs(60)).await {
        Ok(code) => code,
        Err(err) => {
            let _ = webview.close();
            return Err(ApiError::from(err));
        }
    };
    
    println!("[quick-register-simple] 获取验证码: {}", code);
    
    // 填入验证码和密码并提交
    println!("[quick-register-simple] 立即填入验证码并提交...");
    let code_escaped = code.replace("\"", "\\\"");
    let password_escaped = password.replace("\"", "\\\"");
    
    // 记录填入时间
    let fill_time = std::time::SystemTime::now();
    println!("[quick-register-simple] 验证码填入时间戳: {:?}", fill_time);
    
    let fill_and_submit_script = format!(
        r#"(function() {{
            var codeInput = document.querySelector('input[placeholder*="Verification"]') || document.querySelector('input[maxlength="6"]');
            if (codeInput) {{
                // 清除原有值并填入新验证码
                codeInput.value = "";
                codeInput.focus();
                codeInput.value = "{}";
                codeInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
                codeInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
                codeInput.dispatchEvent(new KeyboardEvent('keyup', {{ bubbles: true }}));
                console.log('[AutoFill] 验证码已填入:', codeInput.value);
                
                // 验证填入的值
                var expectedCode = "{}";
                if (codeInput.value !== expectedCode) {{
                    console.log('[AutoFill] 警告: 验证码填入不匹配! 期望:', expectedCode, '实际:', codeInput.value);
                }}
            }} else {{
                console.log('[AutoFill] 错误: 未找到验证码输入框');
            }}
            
            var passInput = document.querySelector('input[type="password"]');
            if (passInput) {{
                passInput.value = "{}";
                passInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
                passInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
                console.log('[AutoFill] 密码已填入');
            }}
            
            // 延迟点击 Sign Up，让输入框有时间响应
            setTimeout(function() {{
                var btn = document.querySelector('.btn-submit') || document.querySelector('.trae__btn');
                if (btn) {{
                    console.log('[AutoFill] 点击 Sign Up 按钮');
                    btn.click();
                }} else {{
                    console.log('[AutoFill] 错误: 未找到 Sign Up 按钮');
                }}
            }}, 500);
        }})()"#,
        code_escaped, code_escaped, password_escaped
    );
    let _ = webview.eval(fill_and_submit_script);

    // 等待注册完成 - 给浏览器更多时间来完成注册流程
    println!("[quick-register-simple] 等待注册完成...");
    tokio::time::sleep(Duration::from_secs(10)).await;
    
    // 检查当前页面 URL
    match webview.url() {
        Ok(url) => println!("[quick-register-simple] 当前页面 URL: {}", url),
        Err(e) => println!("[quick-register-simple] 获取页面 URL 失败: {}", e),
    }
    
    // 执行 JS 检查页面状态
    let check_status_script = r#"
        (function() {
            var errorMsg = document.querySelector('.error-message') || document.querySelector('.error');
            var successMsg = document.querySelector('.success-message') || document.querySelector('.success');
            var currentUrl = window.location.href;
            
            console.log('[PageStatus] 当前URL:', currentUrl);
            
            if (errorMsg) {
                console.log('[PageStatus] 错误信息:', errorMsg.innerText);
            }
            if (successMsg) {
                console.log('[PageStatus] 成功信息:', successMsg.innerText);
            }
            
            // 检查是否有验证码错误
            var codeInput = document.querySelector('input[maxlength="6"]');
            if (codeInput && codeInput.parentElement) {
                var error = codeInput.parentElement.querySelector('.error, .error-message');
                if (error) {
                    console.log('[PageStatus] 验证码错误:', error.innerText);
                }
            }
            
            return {
                url: currentUrl,
                hasError: !!errorMsg,
                errorText: errorMsg ? errorMsg.innerText : '',
                hasSuccess: !!successMsg
            };
        })()
    "#;
    let _ = webview.eval(check_status_script);
    
    tokio::time::sleep(Duration::from_secs(5)).await;

    // 关闭浏览器窗口
    let _ = webview.close();

    // 保存账号 - 直接使用邮箱密码登录
    println!("[quick-register-simple] 注册完成，开始登录并保存账号...");
    let mut manager = state.account_manager.lock().await;
    
    let mut account = None;
    
    // 直接使用邮箱密码登录
    println!("[quick-register-simple] 尝试邮箱密码登录...");
    for attempt in 0..5 {
        if attempt > 0 {
            println!("[quick-register-simple] 第 {} 次尝试登录...", attempt + 1);
        }
        // 等待时间，给服务器时间创建账号
        let wait_secs = if attempt == 0 { 3 } else { 15 + (attempt as u64 * 10) };
        println!("[quick-register-simple] 等待 {} 秒后尝试登录...", wait_secs);
        tokio::time::sleep(Duration::from_secs(wait_secs)).await;
        
        match login_with_email(&email, &password).await {
            Ok(login_result) => {
                match manager.add_account_by_token(
                    login_result.token, 
                    Some(login_result.cookies), 
                    Some(password.clone())
                ).await {
                    Ok(acc) => {
                        println!("[quick-register-simple] 邮箱登录添加账号成功");
                        account = Some(acc);
                        break;
                    }
                    Err(e) => {
                        println!("[quick-register-simple] 邮箱登录添加账号失败: {}", e);
                    }
                }
            }
            Err(e) => {
                println!("[quick-register-simple] 登录请求失败: {}", e);
            }
        }
    }
    
    let mut account = account.ok_or_else(|| ApiError::from(anyhow!("所有添加账号方式都失败")))?;

    if account.email.trim().is_empty() || account.email.contains('*') || !account.email.contains('@') {
        match manager.update_account_email(&account.id, email.clone()) {
            Ok(_) => {
                account = manager.get_account(&account.id).map_err(ApiError::from)?;
            }
            Err(_) => {}
        }
    }

    println!("\n========================================");
    println!("[quick-register-simple] 快速注册完成!");
    println!("[quick-register-simple] 邮箱: {}", account.email);
    println!("========================================\n");

    Ok(account)
}

pub async fn wait_for_request_cookies(
    webview: &tauri::webview::WebviewWindow,
    request_url: &str,
    timeout: Duration,
) -> anyhow::Result<String> {
    let parsed_url = normalize_request_url(request_url)
        .ok_or_else(|| anyhow!("URL 无效: {}", request_url))?;
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        if let Ok(cookie_list) = webview.cookies_for_url(parsed_url.clone()) {
            let cookies = cookie_list
                .into_iter()
                .map(|c| format!("{}={}", c.name(), c.value()))
                .collect::<Vec<_>>()
                .join("; ");
            if !cookies.is_empty() {
                return Ok(cookies);
            }
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    Err(anyhow!("未能获取 Cookie"))
}

fn normalize_request_url(url: &str) -> Option<Url> {
    let trimmed = url.split('?').next().unwrap_or(url);
    Url::parse("https://www.trae.ai/")
        .ok()?
        .join(trimmed)
        .ok()
}
