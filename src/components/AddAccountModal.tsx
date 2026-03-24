import { useRef, useState, useEffect } from "react";
import * as api from "../api";
import type { Account } from "../types";

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (type: "success" | "error" | "warning" | "info", message: string) => void;
  onAccountAdded?: (account: Account) => void;
  quickRegisterShowWindow?: boolean;
  onImportAccounts?: () => void;
  onExportAccounts?: () => void;
  canExport?: boolean;
}

type AddMode = "browser" | "register" | "more";
type MoreSubMode = "trae-ide" | "import-export" | null;

// 注册进度步骤
const REGISTER_STEPS = [
  { percent: 5, message: "正在初始化..." },
  { percent: 15, message: "生成临时邮箱..." },
  { percent: 25, message: "打开注册页面..." },
  { percent: 40, message: "填写注册信息..." },
  { percent: 55, message: "等待验证码..." },
  { percent: 70, message: "验证邮箱..." },
  { percent: 85, message: "获取账号 Token..." },
  { percent: 95, message: "保存账号信息..." },
  { percent: 100, message: "注册完成!" },
];

export function AddAccountModal({
  isOpen,
  onClose,
  onToast,
  onAccountAdded,
  quickRegisterShowWindow = true,
  onImportAccounts,
  onExportAccounts,
  canExport = false,
}: AddAccountModalProps) {
  const [mode, setMode] = useState<AddMode>("browser");
  const [moreSubMode, setMoreSubMode] = useState<MoreSubMode>(null);
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // 浏览器登录表单状态
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginProgress, setLoginProgress] = useState(0);
  const [loginStatus, setLoginStatus] = useState("");
  
  // 快速注册进度状态
  const [registerProgress, setRegisterProgress] = useState(0);
  const [registerStatus, setRegisterStatus] = useState("");
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 清理进度定时器
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowMoreDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isOpen) return null;

  // 模拟进度更新
  const startProgressSimulation = () => {
    let currentStep = 0;
    setRegisterProgress(0);
    setRegisterStatus(REGISTER_STEPS[0].message);
    
    progressIntervalRef.current = setInterval(() => {
      currentStep++;
      if (currentStep < REGISTER_STEPS.length) {
        const step = REGISTER_STEPS[currentStep];
        setRegisterProgress(step.percent);
        setRegisterStatus(step.message);
      } else {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      }
    }, 3000); // 每3秒更新一次进度
  };

  // 停止进度模拟
  const stopProgressSimulation = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setRegisterProgress(0);
    setRegisterStatus("");
  };

  const handleReadTraeAccount = async () => {
    setLoading(true);
    setError("");

    try {
      const account = await api.readTraeAccount();
      if (account) {
        onToast?.("success", `成功读取 Trae IDE 账号: ${account.email}`);
        onAccountAdded?.(account);
        handleClose();
      } else {
        setError("未找到 Trae IDE 登录账号或账号已存在");
      }
    } catch (err: any) {
      setError(err.message || "读取 Trae IDE 账号失败");
    } finally {
      setLoading(false);
    }
  };

  // 浏览器自动登录
  const handleBrowserAutoLogin = async () => {
    if (!loginEmail || !loginPassword) {
      setError("请输入邮箱和密码");
      return;
    }

    setLoading(true);
    setError("");
    setLoginProgress(10);
    setLoginStatus("正在打开浏览器...");

    try {
      const account = await api.browserAutoLogin(loginEmail, loginPassword);
      
      setLoginProgress(100);
      setLoginStatus("登录成功!");
      
      console.log("[BrowserAutoLogin] 登录成功，账号:", account);
      
      // 通知父组件添加账号
      onAccountAdded?.(account);
      
      // 延迟关闭弹窗
      setTimeout(() => {
        setLoading(false);
        setLoginProgress(0);
        setLoginStatus("");
        setLoginEmail("");
        setLoginPassword("");
        onClose();
        onToast?.("success", `登录成功，已导入账号: ${account.email}`);
      }, 800);
    } catch (err: any) {
      setError(err.message || "自动登录失败");
      setLoading(false);
      setLoginProgress(0);
      setLoginStatus("");
    }
  };

  const handleQuickRegister = async () => {
    setLoading(true);
    setError("");
    startProgressSimulation();

    try {
      const account = await api.quickRegister(quickRegisterShowWindow);
      // 完成进度
      setRegisterProgress(100);
      setRegisterStatus("注册完成!");
      
      console.log("[QuickRegister] 注册成功，账号:", account);
      
      // 先通知父组件添加账号
      onAccountAdded?.(account);
      
      // 延迟关闭弹窗，让用户看到完成状态
      setTimeout(() => {
        // 重置状态并关闭
        setLoading(false);
        stopProgressSimulation();
        onClose();
        // 显示成功提示
        onToast?.("success", `注册成功，已导入账号: ${account.email}`);
      }, 800);
    } catch (err: any) {
      setError(err.message || "快速注册失败");
      setLoading(false);
      stopProgressSimulation();
    }
  };

  const handleClose = () => {
    setError("");
    setMode("browser");
    setMoreSubMode(null);
    setShowMoreDropdown(false);
    setLoginEmail("");
    setLoginPassword("");
    setLoginProgress(0);
    setLoginStatus("");
    stopProgressSimulation();
    void api.cancelBrowserLogin();
    onClose();
  };

  const handleImport = () => {
    onImportAccounts?.();
    handleClose();
  };

  const handleExport = () => {
    onExportAccounts?.();
    handleClose();
  };

  const handleMoreSelect = (subMode: MoreSubMode) => {
    setMoreSubMode(subMode);
    setMode("more");
    setShowMoreDropdown(false);
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content add-account-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-account-header">
          <h2>添加账号</h2>
          {/* 更多下拉菜单 */}
          <div className="more-dropdown-container header-dropdown" ref={dropdownRef}>
            <button
              className="quick-register-btn"
              onClick={() => setShowMoreDropdown(!showMoreDropdown)}
              disabled={loading}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
              更多
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginLeft: '4px'}}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            
            {showMoreDropdown && (
              <div className="more-dropdown-menu dropdown-right">
                <button
                  className={`dropdown-item ${moreSubMode === "trae-ide" ? "active" : ""}`}
                  onClick={() => handleMoreSelect("trae-ide")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  从 Trae 读取
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowMoreDropdown(false);
                    handleImport();
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  导入账号
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowMoreDropdown(false);
                    handleExport();
                  }}
                  disabled={!canExport}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  导出账号
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="add-mode-tabs">
          <button
            className={`mode-tab ${mode === "browser" ? "active" : ""}`}
            onClick={() => setMode("browser")}
            disabled={loading}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            浏览器登录
          </button>
          
          {/* 快速注册按钮 */}
          <button
            className={`mode-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => setMode("register")}
            disabled={loading}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            快速注册
          </button>
        </div>

        {mode === "browser" ? (
          <div className="trae-ide-mode">
            <div className="mode-description" style={{ minHeight: 'auto', padding: '24px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <h3>浏览器自动登录</h3>
              <p>输入账号密码后，后台自动打开浏览器完成登录</p>
            </div>

            {/* 登录表单 */}
            {!loading && (
              <div className="login-form" style={{ padding: '0 24px 20px' }}>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    邮箱地址
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="请输入邮箱"
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                  />
                </div>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    密码
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="请输入密码"
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                  />
                </div>
              </div>
            )}

            {/* 进度显示 */}
            {loading && loginProgress > 0 && (
              <div className="register-progress-container" style={{ margin: '0 24px 20px' }}>
                <div className="register-progress-status">
                  {loginProgress >= 100 ? '✓ ' : ''}{loginStatus}
                </div>
                <div className="register-progress-bar">
                  <div 
                    className="register-progress-fill" 
                    style={{ width: `${loginProgress}%` }}
                  />
                </div>
                <div className="register-progress-percent">{loginProgress}%</div>
              </div>
            )}

            {error && <div className="error-message" style={{ margin: '0 24px 16px' }}>{error}</div>}

            <div className="modal-actions">
              <button type="button" onClick={handleClose} disabled={loading}>
                取消
              </button>
              <button 
                type="button" 
                className="primary" 
                onClick={handleBrowserAutoLogin} 
                disabled={loading || !loginEmail || !loginPassword}
              >
                {loading ? "正在登录..." : "开始登录"}
              </button>
            </div>
          </div>
        ) : mode === "register" ? (
          <div className="trae-ide-mode">
            <div className="mode-description">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              <h3>快速注册并自动导入</h3>
              <p>系统自动生成邮箱完成注册，并导入到列表</p>
            </div>

            {/* 进度条区域 */}
            {loading && (
              <div className={`register-progress-container ${registerProgress >= 100 ? 'complete' : ''}`}>
                <div className="register-progress-status">
                  {registerProgress >= 100 ? '✓ ' : ''}{registerStatus}
                </div>
                <div className="register-progress-bar">
                  <div 
                    className="register-progress-fill" 
                    style={{ width: `${registerProgress}%` }}
                  />
                </div>
                <div className="register-progress-percent">{registerProgress}%</div>
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <div className="modal-actions">
              <button type="button" onClick={handleClose} disabled={loading}>
                取消
              </button>
              <button type="button" className="primary" onClick={handleQuickRegister} disabled={loading}>
                {loading ? "注册中..." : "快速注册并导入"}
              </button>
            </div>
          </div>
        ) : mode === "more" && moreSubMode === "trae-ide" ? (
          <div className="trae-ide-mode">
            <div className="mode-description">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <h3>自动检测本地 Trae IDE 账号</h3>
              <p>系统将自动读取本地 Trae IDE 客户端当前登录的账号信息</p>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="modal-actions">
              <button type="button" onClick={handleClose} disabled={loading}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleReadTraeAccount}
                disabled={loading}
              >
                {loading ? "读取中..." : "读取本地账号"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
