import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: require valid JWT ---
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
      global: { headers: { Authorization: authHeader } },
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

    const { textContent, fileBase64, fileName } = await req.json();

    if (!textContent && !fileBase64) {
      return new Response(
        JSON.stringify({ error: "Either textContent or fileBase64 is required" }),
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

    const systemPrompt = `Du bist ein Experte für deutsche Baukostenkalkulationen und die DIN 276 Kostenstruktur.

Deine Aufgabe hat zwei Schritte:

**Schritt 1: Dokumenterkennung**
Prüfe ob das Dokument eine Kostenschätzung, Kostenberechnung oder Baukalkulation ist.

**Schritt 2: Kostenextraktion (nur wenn Schritt 1 positiv)**
Extrahiere alle Kostengruppen mit ihren geschätzten Beträgen nach DIN 276.

Antworte NUR im folgenden JSON-Format, ohne zusätzlichen Text:
{
  "is_estimate": true/false,
  "confidence": "hoch" | "mittel" | "niedrig",
  "reason": "Kurze Begründung warum es (k)eine Kostenschätzung ist",
  "items": [
    {
      "kostengruppe_code": "310",
      "estimated_amount": 15000.00,
      "notes": "Baugrube/Erdbau"
    }
  ],
  "total": 250000.00
}

Wenn is_estimate=false, setze items auf ein leeres Array und total auf 0.

Wichtig:
- Extrahiere so viele Kostengruppen wie möglich
- Verwende die detaillierteste Ebene (3-stellig wenn verfügbar)
- Beträge als reine Zahlen ohne Währungszeichen
- Auch wenn das Dokument nicht eindeutig eine Kostenschätzung ist aber Kosten enthält, setze is_estimate auf true mit confidence "niedrig"`;

    const userContent: any[] = [];

    if (textContent) {
      userContent.push({
        type: "text",
        text: `Analysiere dieses Dokument (Dateiname: ${fileName || 'unbekannt'}):\n\n${textContent}`,
      });
    }

    if (fileBase64) {
      const mimeType = fileBase64.startsWith("/9j/") ? "image/jpeg"
        : fileBase64.startsWith("iVBOR") ? "image/png"
        : "application/pdf";

      userContent.push({
        type: "text",
        text: `Analysiere dieses Dokument (Dateiname: ${fileName || 'unbekannt'}). Das Dokument wurde als Bild/PDF bereitgestellt:`,
      });
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${fileBase64}` },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Bitte versuchen Sie es später erneut." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI-Credits aufgebraucht. Bitte Credits aufladen." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
    console.error("Error analyzing estimate:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
