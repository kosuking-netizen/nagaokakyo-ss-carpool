# -*- coding: utf-8 -*-
"""京都府のレギュラーガソリン週次平均価格を取得して data.js を更新する。

毎週水曜夜に GitHub Actions から実行される（.github/workflows/update-gas-price.yml）。
取得元: oil-stat.com の京都府ページ（資源エネルギー庁の週次調査ベース）。
ページ構造が変わって取得できなくなった場合は非ゼロ終了し、Actions が失敗として通知する。
"""
import io
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

URL = "https://oil-stat.com/reg/%E4%BA%AC%E9%83%BD%E5%BA%9C.html"
DATA_JS = "data.js"

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")


def fetch_price():
    req = urllib.request.Request(
        URL,
        headers={"User-Agent": "Mozilla/5.0 (gas-price-bot; nagaokakyo-ss-carpool)"},
    )
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")

    # 「173.4 円（2026年07月13日）」形式をすべて拾い、最も新しい日付のものを採用
    # （ページ内には過去の最高値・最安値も同形式で載っているため）
    matches = re.findall(
        r"(\d{2,3}(?:\.\d)?)\s*円\s*[（(](\d{4})年(\d{1,2})月(\d{1,2})日[）)]", html
    )
    if not matches:
        raise RuntimeError("価格パターンが見つかりません（ページ構造が変わった可能性）")

    best = max(matches, key=lambda m: (int(m[1]), int(m[2]), int(m[3])))
    price = float(best[0])
    week = "%04d-%02d-%02d" % (int(best[1]), int(best[2]), int(best[3]))

    if not (80.0 <= price <= 400.0):
        raise RuntimeError("取得した価格が異常値です: %s" % price)
    return price, week


def update_data_js(price, week):
    with open(DATA_JS, encoding="utf-8") as f:
        src = f.read()

    new = re.sub(
        r"price: [\d.]+, // \[AUTO-GAS-PRICE\]",
        "price: %s, // [AUTO-GAS-PRICE]" % price,
        src,
    )
    new = re.sub(
        r'week: "[\d-]+", // \[AUTO-GAS-WEEK\]',
        'week: "%s", // [AUTO-GAS-WEEK]' % week,
        new,
    )
    jst_today = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")
    new = re.sub(
        r'dataUpdated: "[\d-]+", // \[AUTO-UPDATED\]',
        'dataUpdated: "%s", // [AUTO-UPDATED]' % jst_today,
        new,
    )

    if new == src:
        print("変更なし（価格 %s 円/L・%s の週のまま）" % (price, week))
        return False
    with open(DATA_JS, "w", encoding="utf-8", newline="\n") as f:
        f.write(new)
    print("更新しました: %s 円/L（%s の週）" % (price, week))
    return True


if __name__ == "__main__":
    p, w = fetch_price()
    update_data_js(p, w)
