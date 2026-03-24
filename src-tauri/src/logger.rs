use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use chrono::Local;
use directories::ProjectDirs;
use once_cell::sync::Lazy;

/// Maximum log file size (5MB)
const MAX_LOG_SIZE: u64 = 5 * 1024 * 1024;
/// Maximum number of log files to keep
const MAX_LOG_FILES: usize = 5;

static LOG_FILE_PATH: Lazy<Mutex<PathBuf>> = Lazy::new(|| {
    Mutex::new(get_log_dir().join("app.log"))
});

/// Initialize the logger
pub fn init_logger() -> Result<(), Box<dyn std::error::Error>> {
    let log_dir = get_log_dir();
    fs::create_dir_all(&log_dir)?;
    
    let log_file = log_dir.join("app.log");
    *LOG_FILE_PATH.lock().unwrap() = log_file.clone();
    
    // Rotate old logs
    rotate_logs(&log_dir)?;
    
    // Create log file
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)?;
    
    // Initialize fern logger
    fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{}] [{}] {}",
                Local::now().format("%Y-%m-%d %H:%M:%S"),
                record.level(),
                message
            ))
        })
        // Only log WARN and above for third-party crates
        .level(log::LevelFilter::Warn)
        // But log INFO and above for our own crate
        .level_for("trae_auto_lib", log::LevelFilter::Info)
        .chain(file)
        .apply()?;
    
    log::info!("Logger initialized successfully");
    log::info!("Log file location: {:?}", log_file);
    
    Ok(())
}

/// Get the log directory
pub fn get_log_dir() -> PathBuf {
    if let Some(proj_dirs) = ProjectDirs::from("com", "HHJ", "TraeCC") {
        proj_dirs.data_local_dir().join("logs")
    } else {
        PathBuf::from("./logs")
    }
}

/// Get the current log file path
pub fn get_log_file_path() -> PathBuf {
    LOG_FILE_PATH.lock().unwrap().clone()
}

/// Rotate old log files
fn rotate_logs(log_dir: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let log_file = log_dir.join("app.log");
    
    // Check if current log file exists and needs rotation
    if log_file.exists() {
        let metadata = fs::metadata(&log_file)?;
        if metadata.len() > MAX_LOG_SIZE {
            // Rotate: move app.log to app.log.1, app.log.1 to app.log.2, etc.
            for i in (1..MAX_LOG_FILES).rev() {
                let old_file = log_dir.join(format!("app.log.{}", i));
                let new_file = log_dir.join(format!("app.log.{}", i + 1));
                
                if old_file.exists() {
                    if i == MAX_LOG_FILES - 1 {
                        // Delete oldest log
                        let _ = fs::remove_file(&old_file);
                    } else {
                        let _ = fs::rename(&old_file, &new_file);
                    }
                }
            }
            
            // Move current log to .1
            let _ = fs::rename(&log_file, log_dir.join("app.log.1"));
        }
    }
    
    Ok(())
}

/// Export logs to a specific location
pub fn export_logs(target_path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let log_file = get_log_file_path();
    
    if !log_file.exists() {
        return Err("Log file not found".into());
    }
    
    // Copy current log
    fs::copy(&log_file, target_path)?;
    
    // Also append older logs if they exist
    let log_dir = log_file.parent().unwrap();
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(target_path)?;
    
    for i in 1..=MAX_LOG_FILES {
        let old_log = log_dir.join(format!("app.log.{}", i));
        if old_log.exists() {
            writeln!(file, "\n\n=== Older Log (app.log.{}) ===\n", i)?;
            let content = fs::read_to_string(&old_log)?;
            file.write_all(content.as_bytes())?;
        }
    }
    
    log::info!("Logs exported to: {:?}", target_path);
    
    Ok(())
}

/// Get recent log entries (for display in UI)
pub fn get_recent_logs(count: usize) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let log_file = get_log_file_path();
    
    if !log_file.exists() {
        return Ok(vec![]);
    }
    
    let content = fs::read_to_string(&log_file)?;
    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    
    // Return last N lines
    let start = if lines.len() > count {
        lines.len() - count
    } else {
        0
    };
    
    Ok(lines[start..].to_vec())
}

/// Clear all logs
pub fn clear_logs() -> Result<(), Box<dyn std::error::Error>> {
    let log_dir = get_log_dir();
    
    // Remove current log
    let log_file = log_dir.join("app.log");
    if log_file.exists() {
        fs::remove_file(&log_file)?;
    }
    
    // Remove rotated logs
    for i in 1..=MAX_LOG_FILES {
        let old_log = log_dir.join(format!("app.log.{}", i));
        if old_log.exists() {
            fs::remove_file(&old_log)?;
        }
    }
    
    log::info!("All logs cleared");
    
    Ok(())
}

/// Log panic information
pub fn log_panic(info: &std::panic::PanicInfo) {
    log::error!("PANIC: {}", info);
    
    // Also write to a separate crash log
    let crash_log = get_log_dir().join("crash.log");
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&crash_log)
    {
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(file, "[{}] CRASH: {}", timestamp, info);
    }
}
