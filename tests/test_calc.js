// 精算計算の自動テスト。GitHub Actions（.github/workflows/ci.yml）が
// pushのたびに実行し、1つでも期待値と違えば失敗として通知される。
"use strict";
const assert = require("assert");
const { calcSettlement, extractCoords, parsePastedLocation, normalizeSearchQuery } = require("../calc.js");

const base = { fuelEfficiency: 7, gasSurcharge: 10 };

// 標準ケース（サンプル会場：片道25km・ETC1050円・173.4円/L・3人乗車）
let c = calcSettlement({ ...base, km: 25, etc: 1050, gas: 173.4, pax: 3 });
assert.strictEqual(c.rtKm, 50);
assert.strictEqual(c.fuel, 1310);   // 50÷7×183.4 = 1310.0
assert.strictEqual(c.toll, 2100);   // 1050×2
assert.strictEqual(c.total, 3410);  // 3410はすでに10円単位
assert.strictEqual(c.per, 1140);    // 3410÷3=1136.7 → 10円切り上げ

// 駐車場代あり（実費をそのまま加算。往復2倍しない）
c = calcSettlement({ ...base, km: 25, etc: 1050, gas: 173.4, pax: 3, parking: 500 });
assert.strictEqual(c.parking, 500);
assert.strictEqual(c.totalRaw, 3910); // 1310+2100+500
assert.strictEqual(c.total, 3910);
assert.strictEqual(c.per, 1310);      // 3910÷3=1303.3 → 10円切り上げ

// 駐車場代の端数も10円丸めの対象（515+300=815 → 820）
c = calcSettlement({ ...base, km: 10, etc: 0, gas: 170.1, parking: 300 });
assert.strictEqual(c.totalRaw, 815);
assert.strictEqual(c.total, 820);

// 駐車場代 未入力・空欄は0扱い、負の値はnull
c = calcSettlement({ ...base, km: 10, etc: 0, gas: 170, parking: "" });
assert.strictEqual(c.parking, 0);
assert.strictEqual(calcSettlement({ ...base, km: 10, gas: 170, parking: -100 }), null);

// 高速なし・人数未入力（一人あたりは出さない）
c = calcSettlement({ ...base, km: 10, etc: 0, gas: 170, pax: 0 });
assert.strictEqual(c.fuel, 514);    // 20÷7×180 = 514.28…
assert.strictEqual(c.toll, 0);
assert.strictEqual(c.total, 510);   // 514 → 四捨五入で510
assert.strictEqual(c.per, null);

// 丸め境界（合計が○5円 → 四捨五入で切り上がる）
c = calcSettlement({ ...base, km: 7, etc: 0, gas: 162.5 });
assert.strictEqual(c.totalRaw, 345); // 14÷7×172.5 = 345
assert.strictEqual(c.total, 350);

// 一人あたりの切り上げ（1020÷4=255 → 10円単位に切り上げて260）
c = calcSettlement({ ...base, km: 10, etc: 255, gas: 170, pax: 4 });
assert.strictEqual(c.total, 1020);  // 514+510=1024 → 1020
assert.strictEqual(c.per, 260);     // 1020÷4=255 → 10円切り上げで260

// 丸め順序の仕様固定：ガソリン代を先に1円丸め→合計を10円丸め
// （生値514.57円 → ガソリン代515円 → 精算額520円。
//   もし生値のまま10円丸めすると510円になり仕様と異なる）
c = calcSettlement({ ...base, km: 10, etc: 0, gas: 170.1 });
assert.strictEqual(c.fuel, 515);   // 20÷7×180.1 = 514.57… → 515
assert.strictEqual(c.total, 520);  // 515 → 10円丸めで520

// 1人乗車では割り勘表示なし
c = calcSettlement({ ...base, km: 10, etc: 0, gas: 170, pax: 1 });
assert.strictEqual(c.per, null);

// 不正入力はnull（計算しない）
assert.strictEqual(calcSettlement({ ...base, km: 0, gas: 170 }), null);
assert.strictEqual(calcSettlement({ ...base, km: 10, gas: 0 }), null);
assert.strictEqual(calcSettlement({ ...base, km: -5, gas: 170 }), null);
assert.strictEqual(calcSettlement({ ...base, km: 10, gas: 170, etc: -100 }), null);
assert.strictEqual(calcSettlement({ ...base, km: "abc", gas: 170 }), null);

// ---------- 地図共有リンク・座標の解析 ----------

