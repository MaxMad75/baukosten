import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listInvoices from "./tools/list-invoices";
import listOffers from "./tools/list-offers";
import listEstimateVersions from "./tools/list-estimate-versions";
import budgetSummary from "./tools/budget-summary";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "baukosten-mcp",
  title: "Baukosten Tracker",
  version: "0.1.0",
  instructions:
    "Read-only access to the signed-in user's household construction-cost data: invoices, offers, DIN 276 cost estimates (versioned with blocks), and a target-vs-actual budget summary. Amounts are in EUR.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listInvoices, listOffers, listEstimateVersions, budgetSummary],
});
