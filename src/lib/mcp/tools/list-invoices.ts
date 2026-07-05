import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sbForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_invoices",
  title: "List invoices",
  description: "Lists invoices in the signed-in user's household, most recent first. Amounts are in EUR.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
    only_unpaid: z.boolean().optional().describe("If true, return only unpaid invoices."),
    kostengruppe_prefix: z.string().optional().describe("Filter by DIN 276 cost-group code prefix, e.g. '3' or '310'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, only_unpaid, kostengruppe_prefix }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = sbForUser(ctx)
      .from("invoices")
      .select("id, company_name, invoice_number, invoice_date, amount, net_amount, tax_amount, is_gross, is_paid, status, kostengruppe_code, description")
      .order("invoice_date", { ascending: false })
      .limit(limit ?? 50);
    if (only_unpaid) q = q.eq("is_paid", false);
    if (kostengruppe_prefix) q = q.like("kostengruppe_code", `${kostengruppe_prefix}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { invoices: data ?? [] },
    };
  },
});
