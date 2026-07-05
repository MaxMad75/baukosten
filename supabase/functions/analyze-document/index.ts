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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Bitte versuchen Sie es später." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits erschöpft." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Analyse fehlgeschlagen. Bitte später erneut versuchen." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("Empty AI response");
      return new Response(
        JSON.stringify({ error: "Analyse fehlgeschlagen. Bitte später erneut versuchen." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Could not parse AI response", content);
      return new Response(
        JSON.stringify({ error: "Analyse fehlgeschlagen. Bitte später erneut versuchen." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extractedData = JSON.parse(jsonMatch[0]);

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
