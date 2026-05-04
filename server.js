const express = require("express");
const path = require("path");
const zlib = require("zlib");
const app = express();

/* ══ PERFORMANCE: compressão gzip nas respostas ══ */
app.use((req, res, next) => {
  const ae = req.headers["accept-encoding"] || "";
  if (!ae.includes("gzip")) return next();
  const orig = res.json.bind(res);
  res.json = (data) => {
    const str = JSON.stringify(data);
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Type", "application/json");
    zlib.gzip(str, (err, buf) => {
      if (err) { res.setHeader("Content-Type","application/json"); res.end(str); }
      else res.end(buf);
    });
  };
  next();
});

app.use(express.json({ limit: "20mb" }));

/* ══ PERFORMANCE: cache headers para arquivos estáticos ══ */
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1d",
  etag: true,
  lastModified: true
}));

/* ══ HEALTH CHECK — mantém servidor acordado (UptimeRobot) ══ */
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", ts: Date.now() });
});

/* ══ PROMPTS PRÉ-COMPILADOS (evita rebuild a cada request) ══ */
const BASE = `
## CONTEXT
In Nano Banana, the user uploads a photo of their own face/body. The AI automatically copies ALL physical and facial characteristics. The prompt MUST NOT contain any physical/facial description — only scene direction.

## NEVER INCLUDE
Hair (color/type/style), eye color, skin tone, face shape, glasses, beard/mustache/facial hair, earrings, facial piercings, apparent age, gender (unless directly affects clothing), ethnicity. Never start with "a man", "a woman", "a person with..."

## OUTPUT FORMAT
- ONLY the final prompt. Nothing else.
- English only
- Single fluid dense paragraph — 120 to 160 words minimum
- Structure: pose/action → clothing details → setting/lighting → visual style → --ar RATIO
- ZERO introductions, ZERO explanations, ZERO titles
- Golden rule: when in doubt — DO NOT INCLUDE IT`;

const ANALYSIS = `
## ANALYZE AND EXTRACT ONLY
1. POSE & BODY LANGUAGE: exact body position, arms/hands/legs, head angle, overall body language
2. EXPRESSION & EMOTION: facial expression, gaze direction, energy/vibe
3. CLOTHING & BODY ACCESSORIES: detailed clothing (type, color, texture, drape, style), watch, bracelet, necklace, ring, belt, bag, footwear if visible — NOT glasses, earrings, facial piercings
4. LIGHTING: type, direction, temperature, notable shadows
5. SETTING & BACKGROUND: environment, visible elements, depth of field, background color/tone
6. COMPOSITION & FRAMING: shot type, camera angle, rule of thirds, focal length
7. COLOR PALETTE & MOOD: dominant colors, overall tone, contrast, visual style`;

const PROMPTS = {
  ed: `You are an expert AI image generation prompt engineer for Nano Banana.
${ANALYSIS}
## STYLE: EDITORIAL
Premium fashion magazine aesthetic (Vogue, Harper's Bazaar). Dramatic studio lighting, neutral/minimalist background, rigorous composition, sophisticated and impactful visuals. High contrast, precise lighting, authority and elegance.
${BASE}`,

  ls: `You are an expert AI image generation prompt engineer for Nano Banana.
${ANALYSIS}
## STYLE: LIFESTYLE
Natural and spontaneous photography. Real ambient light (golden hour, overcast, soft interior), authentic settings (street, café, park, urban architecture), relaxed and human vibe. Candid feel, authenticity and proximity.
${BASE}`
};

/* ══ ROTA GEMINI — otimizada ══ */
app.post("/api/gemini", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY não configurada." });
  }

  const { imageBase64, imageType, ratio, style } = req.body;

  if (!imageBase64 || !imageType) {
    return res.status(400).json({ error: "Imagem não recebida." });
  }

  const ratioFinal = ratio || "4:5";
  const systemPrompt = (PROMPTS[style] || PROMPTS.ed).replace(/RATIO/g, ratioFinal);

  const requestBody = {
    contents: [{
      parts: [
        { inline_data: { mime_type: imageType, data: imageBase64 } },
        { text: systemPrompt + `\n\nGenerate the prompt now for aspect ratio ${ratioFinal}. Output ONLY the final prompt, nothing else.` }
      ]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1500,
      candidateCount: 1
    }
  };

  /* ══ TIMEOUT: cancela se Gemini demorar mais de 25s ══ */
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  /* ══ RETRY: tenta até 3x se der erro de sobrecarga ══ */
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const errMsg = data.error?.message || "Erro na API Gemini.";
        // Se for sobrecarga (503/429), tenta novamente
        if ((response.status === 503 || response.status === 429) && attempt < 3) {
          console.log(`Attempt ${attempt} failed (${response.status}), retrying in ${attempt * 2}s...`);
          await new Promise(r => setTimeout(r, attempt * 2000));
          continue;
        }
        clearTimeout(timeout);
        return res.status(response.status).json({ error: errMsg });
      }

      clearTimeout(timeout);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return res.status(200).json({ text: text.trim() });

    } catch (err) {
      lastError = err;
      if (err.name === "AbortError") {
        clearTimeout(timeout);
        return res.status(504).json({ error: "Timeout: Gemini demorou demais. Tente novamente." });
      }
      if (attempt < 3) {
        console.log(`Attempt ${attempt} error: ${err.message}, retrying...`);
        await new Promise(r => setTimeout(r, attempt * 1500));
        continue;
      }
    }
  }

  clearTimeout(timeout);
  return res.status(500).json({ error: "Erro após 3 tentativas: " + (lastError?.message || "desconhecido") });
});

/* ══ SERVE INDEX ══ */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ══ KEEP ALIVE INTERNO — bate em si mesmo a cada 10min ══ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 Promptfy rodando na porta ${PORT}`);

  // Só ativa o keep-alive em produção (Render)
  if (process.env.NODE_ENV === "production" || process.env.RENDER) {
    const siteUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    setInterval(async () => {
      try {
        await fetch(`${siteUrl}/health`);
        console.log("💓 Keep-alive ping enviado");
      } catch(e) {
        console.log("Keep-alive falhou:", e.message);
      }
    }, 10 * 60 * 1000); // 10 minutos
  }
});
