import { useState } from "react";
import * as api from "../api";

interface AboutProps {
  onToast?: (type: "success" | "error" | "warning" | "info", message: string, duration?: number) => void;
}

export function About({ onToast }: AboutProps) {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; current_version: string; body: string; date: string } | null>(null);

  // 检查更新
  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await api.checkUpdate();
      if (info) {
        setUpdateInfo(info);
        onToast?.("info", `发现新版本: ${info.version}`);
      } else {
        onToast?.("success", "当前已是最新版本");
      }
    } catch (err: any) {
      onToast?.("error", err.message || "检查更新失败");
    } finally {
      setCheckingUpdate(false);
    }
  };

  // 安装更新
  const handleInstallUpdate = async () => {
    try {
      onToast?.("info", "正在下载并安装更新...");
      await api.installUpdate();
    } catch (err: any) {
      onToast?.("error", err.message || "安装更新失败");
    }
  };

  return (
    <div className="about-page">
      <div className="about-card">
        {/* 头部横排 */}
        <div className="about-header">
          <img src="/logo.png" alt="Trae账号管理" className="about-logo" />
          <div className="about-header-text">
            <div className="title-row">
              <h1 className="about-title">Trae账号管理</h1>
              <span className="version">v1.0.2</span>
            </div>
          </div>
        </div>
        
        {/* 说明 */}
        <p className="about-desc">
          这是一款专为 Trae IDE 用户打造的多账号高效管理工具。通过本工具，您可以轻松管理多个 Trae 账号，一键切换账号，实时查看使用量，让您的 Trae IDE 使用体验更加便捷！基于
          <a
            href="https://github.com/S-Trespassing/Trae账号管理"
            target="_blank"
            rel="noopener noreferrer"
            className="original-link"
          >
            原作者项目
          </a>
          进行二次开发，原作者已不再维护。
        </p>
        
        {/* 信息 */}
        <div className="about-info">
          <div className="info-item">
            <span className="label">开发者</span>
            <span className="value">HJH</span>
          </div>
          <div className="info-item">
            <span className="label">GitHub</span>
            <a 
              href="https://github.com/HHH9201/Trae-CC.git" 
              target="_blank" 
              rel="noopener noreferrer"
              className="value link"
            >
              HHH9201/Trae-CC
            </a>
          </div>
        </div>

        {/* 分割线 */}
        <div className="about-divider"></div>

        {/* 软件更新 */}
        <div className="about-update-section">
          <div className="about-update-header">
            <div className="about-update-icon">🔄</div>
            <div className="about-update-title">软件更新</div>
          </div>
          <div className="about-update-content">
            {updateInfo ? (
              <div className="about-update-info">
                <div className="about-update-version">
                  <span className="new-version">{updateInfo.version}</span>
                  <span className="current-version">当前: {updateInfo.current_version}</span>
                </div>
                {updateInfo.body && (
                  <div className="about-update-body">
                    {updateInfo.body}
                  </div>
                )}
              </div>
            ) : (
              <div className="about-update-desc">检查并安装最新版本</div>
            )}
          </div>
          <div className="about-update-actions">
            {!updateInfo ? (
              <button
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="about-update-btn"
              >
                {checkingUpdate ? (
                  <>
                    <span className="btn-spinner"></span>
                    检查中...
                  </>
                ) : (
                  "检查更新"
                )}
              </button>
            ) : (
              <>
                <button
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="about-update-btn secondary"
                >
                  重新检查
                </button>
                <button
                  onClick={handleInstallUpdate}
                  className="about-update-btn primary"
                >
                  立即更新
                </button>
              </>
            )}
          </div>
        </div>
        
        {/* 页脚 */}
        <div className="about-footer">
          Made with ❤️ by HJH · MIT License
        </div>
      </div>
    </div>
  );
}
