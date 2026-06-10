// Public Supabase config. The anon key is safe to expose: the DB is fully
// locked by RLS and all access goes through Edge Functions (custom code auth).
window.APP_CONFIG = {
  FUNCTIONS_URL: "https://pinpxzbvxddvrqfpjjlg.supabase.co/functions/v1",
  ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpbnB4emJ2eGRkdnJxZnBqamxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTY1MDgsImV4cCI6MjA5NjY5MjUwOH0.aHgCDqLdRZwsYUx8xOg4EzuAdPMNA3e-6oyXz-MiQQI",
};
