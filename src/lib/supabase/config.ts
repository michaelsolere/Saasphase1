function getRequiredEnvironmentVariable(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseConfig() {
  return {
    url: getRequiredEnvironmentVariable(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    anonKey: getRequiredEnvironmentVariable(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    organizationSlug: getRequiredEnvironmentVariable(
      "NEXT_PUBLIC_SUPABASE_ORGANIZATION_SLUG",
      process.env.NEXT_PUBLIC_SUPABASE_ORGANIZATION_SLUG,
    ),
  };
}
