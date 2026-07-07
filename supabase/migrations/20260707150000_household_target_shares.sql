-- Soll-Quote für die Kostenverteilung im Haushalt (z. B. 50/50 oder 60/40).
-- JSONB-Map profile_id -> Prozentwert; NULL bedeutet gleichmäßige Verteilung.
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS payment_target_shares jsonb NULL;
