use std::time::Duration;

use reqwest::Client;
use uuid::Uuid;

const API_BASE: &str = "https://email.hhxyyq.online";

pub struct MailClient {
    client: Client,
    api_key: String,
}

impl MailClient {
    pub async fn new(api_key: Option<String>) -> anyhow::Result<Self> {
        println!("[MailClient] 初始化 HTTP 客户端...");
        let client = Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(Duration::from_secs(30))
            .danger_accept_invalid_certs(true)
            .build()?;

        let api_key = api_key.unwrap_or_default();
        println!("[MailClient] HTTP 客户端初始化成功");
        if !api_key.is_empty() {
            println!("[MailClient] 使用自定义 API 密钥");
        } else {
            println!("[MailClient] 使用默认服务（无 API 密钥）");
        }
        Ok(Self { client, api_key })
    }

    /// 生成随机邮箱地址
    pub fn generate_email() -> String {
        let username = Uuid::new_v4().simple().to_string()[..12].to_string();
        let email = format!("{}@hhxyyq.online", username);
        println!("[MailClient] 生成随机邮箱地址: {}", email);
        email
    }

    /// 获取验证码 - API 返回格式: "验证码: 123456\n时间: ..."
    pub async fn get_code(&self) -> anyhow::Result<Option<String>> {
        // 使用 API 密钥构建正确的端点
        let url = if self.api_key.is_empty() {
            format!("{}/view", API_BASE)
        } else {
            format!("{}/api/get-code?key={}", API_BASE, self.api_key)
        };
        println!("[MailClient] 正在请求验证码: GET {}", url);
        
        let resp = match self.client.get(&url).send().await {
            Ok(resp) => resp,
            Err(e) => {
                println!("[MailClient] ❌ 请求失败: {}", e);
                if e.is_connect() {
                    println!("[MailClient]    连接错误，请检查网络或 API 地址");
                }
                if e.is_timeout() {
                    println!("[MailClient]    请求超时");
                }
                return Err(e.into());
            }
        };
        
        let status = resp.status();
        println!("[MailClient] API 响应状态: {}", status);

        if !status.is_success() {
            println!("[MailClient] API 请求失败，返回 None");
            return Ok(None);
        }

        let content = resp.text().await?;
        println!("[MailClient] API 返回内容: '{}' (长度: {})", content, content.len());
        
        // 尝试从格式 "验证码: 123456" 中提取
        if let Some(cap) = content.lines().next().and_then(|line| {
            let line = line.trim();
            // 匹配 "验证码: 123456" 或 "231042" 格式
            if line.starts_with("验证码:") {
                line.split(':').nth(1).map(|s| s.trim().to_string())
            } else {
                None
            }
        }) {
            if cap.len() == 6 && cap.chars().all(|c| c.is_ascii_digit()) {
                println!("[MailClient] 成功提取验证码: {}", cap);
                return Ok(Some(cap));
            }
        }
        
        // 备用：直接查找6位数字
        let digits: String = content.chars().filter(|c| c.is_ascii_digit()).collect();
        if digits.len() >= 6 {
            let code = &digits[..6];
            println!("[MailClient] 从文本中提取验证码: {}", code);
            return Ok(Some(code.to_string()));
        }
        
        println!("[MailClient] 未找到有效验证码，等待中...");
        Ok(None)
    }
}

pub fn generate_password() -> String {
    let raw = Uuid::new_v4().simple().to_string();
    let password = format!("A{}!{}", &raw[..6], &raw[6..12]);
    println!("[MailClient] 生成随机密码: {}******", &password[..3]);
    password
}

pub async fn wait_for_verification_code(client: &MailClient, timeout: Duration) -> anyhow::Result<String> {
    use std::time::Instant;

    println!("[MailClient] 开始等待验证码，超时时间: {} 秒", timeout.as_secs());
    let start = Instant::now();
    let mut check_count = 0;

    while start.elapsed() < timeout {
        check_count += 1;
        println!("[MailClient] 第 {} 次检查验证码...", check_count);
        
        match client.get_code().await {
            Ok(Some(code)) => {
                println!("[MailClient] ✅ 第 {} 次检查成功找到验证码: {}", check_count, code);
                println!("[MailClient] 总耗时: {} 秒", start.elapsed().as_secs());
                return Ok(code);
            }
            Ok(None) => {
                let elapsed = start.elapsed().as_secs();
                if check_count % 6 == 0 {
                    println!("[MailClient] ⏳ 等待验证码中... (已等待 {} 秒)", elapsed);
                } else {
                    println!("[MailClient] ⏳ 未找到验证码，继续等待... ({} 秒)", elapsed);
                }
            }
            Err(e) => {
                println!("[MailClient] ❌ 检查错误: {}", e);
            }
        }
        
        println!("[MailClient] 等待 3 秒后重试...");
        tokio::time::sleep(Duration::from_secs(3)).await;
    }

    println!("[MailClient] ❌ 等待验证码超时 ({} 秒)", timeout.as_secs());
    Err(anyhow::anyhow!(
        "等待验证码超时 ({} 秒)\n\n可能原因:\n1. 邮件发送延迟\n2. 邮箱服务不可用\n3. 注册页未发送验证码",
        timeout.as_secs()
    ))
}
