# -*- coding: utf-8 -*-
"""チーム共有キーのAPI残り回数を調べて data.js を更新する。

毎晩 GitHub Actions から実行される（.github/workflows/check-api-quota.yml）。

なぜこれが必要か：
  アプリ内の残り回数表示は「その端末が最後にAPIを叩いた時点」の値しか持てない。
  RapidAPIには残数だけを問い合わせる口がなく、確認そのものが1回消費になるため、
  端末が勝手に定期確認することはできない。そこで1日1回だけここで確認し、
  結果を共有データ(data.js)に書いて全員が同じ数字を見られるようにする。

ルート取得(Route car)と会場検索(Spot)は別枠なので、それぞれ1回ずつ確認する。
チェックはその API 自身の枠から引くため、負担は各枠6%（月約30回）ずつで偏らない。

片方だけ失敗した場合、成功した側は記録したうえで非ゼロ終了する
（正しく取れた値を捨てないため。失敗はActionsが通知する）。
"""
import io
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

DATA_JS = "data.js"
KEY_JS = "key.js"

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
JST = timezone(timedelta(hours=9))

# 確認対象。path は枠を1回だけ使う最小のリクエストにする
APIS = {
    "ROUTE": {
        "label": "ルート取得",
        "host": "navitime-route-car.p.rapidapi.com",
        # 出発地は data.js の集合場所、目的地はそのすぐ近く（最短ルートで軽く済ませる）
        "path": lambda mp: "/route_car?start=%.6f%%2C%.6f&goal=%.6f%%2C%.6f"
        % (mp[0], mp[1], mp[0] + 0.01, mp[1] + 0.01),
    },
    "SPOT": {
        "label": "会場検索",
        "host": "navitime-spot.p.rapidapi.com",
        "path": lambda mp: "/spot?word=%E9%95%B7%E5%B2%A1%E4%BA%AC&limit=1",
    },
}


def shared_key():
    """key.js からチーム共有キーを取り出す（公開リポジトリなのでSecret不要）。"""
    with open(KEY_JS, encoding="utf-8") as f:
        src = f.read()
    m = re.search(r'APP_SHARED_KEY\s*=\s*"([^"]*)"', src)
    if not m or not m.group(1):
        raise RuntimeError("key.js から APP_SHARED_KEY を読めません")
    return m.group(1)


def meeting_point():
    """出発地は data.js の集合場所を使う（実在する座標で叩くため）。"""
    with open(DATA_JS, encoding="utf-8") as f:
        src = f.read()
    lat = re.search(r"lat: ([\d.]+),", src)
    lon = re.search(r"lon: ([\d.]+),", src)
    if not lat or not lon:
        raise RuntimeError("data.js から集合場所の座標を読めません")
    return float(lat.group(1)), float(lon.group(1))


