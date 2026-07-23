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
from datetime import datetime, timedelta, timezone, date

URL = "https://oil-stat.com/reg/%E4%BA%AC%E9%83%BD%E5%BA%9C.html"
DATA_JS = "data.js"

# 安全装置のしきい値
MAX_WEEKLY_JUMP = 15.0   # 前回価格からの変動がこれ（円/L）を超えたら異常として停止
MAX_WEEK_AGE_DAYS = 21   # 調査週がこれより古いデータしか取れなければ異常として停止

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

    best_date = max((int(m[1]), int(m[2]), int(m[3])) for m in matches)
    prices = {m[0] for m in matches if (int(m[1]), int(m[2]), int(m[3])) == best_date}
    if len(prices) > 1:
        # 最新日付に複数の異なる価格が並ぶ場合はどれが平均価格か判別できないため安全側で停止
        raise RuntimeError(
            "同じ日付(%s)に複数の異なる価格 %s が見つかりました。ページ構造の確認が必要"
            % ("%04d-%02d-%02d" % best_date, sorted(prices))
        )
    price = float(prices.pop())
    week = "%04d-%02d-%02d" % best_date

    if not (80.0 <= price <= 400.0):
        raise RuntimeError("取得した価格が異常値です: %s" % price)
    return price, week


def update_data_js(price, week):
    with open(DATA_JS, encoding="utf-8") as f:
        src = f.read()

    # 安全装置1: 調査週が古すぎないか（取得元が更新停止している兆候）
    wy, wm, wd = (int(x) for x in week.split("-"))
    age = (date.today() - date(wy, wm, wd)).days
    if age > MAX_WEEK_AGE_DAYS:
        raise RuntimeError(
            "取得できた調査週(%s)が%d日前と古すぎます。取得元の更新が止まっている可能性" % (week, age)
        )

    # 安全装置2: 前回価格からの急変を検知（誤った値の取り込み防止）
    m = re.search(r"price: ([\d.]+), // \[AUTO-GAS-PRICE\]", src)
    if not m:
        raise RuntimeError("data.js に [AUTO-GAS-PRICE] マーカーが見つかりません")
    old_price = float(m.group(1))
    if abs(price - old_price) > MAX_WEEKLY_JUMP:
        raise RuntimeError(
            "価格が前回(%s円)から%s円へ急変しています（差%.1f円 > %.0f円）。"
            "取得ミスの可能性があるため更新を停止。正しければ data.js を手動更新してください"
            % (old_price, price, abs(price - old_price), MAX_WEEKLY_JUMP)
        )

    if "[AUTO-GAS-CHECKED]" not in src:
        raise RuntimeError("data.js に [AUTO-GAS-CHECKED] マーカーが見つかりません")

    jst_today = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")

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
    price_changed = new != src

    # チェック実行日は価格に変更がなくても毎回記録する
    # （画面の「最終自動チェック」表示で、処理がちゃんと回ったか確認できるように）
    new = re.sub(
        r'checked: "[\d-]+", // \[AUTO-GAS-CHECKED\]',
        'checked: "%s", // [AUTO-GAS-CHECKED]' % jst_today,
        new,
    )

    # dataUpdated は価格・週が実際に変わったときだけ動かす
    if price_changed:
        new = re.sub(
            r'dataUpdated: "[\d-]+", // \[AUTO-UPDATED\]',
            'dataUpdated: "%s", // [AUTO-UPDATED]' % jst_today,
            new,
        )

    if new == src:
        # 同じ日に再実行した場合のみここに来る
        print("変更なし（価格 %s 円/L・%s の週・チェック日 %s 記録済み）" % (price, week, jst_today))
        return False

    with open(DATA_JS, "w", encoding="utf-8", newline="\n") as f:
        f.write(new)
    if price_changed:
        print("更新しました: %s 円/L（%s の週）" % (price, week))
    else:
        print("価格は変更なし（%s 円/L・%s の週のまま）。チェック実行日 %s を記録" % (price, week, jst_today))
    return True


if __name__ == "__main__":
    p, w = fetch_price()
    update_data_js(p, w)
