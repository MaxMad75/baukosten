-- Rohergebnis der KI-Analyse am Dokument speichern, damit fehlgeschlagene
-- oder unerwartete Extraktionen nachvollziehbar sind ("Was hat die KI erkannt?").
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS ai_raw_result jsonb NULL;
