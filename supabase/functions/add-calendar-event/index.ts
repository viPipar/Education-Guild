// Supabase Edge Function (Deno)
// Path: supabase/functions/add-calendar-event/index.ts

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
    scope: "https://www.googleapis.com/auth/calendar",
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

Deno.serve(async (req) => {
  // CORS configuration to allow requests from client
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let debugLog: any = {};
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse the payload from client
    const { title, startTime, endTime, description } = await req.json();

    // Field validation
    if (!title || !startTime || !endTime) {
      return new Response(JSON.stringify({ error: 'Missing required fields: title, startTime, endTime' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Retrieve environment variables
    let clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    let rawPrivateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
    let calendarId = Deno.env.get('GOOGLE_CALENDAR_ID');

    if (!clientEmail || !rawPrivateKey || !calendarId) {
      return new Response(JSON.stringify({ 
        error: 'Server configuration error: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_CALENDAR_ID must be set on the server.' 
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

    // Clean calendarId if it has surrounding quotes
    calendarId = calendarId.trim();
    if (calendarId.startsWith('"') && calendarId.endsWith('"')) {
      calendarId = calendarId.slice(1, -1);
    }
    if (calendarId.startsWith("'") && calendarId.endsWith("'")) {
      calendarId = calendarId.slice(1, -1);
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

    debugLog = {
      clientEmail,
      calendarId,
      rawPrivateKeyLength: rawPrivateKey.length,
      rawPrivateKeyStart: rawPrivateKey.substring(0, 40),
      rawPrivateKeyEnd: rawPrivateKey.substring(rawPrivateKey.length - 40),
      privateKeyStart: privateKey.substring(0, 40),
      privateKeyEnd: privateKey.substring(privateKey.length - 40),
      privateKeyLength: privateKey.length,
      privateKeyHasNewlines: privateKey.includes('\n'),
    };

    // Obtain access token natively
    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);

    // Call Google Calendar REST API using native fetch
    const googleResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: title,
          description: description || '',
          start: {
            dateTime: new Date(startTime).toISOString(),
            timeZone: 'Asia/Jakarta',
          },
          end: {
            dateTime: new Date(endTime).toISOString(),
            timeZone: 'Asia/Jakarta',
          },
        }),
      }
    );

    const googleData = await googleResponse.json();

    // Check if Google Calendar API returned an error
    if (!googleResponse.ok) {
      console.error('Google Calendar API Error:', googleData);
      return new Response(JSON.stringify({ 
        error: googleData.error?.message || 'Google Calendar API reported an error.',
        debug: googleData
      }), {
        status: googleResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return success response to the client
    return new Response(JSON.stringify({ 
      success: true, 
      eventId: googleData.id,
      htmlLink: googleData.htmlLink 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error',
      debug: debugLog
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
