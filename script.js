// =========================
// Ambil elemen-elemen dari HTML
// =========================
const tfSelect = document.getElementById("timeframe");
const modeSelect = document.getElementById("mode");
const btnGenerate = document.getElementById("btn-generate");

const signalLabel = document.getElementById("signal-label");
const signalDetail = document.getElementById("signal-detail");
const signalMeta = document.getElementById("signal-meta");

const entryLine = document.getElementById("entry-line");
const slLine = document.getElementById("sl-line");
const tp1Line = document.getElementById("tp1-line");
const tp2Line = document.getElementById("tp2-line");
const signalCard = document.getElementById("signal-card");

const historyList = document.getElementById("history-list");
const priceLine = document.getElementById("price-line");

const priceNowInput = document.getElementById("price-now");
const supportInput = document.getElementById("support");
const resistanceInput = document.getElementById("resistance");

// URL API Broker Radar (XAUUSD + beberapa pair lain)
const API_URL =
  "https://api.broker-radar.com/api/public/spreads/v2e/otetmarkets_ecnplus/XAUUSD.p,EURUSD.p,USDCHF.p,DJ30.c.p";

// Harga terakhir yang berhasil diambil
let latestPriceInfo = null;

// Interval refresh harga (ms)
const PRICE_REFRESH_MS = 5000; // 5 detik

// =========================
// 1) Ambil harga XAUUSD dari API (dipakai real time)
// =========================
async function fetchXauPrice() {
  try {
    // Kalau belum ada harga sama sekali, tampilkan status loading.
    if (!latestPriceInfo) {
      priceLine.textContent = "Mengambil harga XAUUSD dari API...";
    }

    const res = await fetch(API_URL);
    const data = await res.json();

    const xau = data.best_spreads.find(
      (item) => item.symbol === "XAUUSD.p"
    );

    if (!xau) {
      priceLine.textContent = "Data XAUUSD tidak ditemukan di API.";
      return null;
    }

    const bid = xau.bid;
    const ask = xau.ask;
    const spreadPoints = xau.spread_points;
    const mid = (bid + ask) / 2;

    const info = {
      bid,
      ask,
      mid,
      spread_points: spreadPoints,
    };

    // Simpan sebagai harga terbaru
    latestPriceInfo = info;

    // Update tampilan harga
    priceLine.textContent =
      `Bid: ${bid.toFixed(2)} | Ask: ${ask.toFixed(2)} | ` +
      `Mid: ${mid.toFixed(2)} | Spread: ${spreadPoints} pts`;

    return info;
  } catch (err) {
    console.error("Error fetchXauPrice:", err);
    if (!latestPriceInfo) {
      priceLine.textContent =
        "Gagal mengambil harga XAUUSD (cek koneksi atau API).";
    }
    return null;
  }
}

// =========================
// 2) Util: normalisasi dua level
// =========================
function normalizeLevels(levelA, levelB) {
  if (isNaN(levelA) || isNaN(levelB)) {
    return { valid: false, lower: NaN, upper: NaN };
  }

  if (levelA === levelB) {
    return { valid: false, lower: levelA, upper: levelB };
  }

  const lower = Math.min(levelA, levelB);
  const upper = Math.max(levelA, levelB);

  return { valid: true, lower, upper };
}

// =========================
// 3) Tentukan signal dari harga + level + mode
// =========================
function decideSignalFromLevels(mode, priceNow, level1, level2) {
  if (isNaN(priceNow)) {
    return {
      signal: "WAIT",
      reason: "Harga sekarang belum tersedia (API atau input).",
      support: NaN,
      resistance: NaN,
      validLevels: false,
    };
  }

  const norm = normalizeLevels(level1, level2);

  if (!norm.valid) {
    return {
      signal: "WAIT",
      reason: "Dua level harga harus diisi dan tidak boleh sama.",
      support: NaN,
      resistance: NaN,
      validLevels: false,
    };
  }

  const support = norm.lower;
  const resistance = norm.upper;

  // RULE: harga harus berada di dalam range support–resistance
  if (priceNow < support || priceNow > resistance) {
    return {
      signal: "WAIT",
      reason: `Harga (${priceNow.toFixed(
        2
      )}) berada di luar range level (${support.toFixed(
        2
      )} - ${resistance.toFixed(
        2
      )}). Tunggu harga mendekati zona support/resistance.`,
      suppor
