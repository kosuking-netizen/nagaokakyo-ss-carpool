// ============================================================
// 長岡京SS 配車交通費精算 — 計算ロジック（純関数）
// index.html から使用し、tests/test_calc.js で自動テストされる。
//
// 計算式（チームルール）:
//   ガソリン代 = 往復距離 ÷ 燃費7km/L × (週次ガソリン価格 + 10円)
//   高速代     = ETC片道 × 2
//   精算額     = 上記合計を10円単位に四捨五入
//   一人あたり = 精算額 ÷ 乗車人数 を10円単位に切り上げ（2人以上のとき）
// ============================================================
(function (root) {
  "use strict";

  function calcSettlement(p) {
    const km = Number(p.km);
    const etc = Number(p.etc) || 0;
    const gas = Number(p.gas);
    const pax = parseInt(p.pax, 10) || 0;
    const fuelEff = Number(p.fuelEfficiency);
    const surcharge = Number(p.gasSurcharge);
    if (!(km > 0) || !(gas > 0) || !(fuelEff > 0) || !(surcharge >= 0) || !(etc >= 0)) {
      return null;
    }
    const rtKm = km * 2;
    const unit = gas + surcharge;
    const fuel = Math.round((rtKm / fuelEff) * unit);
    const toll = Math.round(etc * 2);
    const totalRaw = fuel + toll;
    const total = Math.round(totalRaw / 10) * 10;
    const per = pax >= 2 ? Math.ceil(total / pax / 10) * 10 : null;
    return { km, etc, gas, pax, rtKm, unit, fuel, toll, totalRaw, total, per };
  }

  const api = { calcSettlement };
  root.NSS_CALC = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
