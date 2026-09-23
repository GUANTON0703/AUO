#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
202608271053.PY — 背汙檢系統後端（HTA 版）
修改說明（vs 202608191230.PY）：
  - do_GET 新增靜態資源路由（.css / .js），供拆分後的 feol.css / feol_*.js 使用
  - 新增 _serve_static() 方法
"""

from http.server import HTTPServer, BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from datetime import datetime
from urllib.parse import urlparse, parse_qs
import webbrowser
import threading
import time
import sys
import mimetypes

import feol_handler
import beol_handler

# ===== HTML 路徑（動態，支援 PyInstaller onefile）=====
def _get_base_path():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

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

        # ── HTML 靜態檔案路由（HTA 整合用）──
        if path in ('/', '/index.html'):
            self._serve_html('index.html'); return
        elif path == '/feol.html':
            self._serve_html('feol.html'); return
        elif path == '/beol.html':
            self._serve_html('beol.html'); return

        # ── 靜態資源（CSS / JS）── ★ 新增
        elif path.endswith('.css') or path.endswith('.js'):
            self._serve_static(path.lstrip('/')); return

        # ── BEOL 路由 ──
        elif path == '/api/beol/search':            beol_handler.beol_search(self, params)
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
        elif path == '/api/summary/bg_image':       feol_handler.summary_bg_image(self)
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
        elif path == '/api/beol/process_summary':          beol_handler.beol_process_summary(self, data)

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

    # ── HTML 靜態檔案服務 ────────────────────────────────────────────
    def _serve_html(self, filename):
        base = _get_base_path()
        # 先找同層，再找 html/ 子目錄
        for candidate in [base, os.path.join(base, 'html')]:
            fpath = os.path.join(candidate, filename)
            if os.path.isfile(fpath):
                try:
                    with open(fpath, 'rb') as f:
                        data = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                    self.send_header('Content-Length', str(len(data)))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(data)
                    log(f'HTML served: {filename}')
                except Exception as e:
                    log(f'HTML serve error: {e}', 'ERROR')
                return
        self.send_json({'success': False, 'error': filename + ' not found'}, 404)

    # ── 靜態資源服務（CSS / JS）── ★ 新增 ───────────────────────────
    def _serve_static(self, filename):
        base = _get_base_path()
        # 先找同層，再找 html/ 子目錄（與 _serve_html 相同搜尋順序）
        for candidate in [base, os.path.join(base, 'html')]:
            fpath = os.path.join(candidate, filename)
            if os.path.isfile(fpath):
                try:
                    ctype, _ = mimetypes.guess_type(filename)
                    ctype = ctype or 'application/octet-stream'
                    with open(fpath, 'rb') as f:
                        data = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', ctype + '; charset=utf-8')
                    self.send_header('Content-Length', str(len(data)))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(data)
                    log('Static served: ' + filename)
                except Exception as e:
                    log('Static serve error: ' + str(e), 'ERROR')
                return
        self.send_json({'success': False, 'error': filename + ' not found'}, 404)

    # ── 共用回應工具 ────────────────────────────────────────────────
    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)


# ===== 主程式 =====


# ── HTA Logger (auto-patched) ─────────────────────────────
import time as _hta_time
from hta_logger import HTALogger
_hta_logger = HTALogger("roller_mark")
_hta_logger.register(app)  # HTA auto-middleware

_hta_orig_setup = BeiwuAPIHandler.__dict__.get('setup')
def _hta_setup(self):
    if _hta_orig_setup:
        _hta_orig_setup(self)
    else:
        import socketserver
        socketserver.StreamRequestHandler.setup(self)
    self._hta_t0 = _hta_time.time()
BeiwuAPIHandler.setup = _hta_setup

def _hta_log_request(self, code='-', size='-'):
    from http.server import BaseHTTPRequestHandler as _BHRH
    _BHRH.log_request(self, code, size)
    try:
        _ms = int((_hta_time.time() - getattr(self, '_hta_t0', _hta_time.time())) * 1000)
        _code = int(str(code)) if str(code).isdigit() else 0
        _hta_logger.log_request(
            client_ip     = self.client_address[0],
            request_path  = getattr(self, 'path', ''),
            request_ms    = _ms,
            response_code = _code,
        )
    except Exception:
        pass
BeiwuAPIHandler.log_request = _hta_log_request
# ── End HTA Logger ───────────────────────────────────────────

if __name__ == '__main__':
    log('Starting Roller Mark Backend (HTA Mode)')
    log(f'FEOL — TXT_DIR: {feol_handler.TXT_DIR}')
    log(f'FEOL — PHOTOS:  {feol_handler.PHOTOS_DIR}')
    log(f'BEOL — TXT_DIR: {beol_handler.BEOL_TXT_DIR}')
    log(f'BEOL — PHOTOS:  {beol_handler.BEOL_PHOTOS_DIR}')

    HOST, PORT = '0.0.0.0', 5102
    server = ThreadingHTTPServer((HOST, PORT), BeiwuAPIHandler)
    log(f'HTTP Server ready -> http://localhost:{PORT}')
    log('Press Ctrl+C to stop\n')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log('Server stopped.')
        server.shutdown()
