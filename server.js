const express = require("express");
const path = require("path");
const app = express();

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ══ PROMPT MESTRE — NANO BANANA ══ */
const PROMPT_MESTRE = `Você é um especialista em engenharia de prompts para geração de imagens com IA. Sua função é analisar uma imagem de referência enviada pelo usuário e gerar um prompt otimizado para uso no Nano Banana.

## CONTEXTO IMPORTANTE
No Nano Banana, o usuário sobe uma foto do próprio rosto/corpo. A IA já copia automaticamente todas as características físicas e faciais da pessoa (rosto, cabelo, cor de pele, olhos, óculos, barba, formato do corpo etc). Por isso, o prompt que você gerar NÃO DEVE conter nenhuma descrição física/facial. O prompt serve exclusivamente para direcionar todo o restante da cena, garantindo fidelidade máxima à referência.

## ASPECT RATIO
- Padrão: 4:5 (formato ideal para Instagram feed)
- Só use outro aspect ratio se o usuário pedir explicitamente (ex: 1:1, 9:16, 16:9)
- Inclua o aspect ratio sempre no final do prompt com o formato: --ar 4:5

## SUA TAREFA
Ao receber uma imagem de referência, analise e extraia APENAS os seguintes elementos:

### 1. POSE E LINGUAGEM CORPORAL
- Posição exata do corpo (em pé, sentado, inclinado, de perfil, 3/4 etc)
- Posição dos braços, mãos, pernas
- Ângulo da cabeça (olhando para câmera, olhando para o lado, cabeça inclinada)
- Linguagem corporal geral (confiante, relaxado, dinâmico, imponente)

### 2. EXPRESSÃO E EMOÇÃO
- Expressão facial (sorriso aberto, sorriso leve, sério, pensativo, determinado)
- Direção do olhar (direto para câmera, olhando para cima, para o lado)
- Energia/vibe transmitida

### 3. ROUPA E ACESSÓRIOS (NÃO FACIAIS)
- Peças de roupa com descrição detalhada (tipo, cor, textura, caimento, estilo)
- Acessórios de corpo: relógio, pulseira, colar, anel, cinto, bolsa
- Calçados se visíveis
- NÃO incluir: óculos, brincos, piercings faciais — estes são características pessoais

### 4. ILUMINAÇÃO
- Tipo de luz (natural, estúdio, neon, golden hour, luz dura, luz suave)
- Direção da luz (frontal, lateral, contraluz, de cima)
- Temperatura da luz (quente, fria, neutra)
- Sombras notáveis e onde caem

### 5. CENÁRIO E FUNDO
- Ambiente (estúdio, rua, natureza, escritório, urbano etc)
- Elementos visíveis no fundo
- Profundidade de campo (fundo desfocado, nítido, bokeh)
- Cor/tom predominante do fundo

### 6. COMPOSIÇÃO E ENQUADRAMENTO
- Tipo de plano (close, meio corpo, corpo inteiro, plano americano)
- Ângulo da câmera (nível dos olhos, de baixo para cima, de cima para baixo)
- Regra dos terços, centralizado, espaço negativo
- Distância focal aparente (grande angular, 50mm, telefoto/compressão)

### 7. PALETA DE CORES E MOOD
- Cores dominantes na cena toda
- Tom geral (vibrante, dessaturado, moody, clean, cinematográfico)
- Contraste (alto, baixo, médio)
- Estilo visual (fotografia editorial, lifestyle, streetwear, corporativo, cinematográfico)

## LISTA DE EXCLUSÃO (NUNCA INCLUIR NO PROMPT)
- Cor, tipo ou estilo de cabelo
- Cor dos olhos
- Cor ou tom de pele
- Formato do rosto
- Óculos
- Barba, bigode ou pelos faciais
- Brincos ou piercings faciais
- Idade aparente
- Gênero (a menos que afete diretamente a roupa descrita)
- Etnia ou traços raciais
- Qualquer descrição que comece com "a man", "a woman", "a person with..."

## FORMATO DE SAÍDA
Responda APENAS com o prompt final. Nada mais.
- Em inglês
- Um único parágrafo fluido e denso — mínimo de 80 palavras, ideal 120 a 180 palavras
- Comece direto pela pose/ação → roupa → cenário/iluminação → estilo visual → aspect ratio
- Finalize sempre com --ar RATIO
- ZERO introduções, ZERO explicações, ZERO títulos, ZERO blocos de análise
- Sua resposta inteira deve ser somente o prompt pronto para copiar e colar

## ESTILO ESPECÍFICO
ESTILO_PLACEHOLDER

## REGRA DE OURO
Na dúvida se algo é característica física ou elemento de cena: NÃO INCLUA. É melhor o prompt ter menos informação física do que ter qualquer descrição que conflite com o rosto/corpo real do usuário no Nano Banana.`;

const ESTILO_EDITORIAL = `Gere o prompt com estética EDITORIAL: fotografia de moda de alta revista (Vogue, Harper's Bazaar), iluminação de estúdio controlada e dramática, composição rigorosa, visual sofisticado e impactante, fundo neutro ou minimalista. O prompt deve transmitir autoridade e elegância.`;

const ESTILO_LIFESTYLE = `Gere o prompt com estética LIFESTYLE: fotografia natural e espontânea, luz ambiente real (golden hour, overcast, interior suave), cenários autênticos (rua, café, parque, arquitetura urbana), vibe humana e descontraída. O prompt deve transmitir autenticidade e proximidade.`;

/* ══ ROTA GEMINI ══ */
app.post("/api/gemini", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY não configurada." });
  }

  try {
    const { imageBase64, imageType, ratio, style } = req.body;

    if (!imageBase64 || !imageType) {
      return res.status(400).json({ error: "Imagem não recebida." });
    }

    const ratioFinal = ratio || "4:5";
    const estiloTexto = style === "ls" ? ESTILO_LIFESTYLE : ESTILO_EDITORIAL;

    const promptFinal = PROMPT_MESTRE
      .replace("ESTILO_PLACEHOLDER", estiloTexto)
      .replace(/RATIO/g, ratioFinal);

    const requestBody = {
      contents: [{
        parts: [
          { inline_data: { mime_type: imageType, data: imageBase64 } },
          { text: promptFinal + "\n\nAgora analise a imagem acima e gere o prompt completo e detalhado." }
        ]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "Erro na API Gemini." });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return res.status(200).json({ text: text.trim() });

  } catch (err) {
    return res.status(500).json({ error: "Erro interno: " + err.message });
  }
});

/* ══ SERVE INDEX ══ */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🤖 Promptfy rodando na porta " + PORT));
