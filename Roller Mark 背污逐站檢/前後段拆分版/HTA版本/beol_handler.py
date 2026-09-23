#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
beol_handler 202609071156.py — BEOL API 處理器
修改說明：
  - 202507251115：wb.close() 修 WinError 32
  - 202507251200：meta.json 改存路徑，修 bytes JSON serializable
  - 202507251300：三個 bug 一次修
      Bug1 照片預覽顯示「—」：row_images[key] 改為平坦 URL 陣列
      Bug2 匯入後搜尋不到：日期截取前10碼
      Bug3 X/Y 欄位對應失敗：新增 'X (cm)'/'Y (cm)'
  - 202609041502：新增 beol_process_summary（WebService 兩段查詢）
  - 202609041720：問題3修正 — SQL2 JOIN key 改用 TFT_GLASS_ID
  - 202609070929：beol_process_summary 明細展開修正
      問題A：SQL2 加 OP_ID IN ('PRINT_TFT','PA_TFT','ODF_TFT','AGX','AGX_BS') 過濾
      問題B：glass_oper 改為保留全部符合 OP_ID 的 oper 列（list），不再只取最新一筆
      問題C：合併邏輯改為展開——每個 local_rec × 對應 oper list，各輸出一列
  - 202609071156：_BPT_OP_IDS 修正 'PRINT_TFT' → 'PI PRINT_TFT'
