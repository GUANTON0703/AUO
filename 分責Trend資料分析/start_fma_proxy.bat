@if (@X)==(@Y) @end /*
@echo off
cscript //nologo //e:jscript "%~f0"
exit /b
*/

var sh  = new ActiveXObject("WScript.Shell");
var fso = new ActiveXObject("Scripting.FileSystemObject");
var dir = fso.GetParentFolderName(WScript.ScriptFullName) + "\\";

// ── 設定：共用 Server IP（若有，填入；沒有填空字串）──────
var SHARED_SERVER = "";   // 例: "http://192.168.1.100:5050"
var LOCAL_PORT    = 5050;
// ─────────────────────────────────────────────────────────

var html = dir + "L8B_DEFECT_Monitor_v12.html";

// ── 偵測 Server 是否已在線 ───────────────────────────────
function checkServer(baseUrl) {
    try {
        var xhr = new ActiveXObject("Microsoft.XMLHTTP");
        xhr.Open("GET", baseUrl + "/health", false);
        xhr.Send();
        return xhr.status === 200;
    } catch(e) {
        return false;
    }
}

// 1. 先試共用 Server
if (SHARED_SERVER && checkServer(SHARED_SERVER)) {
    WScript.Echo("連線到共用 Server: " + SHARED_SERVER);
    sh.Run("\"" + html + "\"", 1, false);
    WScript.Quit();
}

// 2. 再試本機 Server（已在跑）
if (checkServer("http://localhost:" + LOCAL_PORT)) {
    sh.Run("\"" + html + "\"", 1, false);
    WScript.Quit();
}

// 3. 都沒有 → 自己啟動本機 Server

// 找 Python
var python = "";
var candidates = [
    sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") + "\\Programs\\Python\\Python312\\python.exe",
    sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") + "\\Programs\\Python\\Python311\\python.exe",
    sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") + "\\Programs\\Python\\Python310\\python.exe",
    sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") + "\\Programs\\Python\\Python39\\python.exe",
    sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") + "\\Programs\\Python\\Python38\\python.exe",
    "C:\\Python312\\python.exe",
    "C:\\Python38\\python.exe"
];
for (var i = 0; i < candidates.length; i++) {
    if (fso.FileExists(candidates[i])) { python = candidates[i]; break; }
}
if (!python) {
    WScript.Echo("找不到 Python，請安裝 Python 3.8 以上版本。");
    WScript.Quit(1);
}

// 檢查並自動安裝 pymysql
var checkPy = sh.Exec("\"" + python + "\" -c \"import pymysql\"");
checkPy.StdOut.ReadAll();
checkPy.StdErr.ReadAll();
if (checkPy.ExitCode !== 0) {
    WScript.Echo("正在安裝 pymysql，請稍候...");
    var install = sh.Run("\"" + python + "\" -m pip install pymysql", 1, true);
    if (install !== 0) {
        WScript.Echo("pymysql 安裝失敗，請手動執行: pip install pymysql");
        WScript.Quit(1);
    }
}

// 啟動 app.py
var appPy = dir + "app.py";
var tmp = sh.ExpandEnvironmentStrings("%TEMP%") + "\\l8b_start.bat";
var f = fso.CreateTextFile(tmp, true, false);
f.WriteLine("@echo off");
f.WriteLine("start \"L8B Server\" cmd /k \"\"" + python + "\" \"" + appPy + "\"\"");
f.Close();
sh.Run("\"" + tmp + "\"", 1, false);

// 等 Server 啟動
WScript.Sleep(2500);

// 開 HTML
sh.Run("\"" + html + "\"", 1, false);
