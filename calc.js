// ============================================================
// 長岡京SS 配車交通費精算 — 計算ロジック・共有テキスト解析（純関数）
// index.html から使用し、tests/test_calc.js で自動テストされる。
//
// 計算式（チームルール）:
//   ガソリン代 = 往復距離 ÷ 燃費7km/L × (週次ガソリン価格 + 10円) を1円単位に四捨五入
//   高速代     = ETC片道 × 2
//   駐車場代   = 手入力の実費をそのまま加算（往復2倍しない）
//   精算額     = ガソリン代 + 高速代 + 駐車場代（丸めなし・1円単位）
//   一人あたり = 精算額 ÷ 割り勘人数 を1円単位に切り上げ（2人以上のとき）
// ※PayPay精算に合わせて10円丸めは廃止（v2.36）。ガソリン代のみ1円単位に
//   四捨五入し、内訳の合計と精算額が常に一致して検算できることを優先している。
// ============================================================
(function (root) {
  "use strict";

  function calcSettlement(p) {
    const km = Number(p.km);
    const etc = Number(p.etc) || 0;
    const parking = Number(p.parking) || 0;
    const gas = Number(p.gas);
    const pax = parseInt(p.pax, 10) || 0;
    const fuelEff = Number(p.fuelEfficiency);
    const surcharge = Number(p.gasSurcharge);
    if (!(km > 0) || !(gas > 0) || !(fuelEff > 0) || !(surcharge >= 0) || !(etc >= 0) || !(parking >= 0)) {
      return null;
    }
    const rtKm = km * 2;
    const unit = gas + surcharge;
    const fuel = Math.round((rtKm / fuelEff) * unit);
    const toll = Math.round(etc * 2);
    const totalRaw = fuel + toll + Math.round(parking);
    const total = totalRaw;
    const per = pax >= 2 ? Math.ceil(total / pax) : null;
    return { km, etc, parking: Math.round(parking), gas, pax, rtKm, unit, fuel, toll, totalRaw, total, per };
  }

  // ------------------------------------------------------------
  // 地図アプリの共有テキスト解析（純関数・検索欄への貼り付けで使用）
  // ------------------------------------------------------------

  // テキスト・URLから日本国内の座標を取り出す。見つからなければnull。
  // 対応：Googleマップの長いURL（!3d!4d / @lat,lon / q=lat,lon）、
  //       Appleマップの共有リンク（ll= / coordinate= 等）、geo:、素の座標貼り付け。
  // ※maps.app.goo.gl等の短縮リンクは座標がURLに含まれないため対象外
  //   （リダイレクト先の取得はCORS制限でブラウザからは不可能。
  //    展開先ページのcenter=はIP位置ベースの誤座標になることを確認済み）
  function extractCoords(text) {
    if (text == null || text === "") return null;
    let t = String(text);
    try { t = decodeURIComponent(t); } catch {} // %2C等を復元（不正な%は元のまま）
    const pats = [
      /!3d(\d{1,2}\.\d+)!4d(\d{1,3}\.\d+)/,                  // Googleのピン座標（最優先）
      /[?&;](?:q|ll|sll|center|coordinate|daddr|destination)=(\d{1,2}\.\d+),\s*(\d{1,3}\.\d+)/,
      /@(\d{1,2}\.\d+),(\d{1,3}\.\d+)/,                      // URL中の地図中心
      /\bgeo:(\d{1,2}\.\d+),(\d{1,3}\.\d+)/,
      /^\s*(\d{1,2}(?:\.\d+)?)\s*[,、\s]\s*(\d{1,3}(?:\.\d+)?)\s*$/, // 素の座標
    ];
    for (let i = 0; i < pats.length; i++) {
      const m = pats[i].exec(t);
      if (!m) continue;
      const lat = parseFloat(m[1]);
      const lon = parseFloat(m[2]);
      // 日本国内の範囲のみ有効（従来の座標貼り付けと同じ範囲）
      if (lat >= 20 && lat < 50 && lon >= 120 && lon < 160) return { lat, lon };
    }
    return null;
  }

  // 検索欄への貼り付けを解釈する。戻り値：
  //   { kind:"coords", coords:{lat,lon}, name, viaLink } … その座標をそのまま使う
  //   { kind:"query",  query } … リンクに添えられた場所名で検索し直す
  //   { kind:"linkOnly" }      … 短縮リンク単体（場所を特定できない→案内を出す）
  //   null                     … URLでも座標でもない、ただの検索語
  function parsePastedLocation(raw) {
    if (raw == null) return null;
    const s = String(raw);
    const hasUrl = /https?:\/\//.test(s);
    const coords = extractCoords(s);
    if (!hasUrl && !coords) return null;
    // URL以外の部分（共有の「コピー」では場所名が一緒に入ることが多い）
    let name = s.replace(/https?:\/\/[^\s]+/g, " ").replace(/\s+/g, " ").trim();
    if (name && extractCoords(name)) name = ""; // 残りが座標そのものなら名前ではない
    if (!name && hasUrl) {
      // AppleマップのURL等に含まれる q=場所名 を会場名として拾う
      let t = s;
      try { t = decodeURIComponent(s); } catch {}
      const m = /[?&]q=([^&\s]+)/.exec(t);
      if (m && !/^[\d.,]+$/.test(m[1])) name = m[1].replace(/\+/g, " ");
    }
    if (coords) return { kind: "coords", coords, name, viaLink: hasUrl };
    if (name.length >= 2) return { kind: "query", query: name };
    return { kind: "linkOnly" };
  }

  // 検索語の正規化：Googleマップ「住所をコピー」の形式（〒615-8262 京都府… や
  // 日本、〒…）をそのまま貼っても住所検索が通るように、郵便番号・国名を取り除く。
  // ※郵便番号は〒付きのときだけ除去（「44-33」のような番地を誤って消さないため）
  function normalizeSearchQuery(q) {
    return String(q)
      .replace(/〒\s*[0-9０-９]{3}[-ー−‐][0-9０-９]{4}\s*/g, " ")
      .replace(/(^|\s)日本[、,]\s*/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  const api = { calcSettlement, extractCoords, parsePastedLocation, normalizeSearchQuery };
  root.NSS_CALC = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
