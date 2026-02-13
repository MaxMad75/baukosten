import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DIN276_CATEGORIES = `
100 - Grundstück (Grundstückswert, Nebenkosten, Freimachen)
200 - Vorbereitende Maßnahmen (Herrichten, Erschließung)
300 - Bauwerk - Baukonstruktionen:
  310 - Baugrube/Erdbau (311 Aushub, 312 Umschließung, 313 Wasserhaltung)
  320 - Gründung (321-329: Baugrund, Flachgründung, Tiefgründung, Bodenplatten, Abdichtung, Dränage)
  330 - Außenwände (331-339: Tragende/Nichttragende Wände, Fenster, Türen, Bekleidungen, Sonnenschutz)
  340 - Innenwände (341-349: Tragende/Nichttragende Wände, Türen, Bekleidungen)
  350 - Decken (351-359: Konstruktionen, Beläge, Bekleidungen)
  360 - Dächer (361-369: Konstruktionen, Dachfenster, Beläge, Bekleidungen)
400 - Bauwerk - Technische Anlagen:
  410 - Abwasser-, Wasser-, Gasanlagen (411-419: Sanitär, Wasser, Gas)
  420 - Wärmeversorgung (421-429: Heizung, Wärmeverteilung, Heizkörper)
  430 - Raumlufttechnik (431-439: Lüftung, Klima, Kälte)
  440 - Elektrische Anlagen (441-449: Strom, Beleuchtung, Blitzschutz)
  450 - Kommunikation (451-459: Telefon, Alarm, Medien)
500 - Außenanlagen (Erdbau, Pflaster, Bepflanzung, Zäune)
600 - Ausstattung (Möbel, Küche, spezielle Einbauten)
700 - Baunebenkosten:
  710 - Bauherrenaufgaben
  730 - Architekten- und Ingenieurleistungen (731-739)
  740 - Gutachten und Beratung
800 - Finanzierung (Finanzierungsnebenkosten, Zinsen)
`;

// Maximum allowed payload size (500KB)
const MAX_PAYLOAD_SIZE = 500 * 1024;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("Missing or invalid authorization header");
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

    // Verify JWT and get user claims
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("JWT verification failed:", claimsError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log("Authenticated user:", userId);

    // Check content length before parsing
    const contentLength = req.headers.get("content-length");
    if (!contentLength) {
      return new Response(
        JSON.stringify({ error: "Content-Length header required" }),
        { status: 411, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
      return new Response(
        JSON.stringify({ error: "Payload too large. Maximum size is 500KB." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { pdfContent, fileName } = await req.json();

    if (!pdfContent) {
      return new Response(
        JSON.stringify({ error: "PDF content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate input size
    if (typeof pdfContent !== "string" || pdfContent.length > MAX_PAYLOAD_SIZE) {
      return new Response(
        JSON.stringify({ error: "PDF content too large or invalid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Du bist ein Experte für deutsche Baurechnungen und die DIN 276 Kostenstruktur.
Analysiere die Rechnung und extrahiere folgende Informationen:
- Rechnungsnummer
- Gesamtbetrag (nur die Zahl, z.B. 1234.56)
- Rechnungsdatum (im Format YYYY-MM-DD)
- Firmenname/Rechnungssteller
- Kurze Beschreibung der Leistung
- Die passende DIN 276 Kostengruppe (3-stelliger Code wenn möglich, z.B. 311, 421, 731)

DIN 276 Kategorien:
${DIN276_CATEGORIES}

Antworte NUR im folgenden JSON-Format, ohne zusätzlichen Text:
{
  "invoice_number": "string oder null",
  "amount": number,
  "invoice_date": "YYYY-MM-DD",
  "company_name": "string",
  "description": "string",
  "kostengruppe_code": "3-stelliger Code",
  "kostengruppe_reasoning": "Kurze Begründung für die Zuordnung"
}`;

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
          { 
            role: "user", 
            content: `Analysiere diese Rechnung (Dateiname: ${fileName}):\n\n${pdfContent}` 
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse the JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse AI response");
    }

    const extractedData = JSON.parse(jsonMatch[0]);

    console.log("Successfully extracted invoice data for user:", userId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: extractedData 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error analyzing invoice:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
