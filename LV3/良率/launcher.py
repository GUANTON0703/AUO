"""
launcher.py — SDATA 3.0 啟動器
打包指令（專案根目錄執行）：
    pyinstaller --onefile --noconsole --add-data "app.py;." --name "SDATA啟動器" launcher.py
"""

import os
import sys
import time
import threading
import webbrowser

# ── PyInstaller 打包後找到 app.py ────────────────────────────
if getattr(sys, 'frozen', False):
    _BASE = sys._MEIPASS
else:
    _BASE = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, _BASE)

# ── 設定預設 index.html 路徑（app.py import 前設定）────────────
os.environ.setdefault('SDATA_INDEX_HTML',
    r'\\tw100049089\00_MyAgent\FMA\index.html')

# ── import app（會觸發所有 import：zeep/lxml/requests 等重量套件）
import app as _app
_app.INDEX_HTML_PATH = os.environ['SDATA_INDEX_HTML']

PORT    = _app.PORT
URL     = 'http://localhost:{}'.format(PORT)
_server_ok  = False    # server 啟動成功旗標
_server_err = None     # 若啟動失敗，記錄錯誤


# ══════════════════════════════════════════════════
#  背景執行緒：啟動 HTTP Server
# ══════════════════════════════════════════════════
def _run_server():
    global _server_ok, _server_err
    try:
        from http.server import HTTPServer
        server = HTTPServer((_app.HOST, PORT), _app.Handler)
        _server_ok = True
        server.serve_forever()
    except OSError as e:
        _server_err = str(e)
    except Exception as e:
        _server_err = str(e)


# ══════════════════════════════════════════════════
#  等待 Server 就緒後開瀏覽器
#  ✅ 修正：等待時間從 8 秒拉長到 30 秒，應對 zeep/lxml 慢啟動
# ══════════════════════════════════════════════════
def _wait_and_open():
    import urllib.request
    max_wait = 30       # 最多等 30 秒
    interval = 0.5      # 每 0.5 秒 ping 一次

    for i in range(int(max_wait / interval)):
        # 若 server 啟動失敗就提前放棄
        if _server_err:
            _show_error('Server 啟動失敗：\n{}'.format(_server_err))
            return

        try:
            urllib.request.urlopen(URL + '/api/ping', timeout=2)
            # ── 成功：開瀏覽器 ──
            webbrowser.open(URL)
            return
        except Exception:
            time.sleep(interval)

    # 等超時也開（讓使用者看到錯誤提示）
    webbrowser.open(URL)


def _show_error(msg):
    """彈出簡單的錯誤訊息（用 tkinter，若沒有就印到 stdout）"""
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror('SDATA 啟動器', msg)
        root.destroy()
    except Exception:
        print('[ERROR]', msg)


# ══════════════════════════════════════════════════
#  主程式
# ══════════════════════════════════════════════════
if __name__ == '__main__':
    # 1. 啟動 Server 執行緒
    t_srv = threading.Thread(target=_run_server, daemon=True)
    t_srv.start()

    # 2. 等待就緒後開瀏覽器
    t_open = threading.Thread(target=_wait_and_open, daemon=True)
    t_open.start()

    # 3. 主執行緒持續存活（daemon server 依附於主執行緒）
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print('已停止。')
