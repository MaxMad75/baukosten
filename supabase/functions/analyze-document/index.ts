import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB for images

const DIN276_CATEGORIES = `
100 - Grundstück
200 - Vorbereitende Maßnahmen
300 - Bauwerk - Baukonstruktionen (310-360)
400 - Bauwerk - Technische Anlagen (410-450)
500 - Außenanlagen
600 - Ausstattung
700 - Baunebenkosten (710-740)
800 - Finanzierung
`;

const systemPrompt = `Du bist ein Experte für Baudokumente und die DIN 276 Kostenstruktur. Analysiere das Dokument und extrahiere folgende Informationen:
- Einen aussagekräftigen Titel
- Den Dokumenttyp (einer von: Vertrag, Genehmigung, Angebot, Zeichnung, Rechnung, Protokoll, Sonstiges)
- Eine kurze Beschreibung / Zusammenfassung (max 2-3 Sätze)
- Den Firmennamen des Ausstellers, falls erkennbar

KLASSIFIKATION "Rechnung":
Ein Dokument ist eine RECHNUNG, wenn es eine Zahlungsaufforderung enthält — typische Merkmale: das Wort "Rechnung"/"Invoice", eine Rechnungsnummer, ein Rechnungsdatum, ausgewiesene Mehrwertsteuer, ein zu zahlender Gesamtbetrag, Zahlungsziel oder Bankverbindung. Auch Abschlagsrechnungen, Teilrechnungen, Schlussrechnungen und Gebührenbescheide zählen als Rechnung.
KEINE Rechnung sind: Angebote, Kostenvoranschläge, Auftragsbestätigungen, Lieferscheine, Mahnungen ohne Rechnungscharakter.

Falls es sich um eine RECHNUNG handelt, extrahiere zusätzlich:
- Rechnungsnummer
- Gesamtbetrag BRUTTO, also inklusive MwSt (nur die Zahl mit Punkt als Dezimaltrenner, z.B. 1234.56 — achte auf deutsche Zahlenformate: "1.234,56 €" bedeutet 1234.56)
- Rechnungsdatum (im Format YYYY-MM-DD)
- Die passende DIN 276 Kostengruppe (3-stelliger Code)
Der Gesamtbetrag steht meist am ENDE des Dokuments (Zeilen wie "Gesamtbetrag", "Rechnungsbetrag", "zu zahlen", "Bruttobetrag"). Wenn du dir bei einem Feld nicht sicher bist, setze es auf null statt zu raten.

KONFIDENZ: Gib bei Rechnungen zu jedem extrahierten Feld (company_name, invoice_number, amount, invoice_date) eine Konfidenz an:
- "high" = steht klar und eindeutig lesbar im Dokument
- "medium" = abgeleitet oder mehrdeutig (z. B. mehrere Beträge, unscharfer Scan)
- "low" = unsicher / könnte falsch sein
Lass die Konfidenz für Felder weg, die du nicht extrahiert hast.

${DIN276_CATEGORIES}

Antworte NUR mit gültigem JSON im folgenden Format, ohne zusätzlichen Text und ohne Markdown-Codeblöcke:
{
  "title": "string",
  "document_type": "string",
  "description": "string",
  "company_name": "string oder null",
  "invoice_number": "string oder null (nur bei Rechnungen)",
  "amount": "number oder null (nur bei Rechnungen)",
  "invoice_date": "YYYY-MM-DD oder null (nur bei Rechnungen)",
  "kostengruppe_code": "string oder null (nur bei Rechnungen)"
}`;

/**
 * Truncate long document text while keeping both the beginning (header,
 * company, invoice number) and the end (totals, payment terms) — invoice
 * amounts are almost always at the end of the document.
 */
