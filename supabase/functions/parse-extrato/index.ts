// parse-extrato — interpreta extratos/faturas (imagens de PDF ou texto) via Gemini.
// A chave da IA vive aqui no servidor (secret GEMINI_API_KEY), nunca no navegador.
// Free tier do Gemini (aistudio.google.com/apikey) cobre de sobra 1-2 faturas por mês.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const PROMPT = `Você extrai lançamentos de extratos bancários e faturas de cartão de crédito brasileiros.
Analise o documento (imagens e/ou texto) e retorne SOMENTE um array JSON, um objeto por transação:
[{"data":"AAAA-MM-DD","descricao":"...","valor":123.45,"tipo":"despesa","parcela":"2/5","titular":"Nome"}]

Regras:
- "valor": número positivo em reais, com ponto decimal.
- "tipo": "despesa" para compras e débitos; "receita" para créditos, estornos e pagamentos recebidos.
  Em fatura de cartão: compras = "despesa"; pagamento da fatura e estornos = "receita".
- "parcela": "N/M" quando a linha indicar parcelamento (ex: PARC 02/05); senão null.
  Extraia apenas as linhas presentes no documento — não invente parcelas futuras.
- "titular": primeiro nome do dono do cartão quando o documento separa seções por titular/adicional; senão null.
- "descricao": como aparece no documento, apenas normalizando espaços repetidos.
- Se o ano não aparecer na linha, deduza pelo contexto (data de emissão/vencimento do documento).
- IGNORE: saldos, limites, totais e subtotais, cabeçalhos, endereços, propagandas, encargos meramente informativos, "SALDO ANTERIOR", datas de vencimento.
- Se não encontrar nenhuma transação, retorne [].`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "GEMINI_API_KEY não configurada no servidor" }, 500);
    }

    const { images, texto } = await req.json();
    const parts: Record<string, unknown>[] = [{ text: PROMPT }];
    parts.push({ text: "Data de hoje: " + new Date().toISOString().slice(0, 10) });
    if (texto) parts.push({ text: "TEXTO DO DOCUMENTO:\n" + String(texto).slice(0, 40000) });
    for (const dataUrl of (images || []).slice(0, 8)) {
      const m = String(dataUrl).match(/^data:(image\/\w+);base64,(.+)$/s);
      if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
    }
    if (parts.length <= 2) return json({ error: "Envie imagens ou texto do extrato" }, 400);

    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { response_mime_type: "application/json", temperature: 0 },
        }),
      },
    );
    const body = await r.json();
    if (!r.ok) {
      return json({ error: body?.error?.message || "Erro na IA (" + r.status + ")" }, 502);
    }

    const txt = (body?.candidates?.[0]?.content?.parts || [])
      .map((p: { text?: string }) => p.text || "").join("");
    let rows: unknown;
    try {
      rows = JSON.parse(txt);
    } catch {
      return json({ error: "A IA respondeu em formato inesperado", raw: txt.slice(0, 400) }, 502);
    }
    if (!Array.isArray(rows)) rows = [];
    return json({ lancamentos: rows });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