def fetch_quota(api, key, mp):
    """対象APIを1回だけ叩き、レスポンスヘッダーから残り回数を読む。

    枠切れ(429)もヘッダーは返るので、残り0として正常に記録する。
    """
    url = "https://" + api["host"] + api["path"](mp)
    req = urllib.request.Request(
        url, headers={"X-RapidAPI-Key": key, "X-RapidAPI-Host": api["host"]}
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        headers, status = resp.headers, resp.status
    except urllib.error.HTTPError as e:
        headers, status = e.headers, e.code
        if status != 429:
            raise RuntimeError(
                "APIがエラーを返しました http %s（キーの失効・Subscribe解除の可能性）" % status
            )

    def num(name):
        v = headers.get(name)
        return int(v) if v is not None and str(v).strip().isdigit() else None

    remaining = num("X-RateLimit-Requests-Remaining")
    limit = num("X-RateLimit-Requests-Limit")
    reset = num("X-RateLimit-Requests-Reset")  # リセットまでの秒数
    if remaining is None or limit is None:
        raise RuntimeError("レスポンスに残り回数のヘッダーがありません（RapidAPIの仕様変更？）")
    if limit <= 0 or not (0 <= remaining <= limit):
        raise RuntimeError("残り回数が異常です: %s/%s" % (remaining, limit))

    reset_on = ""
    if reset is not None and 0 <= reset <= 400 * 86400:
        reset_on = (datetime.now(JST) + timedelta(seconds=reset)).strftime("%Y-%m-%d")
    print("  %s: http %s / 残り %s / 上限 %s / リセット %s"
          % (api["label"], status, remaining, limit, reset_on or "不明"))
    return remaining, limit, reset_on


def marker(src, pattern, label):
    m = re.search(pattern, src)
    if not m:
        raise RuntimeError("data.js に %s マーカーが見つかりません" % label)
    return m.group(1)


def update_data_js(kind, api, remaining, limit, reset_on):
    """1つのAPI分のマーカー行を書き換える。戻り値は変更があったか。"""
    with open(DATA_JS, encoding="utf-8") as f:
        src = f.read()

    # 書き換え前に4つのマーカーが揃っていることを確かめる（1つでも欠けたら中断）
    marker(src, r"remaining: (\d+), // \[AUTO-QUOTA-%s-REMAINING\]" % kind,
           "[AUTO-QUOTA-%s-REMAINING]" % kind)
    marker(src, r"limit: (\d+), // \[AUTO-QUOTA-%s-LIMIT\]" % kind,
           "[AUTO-QUOTA-%s-LIMIT]" % kind)
    marker(src, r'resetOn: "([^"]*)", // \[AUTO-QUOTA-%s-RESET\]' % kind,
           "[AUTO-QUOTA-%s-RESET]" % kind)
    marker(src, r'checked: "([^"]*)", // \[AUTO-QUOTA-%s-CHECKED\]' % kind,
           "[AUTO-QUOTA-%s-CHECKED]" % kind)

    today = datetime.now(JST).strftime("%Y-%m-%d")

    new = re.sub(r"remaining: \d+, // \[AUTO-QUOTA-%s-REMAINING\]" % kind,
                 "remaining: %d, // [AUTO-QUOTA-%s-REMAINING]" % (remaining, kind), src)
    new = re.sub(r"limit: \d+, // \[AUTO-QUOTA-%s-LIMIT\]" % kind,
                 "limit: %d, // [AUTO-QUOTA-%s-LIMIT]" % (limit, kind), new)
    if reset_on:
        new = re.sub(r'resetOn: "[^"]*", // \[AUTO-QUOTA-%s-RESET\]' % kind,
                     'resetOn: "%s", // [AUTO-QUOTA-%s-RESET]' % (reset_on, kind), new)
    new = re.sub(r'checked: "[^"]*", // \[AUTO-QUOTA-%s-CHECKED\]' % kind,
                 'checked: "%s", // [AUTO-QUOTA-%s-CHECKED]' % (today, kind), new)

    print("  %s: 残り%d回／%d回" % (api["label"], remaining, limit))

    if new == src:
        return False
    with open(DATA_JS, "w", encoding="utf-8", newline="\n") as f:
        f.write(new)
    return True


def main():
    dry = os.environ.get("DRY_RUN") == "1"
    if dry:
        print("DRY_RUN: APIは叩かず data.js の書き換えだけ検証します")
    key = None if dry else shared_key()
    mp = meeting_point()

    changed = False
    failures = []
    for kind, api in APIS.items():
        try:
            if dry:
                rem, lim, reset = int(os.environ.get("FAKE_%s" % kind, "480")), 500, "2026-09-18"
            else:
                rem, lim, reset = fetch_quota(api, key, mp)
            changed |= update_data_js(kind, api, rem, lim, reset)
        except Exception as e:
            # 片方が落ちても、もう片方の正しい値は記録する
            print("  %s: 失敗 — %s" % (api["label"], e))
            failures.append("%s: %s" % (api["label"], e))

    if not changed:
        print("変更なし")
    if failures:
        print("❌ 取得に失敗したAPIがあります:")
        for f in failures:
            print("  - " + f)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
