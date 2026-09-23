"""
機台資料比對工具
- 啟動時讀取 TXT，按 y1 排序，快取在記憶體
- 使用二分搜尋快速比對 ±tolerance mm 範圍
"""
import json
import os
import bisect


class MachineHelper:
    # PI前/PI後/PA後 額外比對 CKPIT 必經機台
    CKPIT_STATIONS = ['PI 前', 'PI 後', 'PA 後']

    def __init__(self, txt_path):
        self.records   = []     # 按 y1 排序後的完整紀錄
        self.y1_values = []     # 對應的 y1 float 列表（給 bisect 用）
        self.headers   = []     # 欄位名稱
        self._load(txt_path)

    # ===== 載入 TXT =====
    def _load(self, txt_path):
        if not os.path.exists(txt_path):
            print(f'⚠️ 機台資料不存在：{txt_path}')
            print('   請先執行「機台資料轉換.py」產生 TXT 檔案')
            return
        try:
            recs = []
            with open(txt_path, encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        recs.append(json.loads(line))
                    except Exception:
                        continue

            if not recs:
                print('⚠️ 機台資料 TXT 是空的')
                return

            self.headers = list(recs[0].keys())

            # 按 y1 排序（數值）
            recs.sort(key=lambda r: self._tof(r.get('y1')))
            self.records   = recs
            self.y1_values = [self._tof(r.get('y1')) for r in recs]

            print(f'✅ 機台資料載入完成：{len(recs):,} 筆，按 y1 排序')

        except Exception as e:
            print(f'❌ 機台資料載入失敗：{e}')

    # ===== 工具：轉 float =====
    @staticmethod
    def _tof(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    # ===== 工具：解析 Y 值範圍 =====
    @staticmethod
    def _parse_y_range(y_val):
        """
        解析 Y 值格式，回傳 (y_min, y_max)
        支援：單一數字、"20~25"、"20-25"
        """
        import re
        s = str(y_val).strip() if y_val else ''
        if not s:
            return None, None
        m = re.match(r'^(\d+(?:\.\d+)?)[~\-](\d+(?:\.\d+)?)$', s)
        if m:
            return float(m.group(1)), float(m.group(2))
        try:
            v = float(s)
            return v, v
        except (TypeError, ValueError):
            return None, None

    # ===== 比對單一 Y 值（支援範圍格式）=====
    def match(self, y_value, tolerance=0.5, line="", station=""):
        """
        Y 值容差比對，支援範圍格式（20~25 / 20-25）
        - 範圍格式：搜尋 [y_min - tolerance, y_max + tolerance]
        - 單一數字：同原本邏輯
        - 顯示條件 1：tool_id 前六碼 == line 前六碼
        - 顯示條件 2（PI前/PI後/PA後）：tool_id 開頭為 CKPIT
        - line 為空時：只用 Y 值篩選，不過濾 tool_id
        """
        y_min, y_max = self._parse_y_range(y_value)
        if y_min is None:
            return []

        lo = bisect.bisect_left(self.y1_values,  y_min - tolerance)
        hi = bisect.bisect_right(self.y1_values, y_max + tolerance)
        candidates = list(self.records[lo:hi])

        line_prefix = line[:6].upper() if line else ""
        is_ckpit_st = station in self.CKPIT_STATIONS

        # 沒有 line 也不是 CKPIT 站點 → 不過濾，全部顯示
        if not line_prefix and not is_ckpit_st:
            matched = candidates
        else:
            matched = []
            for rec in candidates:
                tool_id = str(rec.get("tool_id", "") or "").upper()
                if station == 'PI 前':
                    # ★ PI前：只比對 CKPIT，不用 LINE 前六碼
                    if tool_id.startswith("CKPIT"):
                        matched.append(rec)
                else:
                    cond1 = bool(line_prefix) and tool_id[:6] == line_prefix
                    cond2 = is_ckpit_st and tool_id.startswith("CKPIT")
                    if cond1 or cond2:
                        matched.append(rec)

        matched.sort(key=lambda r: abs(self._tof(r.get('y1')) - (y_min + y_max) / 2))
        return matched

    # ===== 批次比對（每筆帶 y / line / station）=====
    def batch_match(self, records, tolerance=0.5):
        """
        records: list of {idx, y, line, station}
        回傳 { str(idx): [matched_records], ... }
        """
        results = {}
        for rec in records:
            idx     = str(rec.get("idx", 0))
            y       = rec.get("y", "0")
            line    = rec.get("line", "")
            station = rec.get("station", "")
            results[idx] = self.match(y, tolerance, line, station)
        return results

    def is_loaded(self):
        return len(self.records) > 0
