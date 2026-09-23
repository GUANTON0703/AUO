#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
APP 202608181007.py — 背汙檢系統後端（路由器）
修改說明：
  - Q1：移除 GET /api/beol/get_total 路由
  - Q1：移除 POST /api/beol/save_total 路由
  - 其餘路由邏輯不動
PORT：8888
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
from datetime import datetime
from urllib.parse import urlparse, parse_qs
import webbrowser
import threading
import time
import sys

import feol_handler
import beol_handler

# ===== HTML 路徑（動態，支援 PyInstaller onefile）=====
def _get_base_path():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

HTML_FILE_PATH = os.path.join(_get_base_path(), 'html', 'index.html')

def log(msg, level='INFO'):
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] [{level}] {msg}')


class BeiwuAPIHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        log(format % args)

    # ── GET ──────────────────────────────────────────────────────────
    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path
        params = {k: v[0] if v else '' for k, v in parse_qs(parsed.query).items()}
        log(f'GET {path}')

        # ── BEOL 路由 ──
        if   path == '/api/beol/search':            beol_handler.beol_search(self, params)
        elif path == '/api/beol/export':            beol_handler.beol_export(self, params)
        elif path == '/api/beol/download/template': beol_handler.beol_download_template(self)

        # ── FEOL 路由 ──
        elif path == '/api/health':                 feol_handler.health_check(self)
        elif path == '/api/search':                 feol_handler.search_records(self, params)
        elif path == '/api/export':                 feol_handler.export_excel(self, params)
        elif path == '/api/photo':                  feol_handler.serve_photo(self, params)
        elif path == '/api/machine/status':         feol_handler.machine_status(self)
        elif path == '/api/download/template':      feol_handler.download_template(self)
        elif path == '/api/machine/map_image':      feol_handler.machine_map_image(self)
        elif path == '/api/machine/all_positions':  feol_handler.machine_all_positions(self, params)

        else: self.send_json({'success': False, 'error': 'Not Found'}, 404)

    # ── POST ─────────────────────────────────────────────────────────
    def do_POST(self):
        parsed = urlparse(self.path)
        path   = parsed.path
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)
        try:
            data = json.loads(body.decode('utf-8'))
        except Exception:
            self.send_json({'success': False, 'error': '無效的 JSON'}, 400)
            return
        log(f'POST {path}')

        # ── BEOL 路由 ──
        if   path == '/api/beol/save':                     beol_handler.beol_save(self, data)
        elif path == '/api/beol/import':                   beol_handler.beol_import(self, data)
        elif path == '/api/beol/update':                   beol_handler.beol_update(self, data)
        elif path == '/api/beol/delete':                   beol_handler.beol_delete(self, data)
        elif path == '/api/beol/preview_excel_with_pics':  beol_handler.beol_preview_excel_with_pics(self, data)
        elif path == '/api/beol/import_excel_with_pics':   beol_handler.beol_import_excel_with_pics(self, data)

        # ── FEOL 路由 ──
        elif path == '/api/save':                          feol_handler.save_records(self, data)
        elif path == '/api/import':                        feol_handler.import_records(self, data)
        elif path == '/api/machine/match':                 feol_handler.machine_match(self, data)
        elif path == '/api/check/isnew':                   feol_handler.check_isnew(self, data)
        elif path == '/api/update':                        feol_handler.update_record(self, data)
        elif path == '/api/delete':                        feol_handler.delete_records(self, data)
        elif path == '/api/preview_excel_with_pics':       feol_handler.preview_excel_with_pics(self, data)
        elif path == '/api/import_excel_with_pics':        feol_handler.import_excel_with_pics(self, data)
        elif path == '/api/bulk_update':                   feol_handler.bulk_update(self, data)
        else: self.send_json({'success': False, 'error': 'Not Found'}, 404)

    # ── OPTIONS（CORS preflight）────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    # ── 共用回應工具 ────────────────────────────────────────────────
    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)


# ===== 開啟 HTML =====
def open_html_file(file_path, delay=1.5):
    time.sleep(delay)
    if not os.path.exists(file_path):
        log(f'⚠️ HTML 不存在：{file_path}', 'WARN'); return
    log(f'📂 開啟：{file_path}')
    try:
        if sys.platform == 'win32':
            os.startfile(file_path)
        else:
            webbrowser.open('file://' + file_path)
    except Exception as e:
        log(f'❌ 無法開啟：{e}', 'WARN')


# ===== 主程式 =====
if __name__ == '__main__':
    log('🚀 啟動背汙檢系統後端')
    log(f'HTML: {HTML_FILE_PATH}')
    log(f'FEOL — TXT_DIR: {feol_handler.TXT_DIR}')
    log(f'FEOL — PHOTOS:  {feol_handler.PHOTOS_DIR}')
    log(f'BEOL — TXT_DIR: {beol_handler.BEOL_TXT_DIR}')
    log(f'BEOL — PHOTOS:  {beol_handler.BEOL_PHOTOS_DIR}')

    HOST, PORT = '0.0.0.0', 8888
    server = HTTPServer((HOST, PORT), BeiwuAPIHandler)
    log(f'✅ HTTP 伺服器啟動 → http://{HOST}:{PORT}')

    threading.Thread(target=open_html_file, args=(HTML_FILE_PATH,), daemon=True).start()
    log('按 Ctrl+C 停止\n')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log('\n🛑 伺服器已停止')
        server.shutdown()
