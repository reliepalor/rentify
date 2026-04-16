interface ImportMetaEnv {
  readonly NG_SUPABASE_URL?: string;
  readonly NG_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
