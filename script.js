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

// =========================
// Konfigurasi API & refresh
// =========================
const API_URL =
  "https://api.broker-radar.com/api/public/spreads/v2e/otetmarkets_ecnplus/XAUUSD.p,EURUSD.p,USDCHF.p,DJ30.c.p";

let latestPriceInfo = null;       // cache harga terakhir
const PRICE_REFRESH_MS = 5000;    // refresh tiap 5 detik

// =========================
// 1) Ambil harga XAUUSD dari API
// =========================
async function fetchXauPrice() {
  try {
    // Saat pertama kali belum ada harga → tampilkan status loading
    if (!latestPriceInfo) {
      priceLine.textContent = "Mengambil harga XAUUSD dari API...";
    }

    const res = await fetch(API_URL);
    const data = await res.json();

    // Cari symbol XAUUSD.p
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

    // Tampilkan di UI
    priceLine.textContent =
      `Bid: ${bid.toFixed(2)} | Ask: ${ask.toFixed(2)} | ` +
      `Mid: ${mid.toFixed(2)} | Spread: ${spreadPoints} pts`;

    return info;
  } catch (err) {
    console.error("Error fetchXauPrice:", err);

    // Kalau benar-benar belum pernah berhasil ambil harga
    if (!latestPriceInfo) {
      priceLine.textContent =
        "Gagal mengambil harga XAUUSD (cek koneksi atau API).";
    }
    return null;
  }
}

// =========================
// 2) Util – normalisasi dua level
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
      support,
      resistance,
      validLevels: true,
    };
  }

  const distToSupport = Math.abs(priceNow - support);
  const distToResistance = Math.abs(priceNow - resistance);
  const range = Math.abs(resistance - support) || 1;
  const nearThreshold = range * 0.15; // 15% range dianggap "dekat"

  let signal = "WAIT";
  let reason = `Harga di tengah range (${support.toFixed(
    2
  )} - ${resistance.toFixed(2)}), lebih aman menunggu.`;

  if (distToSupport <= nearThreshold && priceNow > support) {
    signal = "BUY";
    reason = `Harga dekat support (${support.toFixed(
      2
    )}) → potensi mantul naik.`;
  } else if (distToResistance <= nearThreshold && priceNow < resistance) {
    signal = "SELL";
    reason = `Harga dekat resistance (${resistance.toFixed(
      2
    )}) → potensi reject turun.`;
  }

  // Mode agresif: kalau masih WAIT, pilih arah level terdekat
  if (signal === "WAIT" && mode === "aggressive") {
    if (distToSupport < distToResistance) {
      signal = "BUY";
      reason = `Mode agresif: condong BUY (lebih dekat ke support ${support.toFixed(
        2
      )}).`;
    } else if (distToResistance < distToSupport) {
      signal = "SELL";
      reason = `Mode agresif: condong SELL (lebih dekat ke resistance ${resistance.toFixed(
        2
      )}).`;
    }
  }

  return { signal, reason, support, resistance, validLevels: true };
}

// =========================
// 4) Hitung Entry / SL / TP dari signal + level
// =========================
function buildLevelsFromSignal(signal, priceNow, support, resistance) {
  if (
    signal === "WAIT" ||
    isNaN(priceNow) ||
    isNaN(support) ||
    isNaN(resistance)
  ) {
    return null;
  }

  const range = Math.abs(resistance - support) || 1;

  let entry = priceNow;
  let sl, tp1, tp2;

  if (signal === "BUY") {
    sl = support - range * 0.1;
    tp1 = entry + range * 0.5;
    tp2 = entry + range * 0.8;
  } else if (signal === "SELL") {
    sl = resistance + range * 0.1;
    tp1 = entry - range * 0.5;
    tp2 = entry - range * 0.8;
  }

  return { entry, sl, tp1, tp2 };
}

// =========================
// 5) Util waktu
// =========================
function getNowString() {
  const now = new Date();
  const pad = (n) => (n < 10 ? "0" + n : n);
  return (
    now.getFullYear() +
    "-" +
    pad(now.getMonth() + 1) +
    "-" +
    pad(now.getDate()) +
    " " +
    pad(now.getHours()) +
    ":" +
    pad(now.getMinutes()) +
    ":" +
    pad(now.getSeconds())
  );
}

// =========================
// 6) Event: tombol Generate Signal
// =========================
btnGenerate.addEventListener("click", async () => {
  const tf = tfSelect.value;
  const mode = modeSelect.value;
  const nowStr = getNowString();

  // 1) Pakai harga terbaru; kalau belum ada sama sekali, fetch dulu
  let priceInfo = latestPriceInfo;
  if (!priceInfo) {
    priceInfo = await fetchXauPrice();
  }

  // 2) Ambil input user
  let priceNow = parseFloat(priceNowInput.value);
  const level1 = parseFloat(supportInput.value);
  const level2 = parseFloat(resistanceInput.value);

  // Kalau input harga kosong tapi API sukses → pakai mid dari API
  if ((isNaN(priceNow) || !priceNow) && priceInfo) {
    priceNow = priceInfo.mid;
  }

  // 3) Hitung signal dari level
  const decision = decideSignalFromLevels(
    mode,
    priceNow,
    level1,
    level2
  );

  const { signal, reason, support, resistance, validLevels } = decision;

  // 4) Update card signal (judul)
  signalLabel.textContent = signal;

  // 4a) Warna border card
  signalCard.classList.remove("signal-buy", "signal-sell", "signal-wait");
  if (signal === "BUY") signalCard.classList.add("signal-buy");
  else if (signal === "SELL") signalCard.classList.add("signal-sell");
  else signalCard.classList.add("signal-wait");

  // 4b) Detail reason + info angka
  let textDetail = reason;

  if (!isNaN(priceNow) && validLevels) {
    textDetail += ` (Harga: ${priceNow.toFixed(
      2
    )}, Support: ${support.toFixed(2)}, Resistance: ${resistance.toFixed(
      2
    )})`;
  }

  signalDetail.textContent = textDetail;

  // 4c) Hitung Entry / SL / TP
  const levels = buildLevelsFromSignal(
    signal,
    priceNow,
    support,
    resistance
  );

  if (!levels) {
    entryLine.textContent = "Entry: -";
    slLine.textContent = "SL: -";
    tp1Line.textContent = "TP1: -";
    tp2Line.textContent = "TP2: -";
  } else {
    entryLine.textContent = `Entry: ${levels.entry.toFixed(2)}`;
    slLine.textContent = `SL: ${levels.sl.toFixed(2)}`;
    tp1Line.textContent = `TP1: ${levels.tp1.toFixed(2)}`;
    tp2Line.textContent = `TP2: ${levels.tp2.toFixed(2)}`;
  }

  // 4d) Meta info
  let metaExtra = "";
  if (priceInfo) {
    metaExtra = ` | Mid API: ${priceInfo.mid.toFixed(
      2
    )} | Spread: ${priceInfo.spread_points} pts`;
  }

  signalMeta.textContent = `Mode: ${mode.toUpperCase()} • Timeframe: ${tf} • Generated at ${nowStr}${metaExtra}`;

  // 5) Tambah ke history
  const li = document.createElement("li");
  li.textContent = `[${nowStr}] TF ${tf} | Mode ${mode.toUpperCase()} → ${signal}`;
  historyList.prepend(li);
});

// =========================
// 7) Auto-refresh harga real time
// =========================
fetchXauPrice();                           // ambil pertama kali saat halaman dibuka
setInterval(fetchXauPrice, PRICE_REFRESH_MS); // update berkala
