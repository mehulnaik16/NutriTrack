-- Strict authenticated read access (Leak-Proof)
CREATE POLICY "Users read own weight photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'weight-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Upload
CREATE POLICY "Users upload own photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'weight-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Update
CREATE POLICY "Users update own photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'weight-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Delete
CREATE POLICY "Users delete own photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'weight-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
);
