import { getSettings, getPontoToken, savePontoToken } from './db.js';

const PONTO_API_URL = 'https://api.myponto.com';

export class PontoService {
  static async getConfig() {
    const config = await getSettings('ponto_config');
    if (!config || !config.clientId || !config.clientSecret) {
      throw new Error('Ponto configuration missing (clientId or clientSecret)');
    }
    return config;
  }

  static async getValidToken() {
    let token = await getPontoToken();
    if (!token) return null;

    // Refresh if expiring in less than 5 minutes
    const now = new Date();
    const expiry = new Date(token.expires_at);
    if (expiry.getTime() - now.getTime() < 5 * 60 * 1000) {
      if (token.refresh_token) {
        token = await this.refreshToken(token.refresh_token);
      } else {
        token = await this.fetchTokenWithClientCredentials();
      }
    }

    return token.access_token;
  }

  static async fetchTokenWithClientCredentials() {
    const config = await this.getConfig();
    const response = await fetch(`${PONTO_API_URL}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch Ponto token with client credentials: ${error}`);
    }

    const data = await response.json();
    return await savePontoToken(data.access_token, null, data.expires_in);
  }

  static async refreshToken(refreshToken) {
    const config = await this.getConfig();
    const response = await fetch(`${PONTO_API_URL}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh Ponto token: ${error}`);
    }

    const data = await response.json();
    return await savePontoToken(data.access_token, data.refresh_token, data.expires_in);
  }

  static async fetchAccounts() {
    const accessToken = await this.getValidToken();
    if (!accessToken) throw new Error('Not authorized with Ponto');

    const response = await fetch(`${PONTO_API_URL}/accounts`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch Ponto accounts: ${error}`);
    }

    const data = await response.json();
    return data.data; // Ponto returns { data: [...] }
  }

  static async fetchTransactions(accountId, { from, to, after, nextUrl } = {}) {
    const accessToken = await this.getValidToken();
    if (!accessToken) throw new Error('Not authorized with Ponto');

    let url;
    if (nextUrl) {
      // Use the provided next URL directly for pagination
      url = nextUrl.startsWith('http') ? nextUrl : `${PONTO_API_URL}${nextUrl}`;
      
      const urlObj = new URL(url);
      
      // Ensure we use the correct pagination limit parameter if not present
      if (!urlObj.searchParams.has('page[limit]')) {
        urlObj.searchParams.set('page[limit]', '100');
      }

      // Ensure the URL has the required filters if they were passed
      if (from && !urlObj.searchParams.has('filter[valueDate][ge]')) {
        urlObj.searchParams.set('filter[valueDate][ge]', from);
      }
      if (to && !urlObj.searchParams.has('filter[valueDate][le]')) {
        urlObj.searchParams.set('filter[valueDate][le]', to);
      }
      url = urlObj.toString();
    } else {
      // Ponto uses square brackets for filters which need to be encoded or handled carefully
      const params = new URLSearchParams();
      params.set('page[limit]', '100');
      if (from) params.set('filter[valueDate][ge]', from);
      if (to) params.set('filter[valueDate][le]', to);
      if (after) params.set('page[after]', after);
      
      url = `${PONTO_API_URL}/accounts/${accountId}/transactions?${params.toString()}`;
    }

    console.log(`[PontoService] Fetching from URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch Ponto transactions: ${error}`);
    }

    const data = await response.json();
    return data; // Returns { data: [...], links: { next: ... } }
  }

  static async fetchAccountDetails(accountId) {
    const accessToken = await this.getValidToken();
    if (!accessToken) throw new Error('Not authorized with Ponto');

    const response = await fetch(`${PONTO_API_URL}/accounts/${accountId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch Ponto account details: ${error}`);
    }

    const data = await response.json();
    return data.data;
  }
}
