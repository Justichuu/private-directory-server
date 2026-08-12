using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
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
        private bool _allowNetworkAccess;

        public TrayApplicationContext()
        {
            _repoRoot = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            _settingsPath = Path.Combine(_repoRoot, "gui", "settings.txt");
            _logPath = Path.Combine(_repoRoot, "gui", "server.log");
            var isFirstRun = !File.Exists(_settingsPath);
            LoadSettings();

            _openBrowserItem = new ToolStripMenuItem("Open in Browser", null, (s, e) => OpenBrowser()) { Enabled = false };
            _toggleItem = new ToolStripMenuItem("Start Server", null, (s, e) => ToggleServer());
            _folderItem = new ToolStripMenuItem(FolderLabel(), null, (s, e) => ChooseFolder());
            var showPhoneItem = new ToolStripMenuItem("Show Phone Address / QR Code...", null, (s, e) => ShowPhoneQr());
            var copyAddressItem = new ToolStripMenuItem("Copy Server Address", null, (s, e) => CopyAddress());
            var viewLogItem = new ToolStripMenuItem("View Log", null, (s, e) => ViewLog());
            var exitItem = new ToolStripMenuItem("Exit", null, (s, e) => ExitApplication());

            var menu = new ContextMenuStrip();
            menu.Items.Add(_openBrowserItem);
            menu.Items.Add(_toggleItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(_folderItem);
            menu.Items.Add(showPhoneItem);
            menu.Items.Add(copyAddressItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(viewLogItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(exitItem);

            _trayIcon = new NotifyIcon
            {
                Icon = CreateTrayIcon(),
                Text = "Private Directory Server (stopped)",
                ContextMenuStrip = menu,
                Visible = true,
            };
            _trayIcon.DoubleClick += (s, e) => ToggleServer();

            Application.ApplicationExit += (s, e) => StopServer();

            if (isFirstRun)
            {
                MessageBox.Show(
                    "Private Directory Server is now running in your system tray.\n\n"
                    + "If you don't see its icon near the clock, click the small ^ arrow to show hidden icons.\n\n"
                    + "Right-click the icon and choose \"Start Server\" to begin.",
                    "Private Directory Server", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                _trayIcon.ShowBalloonTip(6000, "Private Directory Server",
                    "Running in the tray. If you don't see this icon, click the ^ arrow near the clock, then right-click it to start the server.",
                    ToolTipIcon.Info);
            }
        }

        /// A small, distinctive icon drawn at runtime so the tray entry
        /// doesn't blend in with the generic system icon.
        private static Icon CreateTrayIcon()
        {
            using (var bitmap = new Bitmap(32, 32))
            using (var g = Graphics.FromImage(bitmap))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);
                using (var brush = new SolidBrush(Color.FromArgb(255, 37, 99, 235)))
                {
                    g.FillEllipse(brush, 1, 1, 30, 30);
                }
                using (var pen = new Pen(Color.White, 3) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                {
                    g.DrawLine(pen, 9, 16, 14, 22);
                    g.DrawLine(pen, 14, 22, 24, 9);
                }
                var handle = bitmap.GetHicon();
                return Icon.FromHandle(handle);
            }
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
                    else if (key == "AllowNetworkAccess") _allowNetworkAccess = value == "true";
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
                "AllowNetworkAccess=" + (_allowNetworkAccess ? "true" : "false"),
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

        private void ShowPhoneQr()
        {
            if (!EnsureNetworkAccessEnabled()) return;

            if (_serverProcess == null || _serverProcess.HasExited)
            {
                if (!PromptForSharedFolder()) return;
                StartServerWithCurrentFolder();
                if (_serverProcess == null) return;
            }

            var ip = GetLocalIPAddress();
            if (ip == null)
            {
                MessageBox.Show("Could not find a network address for this PC. Make sure it's connected to Wi-Fi or Ethernet.",
                    "Private Directory Server", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var phoneUrl = "http://" + ip + ":" + _port;
            using (var form = new PhoneAccessForm(phoneUrl, _accessToken))
            {
                form.ShowDialog();
            }
        }

        /// Network binding requires an access token (see src/config.ts), so
        /// turning this on generates one the first time it's needed. Asks
        /// first, since this is a real change in what's reachable from the
        /// network, not something to flip on silently.
        private bool EnsureNetworkAccessEnabled()
        {
            if (_allowNetworkAccess) return true;

            var confirm = MessageBox.Show(
                "This makes the server reachable from other devices on this Wi-Fi network, not just this PC, "
                + "protected by a private access code.\n\nTurn this on?",
                "Private Directory Server", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (confirm != DialogResult.Yes) return false;

            _allowNetworkAccess = true;
            _host = "0.0.0.0";
            if (string.IsNullOrEmpty(_accessToken)) _accessToken = GenerateAccessToken();
            SaveSettings();

            if (_serverProcess != null && !_serverProcess.HasExited)
            {
                StopServer();
                StartServerWithCurrentFolder();
            }
            return true;
        }

        private static string GenerateAccessToken()
        {
            var bytes = new byte[16];
            using (var rng = new RNGCryptoServiceProvider()) rng.GetBytes(bytes);
            var builder = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) builder.Append(b.ToString("x2"));
            return builder.ToString();
        }

        /// Prefers a Wi-Fi or Ethernet adapter's address over VPN/virtual
        /// adapters, since that's what a phone on the same network needs.
        private static string GetLocalIPAddress()
        {
            var interfaces = NetworkInterface.GetAllNetworkInterfaces();
            foreach (var preferredType in new[] { NetworkInterfaceType.Wireless80211, NetworkInterfaceType.Ethernet })
            {
                foreach (var ni in interfaces)
                {
                    if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType != preferredType) continue;
                    var address = FirstIPv4Address(ni);
                    if (address != null) return address;
                }
            }
            foreach (var ni in interfaces)
            {
                if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                var address = FirstIPv4Address(ni);
                if (address != null) return address;
            }
            return null;
        }

        private static string FirstIPv4Address(NetworkInterface ni)
        {
            foreach (var addr in ni.GetIPProperties().UnicastAddresses)
            {
                if (addr.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(addr.Address))
                    return addr.Address.ToString();
            }
            return null;
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
