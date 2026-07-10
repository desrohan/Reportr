-- Add thumbnail_url column to public.reports table
ALTER TABLE public.reports 
ADD COLUMN IF NOT EXISTS thumbnail_url text;