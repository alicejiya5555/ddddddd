import { Telegraf } from "telegraf";
import axios from "axios";
import ti from "technicalindicators";
import express from "express";

// --- Bot Init ---
const BOT_TOKEN = "7655482876:AAGu1F3V_pUbAwUu8wRpLjoy6lMJ2QCm4FY";
const bot = new Telegraf(BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// --- Utility Functions ---
function parseCommand(command) {
  const cmd = command.toLowerCase();
  const match = cmd.match(/^\/(\w+)(15m|1h|4h|6h|12h)$/);
  if (!match) return null;

  const [, symbolRaw, interval] = match;

  const symbol = symbolRaw === "eth" ? "ETHUSDT"
    : symbolRaw === "btc" ? "BTCUSDT"
    : symbolRaw === "link" ? "LINKUSDT"
    : null;

  if (!symbol) return null;

  return { symbol, interval };
}

function formatNum(num) {
  if (num === undefined || num === null || isNaN(num)) return "N/A";
  return parseFloat(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function calcVWAP(candles, period) {
  let vwapArray = [];
  for (let i = 0; i <= candles.length - period; i++) {
    let slice = candles.slice(i, i + period);
    let cumPV = 0;
    let cumVol = 0;

    for (let bar of slice) {
      const typicalPrice = (parseFloat(bar.high) + parseFloat(bar.low) + parseFloat(bar.close)) / 3;
      const volume = parseFloat(bar.volume);
      cumPV += typicalPrice * volume;
      cumVol += volume;
    }

    vwapArray.push(cumPV / cumVol);
  }

  return vwapArray[vwapArray.length - 1]; // latest VWAP
}

// --- Binance Data Fetch ---
async function getBinanceData(symbol, interval) {
  const [priceRes, candlesRes] = await Promise.all([
    axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`),
    axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=200`)
  ]);

  const priceData = priceRes.data;
  const candles = candlesRes.data.map(c => ({
    time: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5])
  }));
  
  return { priceData, candles };
}

