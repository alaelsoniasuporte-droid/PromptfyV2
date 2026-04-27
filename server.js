const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ── SUPABASE ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service_role key (não a anon!)
);

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname)));

// ── ROTA: GEMINI API PROXY ──
app.post("/api/gemini", async (req, res) => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY não configurada." });
  }

  try {
    const { system, imageBase64, imageType, ratio } = req.body;
    const prompt = `${system}\n\nAspect ratio: ${ratio}\n\nAnalyze this image and generate the prompt now.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: imageType, data: imageBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "Erro na API Gemini." });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return res.json({ text: text.trim() });

  } catch (err) {
    return res.status(500).json({ error: "Erro interno: " + err.message });
  }
});

// ── ROTA: WEBHOOK KIWIFY ──
app.post("/webhook/kiwify", async (req, res) => {
  try {
    const payload = req.body;
    console.log("Webhook Kiwify recebido:", JSON.stringify(payload, null, 2));

    // Kiwify envia diferentes eventos — tratamos os de pagamento confirmado
    const status = payload?.order?.status || payload?.status || "";
    const email  = payload?.Customer?.email || payload?.customer?.email || payload?.email || "";

    if (!email) {
      console.log("Email não encontrado no webhook");
      return res.status(200).json({ ok: true });
    }

    // Eventos que ativam o acesso
    const eventosAtivos = ["paid", "approved", "active", "complete", "completed"];
    // Eventos que cancelam o acesso
    const eventosCancelados = ["refunded", "cancelled", "canceled", "chargeback", "expired"];

    const emailLower = email.toLowerCase();

    if (eventosAtivos.some(e => status.toLowerCase().includes(e))) {
      // Calcula expiração: 30 dias a partir de agora
      const dataExpiracao = new Date();
      dataExpiracao.setDate(dataExpiracao.getDate() + 30);

      // Busca usuário pelo email no auth
      const { data: users } = await supabase.auth.admin.listUsers();
      const user = users?.users?.find(u => u.email?.toLowerCase() === emailLower);

      if (user) {
        // Atualiza ou cria registro na tabela usuarios
        const { error } = await supabase.from("usuarios").upsert({
          id: user.id,
          email: emailLower,
          plano: "mensal",
          ativo: true,
          data_ativacao: new Date().toISOString(),
          data_expiracao: dataExpiracao.toISOString()
        }, { onConflict: "email" });

        if (error) console.error("Erro ao ativar usuário:", error);
        else console.log(`✅ Usuário ${emailLower} ativado até ${dataExpiracao.toLocaleDateString("pt-BR")}`);
      } else {
        // Usuário ainda não tem conta — salva o email para ativar quando se cadastrar
        const { error } = await supabase.from("usuarios").upsert({
          email: emailLower,
          plano: "mensal",
          ativo: true,
          data_ativacao: new Date().toISOString(),
          data_expiracao: dataExpiracao.toISOString()
        }, { onConflict: "email" });

        if (error) console.error("Erro ao pré-ativar usuário:", error);
        else console.log(`✅ Email ${emailLower} pré-ativado (conta ainda não criada)`);
      }

    } else if (eventosCancelados.some(e => status.toLowerCase().includes(e))) {
      // Cancela o acesso
      const { error } = await supabase.from("usuarios").update({
        ativo: false,
        plano: "gratis"
      }).eq("email", emailLower);

      if (error) console.error("Erro ao desativar usuário:", error);
      else console.log(`❌ Usuário ${emailLower} desativado`);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("Erro no webhook:", err);
    return res.status(200).json({ ok: true }); // Sempre retorna 200 para a Kiwify
  }
});

// ── ROTA: VERIFICAR ACESSO (chamada pelo frontend) ──
app.post("/api/check-acesso", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ ativo: false, plano: "gratis" });

    const { data, error } = await supabase
      .from("usuarios")
      .select("ativo, plano, data_expiracao")
      .eq("email", email.toLowerCase())
      .single();

    if (error || !data) return res.json({ ativo: false, plano: "gratis" });

    // Verifica se expirou
    if (data.data_expiracao && new Date() > new Date(data.data_expiracao)) {
      await supabase.from("usuarios").update({ ativo: false, plano: "gratis" }).eq("email", email.toLowerCase());
      return res.json({ ativo: false, plano: "gratis", msg: "Assinatura expirada" });
    }

    return res.json({ ativo: data.ativo, plano: data.plano });

  } catch (err) {
    return res.status(500).json({ ativo: false, plano: "gratis" });
  }
});

// ── SERVE O INDEX.HTML ──
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`🤖 Promptfy rodando na porta ${PORT}`);
});