function truncateKeepingEnds(text: string, maxLen = 10000): string {
  if (text.length <= maxLen) return text;
  const headLen = Math.floor(maxLen * 0.6);
  const tailLen = maxLen - headLen;
  return `${text.substring(0, headLen)}\n\n[... gekürzt ...]\n\n${text.substring(text.length - tailLen)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
      return new Response(
        JSON.stringify({ error: "Payload too large" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { textContent, imageBase64, fileName } = await req.json();

    // R4.2 Lernschleife light (SRS 4.3): Haushalts-Kontext in den Prompt —
    // (a) bekannte Firmen (exakte Schreibweisen → stabile Firma→Gewerk-Kette),
    // (b) Hinweise aus früheren Korrekturen (KI-Betrag vs. finaler Betrag).
    // Läuft über den Auth-Client → RLS liefert nur Daten des Haushalts.
    let householdHints = "";
    try {
      const { data: contractors } = await supabase
        .from("contractors")
        .select("company_name")
        .order("company_name")
        .limit(60);
      if (contractors && contractors.length > 0) {
        householdHints += `\n\nBEKANNTE FIRMEN DES BAUPROJEKTS — wenn der Aussteller eine davon ist, verwende EXAKT diese Schreibweise als company_name:\n` +
          contractors.map((c: { company_name: string }) => `- ${c.company_name}`).join("\n");
      }

      const { data: analyzedDocs } = await supabase
        .from("documents")
        .select("ai_raw_result, invoice_id")
        .not("ai_raw_result", "is", null)
        .not("invoice_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(40);
      const invoiceIds = (analyzedDocs || []).map((d: { invoice_id: string }) => d.invoice_id);
      if (invoiceIds.length > 0) {
        const { data: linkedInvoices } = await supabase
          .from("invoices")
          .select("id, company_name, amount")
          .in("id", invoiceIds);
        const invoiceById = new Map((linkedInvoices || []).map((i: { id: string }) => [i.id, i]));
        const corrections: string[] = [];
        for (const doc of analyzedDocs || []) {
          const raw = doc.ai_raw_result as { amount?: number | null } | null;
          const inv = invoiceById.get(doc.invoice_id) as { company_name: string; amount: number } | undefined;
          if (!raw || !inv || raw.amount == null) continue;
          if (Math.abs(Number(raw.amount) - Number(inv.amount)) > 0.01) {
            corrections.push(`- Bei "${inv.company_name}" wurde der Betrag schon einmal falsch erkannt (${raw.amount} statt korrekt ${inv.amount}). Prüfe den Brutto-Endbetrag dort besonders sorgfältig.`);
          }
          if (corrections.length >= 5) break;
        }
        if (corrections.length > 0) {
          householdHints += `\n\nHINWEISE AUS FRÜHEREN KORREKTUREN DES NUTZERS:\n` + corrections.join("\n");
        }
      }
    } catch (e) {
      console.error("household hints failed (non-fatal)", e);
    }

    if (!textContent && !imageBase64) {
      return new Response(
        JSON.stringify({ error: "textContent or imageBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("Missing LOVABLE_API_KEY secret");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable. Please try again later." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userContent: any[] = [];

    if (imageBase64) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
      });
      userContent.push({
        type: "text",
        text: `Analysiere dieses Bild/Dokument (Dateiname: ${fileName}).`
      });
    } else {
      userContent.push({
        type: "text",
        text: `Analysiere dieses Dokument (Dateiname: ${fileName}):\n\n${truncateKeepingEnds(textContent)}`
      });
    }

    // Tool calling forces valid structured JSON (no markdown fences, no chatter)
    const extractTool = {
      type: "function",
      function: {
        name: "extract_document_data",
        description: "Gibt die extrahierten Dokumentdaten strukturiert zurück.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Aussagekräftiger Titel" },
            document_type: { type: "string", enum: ["Vertrag", "Genehmigung", "Angebot", "Zeichnung", "Rechnung", "Protokoll", "Sonstiges"] },
            description: { type: "string", description: "Kurze Zusammenfassung, max 2-3 Sätze" },
            company_name: { type: "string", description: "Firmenname des Ausstellers, weglassen wenn unbekannt" },
            invoice_number: { type: "string", description: "Nur bei Rechnungen" },
            amount: { type: "number", description: "Brutto-Gesamtbetrag, nur bei Rechnungen" },
            invoice_date: { type: "string", description: "YYYY-MM-DD, nur bei Rechnungen" },
            kostengruppe_code: { type: "string", description: "3-stelliger DIN 276 Code, nur bei Rechnungen" },
            confidence: {
              type: "object",
              description: "Konfidenz je extrahiertem Rechnungsfeld: high = klar lesbar, medium = abgeleitet/mehrdeutig, low = unsicher. Nur für tatsächlich extrahierte Felder.",
              properties: {
                company_name: { type: "string", enum: ["high", "medium", "low"] },
                invoice_number: { type: "string", enum: ["high", "medium", "low"] },
                amount: { type: "string", enum: ["high", "medium", "low"] },
                invoice_date: { type: "string", enum: ["high", "medium", "low"] },
              },
            },
          },
          required: ["title", "document_type", "description"],
        },
      },
    };

    /** Ein Gateway-Aufruf mit wählbarem Modell; gibt geparste Daten oder null. */
    const runExtraction = async (model: string): Promise<Record<string, unknown> | null> => {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt + householdHints },
            { role: "user", content: userContent },
          ],
          tools: [extractTool],
          tool_choice: { type: "function", function: { name: "extract_document_data" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) throw { status: 429, message: "Rate limit exceeded. Bitte versuchen Sie es später." };
        if (response.status === 402) throw { status: 402, message: "AI credits erschöpft." };
        console.error("AI gateway error:", model, response.status, await response.text());
        return null;
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;

      // Preferred path: structured tool call. Fallback: JSON in plain content.
      const toolArgs = message?.tool_calls?.[0]?.function?.arguments;
      if (toolArgs) {
        try {
          return JSON.parse(toolArgs);
        } catch (e) {
          console.error("Could not parse tool call arguments", toolArgs, e);
        }
      }
      if (message?.content) {
        const jsonMatch = message.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch (e) {
            console.error("Could not parse AI response content", message.content, e);
          }
        }
      }
      console.error("No usable AI response", model, JSON.stringify(message));
      return null;
    };

    // R4.2 Modell-Eskalation (SRS 4.3): Rechnung mit unsicheren/fehlenden
    // Kernfeldern → zweiter Versuch mit dem stärkeren Modell.
    const coreUncertain = (d: Record<string, unknown> | null): boolean => {
      if (!d || d.document_type !== "Rechnung") return false;
      const conf = (d.confidence || {}) as Record<string, string | undefined>;
      return (["company_name", "amount", "invoice_date"] as const).some(
        (f) => d[f] == null || conf[f] === "medium" || conf[f] === "low"
      );
    };

    let extractedData: Record<string, unknown> | null;
    try {
      extractedData = await runExtraction("google/gemini-3-flash-preview");
      if (coreUncertain(extractedData)) {
        const escalated = await runExtraction("google/gemini-3-pro-preview");
        if (escalated) extractedData = { ...escalated, escalated: true };
      }
    } catch (gatewayError) {
      const { status, message } = gatewayError as { status?: number; message?: string };
      if (status === 429 || status === 402) {
        return new Response(JSON.stringify({ error: message }),
          { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw gatewayError;
    }

    if (!extractedData) {
      return new Response(
        JSON.stringify({ error: "Analyse fehlgeschlagen. Bitte später erneut versuchen." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error analyzing document:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