// 📊 KDJ (9,3,3) calculation
function getKDJ(candles) {
  const period = 9;
  const kPeriod = 3;
  const dPeriod = 3;

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);

  const RSV = [];

  for (let i = period - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - period + 1, i + 1);
    const lowSlice = lows.slice(i - period + 1, i + 1);

    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);

    const rsv = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
    RSV.push(rsv);
  }

  const K = [];
  const D = [];

  K[0] = 50;
  D[0] = 50;

  for (let i = 1; i < RSV.length; i++) {
    K[i] = (2 / 3) * K[i - 1] + (1 / 3) * RSV[i];
    D[i] = (2 / 3) * D[i - 1] + (1 / 3) * K[i];
  }

  const latestK = K[K.length - 1] || 0;
  const latestD = D[D.length - 1] || 0;
  const J = 3 * latestK - 2 * latestD;

  return {
    k: latestK.toFixed(2),
    d: latestD.toFixed(2),
    j: J.toFixed(2),
  };
}
// --- Indicator Calculations ---
function calculateIndicators(candles) {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const volume = candles.map(c => c.volume);

  // Helper to safely get last value or NaN if empty
  const lastValue = (arr) => arr.length ? arr.slice(-1)[0] : NaN;

  const macdRaw = ti.MACD.calculate({
    values: close,
    fastPeriod: 3,
    slowPeriod: 10,
    signalPeriod: 16,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  const macd = lastValue(macdRaw) || { MACD: 0, signal: 0, histogram: 0 };

  const bbRaw = ti.BollingerBands.calculate({
    period: 20,
    values: close,
    stdDev: 2
  });
  const bb = lastValue(bbRaw) || { upper: 0, middle: 0, lower: 0 };

  const atrRaw = ti.ATR.calculate({
    period: 14,
    high,
    low,
    close
  });
  const atr = lastValue(atrRaw);

    const adxData = ti.ADX.calculate({
    period: 14,
    close,
    high,
    low
  });

  const adx = lastValue(adxData)?.adx;
  const pdi = lastValue(adxData)?.pdi;
  const mdi = lastValue(adxData)?.mdi;

  const stochRsiData = ti.StochasticRSI.calculate({
    values: close,
    rsiPeriod: 14,
    stochasticPeriod: 14,
    kPeriod: 3,
    dPeriod: 3
  });

  const stochRsi = lastValue(stochRsiData);
  const stochK = stochRsi?.k;
  const stochD = stochRsi?.d;

const vwap1 = calcVWAP(candles, 1);
const vwap5 = calcVWAP(candles, 5);

const roc14 = lastValue(ti.ROC.calculate({
  period: 14,
  values: close
}));

const uoRaw = ti.UO.calculate({
  close,
  high,
  low,
  short: 7,
  medium: 14,
  long: 28
});

const uo = lastValue(uoRaw) || 0;

// 📉 WILLIAMS %R (14)
function getWilliamsR(candles) {
  const highs = candles.slice(-14).map(c => parseFloat(c[2]));
  const lows = candles.slice(-14).map(c => parseFloat(c[3]));
  const close = parseFloat(candles[candles.length - 1][4]);

  const highestHigh = Math.max(...highs);
  const lowestLow = Math.min(...lows);

  const williamsR = ((highestHigh - close) / (highestHigh - lowestLow)) * -100;
  return williamsR.toFixed(2);
}

// 📊 KDJ indicator calculation
const kdj = getKDJ(candles);

const cci7 = lastValue(ti.CCI.calculate({
  period: 7,
  high,
  low,
  close
}));

const cci10 = lastValue(ti.CCI.calculate({
  period: 10,
  high,
  low,
  close
}));

const cci20 = lastValue(ti.CCI.calculate({
  period: 20,
  high,
  low,
  close
}));

  return {
    sma5: formatNum(lastValue(ti.SMA.calculate({ period: 5, values: close }))),
    sma13: formatNum(lastValue(ti.SMA.calculate({ period: 13, values: close }))),
    sma21: formatNum(lastValue(ti.SMA.calculate({ period: 21, values: close }))),
    sma50: formatNum(lastValue(ti.SMA.calculate({ period: 50, values: close }))),
    sma100: formatNum(lastValue(ti.SMA.calculate({ period: 100, values: close }))),
    sma200: formatNum(lastValue(ti.SMA.calculate({ period: 200, values: close }))),

    ema5: formatNum(lastValue(ti.EMA.calculate({ period: 5, values: close }))),
    ema13: formatNum(lastValue(ti.EMA.calculate({ period: 13, values: close }))),
    ema21: formatNum(lastValue(ti.EMA.calculate({ period: 21, values: close }))),
    ema50: formatNum(lastValue(ti.EMA.calculate({ period: 50, values: close }))),
    ema100: formatNum(lastValue(ti.EMA.calculate({ period: 100, values: close }))),
    ema200: formatNum(lastValue(ti.EMA.calculate({ period: 200, values: close }))),

    wma5: formatNum(lastValue(ti.WMA.calculate({ period: 5, values: close }))),
    wma13: formatNum(lastValue(ti.WMA.calculate({ period: 13, values: close }))),
    wma21: formatNum(lastValue(ti.WMA.calculate({ period: 21, values: close }))),
    wma50: formatNum(lastValue(ti.WMA.calculate({ period: 50, values: close }))),
    wma100: formatNum(lastValue(ti.WMA.calculate({ period: 100, values: close }))),

    macdValue: formatNum(macd.MACD),
    macdSignal: formatNum(macd.signal),
    macdHistogram: formatNum(macd.histogram),

    bbUpper: formatNum(bb.upper),
    bbMiddle: formatNum(bb.middle),
    bbLower: formatNum(bb.lower),

    rsi5: formatNum(lastValue(ti.RSI.calculate({ period: 5, values: close }))),
    rsi14: formatNum(lastValue(ti.RSI.calculate({ period: 14, values: close }))),
   
    atr14: formatNum(atr),

    mfi14: formatNum(lastValue(ti.MFI.calculate({
      high,
      low,
      close,
      volume,
      period: 14
    }))),

    mfi20: formatNum(lastValue(ti.MFI.calculate({
      high,
      low,
      close,
      volume,
      period: 20
    }))),


williamsR14: formatNum(lastValue(ti.WilliamsR.calculate({
  period: 14,
  high: high,
  low: low,
  close: close
}))),

    adx14: formatNum(adx),
    pdi14: formatNum(pdi),
    mdi14: formatNum(mdi),

    stochRsiK: formatNum(stochK),
    stochRsiD: formatNum(stochD),

    vwap1: formatNum(vwap1),
    vwap5: formatNum(vwap5),
    uo: formatNum(uo),

// Add KDJ values here:
  kdjK: kdj.k,
  kdjD: kdj.d,
  kdjJ: kdj.j,

cci7: formatNum(cci7),
cci10: formatNum(cci10),
cci20: formatNum(cci20),

roc14: formatNum(roc14),
  };
}

// --- Output Message Generator ---
function generateOutput(priceData, indicators, name = "Symbol", tfLabel = "Timeframe") {
  const header = 
`📊 ${name} ${tfLabel} Analysis

💰 Price: $${formatNum(priceData.lastPrice)}
📈 24h High: $${formatNum(priceData.highPrice)}
📉 24h Low: $${formatNum(priceData.lowPrice)}
🔁 Change: $${formatNum(priceData.priceChange)} (${priceData.priceChangePercent}%)
🧮 Volume: ${formatNum(priceData.volume)}
💵 Quote Volume: $${formatNum(priceData.quoteVolume)}
🔓 Open Price: $${formatNum(priceData.openPrice)}
⏰ Close Time: ${new Date(priceData.closeTime).toLocaleString('en-UK')}

`;

  const smaSection = 
`📊 Simple Moving Averages (SMA):
 - SMA 5: $${indicators.sma5}
 - SMA 13: $${indicators.sma13}
 - SMA 21: $${indicators.sma21}
 - SMA 50: $${indicators.sma50}
 - SMA 100: $${indicators.sma100}
 - SMA 200: $${indicators.sma200}

`;

  const emaSection =
`📈 Exponential Moving Averages (EMA):
 - EMA 5: $${indicators.ema5}
 - EMA 13: $${indicators.ema13}
 - EMA 21: $${indicators.ema21}
 - EMA 50: $${indicators.ema50}
 - EMA 100: $${indicators.ema100}
 - EMA 200: $${indicators.ema200}

`;

  const wmaSection =
`⚖️ Weighted Moving Averages (WMA):
 - WMA 5: $${indicators.wma5}
 - WMA 13: $${indicators.wma13}
 - WMA 21: $${indicators.wma21}
 - WMA 50: $${indicators.wma50}
 - WMA 100: $${indicators.wma100}

`;

  const macdSection =
`📉 MACD: 3,10,16
 - MACD: ${indicators.macdValue}
 - Signal: ${indicators.macdSignal}
 - Histogram: ${indicators.macdHistogram}

`;

  const bbSection =
`🎯 Bollinger Bands (20, 2 StdDev):
 - Upper Band: $${indicators.bbUpper}
 - Middle Band: $${indicators.bbMiddle}
 - Lower Band: $${indicators.bbLower}

`;

  const rsiSection =
`⚡ Relative Strength Index (RSI):
 - RSI (5): ${indicators.rsi5}
 - RSI (14): ${indicators.rsi14}

`;

  const atrSection = 
`📏 Average True Range (ATR):
 - ATR (14): ${indicators.atr14}

`;

  const adxSection =
`📊 ADX (Trend Strength):
 - ADX (14): ${indicators.adx14}
 - +DI (14): ${indicators.pdi14}
 - -DI (14): ${indicators.mdi14}

`;

  const stochRsiSection =
`📉 Stochastic RSI (14,14,3,3):
 - %K: ${indicators.stochRsiK}
 - %D: ${indicators.stochRsiD}

`;

  const vwapSection =
`🔹 VWAP:
 - VWAP(1): ${indicators.vwap1}
 - VWAP(5): ${indicators.vwap5}

`;

  const mfiSection = 
`💧 Money Flow Index (MFI):
 - MFI (14): ${indicators.mfi14}
 - MFI (20): ${indicators.mfi20}
`;

const williamsSection =
`📉 Williams %R Indicator:
 - Williams %R (14): ${indicators.williamsR14}%
`;

const kdjSection =
`📊 KDJ (9,3,3):
 - K: ${indicators.kdjK}
 - D: ${indicators.kdjD}
 - J: ${indicators.kdjJ}

`;

const cciSection =
`📘 Commodity Channel Index (CCI):
 - CCI (7): ${indicators.cci7}
 - CCI (10): ${indicators.cci10}
 - CCI (20): ${indicators.cci20}

`;

const rocSection =
`📊 Rate of Change (ROC):
 - ROC (14): ${indicators.roc14}%

`;

const uoSection =
`🧭 Ultimate Oscillator:
 - UO (7,14,28): ${indicators.uo}

`;

  // Your added custom words here:
  const extraNotes =
`
Calculate and measure these values for best output

Calculate Values of all other Indicators
📍 Final Signal Summary
📉 Trend Direction
📊 Indicator Behavior Breakdown
⚠️ Volatility + Breakout Scan
🌡 Momentum Heatmap
📈 Volume & OBV Strength
🧮 Fibonacci Zones
⏳ Multi-Timeframe Comparison
🐋 Whale vs Retail Movement
🕯 Candle Pattern Alerts
🕰 Best UTC Entry & Exit Times
🔮 Short-Term & Mid-Term Price Prediction
🛡 Entry Zone, Take Profit, Stop Loss
📢 Final Trade Advice (Mindset + Strategy)
🔵Mostly of the Chances for Hit Tp1 or T2 or T3 suggest 1
🔵IF I take profit on TP1, or 2, Where should I take my next position
🔵Chances for go more up or now it's a small or big reserve time
Some Other Information if you can Provide:
🔁 Reversal vs Continuation Clarity
🧠 Strategy Type Suggestion
📅 3-Day or Weekly Forecast

`;

  return header + smaSection + emaSection + wmaSection + macdSection + bbSection + rsiSection + stochRsiSection + kdjSection + williamsSection + cciSection + rocSection + uoSection + vwapSection + mfiSection + atrSection + adxSection + extraNotes;
}

// --- Command Handler ---
bot.on("text", async (ctx) => {
  const parsed = parseCommand(ctx.message.text);
  if (!parsed) return ctx.reply("❌ Invalid format. Try `/eth1h`, `/btc15m`, `/link4h`");

  try {
    const { symbol, interval } = parsed;
    const { priceData, candles } = await getBinanceData(symbol, interval);
    const indicators = calculateIndicators(candles);
    
    // Derive friendly names
    const name = symbol.replace("USDT", "");
    const tfLabel = interval.toUpperCase();
    
    const message = generateOutput(priceData, indicators, name, tfLabel);
    ctx.reply(message);
  } catch (error) {
    console.error(error);
    ctx.reply("⚠️ Error fetching data. Please try again.");
  }
});

// --- Web Server (keep-alive for Render/Heroku) ---
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  bot.launch();
});
