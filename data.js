// ============================================================
// 長岡京SS 配車交通費精算 — 共有データ
//
// このファイルを編集すると全員のアプリに反映されます。
// 編集方法：GitHubのこのファイルのページで鉛筆マーク（Edit）→
//           修正 → 「Commit changes」を押すだけ。数分で反映されます。
//
// ★ ガソリン価格は毎週水・木・金の夜に自動チェックされます（GitHub Actions）。
//    新しい週の価格が出ていれば更新され、なくてもチェック日は毎回記録されます。
//
// ★ APIの残り回数は毎晩21:30に自動チェックされます（GitHub Actions）。
//    チーム全員が同じ残数を見られるようにするための記録です。
//
//    [AUTO-...] の行は自動更新の目印なので消さないでください。
//
// ★ 会場はマスタ登録制ではなく、計算のたびにNAVITIMEから
//    最新のルート・料金を取得する方式です（このファイルに会場情報は持ちません）。
// ============================================================
window.APP_DATA = {
  dataUpdated: "2026-08-28", // [AUTO-UPDATED]

  // 集合場所（この学年の集合場所）
  meetingPoint: {
    name: "ローソン長岡京インター店",
    lat: 34.917603,
    lon: 135.686203,
  },

  // 精算ルール
  fuelEfficiency: 7,   // 燃費 7km/L（チーム共通ルール）
  gasSurcharge: 10,    // ガソリン価格に +10円/L

  // 今週のガソリン価格（京都府平均・レギュラー）※毎週水・木・金の夜に自動チェック
  gasPrice: {
    price: 172.6, // [AUTO-GAS-PRICE]
    week: "2026-08-24", // [AUTO-GAS-WEEK]
    checked: "2026-08-29", // [AUTO-GAS-CHECKED] 自動チェックが最後に走った日（変更がなくても記録）
  },

  // チーム共有キーのAPI残り回数（毎晩21:30に自動チェック）
  // ルート取得(Route car)と会場検索(Spot)は別枠なので、それぞれ1回ずつ確認する。
  // チェックはその API 自身の枠から引くので、負担は各枠6%（月約30回）ずつ。
  // resetOn は暦月ではなく契約日基準（毎月18日ごろ）。
  apiQuota: {
    route: {
      remaining: 418, // [AUTO-QUOTA-ROUTE-REMAINING]
      limit: 500, // [AUTO-QUOTA-ROUTE-LIMIT]
      resetOn: "2026-09-18", // [AUTO-QUOTA-ROUTE-RESET]
      checked: "2026-09-03", // [AUTO-QUOTA-ROUTE-CHECKED]
    },
    spot: {
      remaining: 428, // [AUTO-QUOTA-SPOT-REMAINING]
      limit: 500, // [AUTO-QUOTA-SPOT-LIMIT]
      resetOn: "2026-09-18", // [AUTO-QUOTA-SPOT-RESET]
      checked: "2026-09-03", // [AUTO-QUOTA-SPOT-CHECKED]
    },
  },
};
