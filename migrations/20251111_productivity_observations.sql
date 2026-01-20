-- Create table for productivity observations
CREATE TABLE IF NOT EXISTS public.productivity_observations (
    matriz text NOT NULL,
    month text NOT NULL, -- Format: 'YYYY-MM' or 'GENERAL'
    observation text,
    updated_at timestamptz DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id),
    PRIMARY KEY (matriz, month)
);

-- Enable RLS
ALTER TABLE public.productivity_observations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read/write (for now, similar to other tables)
CREATE POLICY "Enable read access for all users" ON public.productivity_observations
    FOR SELECT USING (true);

CREATE POLICY "Enable insert/update for all users" ON public.productivity_observations
    FOR ALL USING (true) WITH CHECK (true);

-- Grant access to anon/authenticated (adjust based on project security)
GRANT ALL ON public.productivity_observations TO anon, authenticated, service_role;
