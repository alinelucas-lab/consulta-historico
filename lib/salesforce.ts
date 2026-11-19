type Token = { access_token: string; instance_url: string };

// Reaproveita o token entre requisições (evita 2 logins por acesso ao dash).
// O token do client_credentials costuma valer por horas; usamos 30 min por segurança.
let tokenCache: { token: Token; expiraEm: number } | null = null;
let tokenEmAndamento: Promise<Token> | null = null;

async function buscarToken(): Promise<Token> {
  const res = await fetch(`${process.env.SF_LOGIN_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SF_CLIENT_ID!,
      client_secret: process.env.SF_CLIENT_SECRET!,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao autenticar no Salesforce: ${await res.text()}`);
  return res.json() as Promise<Token>;
}

async function getToken(): Promise<Token> {
  if (tokenCache && Date.now() < tokenCache.expiraEm) return tokenCache.token;
  if (!tokenEmAndamento) {
    tokenEmAndamento = buscarToken()
      .then((token) => {
        tokenCache = { token, expiraEm: Date.now() + 30 * 60_000 };
        return token;
      })
      .finally(() => {
        tokenEmAndamento = null;
      });
  }
  return tokenEmAndamento;
}

export async function sfQuery<T = Record<string, unknown>>(soql: string): Promise<T[]> {
  const { access_token, instance_url } = await getToken();
  const headers = { Authorization: `Bearer ${access_token}` };
  let url: string | null = `${instance_url}/services/data/v62.0/query?q=${encodeURIComponent(soql)}`;
  const records: T[] = [];
  while (url) {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) throw new Error(`Erro na consulta SOQL: ${await res.text()}`);
    const data = (await res.json()) as { records: T[]; nextRecordsUrl?: string | null };
    records.push(...data.records);
    url = data.nextRecordsUrl ? `${instance_url}${data.nextRecordsUrl}` : null;
  }
  return records;
}