"""

import os
from datetime import datetime

from config_beol import BEOL_TXT_DIR, BEOL_PHOTOS_DIR
from utils.txt_helper   import TxtHelper
from utils.network_path import decode_base64_image, save_photo_from_bytes

beol_txt_db = TxtHelper(BEOL_TXT_DIR)


def log(msg, level='INFO'):
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] [BEOL/{level}] {msg}')


def _fmt_date(s):
    """把各種日期格式統一成 YYYY-MM-DD，處理 openpyxl 回傳的 datetime 字串"""
    if not s:
        return ''
    s = str(s).strip()
    if len(s) >= 10 and (s[10] == ' ' or s[10] == 'T'):
        return s[:10]
    return s


def _beol_extract_images_from_xlsx(xlsx_path):
    import zipfile, xml.etree.ElementTree as ET

    PHOTO_COL = 13
    OM_COL    = 14
    images_by_row = {}

    try:
        with zipfile.ZipFile(xlsx_path, 'r') as zf:
            names = zf.namelist()
            media = {}
            for n in names:
                if n.startswith('xl/media/'):
                    fname = n.split('/')[-1]
                    media[fname] = zf.read(n)
            log(f'zipfile：找到 {len(media)} 個媒體檔：{list(media.keys())}')
            if not media:
                return images_by_row
            drawing_files = [n for n in names if n.startswith('xl/drawings/drawing') and n.endswith('.xml')]
            log(f'zipfile：找到 drawing 檔：{drawing_files}')
            for drw_path in drawing_files:
                drw_name  = drw_path.split('/')[-1]
                rels_path = f'xl/drawings/_rels/{drw_name}.rels'
                if rels_path not in names:
                    log(f'  找不到 rels：{rels_path}')
                    continue
                rels_xml  = zf.read(rels_path)
                rels_root = ET.fromstring(rels_xml)
                rid_to_media = {}
                for rel in rels_root:
                    rid   = rel.get('Id', '')
                    tgt   = rel.get('Target', '')
                    fname = tgt.split('/')[-1]
                    if fname in media:
                        rid_to_media[rid] = fname
                log(f'  rels 對應：{rid_to_media}')
                drw_xml  = zf.read(drw_path)
                drw_root = ET.fromstring(drw_xml)
                NS = {
                    'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
                    'a':   'http://schemas.openxmlformats.org/drawingml/2006/main',
                    'r':   'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                }
                for anchor in drw_root:
                    tag = anchor.tag.split('}')[-1]
                    if tag not in ('twoCellAnchor', 'oneCellAnchor'):
                        continue
                    from_el = anchor.find('xdr:from', NS)
                    if from_el is None:
                        continue
                    row_el = from_el.find('xdr:row', NS)
                    col_el = from_el.find('xdr:col', NS)
                    if row_el is None or col_el is None:
                        continue
                    try:
                        row = int(row_el.text)
                        col = int(col_el.text)
                    except (ValueError, TypeError):
                        continue
                    pic  = anchor.find('.//xdr:pic', NS)
                    if pic is None:
                        continue
                    blip = pic.find('.//a:blip', NS)
                    if blip is None:
                        continue
                    rid = blip.get(
                        '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed', '')
                    if not rid or rid not in rid_to_media:
                        continue
                    img_bytes = media[rid_to_media[rid]]
                    log(f'  圖片：row={row} col={col} rId={rid} size={len(img_bytes)}')
                    if col < 10:
                        continue
                    is_om = abs(col - OM_COL) < abs(col - PHOTO_COL)
                    if row not in images_by_row:
                        images_by_row[row] = {'photo': [], 'om': []}
                    if is_om:
                        images_by_row[row]['om'].append(img_bytes)
                    else:
                        images_by_row[row]['photo'].append(img_bytes)
    except Exception as e:
        log(f'❌ zipfile 解析圖片失敗：{e}')

    log(f'zipfile 解析完成：{len(images_by_row)} 列有圖片，rows={list(images_by_row.keys())}')
    return images_by_row


def beol_save(handler, data):
    try:
        date    = data.get('date', '')
        records = data.get('records', [])
        if not date or not records:
            handler.send_json({'success': False, 'error': '日期或紀錄缺失'}, 400); return
        saved = 0
        for rec in records:
            photo_urls = []
            for _j, photo in enumerate(rec.get('photos', [])):
                if 'dataUrl' not in photo: continue
                raw = decode_base64_image(photo['dataUrl'])
                if raw:
                    import uuid as _uuid, os as _os
                    _base, _ext = _os.path.splitext(photo['name']); _ext = _ext or '.jpg'
                    _uname = f"{_base}_{_j}_{_uuid.uuid4().hex[:6]}{_ext}"
                    ok, path = save_photo_from_bytes(raw, _uname, BEOL_PHOTOS_DIR, date)
                    if ok: photo_urls.append(path)
            om_photo_urls = []
            for _j, photo in enumerate(rec.get('omPhotos', [])):
                if 'dataUrl' not in photo: continue
                raw = decode_base64_image(photo['dataUrl'])
                if raw:
                    import uuid as _uuid, os as _os
                    _base, _ext = _os.path.splitext(photo['name']); _ext = _ext or '.jpg'
                    _uname = f"om_{_base}_{_j}_{_uuid.uuid4().hex[:6]}{_ext}"
                    ok, path = save_photo_from_bytes(raw, _uname, BEOL_PHOTOS_DIR, date)
                    if ok: om_photo_urls.append(path)
            beol_txt_db.save({
                'date': date, 'model': data.get('model', ''),
                'station': data.get('station', ''), 'line': data.get('line', ''),
                'empId': data.get('empId', ''),
                'midId': rec.get('midId', ''),
                'chipId': rec.get('chipId', ''), 'tc': rec.get('tc', ''),
                'x': str(rec.get('x', '') or ''), 'y': str(rec.get('y', '') or ''),
                'morphology': rec.get('morphology', ''), 'level': rec.get('level', ''),
                'ito': rec.get('ito', ''), 'note': rec.get('note', ''),
                'photoUrls': photo_urls, 'omPhotoUrls': om_photo_urls,
                'createdAt': datetime.now().isoformat()
            })
            saved += 1
        log(f'✅ 儲存 {saved} 筆')
        handler.send_json({'success': True, 'count': saved})
    except Exception as e:
        log(f'❌ 儲存失敗：{e}')
        handler.send_json({'success': False, 'error': str(e)}, 500)


def beol_search(handler, params):
    try:
        filters = {k: params[k] for k in
                   ['model', 'station', 'line', 'tc', 'level', 'empId',
                    'midId', 'chipId', 'morphology', 'ito']
                   if params.get(k)}
        records = beol_txt_db.search(filters, params.get('dateFrom', ''), params.get('dateTo', ''))
        records.sort(key=lambda r: (r.get('date', ''), r.get('createdAt', '')), reverse=True)
        handler.send_json({'success': True, 'records': records})
    except Exception as e:
        log(f'❌ 搜尋失敗：{e}')
        handler.send_json({'success': False, 'error': str(e)}, 500)


def beol_download_template(handler):
    template_path = r'\\tw100049089\ML8BC1\逐站檢資料\BEOL_SAMPLE_01.xlsm'
    try:
        if not os.path.exists(template_path):
            handler.send_json({'success': False, 'error': '範例檔案不存在'}, 404); return
        with open(template_path, 'rb') as f:
            data = f.read()
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/vnd.ms-excel.sheet.macroEnabled.12')
        handler.send_header('Content-Disposition', 'attachment; filename="BEOL_SAMPLE_01.xlsm"')
        handler.send_header('Content-Length', str(len(data)))
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        try:
            handler.wfile.write(data)
            log('✅ BEOL 範例 Excel 已下載')
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            log('⚠️ BEOL 範例下載連線中斷')
    except Exception as e:
        log(f'❌ BEOL 範例下載失敗：{e}')


def beol_export(handler, params):
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
        filters = {k: params[k] for k in
                   ['model', 'station', 'line', 'tc', 'level', 'empId'] if params.get(k)}
        records = beol_txt_db.search(filters, params.get('dateFrom', ''), params.get('dateTo', ''))
        records.sort(key=lambda r: (r.get('date', ''), r.get('createdAt', '')), reverse=True)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'BEOL 搜尋結果'

        headers = ['日期', 'Model', '站點', 'LINE', '中片ID', 'CHIP ID', 'T/C', 'X(mm)', 'Y(mm)',
                   '成像敘述', '程度', 'ITO', 'Note', '工號', '建立時間']
        hdr_fill = PatternFill('solid', fgColor='005087')
        hdr_font = Font(bold=True, color='FFFFFF')
        for ci, h in enumerate(headers, 1):
            cell = ws.cell(row=1, column=ci, value=h)
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')

        for ri, rec in enumerate(records, 2):
            row_vals = [
                rec.get('date',''), rec.get('model',''), rec.get('station',''), rec.get('line',''),
                rec.get('midId',''), rec.get('chipId',''), rec.get('tc',''),
                rec.get('x',''), rec.get('y',''),
                rec.get('morphology',''), rec.get('level',''), rec.get('ito',''),
                rec.get('note',''), rec.get('empId',''), rec.get('createdAt','')
            ]
            for ci, v in enumerate(row_vals, 1):
                ws.cell(row=ri, column=ci, value=v)

        import io
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        data = buf.read()

        handler.send_response(200)
        handler.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        handler.send_header('Content-Disposition', 'attachment; filename="BEOL_export.xlsx"')
        handler.send_header('Content-Length', str(len(data)))
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        try:
            handler.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            log('⚠️ BEOL 匯出連線中斷')
    except Exception as e:
        log(f'❌ BEOL 匯出失敗：{e}')
        handler.send_json({'success': False, 'error': str(e)}, 500)


def beol_import(handler, data):
    try:
        records = data.get('records', [])
        if not records:
            handler.send_json({'success': False, 'error': '無資料'}, 400); return
        saved = 0
        for rec in records:
            beol_txt_db.save({
                'date':      rec.get('date', ''),
                'model':     rec.get('model', ''),
                'station':   rec.get('station', ''),
                'line':      rec.get('line', ''),
                'midId':     rec.get('midId', ''),
                'chipId':    rec.get('chipId', ''),
                'tc':        rec.get('tc', ''),
                'x':         str(rec.get('x', '') or ''),
                'y':         str(rec.get('y', '') or ''),
                'morphology': rec.get('morphology', ''),
                'level':     rec.get('level', ''),
                'ito':       rec.get('ito', ''),
                'note':      rec.get('note', ''),
                'empId':     rec.get('empId', ''),
                'photoUrls':   rec.get('photoUrls', []),
                'omPhotoUrls': rec.get('omPhotoUrls', []),
                'createdAt': datetime.now().isoformat()
            })
            saved += 1
        log(f'✅ BEOL CSV 匯入 {saved} 筆')
        handler.send_json({'success': True, 'count': saved})
    except Exception as e:
        log(f'❌ BEOL 匯入失敗：{e}')
        handler.send_json({'success': False, 'error': str(e)}, 500)


def beol_delete(handler, data):
    try:
        deletions = data.get('deletions', [])
        deleted = 0
        for d in deletions:
            ok = beol_txt_db.delete(d.get('createdAt', ''), d.get('date', ''))
            if ok:
                deleted += 1
        log(f'✅ 刪除 {deleted} 筆')
        handler.send_json({'success': True, 'deleted': deleted})
    except Exception as e:
        log(f'❌ 刪除失敗：{e}')
        handler.send_json({'success': False, 'error': str(e)}, 500)


def beol_preview_excel_with_pics(handler, data):
    try:
        import base64, tempfile, uuid, json
        b64 = data.get('excel_base64', '')
        if not b64:
            handler.send_json({'success': False, 'error': '無 excel_base64'}, 400); return
        xlsx_bytes = base64.b64decode(b64)
        with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp:
            tmp.write(xlsx_bytes)
            tmp_path = tmp.name
        try:
            from openpyxl import load_workbook
            wb = load_workbook(tmp_path, read_only=True, data_only=True)
            ws = wb.active
            headers = []
            rows_data = []
            for ri, row in enumerate(ws.iter_rows(values_only=True)):
                if ri == 0:
                    headers = [str(c) if c is not None else '' for c in row]
                else:
                    rows_data.append({
                        headers[ci]: (str(v) if v is not None else '')
                        for ci, v in enumerate(row)
                    })
            wb.close()

            images_by_row = _beol_extract_images_from_xlsx(tmp_path)

            preview_id  = str(uuid.uuid4())
            preview_dir = os.path.join(BEOL_PHOTOS_DIR, 'previews', preview_id)
            os.makedirs(preview_dir, exist_ok=True)

            host = handler.headers.get('Host', '127.0.0.1:8888')

            row_images = {}
            img_paths  = {}

            for row_idx, imgs in images_by_row.items():
                key = str(row_idx)
                row_images[key] = []
                img_paths[key]  = {'photo': [], 'om': []}

                for i, img_bytes in enumerate(imgs.get('photo', [])):
                    fname = f'photo_{row_idx}_{i}.png'
                    fpath = os.path.join(preview_dir, fname)
                    with open(fpath, 'wb') as ff:
                        ff.write(img_bytes)
                    url = f'http://{host}/api/photo?path={fpath}'
                    row_images[key].append(url)
                    img_paths[key]['photo'].append(fpath)

                for i, img_bytes in enumerate(imgs.get('om', [])):
                    fname = f'om_{row_idx}_{i}.png'
                    fpath = os.path.join(preview_dir, fname)
                    with open(fpath, 'wb') as ff:
                        ff.write(img_bytes)
                    url = f'http://{host}/api/photo?path={fpath}'
                    row_images[key].append(url)
                    img_paths[key]['om'].append(fpath)

            meta_path = os.path.join(preview_dir, 'meta.json')
            with open(meta_path, 'w', encoding='utf-8') as ff:
                json.dump({
                    'headers':     headers,
                    'rows':        rows_data,
                    'img_paths':   img_paths,
                    'preview_dir': preview_dir
                }, ff, ensure_ascii=False)

            handler.send_json({'success': True, 'preview_id': preview_id,
                               'headers': headers, 'rows': rows_data,
                               'row_images': row_images, 'total': len(rows_data)})
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        log(f'❌ BEOL preview_excel_with_pics 失敗：{e}')
        handler.send_json({'success': False, 'error': str(e)}, 500)


def beol_import_excel_with_pics(handler, data):
    try:
        import json
        preview_id = data.get('preview_id', '')
        if not preview_id:
            handler.send_json({'success': False, 'error': '無 preview_id'}, 400); return
        preview_dir = os.path.join(BEOL_PHOTOS_DIR, 'previews', preview_id)
        meta_path = os.path.join(preview_dir, 'meta.json')
        if not os.path.exists(meta_path):
            handler.send_json({'success': False, 'error': 'Preview 不存在或已過期'}, 404); return
        with open(meta_path, 'r', encoding='utf-8') as ff:
            meta = json.load(ff)
        headers   = meta['headers']
        rows      = meta['rows']
        img_paths = meta.get('img_paths', {})

        saved = 0; photos_saved = 0; skipped = 0

        g = lambda row, keys: next((str(row[k]) for k in keys if row.get(k) not in (None,'') ), '')

        for ri, row in enumerate(rows):
            date = _fmt_date(g(row, ['日期', 'date', 'Date', 'DATE']))
            chip = g(row, ['CHIP ID', 'chipId', 'chip_id'])
            if not date and not chip:
                skipped += 1; continue

            photo_urls = []; om_photo_urls = []
            row_paths = img_paths.get(str(ri + 1), {})

            for _pi, fpath in enumerate(row_paths.get('photo', [])):
                if not os.path.exists(fpath): continue
                with open(fpath, 'rb') as ff: img_bytes = ff.read()
                ok, path = save_photo_from_bytes(
                    img_bytes, f'import_{ri+1}_ph_{_pi}.png', BEOL_PHOTOS_DIR, date)
                if ok: photo_urls.append(path); photos_saved += 1

            for _oi, fpath in enumerate(row_paths.get('om', [])):
                if not os.path.exists(fpath): continue
                with open(fpath, 'rb') as ff: img_bytes = ff.read()
                ok, path = save_photo_from_bytes(
                    img_bytes, f'import_{ri+1}_om_{_oi}.png', BEOL_PHOTOS_DIR, date)
                if ok: om_photo_urls.append(path); photos_saved += 1

            beol_txt_db.save({
                'date':      date,
                'model':     g(row, ['Model', 'model', 'MODEL']),
                'station':   g(row, ['站點', 'station', 'Station']),
                'line':      g(row, ['LINE', 'Line', 'line']),
                'midId':     g(row, ['中片ID', 'midId']),
                'chipId':    chip,
                'tc':        g(row, ['T/C', 'T/C側', 'TC', 'tc']),
                'x':         g(row, ['X(mm)', 'X (mm)', 'X (cm)', 'X(cm)', 'x', 'X']),
                'y':         g(row, ['Y(mm)', 'Y (mm)', 'Y (cm)', 'Y(cm)', 'y', 'Y']),
                'morphology': g(row, ['成像敘述', 'morphology']),
                'level':     g(row, ['程度', 'level', 'Level']),
                'ito':       g(row, ['ITO', 'ito']),
                'note':      g(row, ['Note', 'note', 'NOTE', '備註']),
                'empId':     g(row, ['工號', 'empId']),
                'photoUrls':   photo_urls,
                'omPhotoUrls': om_photo_urls,
                'createdAt': datetime.now().isoformat()
            })
            saved += 1

        log(f'✅ BEOL Excel 匯入 {saved} 筆，圖片 {photos_saved} 張，跳過 {skipped} 筆')
        handler.send_json({'success': True, 'count': saved,
                           'photos': photos_saved, 'skipped': skipped})
    except Exception as e:
        log(f'❌ BEOL import_excel_with_pics 失敗：{e}')
        handler.send_json({'success': False, 'error': str(e)}, 500)


def beol_update(handler, data):
    """修改單筆 BEOL 記錄（含新增 / 刪除照片）"""
    try:
        import uuid as _uuid, os as _os
        created_at    = data.get('createdAt', '')
        original_date = data.get('originalDate', '')
        new_record    = data.get('record', {})
        new_photos    = data.get('newPhotos', [])
        new_om_photos = data.get('newOmPhotos', [])

        if not created_at:
            handler.send_json({'success': False, 'error': '缺少 createdAt'}, 400); return

        date = new_record.get('date', original_date)
        for _j, photo in enumerate(new_photos):
            if 'dataUrl' not in photo: continue
            raw = decode_base64_image(photo['dataUrl'])
            if raw:
                _base, _ext = _os.path.splitext(photo.get('name', 'photo'))
                _ext = _ext or '.jpg'
                _uname = f"{_base}_edit{_j}_{_uuid.uuid4().hex[:6]}{_ext}"
                ok, path = save_photo_from_bytes(raw, _uname, BEOL_PHOTOS_DIR, date)
                if ok:
                    new_record.setdefault('photoUrls', []).append(path)

        for _j, photo in enumerate(new_om_photos):
            if 'dataUrl' not in photo: continue
            raw = decode_base64_image(photo['dataUrl'])
            if raw:
                _base, _ext = _os.path.splitext(photo.get('name', 'om'))
                _ext = _ext or '.jpg'
                _uname = f"om_{_base}_edit{_j}_{_uuid.uuid4().hex[:6]}{_ext}"
                ok, path = save_photo_from_bytes(raw, _uname, BEOL_PHOTOS_DIR, date)
                if ok:
                    new_record.setdefault('omPhotoUrls', []).append(path)

        ok = beol_txt_db.update(created_at, original_date, new_record)
        if ok:
            log(f'✅ 更新成功 createdAt={created_at}')
            handler.send_json({'success': True, 'record': new_record})
        else:
            handler.send_json({'success': False, 'error': '找不到對應記錄'}, 404)
    except Exception as e:
        log(f'❌ 更新失敗：{e}')
        handler.send_json({'success': False, 'error': str(e)}, 500)


# ════════════════════════════════════════════════════════════
# BY製程時間SUMMARY — WebService 兩段查詢
# 202609041502 新增，202609041720 修正 SQL2 JOIN key
# 202609070929 修正：SQL2 加 OP_ID 過濾 + glass_oper 保留全部 + 合併展開
# 202609071156 修正：'PRINT_TFT' → 'PI PRINT_TFT'
# ════════════════════════════════════════════════════════════

import warnings
import logging as _logging

# 目標製程站清單（固定不變）
# 202609071156：PRINT_TFT 修正為 PI PRINT_TFT
_BPT_OP_IDS = ('PI PRINT_TFT', 'PA_TFT', 'ODF_TFT', 'AGX', 'AGX_BS')


def _ws_build_client():
    """建立 zeep WebService 客戶端（內網，忽略 SSL）"""
    import requests as _requests
    from zeep import Client
    from zeep.transports import Transport
    from lxml import etree as lxml_etree

    warnings.filterwarnings("ignore")
    _logging.disable(_logging.CRITICAL)

    _original_fromstring = lxml_etree.fromstring
    def _safe_fromstring(text, *args, **kwargs):
        parser = lxml_etree.XMLParser(huge_tree=True, recover=True)
        if isinstance(text, bytes):
            return _original_fromstring(text, parser=parser)
        return _original_fromstring(text.encode('utf-8'), parser=parser)
    lxml_etree.fromstring = _safe_fromstring

    session = _requests.Session()
    session.verify = False
    transport = Transport(session=session, timeout=120)
    return Client(
        'http://hlwbs001:8250/L8BOlapWebService/L8BServices.asmx?wsdl',
        transport=transport
    )


def _ws_call(sql: str) -> str:
    """執行 SQL，回傳 XML 字串"""
    client = _ws_build_client()
    raw = client.service.getCelODSBySql(selSql=sql)
    return str(raw) if not isinstance(raw, str) else raw


def _ws_xml_to_list(raw_str: str) -> list:
    """把 WebService 回傳的 XML 轉成 list[dict]"""
    import html, xml.etree.ElementTree as ET
    if '&lt;' in raw_str or '&amp;' in raw_str:
        raw_str = html.unescape(raw_str)
    xml_string = raw_str.strip().lstrip('\ufeff')
    try:
        root = ET.fromstring(xml_string)
    except ET.ParseError as e:
        log(f'❌ XML 解析失敗：{e}', 'ERROR')
        return []
    rows = []
    for table_elem in root.findall('.//Table'):
        row = {col.tag.split('}')[-1].strip(): col.text for col in table_elem}
        if row:
            rows.append(row)
    return rows


def beol_process_summary(handler, data):
    """
    BY製程時間SUMMARY API
    步驟1：從本地 TXT 撈 CHIP ID 清單（依條件篩選）
    步驟2：用 CHIP ID 查 H_DAX_FBK_MASTER_ODS 取得 TFT_GLASS_ID / CF_GLASS_ID
    步驟3：用 TFT_GLASS_ID 查 H_CHIP_OPER_ODS.SHEET_ID_CHIP_ID
           並限定 OP_ID IN ('PI PRINT_TFT','PA_TFT','ODF_TFT','AGX','AGX_BS')
           保留所有符合的 oper 列（不去重，一片 glass 可有多筆）
    步驟4：合併展開 — 每個 local_rec × 對應 oper list，各輸出一列
    """
    try:
        date_from = data.get('dateFrom', '')
        date_to   = data.get('dateTo', '')
        model     = data.get('model', '')
        station   = data.get('station', '')
        line      = data.get('line', '')
        tc        = data.get('tc', '')
        level     = data.get('level', '')

        if not date_from or not date_to:
            handler.send_json({'success': False, 'error': '請提供時間區間'}, 400)
            return

        # ── Step 1：從本地 TXT 撈符合條件的 BEOL 紀錄 ──
        filters = {}
        if model:   filters['model']   = model
        if station: filters['station'] = station
        if line:    filters['line']    = line
        if tc:      filters['tc']      = tc
        if level:   filters['level']   = level

        local_recs = beol_txt_db.search(filters, date_from, date_to)
        if not local_recs:
            handler.send_json({'success': True, 'records': []})
            return

        chip_ids = list({r.get('chipId', '') for r in local_recs if r.get('chipId', '')})
        if not chip_ids:
            handler.send_json({'success': True, 'records': []})
            return

        # ── Step 2：查 H_DAX_FBK_MASTER_ODS，取得 TFT_GLASS_ID ──
        in_clause_chip = "('" + "','".join(chip_ids) + "')"
        sql1 = (
            "SELECT TFT_CHIP_ID, TFT_GLASS_ID, CF_GLASS_ID, "
            "ARRAY_LOT_ID, FEOL_MODEL_NO, FEOL_ABBR_NO, BEOL_MODEL_NO, BEOL_ABBR_NO "
            "FROM CELODS.H_DAX_FBK_MASTER_ODS "
            f"WHERE TFT_CHIP_ID IN {in_clause_chip}"
        )
        log(f'SQL1：查 H_DAX_FBK_MASTER_ODS，{len(chip_ids)} 個 CHIP ID')
        try:
            master_rows = _ws_xml_to_list(_ws_call(sql1))
        except Exception as e:
            log(f'❌ WebService SQL1 失敗：{e}', 'ERROR')
            handler.send_json({'success': False, 'error': f'WebService SQL1 失敗：{e}'}, 500)
            return

        # chip_id → master info
        chip_master = {r.get('TFT_CHIP_ID', ''): r for r in master_rows}

        # ── Step 3：用 TFT_GLASS_ID 查 H_CHIP_OPER_ODS ──
        glass_ids = list({
            r.get('TFT_GLASS_ID', '')
            for r in master_rows
            if r.get('TFT_GLASS_ID', '')
        })

        if not glass_ids:
            log('⚠️ SQL1 無結果，oper 欄位將全空')
            result = []
            for rec in local_recs:
                cid    = rec.get('chipId', '')
                master = chip_master.get(cid, {})
                result.append({
                    'date':     rec.get('date', ''),
                    'model':    rec.get('model', ''),
                    'station':  rec.get('station', ''),
                    'line':     rec.get('line', ''),
                    'chipId':   cid,
                    'midId':    rec.get('midId', ''),
                    'tc':       rec.get('tc', ''),
                    'level':    rec.get('level', ''),
                    'morphology': rec.get('morphology', ''),
                    'ito':      rec.get('ito', ''),
                    'note':     rec.get('note', ''),
                    'TFT_GLASS_ID':  master.get('TFT_GLASS_ID', ''),
                    'CF_GLASS_ID':   master.get('CF_GLASS_ID', ''),
                    'ARRAY_LOT_ID':  master.get('ARRAY_LOT_ID', ''),
                    'FEOL_MODEL_NO': master.get('FEOL_MODEL_NO', ''),
                    'BEOL_MODEL_NO': master.get('BEOL_MODEL_NO', ''),
                    'PRODUCT_CODE': '', 'OP_ID': '', 'EQP_ID': '',
                    'MFG_DAY': '', 'LOGON_TIME': '', 'LOGOFF_TIME': '', 'NEXT_OP_ID': '',
                })
            handler.send_json({'success': True, 'records': result})
            return

        in_clause_glass = "('" + "','".join(glass_ids) + "')"
        op_id_clause    = "('" + "','".join(_BPT_OP_IDS) + "')"
        sql2 = (
            "SELECT SITE_ID, SHEET_ID_CHIP_ID, MODEL_NO, ABBR_NO, PRODUCT_CODE, ABBR_SIZE, "
            "SHEET_ID, ARRAY_LOT_ID, CHIP_TYPE, PANEL_FLAG, ABBR_CAT, STAGE_TYPE, "
            "OP_ID, OP_VER, OP_SEQ, EQP_ID, EQP_PORT_ID, CASSETTE_ID, "
            "UNLOAD_PORT_ID, UNLOAD_CASSETTE_ID, "
            "TO_CHAR(LOGON_TIME,'YYYY/MM/DD HH24:MI:SS') AS LOGON_TIME, "
            "LOGON_USER, LOGON_CHIP_QTY, "
            "TO_CHAR(LOGOFF_TIME,'YYYY/MM/DD HH24:MI:SS') AS LOGOFF_TIME, "
            "LOGOFF_USER, LOGOFF_CHIP_QTY, "
            "TO_CHAR(MFG_DAY,'YYYY/MM/DD') AS MFG_DAY, "
            "NEXT_OP_ID, NEXT_OP_VER, NEXT_OP_SEQ "
            "FROM CELODS.H_CHIP_OPER_ODS "
            f"WHERE SHEET_ID_CHIP_ID IN {in_clause_glass} "
            f"AND OP_ID IN {op_id_clause}"
        )
        log(f'SQL2：查 H_CHIP_OPER_ODS，{len(glass_ids)} 個 TFT_GLASS_ID，OP_ID 限定 {_BPT_OP_IDS}')
        try:
            oper_rows = _ws_xml_to_list(_ws_call(sql2))
        except Exception as e:
            log(f'❌ WebService SQL2 失敗：{e}', 'ERROR')
            handler.send_json({'success': False, 'error': f'WebService SQL2 失敗：{e}'}, 500)
            return

        # glass_oper：{TFT_GLASS_ID: [list of oper rows]}，保留全部符合列
        glass_oper: dict[str, list] = {}
        for r in oper_rows:
            gid = r.get('SHEET_ID_CHIP_ID', '')
            if not gid:
                continue
            if gid not in glass_oper:
                glass_oper[gid] = []
            glass_oper[gid].append(r)

        # ── Step 4：合併展開 ──
        result = []
        for rec in local_recs:
            cid      = rec.get('chipId', '')
            master   = chip_master.get(cid, {})
            glass_id = master.get('TFT_GLASS_ID', '')
            opers    = glass_oper.get(glass_id, [])

            base = {
                'date':     rec.get('date', ''),
                'model':    rec.get('model', ''),
                'station':  rec.get('station', ''),
                'line':     rec.get('line', ''),
                'chipId':   cid,
                'midId':    rec.get('midId', ''),
                'tc':       rec.get('tc', ''),
                'level':    rec.get('level', ''),
                'morphology': rec.get('morphology', ''),
                'ito':      rec.get('ito', ''),
                'note':     rec.get('note', ''),
                'TFT_GLASS_ID':  master.get('TFT_GLASS_ID', ''),
                'CF_GLASS_ID':   master.get('CF_GLASS_ID', ''),
                'ARRAY_LOT_ID':  master.get('ARRAY_LOT_ID', ''),
                'FEOL_MODEL_NO': master.get('FEOL_MODEL_NO', ''),
                'BEOL_MODEL_NO': master.get('BEOL_MODEL_NO', ''),
            }

            if not opers:
                result.append({
                    **base,
                    'PRODUCT_CODE': '', 'OP_ID': '', 'EQP_ID': '',
                    'MFG_DAY': '', 'LOGON_TIME': '', 'LOGOFF_TIME': '', 'NEXT_OP_ID': '',
                })
            else:
                for oper in opers:
                    result.append({
                        **base,
                        'PRODUCT_CODE': oper.get('PRODUCT_CODE', ''),
                        'OP_ID':        oper.get('OP_ID', ''),
                        'EQP_ID':       oper.get('EQP_ID', ''),
                        'MFG_DAY':      oper.get('MFG_DAY', ''),
                        'LOGON_TIME':   oper.get('LOGON_TIME', ''),
                        'LOGOFF_TIME':  oper.get('LOGOFF_TIME', ''),
                        'NEXT_OP_ID':   oper.get('NEXT_OP_ID', ''),
                    })

        log(f'✅ process_summary 完成：{len(result)} 列（本地 {len(local_recs)} 筆 × 展開後）')
        handler.send_json({'success': True, 'records': result})

    except Exception as e:
        log(f'❌ beol_process_summary 失敗：{e}', 'ERROR')
        handler.send_json({'success': False, 'error': str(e)}, 500)
