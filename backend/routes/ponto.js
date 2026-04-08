import express from 'express';
import { PontoService } from '../ponto.js';
import { getSettings, savePontoToken, createJob, upsertPontoAccount } from '../db.js';
import { pontoQueue } from '../queue.js';

const router = express.Router();

const PONTO_API_URL = 'https://api.myponto.com';

export async function syncPontoAccountsInternal() {
  const pontoAccounts = await PontoService.fetchAccounts();
  const savedAccounts = [];
  
  for (const pa of pontoAccounts) {
    const account = {
      ponto_id: pa.id,
      account_id: pa.attributes.reference, // Usually IBAN
      name: pa.attributes.description,
      currency: pa.attributes.currency,
      institution_name: pa.relationships?.financialInstitution?.data?.id // Simplified
    };
    const saved = await upsertPontoAccount(account);
    savedAccounts.push(saved);
  }
  return savedAccounts;
}

router.get('/auth', async (req, res) => {
  try {
    console.log(`[PontoAuth] Initiating Client Credentials flow`);
    await PontoService.fetchTokenWithClientCredentials();
    console.log(`[PontoAuth] Successfully obtained token via Client Credentials`);
    res.redirect('/settings?ponto=connected');
  } catch (err) {
    console.error(`[PontoAuth] Error in Client Credentials flow:`, err);
    res.status(500).send(`Authentication failed: ${err.message}`);
  }
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  try {
    const config = await PontoService.getConfig();
    const redirectUri = `${req.protocol}://${req.get('host')}/api/integrations/ponto/callback`;

    const response = await fetch(`${PONTO_API_URL}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    const data = await response.json();
    await savePontoToken(data.access_token, data.refresh_token, data.expires_in);

    // Redirect back to frontend settings or dashboard
    res.redirect('/settings?ponto=connected');
  } catch (err) {
    console.error(err);
    res.status(500).send(`Authentication failed: ${err.message}`);
  }
});

router.post('/sync', async (req, res) => {
  try {
    const jobId = await createJob('ponto-sync', { manual: true });
    
    await pontoQueue.add('ponto-sync', { jobId });
    
    res.json({ message: 'Manual Ponto sync started', jobId });
  } catch (err) {
    console.error('[PontoRoute] Failed to trigger manual sync:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
