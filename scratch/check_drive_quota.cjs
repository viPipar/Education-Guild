const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Read .env
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const secrets = {};
envContent.split(/\r?\n/).forEach(line => {
  const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)\s*$/);
  if (match) {
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    secrets[match[1]] = value;
  }
});

const clientEmail = secrets['GOOGLE_SERVICE_ACCOUNT_EMAIL'];
let rawPrivateKey = secrets['GOOGLE_PRIVATE_KEY'];

if (!clientEmail || !rawPrivateKey) {
  console.error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY in .env');
  process.exit(1);
}

// Clean rawPrivateKey
rawPrivateKey = rawPrivateKey.trim();
if (rawPrivateKey.startsWith('"') && rawPrivateKey.endsWith('"')) {
  rawPrivateKey = rawPrivateKey.slice(1, -1);
}
if (rawPrivateKey.startsWith("'") && rawPrivateKey.endsWith("'")) {
  rawPrivateKey = rawPrivateKey.slice(1, -1);
}
const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

function encodeBase64Url(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken() {
  const header = { alg: "RS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: exp,
    iat: iat
  };

  const headerStr = encodeBase64Url(JSON.stringify(header));
  const payloadStr = encodeBase64Url(JSON.stringify(payload));
  const jwtInput = `${headerStr}.${payloadStr}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(jwtInput);
  const signature = signer.sign(privateKey);
  const signatureStr = signature.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${jwtInput}.${signatureStr}`;

  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function run() {
  try {
    const token = await getAccessToken();
    console.log('Obtained access token successfully!');
    
    // Call about endpoint
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Drive about API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    console.log('\n--- Service Account Info ---');
    console.log('Email:', data.user?.emailAddress);
    console.log('DisplayName:', data.user?.displayName);
    console.log('\n--- Storage Quota ---');
    console.log('Limit (bytes):', data.storageQuota?.limit);
    console.log('Usage (bytes):', data.storageQuota?.usage);
    console.log('UsageInDrive (bytes):', data.storageQuota?.usageInDrive);
    console.log('UsageInTrash (bytes):', data.storageQuota?.usageInTrash);
    
    const limitGb = data.storageQuota?.limit ? (data.storageQuota.limit / (1024 ** 3)).toFixed(2) + ' GB' : 'Unlimited';
    const usageGb = (data.storageQuota?.usage / (1024 ** 2)).toFixed(2) + ' MB';
    console.log(`Formatted: Usage ${usageGb} of ${limitGb}`);

  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
