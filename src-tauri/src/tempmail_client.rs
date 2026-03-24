//! TempMail.cn 客户端模块
//!
//! 这个模块使用 Socket.io 连接 tempmail.cn 来获取临时邮箱和接收验证码

use std::time::Duration;
use tokio::time::timeout;

/// TempMail 客户端
pub struct TempMailClient {
    email: Option<String>,
    shortid: Option<String>,
}

impl TempMailClient {
    /// 创建新的 TempMail 客户端
    pub fn new() -> Self {
        Self {
            email: None,
            shortid: None,
        }
    }

    /// 生成随机邮箱地址
    pub async fn generate_email(&mut self) -> String {
        match self.create_email().await {
            Ok(email) => {
                self.email = Some(email.clone());
                email
            }
            Err(e) => {
                println!("[TempMailClient] 创建邮箱失败: {}", e);
                "error@tempmail.cn".to_string()
            }
        }
    }

    /// 创建临时邮箱
    async fn create_email(&mut self) -> anyhow::Result<String> {
        println!("[TempMailClient] 正在创建临时邮箱...");

        // 生成随机 shortid (8位随机字符串)
        let shortid = generate_random_shortid();
        
        self.shortid = Some(shortid.clone());
        let email = format!("{}@tempmail.cn", shortid);

        println!("[TempMailClient] 邮箱创建成功: {}", email);
        Ok(email)
    }

    /// 等待并获取验证码
    pub async fn wait_for_code(&self, timeout_duration: Duration) -> anyhow::Result<String> {
        let shortid = self.shortid.as_ref()
            .ok_or_else(|| anyhow::anyhow!("邮箱未初始化"))?;

        println!("[TempMailClient] 开始等待验证码，超时: {} 秒", timeout_duration.as_secs());
        println!("[TempMailClient] 邮箱: {}@tempmail.cn", shortid);

        // 使用 Python 脚本来获取验证码
        let code = run_python_socketio_client(shortid, timeout_duration).await?;
        
        println!("[TempMailClient] 成功获取验证码: {}", code);
        Ok(code)
    }

    /// 获取当前邮箱地址
    pub fn get_email(&self) -> Option<&String> {
        self.email.as_ref()
    }

    /// 获取 shortid
    pub fn get_shortid(&self) -> Option<&String> {
        self.shortid.as_ref()
    }
}

/// 生成随机 shortid (8位小写字母和数字)
fn generate_random_shortid() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();

    (0..8)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// 运行 Python Socket.io 客户端来获取验证码
async fn run_python_socketio_client(shortid: &str, timeout_duration: Duration) -> anyhow::Result<String> {
    use std::process::Stdio;
    use tokio::process::Command;

    let python_script = format!(r#"
import socketio
import time
import sys

sio = socketio.Client(reconnection=False)
code_received = None

@sio.event
def connect():
    sio.emit('set shortid', '{}')

@sio.on('mail')
def on_mail(mail):
    global code_received
    text = mail.get('text', '')
    subject = mail.get('headers', {{}}).get('subject', '')
    full_text = text + ' ' + subject
    
    # 查找验证码
    import re
    patterns = [
        r'Trae\s+(\d{{6}})',
        r'(?i)verification\s+code.*?\b(\d{{6}})\b',
        r'\b(\d{{6}})\b',
    ]
    for pattern in patterns:
        match = re.search(pattern, full_text)
        if match:
            code_received = match.group(1)
            sio.disconnect()
            break

try:
    sio.connect('https://tempmail.cn', transports=['websocket', 'polling'])
    start = time.time()
    while code_received is None and time.time() - start < {}:
        time.sleep(0.1)
    sio.disconnect()
    
    if code_received:
        print(code_received)
        sys.exit(0)
    else:
        sys.exit(1)
except Exception as e:
    print(f'Error: {{e}}', file=sys.stderr)
    sys.exit(1)
"#, shortid, timeout_duration.as_secs());

    println!("[TempMailClient] 启动 Python Socket.io 客户端...");

    let child = Command::new("python")
        .arg("-c")
        .arg(&python_script)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| anyhow::anyhow!("无法启动 Python: {}", e))?;

    let result = timeout(timeout_duration + Duration::from_secs(5), async {
        let output = child.wait_with_output().await
            .map_err(|e| anyhow::anyhow!("Python 进程错误: {}", e))?;
        
        if output.status.success() {
            let code = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if code.len() == 6 && code.chars().all(|c| c.is_ascii_digit()) {
                Ok(code)
            } else {
                Err(anyhow::anyhow!("无效的验证码格式: {}", code))
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(anyhow::anyhow!("Python 脚本失败: {}", stderr))
        }
    }).await;

    match result {
        Ok(Ok(code)) => Ok(code),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(anyhow::anyhow!("获取验证码超时")),
    }
}

/// 生成随机密码
pub fn generate_password() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let mut rng = rand::thread_rng();

    let password: String = (0..12)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect();

    println!("[TempMailClient] 生成随机密码: {}******", &password[..3]);
    password
}

/// 等待验证码（兼容旧接口）
pub async fn wait_for_verification_code(
    client: &mut TempMailClient,
    _email: &str,
    timeout: Duration
) -> anyhow::Result<String> {
    client.wait_for_code(timeout).await
}
