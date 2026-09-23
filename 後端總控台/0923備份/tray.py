"""
tray.py - HTA Work Platform System Tray
Pure ctypes, 64-bit compatible. No pystray needed.
Features:
  - Dashboard opens in separate Edge app window
  - Right-click menu shows all tools with running status
"""

import sys
import os
import ctypes
import ctypes.wintypes as wt
import threading
import subprocess
import time
import tempfile
import json

# ── SharedLib ────────────────────────────────────────────────
SHARED_LIB = r"\\tw100049089\00_MyAgent\Python\SharedLib"
if os.path.isdir(SHARED_LIB) and SHARED_LIB not in sys.path:
    sys.path.append(SHARED_LIB)

# ── Config ───────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
FLASK_URL   = "http://127.0.0.1:5100"
LAUNCHER_PY = os.path.join(BASE_DIR, "launcher.py")
ICON_PNG    = os.path.join(BASE_DIR, "tray_icon.png")
EDGE_PATHS  = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

# ── Windows API ──────────────────────────────────────────────
shell32  = ctypes.windll.shell32
user32   = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

LRESULT = ctypes.c_int64
LPARAM  = ctypes.c_int64
WPARAM  = ctypes.c_uint64
WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wt.HWND, wt.UINT, WPARAM, LPARAM)

user32.DefWindowProcW.restype  = LRESULT
user32.DefWindowProcW.argtypes = [wt.HWND, wt.UINT, WPARAM, LPARAM]
user32.CreateWindowExW.restype = wt.HWND
shell32.Shell_NotifyIconW.restype = wt.BOOL

WM_RBUTTONUP     = 0x0205
WM_LBUTTONDBLCLK = 0x0203
WM_COMMAND       = 0x0111
WM_DESTROY       = 0x0002
NIM_ADD, NIM_DELETE = 0, 2
NIF_MESSAGE, NIF_ICON, NIF_TIP = 1, 2, 4
TRAY_MSG     = 0x0401
IDM_DASHBOARD = 1001
IDM_QUIT      = 1002
IDM_SVC_BASE  = 2000   # service[i] = IDM_SVC_BASE + i

# ── Structures ───────────────────────────────────────────────
class NOTIFYICONDATA(ctypes.Structure):
    _fields_ = [
        ("cbSize",           wt.DWORD),
        ("hWnd",             wt.HWND),
        ("uID",              wt.UINT),
        ("uFlags",           wt.UINT),
        ("uCallbackMessage", wt.UINT),
        ("hIcon",            wt.HICON),
        ("szTip",            ctypes.c_wchar * 128),
    ]

class WNDCLASSEX(ctypes.Structure):
    _fields_ = [
        ("cbSize",        wt.UINT),
        ("style",         wt.UINT),
        ("lpfnWndProc",   WNDPROC),
        ("cbClsExtra",    ctypes.c_int),
        ("cbWndExtra",    ctypes.c_int),
        ("hInstance",     wt.HINSTANCE),
        ("hIcon",         wt.HICON),
        ("hCursor",       wt.HANDLE),
        ("hbrBackground", wt.HBRUSH),
        ("lpszMenuName",  wt.LPCWSTR),
        ("lpszClassName", wt.LPCWSTR),
        ("hIconSm",       wt.HICON),
    ]

class POINT(ctypes.Structure):
    _fields_ = [("x", wt.LONG), ("y", wt.LONG)]

class MSG(ctypes.Structure):
    _fields_ = [
        ("hWnd",    wt.HWND),
        ("message", wt.UINT),
        ("wParam",  WPARAM),
        ("lParam",  LPARAM),
        ("time",    wt.DWORD),
        ("pt",      POINT),
    ]

# ── Edge / browser helpers ───────────────────────────────────
def _find_edge():
    for p in EDGE_PATHS:
        if os.path.isfile(p):
            return p
    return "msedge"

def open_dashboard(icon=None, item=None):
    """Open dashboard in a new Edge app window (no tabs/navigation bar)."""
    edge = _find_edge()
    try:
        subprocess.Popen([edge, "--app=" + FLASK_URL, "--new-window"])
    except Exception:
        subprocess.Popen(['cmd', '/c', 'start', '', FLASK_URL])

def open_service(url):
    """Open a tool URL in default browser."""
    subprocess.Popen(['cmd', '/c', 'start', '', url])

def start_and_open_service(sid, url):
    """Start backend via Flask API, then open the URL."""
    import urllib.request
    try:
        req = urllib.request.Request(
            FLASK_URL + "/api/start/" + sid,
            data=b'{}',
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass
    # Wait a bit then open
    time.sleep(1)
    open_service(url)

# ── API helpers ──────────────────────────────────────────────
def get_services():
    import urllib.request
    try:
        resp = urllib.request.urlopen(FLASK_URL + "/api/services", timeout=3)
        return json.loads(resp.read())
    except Exception:
        return []

def http_post(path, payload=None):
    import urllib.request
    try:
        data = json.dumps(payload or {}).encode()
        req  = urllib.request.Request(
            FLASK_URL + path, data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception:
        return False

def wait_flask(timeout=30):
    import urllib.request
    for _ in range(timeout):
        try:
            urllib.request.urlopen(FLASK_URL, timeout=1)
            return True
        except Exception:
            time.sleep(1)
    return False

# ── Icon ─────────────────────────────────────────────────────
_ico_tmp = None

def load_hicon(png_path):
    global _ico_tmp
    try:
        from PIL import Image
        img = Image.open(png_path).resize((32, 32))
        _ico_tmp = tempfile.mktemp(suffix=".ico")
        img.save(_ico_tmp, format="ICO", sizes=[(32, 32)])
        h = user32.LoadImageW(None, _ico_tmp, 1, 32, 32, 0x10)
        if h:
            return h
    except Exception:
        pass
    return user32.LoadIconW(None, 32516)

# ── Tray icon ─────────────────────────────────────────────────
_hwnd = None
_menu_services = []   # built each right-click

def _tray_add(hwnd, hicon):
    nid = NOTIFYICONDATA()
    nid.cbSize           = ctypes.sizeof(NOTIFYICONDATA)
    nid.hWnd             = hwnd
    nid.uID              = 1
    nid.uFlags           = NIF_MESSAGE | NIF_ICON | NIF_TIP
    nid.uCallbackMessage = TRAY_MSG
    nid.hIcon            = hicon
    nid.szTip            = "HTA Work Platform"
    shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(nid))

def _tray_del(hwnd):
    nid = NOTIFYICONDATA()
    nid.cbSize = ctypes.sizeof(NOTIFYICONDATA)
    nid.hWnd   = hwnd
    nid.uID    = 1
    shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(nid))

