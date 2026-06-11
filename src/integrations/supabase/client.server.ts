// Server-side Supabase client with service role key - bypasses RLS.
// DEMO-SAFE MODE: If SUPABASE_SERVICE_ROLE_KEY is missing, returns a no-op
// stub that resolves queries to empty data instead of throwing at boot.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

type AdminClient = ReturnType<typeof createClient<Database>>;

function createStubAdminClient(): AdminClient {
  const demoErr = { message: "Demo mode: Supabase admin not configured", code: "DEMO_MODE" };
  // IMPORTANT: keep `error: null` on read-style stubs so callers that do
  // `if (error) throw` don't crash the app in demo mode.
  const emptyResult = { data: null, error: null, count: null, status: 200, statusText: "OK" };
  const emptyList = { data: [], error: null, count: 0, status: 200, statusText: "OK" };

  const queryBuilder: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          // thenable -> resolves to empty list result
          return (resolve: (v: unknown) => unknown) => Promise.resolve(emptyList).then(resolve);
        }
        if (prop === "single" || prop === "maybeSingle") {
          return () => Promise.resolve(emptyResult);
        }
        // Any chainable method returns the builder again
        return () => queryBuilder;
      },
    },
  );

  const stub: any = {
    from: () => queryBuilder,
    rpc: () => Promise.resolve({ data: null, error: null, count: null, status: 200, statusText: "OK" }),
    auth: {
      admin: {
        listUsers: () => Promise.resolve({ data: { users: [] }, error: null }),
        getUserById: () => Promise.resolve({ data: { user: null }, error: demoErr }),
        createUser: () => Promise.resolve({ data: { user: null }, error: demoErr }),
        updateUserById: () => Promise.resolve({ data: { user: null }, error: demoErr }),
        deleteUser: () => Promise.resolve({ data: null, error: demoErr }),
      },
      getUser: () => Promise.resolve({ data: { user: null }, error: demoErr }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: demoErr }),
        download: () => Promise.resolve({ data: null, error: demoErr }),
        remove: () => Promise.resolve({ data: null, error: demoErr }),
        list: () => Promise.resolve({ data: [], error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
        createSignedUrl: () => Promise.resolve({ data: null, error: demoErr }),
      }),
    },
    functions: {
      invoke: () => Promise.resolve({ data: null, error: demoErr }),
    },
  };

  return stub as AdminClient;
}

function createSupabaseAdminClient(): AdminClient {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[Supabase] Service role key missing — using DEMO no-op admin client. Server admin operations will return empty data.",
    );
    return createStubAdminClient();
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: AdminClient | undefined;

export const supabaseAdmin = new Proxy({} as AdminClient, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
