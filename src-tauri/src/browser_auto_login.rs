//! 浏览器自动登录模块
//!
//! 这个模块用于在后台打开浏览器，自动填入账号密码并登录

use std::time::Duration;
use tauri::{AppHandle, Url, WebviewUrl, WebviewWindowBuilder};

use crate::{Account, AppState};

/// 使用账号密码在后台浏览器中登录
pub async fn browser_auto_login(
    app: AppHandle,
    email: String,
    password: String,
    state: &AppState,
) -> anyhow::Result<Account> {
    println!("[browser-auto-login] 开始自动登录流程");
    println!("[browser-auto-login] 邮箱: {}", email);

    // 创建浏览器窗口（隐藏或最小化）
    let window = WebviewWindowBuilder::new(
        &app,
        "auto_login",
        WebviewUrl::External(Url::parse("https://www.trae.ai/login").unwrap()),
    )
    .title("自动登录中...")
    .inner_size(800.0, 600.0)
    .visible(false) // 隐藏窗口，后台运行
    .build()?;

    println!("[browser-auto-login] 浏览器窗口已创建");

    // 等待页面加载
    tokio::time::sleep(Duration::from_secs(3)).await;

    // 执行自动登录脚本
    let login_script = format!(
        r#"
        (async function() {{
            console.log('[AutoLogin] 开始自动登录流程');
            
            // 等待页面完全加载
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 查找邮箱输入框
            const emailInput = document.querySelector('input[type="email"], input[name="email"], input[placeholder*="邮箱"], input[placeholder*="Email"]');
            if (!emailInput) {{
                console.log('[AutoLogin] 未找到邮箱输入框');
                return {{ success: false, error: '未找到邮箱输入框' }};
            }}
            
            // 填入邮箱
            emailInput.value = '{}';
            emailInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
            emailInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
            console.log('[AutoLogin] 已填入邮箱');
            
            // 等待一下
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 查找密码输入框
            const passwordInput = document.querySelector('input[type="password"], input[name="password"]');
            if (!passwordInput) {{
                console.log('[AutoLogin] 未找到密码输入框');
                return {{ success: false, error: '未找到密码输入框' }};
            }}
            
            // 填入密码
            passwordInput.value = '{}';
            passwordInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
            passwordInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
            console.log('[AutoLogin] 已填入密码');
            
            // 等待一下
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 查找登录按钮
            const loginBtn = document.querySelector('button[type="submit"], button:contains("登录"), button:contains("Sign in"), button:contains("Log in")');
            if (loginBtn) {{
                loginBtn.click();
                console.log('[AutoLogin] 已点击登录按钮');
            }} else {{
                // 尝试按回车键提交
                passwordInput.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Enter', bubbles: true }}));
                console.log('[AutoLogin] 已发送回车键');
            }}
            
            return {{ success: true }};
        }})();
        "#,
        email.replace("\"", "\\\""),
        password.replace("\"", "\\\"")
    );

    // 执行登录脚本
    window.eval(&login_script)?;
    println!("[browser-auto-login] 登录脚本已执行");

    // 等待登录完成（最多30秒）
    println!("[browser-auto-login] 等待登录完成...");
    tokio::time::sleep(Duration::from_secs(5)).await;

    // 检查是否登录成功（通过URL变化）
    let mut login_success = false;
    for i in 0..10 {
        tokio::time::sleep(Duration::from_secs(2)).await;
        
        // 获取当前URL
        let current_url = window.url()?;
        println!("[browser-auto-login] 当前URL: {}", current_url);
        
        // 如果URL变成account-setting或dashboard，说明登录成功
        if current_url.as_str().contains("account-setting") || 
           current_url.as_str().contains("dashboard") ||
           current_url.as_str().contains("home") {
            login_success = true;
            println!("[browser-auto-login] 登录成功！");
            break;
        }
        
        println!("[browser-auto-login] 等待登录完成... ({}/10)", i + 1);
    }

    if !login_success {
        let _ = window.close();
        return Err(anyhow::anyhow!("登录超时，请检查账号密码是否正确"));
    }

    // 获取Token和Cookies
    println!("[browser-auto-login] 正在获取Token和Cookies...");
    
    // 使用 webview 的 cookie 方法
    let cookies = window.cookies()?;
    let cookies_str = cookies
        .into_iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect::<Vec<_>>()
        .join("; ");
    
    println!("[browser-auto-login] 获取到 Cookies");

    // 关闭窗口
    let _ = window.close();

    // 使用邮箱密码直接登录获取token
    println!("[browser-auto-login] 使用邮箱密码登录获取Token...");
    let login_result = crate::api::login_with_email(&email, &password).await?;
    
    // 保存账号
    println!("[browser-auto-login] 保存账号...");
    let mut manager = state.account_manager.lock().await;
    
    let account = manager.add_account_by_token(
        login_result.token,
        Some(cookies_str),
        Some(password),
    ).await?;

    println!("[browser-auto-login] 账号添加成功: {}", account.email);
    Ok(account)
}
