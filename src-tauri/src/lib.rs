use std::{io::{Read, Write}, path::PathBuf, process::{Command, Stdio}, thread, time::{Duration, Instant}};

#[tauri::command]
fn run_pynite_analysis(input_json: String, timeout_ms: Option<u64>) -> Result<String, String> {
    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().ok_or("Could not resolve STRUX project root.")?.to_path_buf();
    let python = project_root.join(".venv").join("Scripts").join("python.exe");
    let runner = project_root.join("src").join("solver").join("python").join("strux_pynite_runner.py");
    if !python.is_file() { return Err(format!("Configured STRUX Python interpreter is unavailable: {}", python.display())); }
    if !runner.is_file() { return Err(format!("PyNite runner is unavailable: {}", runner.display())); }
    let mut child = Command::new(python)
        .arg("-u").arg(runner)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|error| format!("Could not start the isolated PyNite runner: {error}"))?;
    child.stdin.take().ok_or("Could not open runner input.")?.write_all(input_json.as_bytes()).map_err(|error| format!("Could not write solver input: {error}"))?;
    let stdout = child.stdout.take().ok_or("Could not open runner output.")?;
    let stderr = child.stderr.take().ok_or("Could not open runner diagnostics.")?;
    let out_handle = thread::spawn(move || { let mut text = String::new(); let _ = std::io::BufReader::new(stdout).read_to_string(&mut text); text });
    let err_handle = thread::spawn(move || { let mut text = String::new(); let _ = std::io::BufReader::new(stderr).read_to_string(&mut text); text });
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(15_000).clamp(1_000, 60_000));
    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|error| format!("Could not monitor PyNite runner: {error}"))? {
            let output = out_handle.join().unwrap_or_default();
            let diagnostics = err_handle.join().unwrap_or_default();
            if status.success() { return Ok(output); }
            return Err(format!("PyNite runner exited with {status}. {diagnostics}"));
        }
        if started.elapsed() >= timeout {
            let _ = child.kill(); let _ = child.wait();
            let _ = out_handle.join(); let diagnostics = err_handle.join().unwrap_or_default();
            return Err(format!("PyNite runner timeout after {} ms. {diagnostics}", timeout.as_millis()));
        }
        thread::sleep(Duration::from_millis(20));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![run_pynite_analysis])
        .run(tauri::generate_context!())
        .expect("error while running STRUX");
}
