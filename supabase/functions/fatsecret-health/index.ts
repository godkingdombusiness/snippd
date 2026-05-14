import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const clientIdPresent = !!Deno.env.get('FATSECRET_CLIENT_ID');
  const clientSecretPresent = !!Deno.env.get('FATSECRET_CLIENT_SECRET');

  const body = {
    client_id_present: clientIdPresent,
    client_secret_present: clientSecretPresent,
    oauth_mode: 'client_credentials',
    nutrition_provider: 'FatSecret',
    nutrition_provider_ready: clientIdPresent && clientSecretPresent,
    note: 'FatSecret OAuth 2.0 — IP whitelist required for production',
  };

  return new Response(JSON.stringify(body), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
    status: 200,
  });
});
