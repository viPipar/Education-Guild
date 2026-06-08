// Supabase Edge Function (Deno)
// Path: supabase/functions/manage-drive-assets/index.ts
// Purpose: Manage Google Drive assets - list files and create new documents

// Utility functions for JWT encoding (reused from add-calendar-event pattern)
function base64ToArrayBuffer(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  const base64 = btoa(binary);
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  let pemContents = "";
  let der: Uint8Array;
  try {
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    pemContents = privateKey
      .replace(pemHeader, "")
      .replace(pemFooter, "")
      .replace(/\s/g, "")
      .replace(/\\/g, ""); // Strip any formatting backslashes robustly
    
    // Detect invalid characters just in case
    const invalidChars = pemContents.match(/[^A-Za-z0-9+/=]/g);
    if (invalidChars && invalidChars.length > 0) {
      throw new Error(`Invalid characters in base64: ${JSON.stringify(invalidChars)}`);
    }
    
    der = base64ToArrayBuffer(pemContents);
  } catch (err: any) {
    throw new Error(`Failed to decode base64: ${err.message}. pemContents length: ${pemContents.length}, start: "${pemContents.substring(0, 30)}", end: "${pemContents.substring(pemContents.length - 30)}"`);
  }

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      der.buffer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );
  } catch (err: any) {
    throw new Error(`Failed to import WebCrypto key: ${err.message}`);
  }
  
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

  const encoder = new TextEncoder();
  const headerStr = encodeBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadStr = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const jwtInput = `${headerStr}.${payloadStr}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(jwtInput)
  );

  const signatureStr = encodeBase64Url(signature);
  const jwt = `${jwtInput}.${signatureStr}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Google OAuth token request failed: ${tokenResponse.status} - ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error("Google OAuth token response did not contain access_token");
  }

  return tokenData.access_token;
}

// Helper to determine MIME type
function getMimeType(type: 'folder' | 'docs' | 'sheets' | 'slides'): string {
  const mimeTypes: Record<string, string> = {
    folder: 'application/vnd.google-apps.folder',
    docs: 'application/vnd.google-apps.document',
    sheets: 'application/vnd.google-apps.spreadsheet',
    slides: 'application/vnd.google-apps.presentation',
  };
  return mimeTypes[type] || type;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, folderid, folderId',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    let rawPrivateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');

    if (!clientEmail || !rawPrivateKey) {
      return new Response(JSON.stringify({ 
        error: 'Server configuration error: GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be set' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Clean clientEmail if it has surrounding quotes
    clientEmail = clientEmail.trim();
    if (clientEmail.startsWith('"') && clientEmail.endsWith('"')) {
      clientEmail = clientEmail.slice(1, -1);
    }
    if (clientEmail.startsWith("'") && clientEmail.endsWith("'")) {
      clientEmail = clientEmail.slice(1, -1);
    }

    // Clean rawPrivateKey if it has surrounding quotes
    rawPrivateKey = rawPrivateKey.trim();
    if (rawPrivateKey.startsWith('"') && rawPrivateKey.endsWith('"')) {
      rawPrivateKey = rawPrivateKey.slice(1, -1);
    }
    if (rawPrivateKey.startsWith("'") && rawPrivateKey.endsWith("'")) {
      rawPrivateKey = rawPrivateKey.slice(1, -1);
    }

    // Replace escaped newlines with actual newlines
    let privateKey = rawPrivateKey.replace(/\\n/g, '\n');
    
    // Normalize newlines and any extra spacing/newlines
    privateKey = privateKey.replace(/\r/g, '').trim();

    // GET /list - Fetch files in a folder
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const folderId = url.searchParams.get('folderId') || req.headers.get('folderId') || req.headers.get('folderid');
      const pageToken = url.searchParams.get('pageToken') || '';

      if (!folderId) {
        return new Response(JSON.stringify({ error: 'folderId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const accessToken = await getGoogleAccessToken(clientEmail, privateKey);

      // Build Drive API query
      let query = `'${folderId}' in parents and trashed=false`;
      let pageTokenParam = pageToken ? `&pageToken=${pageToken}` : '';
      
      const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,shortcutDetails)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true${pageTokenParam}`;

      const response = await fetch(driveUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Drive API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return new Response(JSON.stringify({
        files: data.files || [],
        nextPageToken: data.nextPageToken || null
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /create - Create a new file/folder
    if (req.method === 'POST') {
      const { type, name, parentFolderId, mimeType } = await req.json();

      if (!type || !name || !parentFolderId) {
        return new Response(JSON.stringify({ 
          error: 'Missing required fields: type, name, parentFolderId' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const accessToken = await getGoogleAccessToken(clientEmail, privateKey);

      // Determine final MIME type
      let finalMimeType = mimeType;
      if (!finalMimeType) {
        if (type === 'folder') {
          finalMimeType = getMimeType('folder');
        } else if (type === 'docs') {
          finalMimeType = getMimeType('docs');
        } else if (type === 'sheets') {
          finalMimeType = getMimeType('sheets');
        } else if (type === 'slides') {
          finalMimeType = getMimeType('slides');
        }
      }

      // Create file in Google Drive
      const fileMetadata = {
        name: name.trim(),
        mimeType: finalMimeType,
        parents: [parentFolderId]
      };

      const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink&supportsAllDrives=true', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fileMetadata)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Drive API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return new Response(JSON.stringify({
        id: data.id,
        name: data.name,
        mimeType: data.mimeType,
        webViewLink: data.webViewLink
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ 
      error: err.message || 'Internal server error' 
    }), {
      status: 500,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      },
    });
  }
});
