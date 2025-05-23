const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/command", async (req, res) => {
  const cmd = req.body.command.trim().toLowerCase();

  try {
    if (cmd.startsWith("/price ")) {
      const symbol = cmd.split(" ")[1].toUpperCase();
      const { data } = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      return res.json({ result: `🔹 Price of ${symbol}: $${data.price}` });

    } else if (cmd.startsWith("/indicators ")) {
      const symbol = cmd.split(" ")[1].toUpperCase();
      const { data } = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=50`);

      const closePrices = data.map(k => parseFloat(k[4]));
      const avg = (closePrices.reduce((a, b) => a + b, 0) / closePrices.length).toFixed(2);
      const latest = closePrices[closePrices.length - 1];

      return res.json({
        result: `🔍 Indicators for ${symbol}\nLatest Price: $${latest}\n1H Avg: $${avg}`
      });

    } else if (cmd === "/eth") {
      const { data } = await axios.get("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT");
      return res.json({ result: `ETH/USDT: $${data.price}` });

    } else if (cmd === "/btc") {
      const { data } = await axios.get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
      return res.json({ result: `BTC/USDT: $${data.price}` });

    } else {
      return res.json({ result: "⚠️ Unknown command. Try /price ethusdt or /indicators btcusdt" });
    }

  } catch (error) {
    console.error("API error:", error);
    return res.json({ result: "❌ Error fetching data. Check command and try again." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Server running on port", PORT));
