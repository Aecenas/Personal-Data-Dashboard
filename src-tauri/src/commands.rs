use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::AsyncReadExt;
use tokio::process::Command;

#[derive(Debug, Deserialize)]
pub struct RunPythonScriptRequest {
    pub script_path: String,
    pub args: Vec<String>,
    pub python_path: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct RunPythonScriptResponse {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub duration_ms: u128,
}

#[derive(Debug, Deserialize)]
pub struct ValidatePythonScriptRequest {
    pub script_path: String,
    pub python_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ValidatePythonScriptResponse {
    pub valid: bool,
    pub message: Option<String>,
    pub resolved_python: Option<String>,
}

#[derive(Debug, Clone)]
struct PythonCandidate {
    program: String,
    pre_args: Vec<String>,
    display_name: String,
}

fn python_candidates(python_path: &Option<String>) -> Vec<PythonCandidate> {
    if let Some(path) = python_path {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return vec![PythonCandidate {
                program: trimmed.to_string(),
                pre_args: vec![],
                display_name: trimmed.to_string(),
            }];
        }
    }

    #[cfg(target_os = "windows")]
    {
        vec![
            PythonCandidate {
                program: "python".to_string(),
                pre_args: vec![],
                display_name: "python".to_string(),
            },
            PythonCandidate {
                program: "py".to_string(),
                pre_args: vec!["-3".to_string()],
                display_name: "py -3".to_string(),
            },
        ]
    }

    #[cfg(not(target_os = "windows"))]
    {
        vec![
            PythonCandidate {
                program: "python3".to_string(),
                pre_args: vec![],
                display_name: "python3".to_string(),
            },
            PythonCandidate {
                program: "python".to_string(),
                pre_args: vec![],
                display_name: "python".to_string(),
            },
        ]
    }
}

async fn is_candidate_available(candidate: &PythonCandidate) -> bool {
    let mut command = Command::new(&candidate.program);
    for arg in &candidate.pre_args {
        command.arg(arg);
    }

    command
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    match command.status().await {
        Ok(status) => status.success(),
        Err(_) => false,
    }
}

async fn execute_with_candidate(
    request: &RunPythonScriptRequest,
    timeout: Duration,
    candidate: &PythonCandidate,
) -> Result<RunPythonScriptResponse, std::io::Error> {
    let start_time = Instant::now();

    let mut command = Command::new(&candidate.program);
    for arg in &candidate.pre_args {
        command.arg(arg);
    }

    command
        .arg(&request.script_path)
        .args(&request.args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn()?;

    let mut stdout = child
        .stdout
        .take()
        .expect("stdout pipe should be available");
    let mut stderr = child
        .stderr
        .take()
        .expect("stderr pipe should be available");

    let stdout_handle = tokio::spawn(async move {
        let mut buffer = Vec::new();
        stdout.read_to_end(&mut buffer).await.map(|_| buffer)
    });
    let stderr_handle = tokio::spawn(async move {
        let mut buffer = Vec::new();
        stderr.read_to_end(&mut buffer).await.map(|_| buffer)
    });

    let mut timed_out = false;
    let status = match tokio::time::timeout(timeout, child.wait()).await {
        Ok(status_result) => status_result?,
        Err(_) => {
            timed_out = true;
            let _ = child.kill().await;
            child.wait().await?
        }
    };

    let stdout_bytes = stdout_handle.await.unwrap_or_else(|_| Ok(Vec::new()))?;
    let stderr_bytes = stderr_handle.await.unwrap_or_else(|_| Ok(Vec::new()))?;

    let stdout = String::from_utf8_lossy(&stdout_bytes).to_string();
    let stderr = String::from_utf8_lossy(&stderr_bytes).to_string();

    Ok(RunPythonScriptResponse {
        ok: !timed_out && status.success(),
        stdout,
        stderr,
        exit_code: status.code(),
        timed_out,
        duration_ms: start_time.elapsed().as_millis(),
    })
}

fn validate_script_path(script_path: &str) -> Result<(), String> {
    if script_path.trim().is_empty() {
        return Err("script_path is required".to_string());
    }

    let path = Path::new(script_path);
    if !path.exists() {
        return Err(format!("script file not found: {}", script_path));
    }

    if !path.is_file() {
        return Err(format!("script path is not a file: {}", script_path));
    }

    if path.extension().and_then(|ext| ext.to_str()) != Some("py") {
        return Err("script must be a .py file".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn run_python_script(
    request: RunPythonScriptRequest,
) -> Result<RunPythonScriptResponse, String> {
    validate_script_path(&request.script_path)?;

    let timeout_ms = request.timeout_ms.unwrap_or(10_000).clamp(1_000, 120_000);
    let timeout = Duration::from_millis(timeout_ms);

    let candidates = python_candidates(&request.python_path);

    let mut last_error: Option<String> = None;

    for candidate in &candidates {
        match execute_with_candidate(&request, timeout, candidate).await {
            Ok(response) => return Ok(response),
            Err(error) => {
                if error.kind() == std::io::ErrorKind::NotFound {
                    last_error = Some(format!("python interpreter not found: {}", candidate.display_name));
                    continue;
                }

                return Err(format!(
                    "failed to execute script with {}: {}",
                    candidate.display_name, error
                ));
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "failed to find available python interpreter".to_string()))
}

#[tauri::command]
pub async fn validate_python_script(
    request: ValidatePythonScriptRequest,
) -> Result<ValidatePythonScriptResponse, String> {
    if let Err(message) = validate_script_path(&request.script_path) {
        return Ok(ValidatePythonScriptResponse {
            valid: false,
            message: Some(message),
            resolved_python: None,
        });
    }

    let candidates = python_candidates(&request.python_path);
    for candidate in candidates {
        if is_candidate_available(&candidate).await {
            return Ok(ValidatePythonScriptResponse {
                valid: true,
                message: Some("script and interpreter are valid".to_string()),
                resolved_python: Some(candidate.display_name),
            });
        }
    }

    Ok(ValidatePythonScriptResponse {
        valid: false,
        message: Some("python interpreter is not available".to_string()),
        resolved_python: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_python_path_has_highest_priority() {
        let candidates = python_candidates(&Some("/custom/python".to_string()));
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].program, "/custom/python".to_string());
    }

    #[test]
    fn invalid_script_extension_should_fail_validation() {
        let result = validate_script_path("/tmp/not_python.txt");
        assert!(result.is_err());
    }
}