// Googleマップの長いURL（PC・共有）：!3d!4d のピン座標を最優先で使う
assert.deepStrictEqual(
  extractCoords("https://www.google.com/maps/place/%E5%A4%AA%E9%99%BD%E3%81%8C%E4%B8%98/@34.87,135.79,17z/data=!3m1!4b1!4m6!3m5!8m2!3d34.8721!4d135.7954"),
  { lat: 34.8721, lon: 135.7954 }
);
// ピン座標がなければ @（地図中心）を使う
assert.deepStrictEqual(
  extractCoords("https://www.google.com/maps/@34.9176,135.6862,15z"),
  { lat: 34.9176, lon: 135.6862 }
);
// Appleマップの共有リンク（ll=）
assert.deepStrictEqual(
  extractCoords("https://maps.apple.com/?address=%E4%BA%AC%E9%83%BD&ll=34.9176,135.6862&q=%E3%83%AD%E3%83%BC%E3%82%BD%E3%83%B3"),
  { lat: 34.9176, lon: 135.6862 }
);
// q=lat,lon 形式（%2CエンコードもOK）
assert.deepStrictEqual(
  extractCoords("https://maps.google.com/?q=34.5975%2C135.7935"),
  { lat: 34.5975, lon: 135.7935 }
);
// 素の座標貼り付け（従来形式：カンマ・読点・空白区切り）
assert.deepStrictEqual(extractCoords("34.5975, 135.7935"), { lat: 34.5975, lon: 135.7935 });
assert.deepStrictEqual(extractCoords("34.6　135.8"), { lat: 34.6, lon: 135.8 });
// 短縮リンクは座標を含まないのでnull
assert.strictEqual(extractCoords("https://maps.app.goo.gl/YJBqUGtbumCmt9aa7"), null);
// 日本の範囲外（海外座標）は無効
assert.strictEqual(extractCoords("https://www.google.com/maps/@51.5074,-0.1278,12z"), null);
// ただの文字列・空はnull
assert.strictEqual(extractCoords("太陽が丘"), null);
assert.strictEqual(extractCoords(""), null);

// parsePastedLocation：ただの検索語はnull（通常検索に回す）
assert.strictEqual(parsePastedLocation("太陽が丘"), null);
// 場所名＋短縮リンク（iPhoneのGoogleマップ共有「コピー」の形式）→ 場所名で検索
let p = parsePastedLocation("ほぐし屋 https://maps.app.goo.gl/YJBqUGtbumCmt9aa7");
assert.strictEqual(p.kind, "query");
assert.strictEqual(p.query, "ほぐし屋");
// 短縮リンク単体 → linkOnly（案内を出す）
p = parsePastedLocation("https://maps.app.goo.gl/YJBqUGtbumCmt9aa7");
assert.strictEqual(p.kind, "linkOnly");
// 場所名＋座標入りリンク → 座標＋名前
p = parsePastedLocation("会場A https://maps.apple.com/?ll=34.9,135.6");
assert.strictEqual(p.kind, "coords");
assert.deepStrictEqual(p.coords, { lat: 34.9, lon: 135.6 });
assert.strictEqual(p.name, "会場A");
assert.strictEqual(p.viaLink, true);
// 座標入りリンク単体（Appleマップのq=場所名を名前に使う）
p = parsePastedLocation("https://maps.apple.com/?ll=34.9,135.6&q=%E4%BC%9A%E5%A0%B4B");
assert.strictEqual(p.kind, "coords");
assert.strictEqual(p.name, "会場B");
// 素の座標貼り付け → 名前なし・リンク経由でない
p = parsePastedLocation("34.5975, 135.7935");
assert.strictEqual(p.kind, "coords");
assert.strictEqual(p.name, "");
assert.strictEqual(p.viaLink, false);

// ---------- 検索語の正規化（〒付き住所） ----------

// Googleマップ「住所をコピー」の形式 → 郵便番号を除去
assert.strictEqual(
  normalizeSearchQuery("〒240-0013 神奈川県横浜市保土ケ谷区帷子町1丁目44"),
  "神奈川県横浜市保土ケ谷区帷子町1丁目44"
);
// 「日本、〒…」プレフィックス（Googleマップで付くことがある）も除去
assert.strictEqual(
  normalizeSearchQuery("日本、〒615-8262 京都府京都市西京区"),
  "京都府京都市西京区"
);
// 〒なしの番地ハイフンは消さない
assert.strictEqual(normalizeSearchQuery("帷子町1丁目44-33"), "帷子町1丁目44-33");
// 通常の検索語はそのまま
assert.strictEqual(normalizeSearchQuery("太陽が丘"), "太陽が丘");

console.log("✅ 計算テスト すべて合格");
