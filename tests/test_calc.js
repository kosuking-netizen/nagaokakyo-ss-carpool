// 精算計算の自動テスト。GitHub Actions（.github/workflows/ci.yml）が
// pushのたびに実行し、1つでも期待値と違えば失敗として通知される。
"use strict";
const assert = require("assert");
const { calcSettlement } = require("../calc.js");

const base = { fuelEfficiency: 7, gasSurcharge: 10 };

// 標準ケース（サンプル会場：片道25km・ETC1050円・173.4円/L・3人乗車）
let c = calcSettlement({ ...base, km: 25, etc: 1050, gas: 173.4, pax: 3 });
assert.strictEqual(c.rtKm, 50);
assert.strictEqual(c.fuel, 1310);   // 50÷7×183.4 = 1310.0
assert.strictEqual(c.toll, 2100);   // 1050×2
assert.strictEqual(c.total, 3410);  // 3410はすでに10円単位
assert.strictEqual(c.per, 1140);    // 3410÷3=1136.7 → 10円切り上げ

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

// 一人あたりの切り上げ（1020÷4=255 → そのまま260ではなく…255→260）
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

console.log("✅ 計算テスト すべて合格");
