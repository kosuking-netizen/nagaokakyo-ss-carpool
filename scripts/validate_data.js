// data.js（共有データ）の検証。GitHub Actionsがpushのたびに実行する。
// 管理者の編集ミス（構文エラー・異常なガソリン価格・集合場所の座標間違い）で
// 全員のアプリが壊れるのを防ぐ安全装置。異常があれば非ゼロ終了。
"use strict";
const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync(__dirname + "/../data.js", "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
try {
  vm.runInContext(src, sandbox); // 構文エラーはここで例外になる
} catch (e) {
  console.error("❌ data.js に構文エラーがあります: " + e.message);
  process.exit(1);
}

const D = sandbox.window.APP_DATA;
const errors = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };

ok(D, "window.APP_DATA が定義されていません");
if (D) {
  ok(/^\d{4}-\d{2}-\d{2}$/.test(D.dataUpdated), "dataUpdated が YYYY-MM-DD 形式ではありません");

  // チームルールの定数（変えるときはこの検証も意図的に更新すること）
  ok(D.fuelEfficiency === 7, "燃費がチームルールの 7 ではありません: " + D.fuelEfficiency);
  ok(D.gasSurcharge === 10, "ガソリン上乗せがチームルールの 10円 ではありません: " + D.gasSurcharge);

  // ガソリン価格
  ok(D.gasPrice && typeof D.gasPrice.price === "number", "gasPrice.price がありません");
  if (D.gasPrice && typeof D.gasPrice.price === "number") {
    ok(D.gasPrice.price >= 100 && D.gasPrice.price <= 300,
      "ガソリン価格が異常です（100〜300円/Lの範囲外）: " + D.gasPrice.price);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(D.gasPrice.week), "gasPrice.week が YYYY-MM-DD 形式ではありません");
    const week = new Date(D.gasPrice.week + "T00:00:00Z");
    ok(week.getTime() <= Date.now() + 2 * 86400000, "gasPrice.week が未来の日付です: " + D.gasPrice.week);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(D.gasPrice.checked), "gasPrice.checked が YYYY-MM-DD 形式ではありません");
    const chk = new Date(D.gasPrice.checked + "T00:00:00Z");
    ok(chk.getTime() <= Date.now() + 2 * 86400000, "gasPrice.checked が未来の日付です: " + D.gasPrice.checked);
  }

  // API残り回数（毎晩の自動チェックが書き込む）。ルート取得・会場検索を同じ仕様で持つ
  const quota = D.apiQuota || {};
  ["route", "spot"].forEach((kind) => {
    const q = quota[kind];
    const at = "apiQuota." + kind;
    if (!q) { errors.push(at + " がありません"); return; }
    ok(typeof q.remaining === "number" && typeof q.limit === "number",
      at + ".remaining / limit が数値ではありません");
    if (typeof q.remaining === "number" && typeof q.limit === "number") {
      ok(q.limit > 0, at + ".limit が0以下です: " + q.limit);
      ok(q.remaining >= 0 && q.remaining <= q.limit,
        at + ".remaining が 0〜" + q.limit + " の範囲外です: " + q.remaining);
    }
    ok(/^\d{4}-\d{2}-\d{2}$/.test(q.checked), at + ".checked が YYYY-MM-DD 形式ではありません");
    ok(/^\d{4}-\d{2}-\d{2}$/.test(q.resetOn), at + ".resetOn が YYYY-MM-DD 形式ではありません");
    // lastUsed は「まだ誰も使っていない」を表す空文字を許容する
    ok(q.lastUsed === "" || /^\d{4}-\d{2}-\d{2}$/.test(q.lastUsed),
      at + ".lastUsed が YYYY-MM-DD 形式でも空でもありません: " + q.lastUsed);
  });

  // 集合場所（長岡京周辺の座標か）
  const mp = D.meetingPoint || {};
  ok(typeof mp.name === "string" && mp.name.length > 0, "meetingPoint.name がありません");
  ok(mp.lat > 34 && mp.lat < 36 && mp.lon > 134.5 && mp.lon < 136.5,
    "meetingPoint の座標が京都周辺ではありません: " + mp.lat + "," + mp.lon);
}

// key.js（チーム共有APIキー）の検証：貼り付けミス（全角文字・引用符崩れ）を検出
try {
  const keySrc = fs.readFileSync(__dirname + "/../key.js", "utf8");
  const keySandbox = { window: {} };
  vm.createContext(keySandbox);
  vm.runInContext(keySrc, keySandbox);
  const k = keySandbox.window.APP_SHARED_KEY;
  ok(typeof k === "string", "key.js: APP_SHARED_KEY が文字列ではありません");
  if (typeof k === "string" && k.length > 0) {
    ok(/^[\x21-\x7e]+$/.test(k),
      "key.js: キーに全角文字か空白が混ざっています。RapidAPIからコピーし直してください");
  }
} catch (e) {
  errors.push("key.js に構文エラーがあります: " + e.message);
}

if (errors.length) {
  console.error("❌ 共有データの検証に失敗しました:");
  errors.forEach((e) => console.error("  - " + e));
  process.exit(1);
}
console.log(`✅ data.js / key.js OK（ガソリン ${D.gasPrice.price}円/L・${D.gasPrice.week}の週）`);
