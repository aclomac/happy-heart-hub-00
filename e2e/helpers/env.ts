export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[e2e] Missing required env var ${name}. See e2e/README.md for the full list.`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}
