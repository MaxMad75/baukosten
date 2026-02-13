ALTER TABLE public.documents ADD COLUMN file_hash TEXT;
CREATE INDEX idx_documents_file_hash ON public.documents(file_hash);