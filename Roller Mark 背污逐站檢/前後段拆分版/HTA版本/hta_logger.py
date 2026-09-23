#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
hta_logger.py — stub（平台 logging 模組不存在時的替代品）
讓 APP.PY 可以正常啟動，log_request 不做任何事。
"""

class HTALogger:
    def __init__(self, name=''):
        pass

    def log_request(self, **kwargs):
        pass

    def log(self, *args, **kwargs):
        pass
