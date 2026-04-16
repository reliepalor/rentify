export const environment = {
  production: false,
  supabase: {
    url: import.meta.env['NG_SUPABASE_URL'] || 'https://qcgelrtktmmkvxrpyevy.supabase.co',
    anonKey: import.meta.env['NG_SUPABASE_ANON_KEY'] || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjZ2VscnRrdG1ta3Z4cnB5ZXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4Njk3ODMsImV4cCI6MjA5MDQ0NTc4M30.Dsd-k2K1bX8xnCy0PkEsxWuVvDpKXExo8wiIQU4_4GM'
  }
};