def _show_menu(hwnd):
    global _menu_services
    _menu_services = get_services()   # fetch latest status

    hmenu = user32.CreatePopupMenu()
    pos   = 0

    # Dashboard
    user32.InsertMenuW(hmenu, pos, 0x400, IDM_DASHBOARD, "HTA Work Platform")
    pos += 1

    # Services
    if _menu_services:
        user32.InsertMenuW(hmenu, pos, 0x400 | 0x800, 0, None)  # separator
        pos += 1
        for i, svc in enumerate(_menu_services):
            dot   = "\u25cf " if svc.get("running") else "\u25cb "
            label = dot + svc.get("name", svc.get("id", "?"))
            user32.InsertMenuW(hmenu, pos, 0x400, IDM_SVC_BASE + i, label)
            pos += 1

    # Quit
    user32.InsertMenuW(hmenu, pos, 0x400 | 0x800, 0, None)
    user32.InsertMenuW(hmenu, pos + 1, 0x400, IDM_QUIT, "Quit")

    pt = POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    user32.SetForegroundWindow(hwnd)
    user32.TrackPopupMenu(hmenu, 0, pt.x, pt.y, 0, hwnd, None)
    user32.DestroyMenu(hmenu)

@WNDPROC
def _wnd_proc(hwnd, msg, wparam, lparam):
    global _ico_tmp
    if msg == TRAY_MSG:
        low = lparam & 0xFFFF
        if low == WM_LBUTTONDBLCLK:
            threading.Thread(target=open_dashboard, daemon=True).start()
        elif low == WM_RBUTTONUP:
            _show_menu(hwnd)
    elif msg == WM_COMMAND:
        cmd = wparam & 0xFFFF
        if cmd == IDM_DASHBOARD:
            threading.Thread(target=open_dashboard, daemon=True).start()
        elif IDM_SVC_BASE <= cmd < IDM_SVC_BASE + 100:
            idx = cmd - IDM_SVC_BASE
            if idx < len(_menu_services):
                svc = _menu_services[idx]
                url = svc.get("url", "")
                sid = svc.get("id", "")
                if svc.get("running"):
                    threading.Thread(target=open_service, args=(url,), daemon=True).start()
                else:
                    threading.Thread(target=start_and_open_service, args=(sid, url), daemon=True).start()
        elif cmd == IDM_QUIT:
            _tray_del(hwnd)
            http_post("/api/shutdown")
            if _ico_tmp and os.path.exists(_ico_tmp):
                try: os.remove(_ico_tmp)
                except: pass
            user32.PostQuitMessage(0)
    elif msg == WM_DESTROY:
        _tray_del(hwnd)
        user32.PostQuitMessage(0)
    return user32.DefWindowProcW(hwnd, msg, wparam, lparam)

# ── Tray run ─────────────────────────────────────────────────
def run_tray():
    global _hwnd
    hinstance  = kernel32.GetModuleHandleW(None)
    class_name = "HTATray2026B"

    wc = WNDCLASSEX()
    wc.cbSize        = ctypes.sizeof(WNDCLASSEX)
    wc.lpfnWndProc   = _wnd_proc
    wc.hInstance     = hinstance
    wc.lpszClassName = class_name
    user32.RegisterClassExW(ctypes.byref(wc))

    _hwnd = user32.CreateWindowExW(
        0x80, class_name, "HTA Tray",
        0x80000000, 0, 0, 0, 0,
        None, None, hinstance, None
    )
    hicon = load_hicon(ICON_PNG)
    _tray_add(_hwnd, hicon)

    msg = MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))

# ── Startup ──────────────────────────────────────────────────
def start_launcher():
    env = os.environ.copy()
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"]       = SHARED_LIB + (os.pathsep + existing if existing else "")
    env["PYTHONIOENCODING"] = "utf-8"
    env["HTA_TRAY_MODE"]    = "1"
    subprocess.Popen(
        [sys.executable, LAUNCHER_PY],
        cwd=BASE_DIR, env=env,
        creationflags=subprocess.CREATE_NO_WINDOW
    )

def startup():
    import urllib.request
    already_up = False
    try:
        urllib.request.urlopen(FLASK_URL, timeout=2)
        already_up = True
    except Exception:
        pass
    if not already_up:
        start_launcher()
    if wait_flask(30):
        open_dashboard()

# ── Main ─────────────────────────────────────────────────────
if __name__ == "__main__":
    threading.Thread(target=startup, daemon=True).start()
    run_tray()
