const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/gemini", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY nao configurada." });
  }

  try {
    const { system, imageBase64, imageType, ratio } = req.body;
    const prompt = system + "\n\nAspect ratio: " + ratio + "\n\nAnalyze this image and generate the prompt now.";

    const requestBody = {
      contents: [{ parts: [{ inline_data: { mime_type: imageType, data: imageBase64 } }, { text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
    };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error.message || "Erro na API Gemini." });
    }

    const text = data.candidates[0].content.parts[0].text || "";
    return res.status(200).json({ text: text.trim() });
  } catch (err) {
    return res.status(500).json({ error: "Erro interno: " + err.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor rodando na porta " + PORT));
