using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal sealed class StudyDesk
{
#if PRIVATE_EDITION
    private const int Port = 47853;
    private const string Title = "Mathematics Study Desk (Private)";
#else
    private const int Port = 47852;
    private const string Title = "Mathematics Study Desk";
#endif
    private static readonly string Host = "127.0.0.1:" + Port;
    private static readonly string Home = "http://" + Host + "/";

    private static readonly Dictionary<string, string> ContentTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        { ".html", "text/html; charset=utf-8" },
        { ".css", "text/css; charset=utf-8" },
        { ".js", "text/javascript; charset=utf-8" },
        { ".json", "application/json; charset=utf-8" },
        { ".webmanifest", "application/manifest+json; charset=utf-8" },
        { ".png", "image/png" },
        { ".ico", "image/x-icon" },
        { ".svg", "image/svg+xml" },
        { ".webp", "image/webp" },
        { ".gif", "image/gif" },
        { ".jpg", "image/jpeg" },
        { ".jpeg", "image/jpeg" },
        { ".woff", "font/woff" },
        { ".woff2", "font/woff2" },
        { ".ttf", "font/ttf" }
    };

    [STAThread]
    private static int Main(string[] args)
    {
        bool serveOnly = args.Contains("--serve-only");
        bool acquired;
        using (var instance = new Mutex(true, "Local\\MathematicsStudyDesk" + Port, out acquired))
        {
            if (!acquired)
            {
                if (!serveOnly) OpenDesk();
                return 0;
            }

            try
            {
                var assets = LoadAssets();
                var listener = new TcpListener(IPAddress.Loopback, Port);
                listener.Server.ExclusiveAddressUse = true;
                listener.Start();
                var server = new Thread(() => Serve(listener, assets));
                server.IsBackground = true;
                server.Start();

                try
                {
                    if (serveOnly) server.Join();
                    else RunTray();
                }
                finally { listener.Stop(); }
                return 0;
            }
            catch (Exception error)
            {
                if (!serveOnly) MessageBox.Show(error.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }

    private static Dictionary<string, byte[]> LoadAssets()
    {
        var assets = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("MathFinalsWeb"))
        using (var archive = new ZipArchive(resource, ZipArchiveMode.Read))
        {
            foreach (ZipArchiveEntry entry in archive.Entries)
            using (Stream file = entry.Open())
            using (var bytes = new MemoryStream())
            {
                file.CopyTo(bytes);
                assets.Add("/" + entry.FullName, bytes.ToArray());
            }
        }
        return assets;
    }

    private static void RunTray()
    {
        Application.EnableVisualStyles();
        using (var icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath))
        using (var menu = new ContextMenuStrip())
        using (var tray = new NotifyIcon { Icon = icon, Text = Title, ContextMenuStrip = menu, Visible = true })
        {
            menu.Items.Add("Open study desk", null, (sender, args) => OpenDesk());
            menu.Items.Add("Exit", null, (sender, args) => Application.ExitThread());
            tray.DoubleClick += (sender, args) => OpenDesk();
            OpenDesk();
            Application.Run();
        }
    }

    private static void OpenDesk()
    {
        string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            "Microsoft", "Edge", "Application", "msedge.exe");
        var launch = File.Exists(edgePath)
            ? new ProcessStartInfo(edgePath, "--app=" + Home)
            : new ProcessStartInfo(Home);
        using (Process.Start(launch)) { }
    }

    private static void Serve(TcpListener listener, Dictionary<string, byte[]> assets)
    {
        while (true)
        {
            TcpClient client;
            try { client = listener.AcceptTcpClient(); }
            catch (SocketException) { return; }
            catch (ObjectDisposedException) { return; }
            ThreadPool.QueueUserWorkItem(_ => Respond(client, assets));
        }
    }

    private static void Respond(TcpClient client, Dictionary<string, byte[]> assets)
    {
        using (client)
        {
            client.ReceiveTimeout = 2500;
            client.SendTimeout = 2500;
            try
            {
                NetworkStream stream = client.GetStream();
                string headers = ReadHeaders(stream);
                string[] lines = headers.Split(new[] { "\r\n" }, StringSplitOptions.None);
                string[] request = lines[0].Split(' ');
                bool authorizedHost = lines.Skip(1).Any(line => line.StartsWith("Host:", StringComparison.OrdinalIgnoreCase)
                    && line.Substring(5).Trim() == Host);
                if (request.Length != 3 || !authorizedHost || !request[1].StartsWith("/", StringComparison.Ordinal))
                {
                    Send(stream, "400 Bad Request", "text/plain", new byte[0], true);
                    return;
                }

                bool head = request[0] == "HEAD";
                if (!head && request[0] != "GET")
                {
                    Send(stream, "405 Method Not Allowed", "text/plain", new byte[0], true);
                    return;
                }

                string path = Uri.UnescapeDataString(request[1].Split('?')[0]);
                if (path == "/") path = "/index.html";
                byte[] body;
                string contentType;
                if (path == "/vendor/katex/LICENSE" && assets.TryGetValue(path, out body))
                    Send(stream, "200 OK", "text/plain; charset=utf-8", body, head);
                else if (assets.TryGetValue(path, out body) && ContentTypes.TryGetValue(Path.GetExtension(path), out contentType))
                    Send(stream, "200 OK", contentType, body, head);
                else
                    Send(stream, "404 Not Found", "text/plain", new byte[0], true);
            }
            catch (IOException) { }
            catch (ArgumentException) { }
        }
    }

    private static string ReadHeaders(NetworkStream stream)
    {
        var buffer = new byte[16384];
        var ending = new byte[] { 13, 10, 13, 10 };
        int matched = 0;
        for (int index = 0; index < buffer.Length; index++)
        {
            int next = stream.ReadByte();
            if (next < 0) break;
            buffer[index] = (byte)next;
            matched = next == ending[matched] ? matched + 1 : (next == ending[0] ? 1 : 0);
            if (matched == ending.Length) return Encoding.ASCII.GetString(buffer, 0, index + 1);
        }
        return "";
    }

    private static void Send(NetworkStream stream, string status, string type, byte[] body, bool head)
    {
        string headers = "HTTP/1.1 " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.Length
            + "\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\n"
            + "Content-Security-Policy: frame-ancestors 'none'\r\nConnection: close\r\n\r\n";
        byte[] encoded = Encoding.ASCII.GetBytes(headers);
        stream.Write(encoded, 0, encoded.Length);
        if (!head) stream.Write(body, 0, body.Length);
    }
}
