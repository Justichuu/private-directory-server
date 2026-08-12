using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace PrivateDirectoryServer
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TrayApplicationContext());
        }
    }

    /// Consoleless system-tray front end for the server. Compiled with the
    /// csc.exe that ships with Windows/.NET Framework, so it adds no
    /// npm dependency to the project.
    internal sealed class TrayApplicationContext : ApplicationContext
    {
        private readonly string _repoRoot;
        private readonly string _settingsPath;
        private readonly string _logPath;
        private readonly NotifyIcon _trayIcon;
        private readonly ToolStripMenuItem _toggleItem;
        private readonly ToolStripMenuItem _openBrowserItem;
        private readonly ToolStripMenuItem _folderItem;
        private Process _serverProcess;
        private string _sharedFolder;
        private int _port = 8000;
        private string _host = "127.0.0.1";
        private string _accessToken = "";

        public TrayApplicationContext()
        {
            _repoRoot = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            _settingsPath = Path.Combine(_repoRoot, "gui", "settings.txt");
            _logPath = Path.Combine(_repoRoot, "gui", "server.log");
            LoadSettings();

            _openBrowserItem = new ToolStripMenuItem("Open in Browser", null, (s, e) => OpenBrowser()) { Enabled = false };
            _toggleItem = new ToolStripMenuItem("Start Server", null, (s, e) => ToggleServer());
            _folderItem = new ToolStripMenuItem(FolderLabel(), null, (s, e) => ChooseFolder());
            var copyAddressItem = new ToolStripMenuItem("Copy Server Address", null, (s, e) => CopyAddress());
            var viewLogItem = new ToolStripMenuItem("View Log", null, (s, e) => ViewLog());
            var exitItem = new ToolStripMenuItem("Exit", null, (s, e) => ExitApplication());

            var menu = new ContextMenuStrip();
            menu.Items.Add(_openBrowserItem);
            menu.Items.Add(_toggleItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(_folderItem);
            menu.Items.Add(copyAddressItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(viewLogItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(exitItem);

            _trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "Private Directory Server (stopped)",
                ContextMenuStrip = menu,
                Visible = true,
            };
            _trayIcon.DoubleClick += (s, e) => ToggleServer();

            Application.ApplicationExit += (s, e) => StopServer();
        }

        private string FolderLabel()
        {
            return "Shared Folder: " + _sharedFolder;
        }

        private void LoadSettings()
        {
            _sharedFolder = _repoRoot;
            if (File.Exists(_settingsPath))
            {
                foreach (var line in File.ReadAllLines(_settingsPath))
                {
                    var separatorIndex = line.IndexOf('=');
                    if (separatorIndex <= 0) continue;
                    var key = line.Substring(0, separatorIndex).Trim();
                    var value = line.Substring(separatorIndex + 1).Trim();
                    if (key == "SharedFolder" && value.Length > 0 && Directory.Exists(value)) _sharedFolder = value;
                    else if (key == "Port")
                    {
                        int parsedPort;
                        if (int.TryParse(value, out parsedPort)) _port = parsedPort;
                    }
                    else if (key == "Host" && value.Length > 0) _host = value;
                    else if (key == "AccessToken") _accessToken = value;
                }
            }
        }

        private void SaveSettings()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_settingsPath));
            var lines = new[]
            {
                "SharedFolder=" + _sharedFolder,
                "Port=" + _port,
                "Host=" + _host,
                "AccessToken=" + _accessToken,
            };
            File.WriteAllLines(_settingsPath, lines);
        }

        private void ToggleServer()
        {
            if (_serverProcess != null && !_serverProcess.HasExited) StopServer();
            else StartServer();
        }

        private void StartServer()
        {
            if (!PromptForSharedFolder()) return;
            StartServerWithCurrentFolder();
        }

        /// Shows the folder picker and stores the result in _sharedFolder.
        /// Returns false if the user cancelled, in which case the caller
        /// should not proceed.
        private bool PromptForSharedFolder()
        {
            using (var dialog = new FolderBrowserDialog())
            {
                dialog.SelectedPath = Directory.Exists(_sharedFolder) ? _sharedFolder : _repoRoot;
                dialog.Description = "Choose the folder to share";
                if (dialog.ShowDialog() != DialogResult.OK) return false;

                _sharedFolder = dialog.SelectedPath;
                _folderItem.Text = FolderLabel();
                SaveSettings();
                return true;
            }
        }

        private void StartServerWithCurrentFolder()
        {
            if (!EnsureBuilt()) return;

            var nodeExecutable = FindOnPath("node.exe");
            if (nodeExecutable == null)
            {
                MessageBox.Show(
                    "Node.js 22 or newer is required. Install it from nodejs.org, then try again.",
                    "Private Directory Server", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = nodeExecutable,
                Arguments = "\"" + Path.Combine(_repoRoot, "dist", "src", "server.js") + "\"",
                WorkingDirectory = _repoRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            startInfo.EnvironmentVariables["DIRECTORY_ROOT"] = _sharedFolder;
            startInfo.EnvironmentVariables["PORT"] = _port.ToString();
            startInfo.EnvironmentVariables["HOST"] = _host;
            if (!string.IsNullOrEmpty(_accessToken)) startInfo.EnvironmentVariables["ACCESS_TOKEN"] = _accessToken;

            try
            {
                File.WriteAllText(_logPath, "");
                _serverProcess = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
                _serverProcess.OutputDataReceived += (s, e) => AppendLog(e.Data);
                _serverProcess.ErrorDataReceived += (s, e) => AppendLog(e.Data);
                _serverProcess.Exited += (s, e) => OnServerExited();
                _serverProcess.Start();
                _serverProcess.BeginOutputReadLine();
                _serverProcess.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not start the server: " + ex.Message, "Private Directory Server",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            _toggleItem.Text = "Stop Server";
            _openBrowserItem.Enabled = true;
            _trayIcon.Text = "Private Directory Server (running on " + _host + ":" + _port + ")";
            _trayIcon.ShowBalloonTip(3000, "Private Directory Server", "Serving " + _sharedFolder, ToolTipIcon.Info);
            SaveSettings();
            OpenBrowser();
        }

        private void AppendLog(string line)
        {
            if (line == null) return;
            try { File.AppendAllText(_logPath, line + Environment.NewLine); }
            catch (IOException) { }
        }

        private void OnServerExited()
        {
            _serverProcess = null;
            _toggleItem.Text = "Start Server";
            _openBrowserItem.Enabled = false;
            _trayIcon.Text = "Private Directory Server (stopped)";
        }

        private void StopServer()
        {
            if (_serverProcess == null) return;
            try
            {
                if (!_serverProcess.HasExited) _serverProcess.Kill();
            }
            catch (InvalidOperationException) { }
            _serverProcess = null;
            _toggleItem.Text = "Start Server";
            _openBrowserItem.Enabled = false;
            _trayIcon.Text = "Private Directory Server (stopped)";
        }

        private bool EnsureBuilt()
        {
            var builtEntryPoint = Path.Combine(_repoRoot, "dist", "src", "server.js");
            if (File.Exists(builtEntryPoint)) return true;

            _trayIcon.ShowBalloonTip(5000, "Private Directory Server",
                "Setting up for the first time. This can take a minute...", ToolTipIcon.Info);

            if (FindOnPath("npm.cmd") == null)
            {
                MessageBox.Show("Node.js 22 or newer is required. Install it from nodejs.org, then try again.",
                    "Private Directory Server", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            if (!RunSetupStep("ci")) return false;
            if (!RunSetupStep("run build")) return false;
            return File.Exists(builtEntryPoint);
        }

        /// npm.cmd is a batch file: it cannot be launched directly with
        /// UseShellExecute=false, so cmd.exe /c runs it instead.
        private bool RunSetupStep(string npmArguments)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c npm " + npmArguments,
                WorkingDirectory = _repoRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            using (var setupProcess = Process.Start(startInfo))
            {
                var output = setupProcess.StandardOutput.ReadToEnd();
                var error = setupProcess.StandardError.ReadToEnd();
                setupProcess.WaitForExit();
                File.AppendAllText(_logPath, output + error);
                if (setupProcess.ExitCode != 0)
                {
                    MessageBox.Show("Setup step 'npm " + npmArguments + "' failed. See gui\\server.log for details.",
                        "Private Directory Server", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return false;
                }
            }
            return true;
        }

        private static string FindOnPath(string fileName)
        {
            var pathVariable = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (var directory in pathVariable.Split(Path.PathSeparator))
            {
                try
                {
                    var candidate = Path.Combine(directory, fileName);
                    if (File.Exists(candidate)) return candidate;
                }
                catch (ArgumentException) { }
            }
            return null;
        }

        private string ServerUrl()
        {
            return "http://" + (_host == "0.0.0.0" ? "127.0.0.1" : _host) + ":" + _port;
        }

        private void OpenBrowser()
        {
            try { Process.Start(new ProcessStartInfo(ServerUrl()) { UseShellExecute = true }); }
            catch (Exception) { }
        }

        private void CopyAddress()
        {
            Clipboard.SetText(ServerUrl());
            _trayIcon.ShowBalloonTip(2000, "Private Directory Server", "Copied " + ServerUrl(), ToolTipIcon.Info);
        }

        private void ChooseFolder()
        {
            if (!PromptForSharedFolder()) return;

            var wasRunning = _serverProcess != null && !_serverProcess.HasExited;
            if (wasRunning)
            {
                StopServer();
                StartServerWithCurrentFolder();
            }
            else
            {
                MessageBox.Show("Shared folder updated. It will be used next time you start the server.",
                    "Private Directory Server", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private void ViewLog()
        {
            if (!File.Exists(_logPath)) File.WriteAllText(_logPath, "");
            Process.Start(new ProcessStartInfo("notepad.exe", "\"" + _logPath + "\"") { UseShellExecute = true });
        }

        private void ExitApplication()
        {
            StopServer();
            _trayIcon.Visible = false;
            Application.Exit();
        }
    }
}
