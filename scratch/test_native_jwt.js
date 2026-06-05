import crypto from 'crypto';

const clientEmail = "calendar-bot@cohesive-sign-498421-q5.iam.gserviceaccount.com";
const rawPrivateKey = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDXc2tCXxbSjDFM\nFTKIzeK8+s+KBfSDJgbLTxwOu1D1RzwaTxLUUMBPH5fOKOAuzckz96g2SsANN1U2\nZKktHe9CafOh9TYOhT2NvuWHpXiWiTOeHIQbwbvUM2bzssm6VwioQpcdsYNmQ0L7\nrNArzmKqjWrhDmDaGvxUtDjnVD6scE7u1uuYyB7N83L8olsTRCNElHsCWe3BRGpT\nO0kbRUwKb+yUrjq+IKGvL51GaoUyFabimw4ExIKBiC0tRKScZk2ZLjUX9vtkbl5P\nJeQYlPF3EYSeg0AmiR++uhHXCMX4NB0zrnCo6zN6ZNfrsKyr7F79qTAtirkyw8Fu\nlrBcgs1hAgMBAAECggEAAUYd7r0IMgOBMR14+IUbH5nuCzdgzDu305Dqrg2ee2zJ\n5q/sARRfJridmar1NGGkHGoM9RE5FHrsxo8OzwT7yq08swrzoF9aT1G/Iq+wSFeU\nVg1+HHnnReht5ef7OF5WX0RRh2vqxnqEVV+etXuZar++T4lZukBpmIieQ4PkgPmA\nPKm2KJFZylFBE77aifBEEx8u8+vfQa+l/CoKUsvn1/tsFCSil40njzNikCxMzkVM\ndQOi/CrkqWqdgInzeuFTwbT+LnBiK2R4FEXcy/8GMbK1zMru/yBXAEC84sy1ka2v\nOUp3eZZxI1SIlU4/A0Ov4/on/FCg1bs0J536ODQEDwKBgQD+rsaZNAW1/NjjoAfg\nkAStGFqJKbUNMkf4N35VYAuw0em4PMTFbzT6TsyesQKnMzIoEEiefWb+0lPTYRgs\nC7+AplKsuXUeNE1TrxXnfxHZGKzfhm9joj+HjXPhSJ+5l60ZhS2rG64hYtNdEIIX\nsqFJv9jSmPA0rr66D0MRhQOMlwKBgQDYkLJMQ2QH69SZ7qbXzQnwy+6U9NZO2QqJ\nWtAec2TJNbS9YldM4r3/AfOAXK49aYONJil55esBVSx6ET33MKezfcIr7IDNJnVK\n4Ngduavt8MoOIn5dTY/efWvBNntNhljVc+j6Xg6tKfP5JUl1QYB+LO/FUiIuZPGd\ndQplk6AcxwKBgQDjl8B2TF0GIuyXjf08GrdzEB5oENNw9YwHL2BAX1JTM2NPd07I\nuPZ48U4+SiT60e9yigq7R4lxEvhCH7SAOAdsqjWbkSguU8L+k6pZc965SSnDntmQ\nCgAH3Mq/eizyp67S7YbAMD5OK4iC1CvNjZ5Az6atnGqcScS7dMQUte9UBQKBgQCj\nbQ4f3vstvxnA0Ae38lL+E+cHIXxYJBF/dbh4QjxcWtr5z6xxqOoX9jD7PPWAAo/z\nhEjoZEjjyJK3yysnzt++47gTzXWlWtBIoUR1qhfEh2DzKbSSVGWtUJhwRdzms+t1\nqPK3fSM2KeKisTCt+7Arh12pWkHRIPv0Bs7BuJWrIQKBgAostVy0LX9xonSz12KB\nK0dqjtZroh1xGw92FuJTWTWCr7lSamKY6BKUCNKlmksavLI5gpLqkBSgMl1P/BYS\nnfh2ddimhMUnmaZYSA3QvboVEDxfTTCQ+53TBI9uHhRvV+N6uGCSmX6CAUprsGVP\nsVk5+jMRnzDrUulCh1gsKtpg\n-----END PRIVATE KEY-----";

const privateKey = rawPrivateKey.replace(/\\n/g, '\n').replace(/\r/g, '').trim();

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64Url(buffer) {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  const base64 = btoa(binary);
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function run() {
  try {
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = privateKey
      .replace(pemHeader, "")
      .replace(pemFooter, "")
      .replace(/\s/g, "");
    
    const der = base64ToArrayBuffer(pemContents);
    
    // Use WebCrypto API (which is global in modern Node and Deno)
    const key = await crypto.subtle.importKey(
      "pkcs8",
      der.buffer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );
    
    console.log("Key imported successfully via WebCrypto!");

    // Build JWT
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

    const headerStr = encodeBase64Url(new TextEncoder().encode(JSON.stringify(header)));
    const payloadStr = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const jwtInput = `${headerStr}.${payloadStr}`;

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(jwtInput)
    );

    const signatureStr = encodeBase64Url(signature);
    const jwt = `${jwtInput}.${signatureStr}`;
    console.log("JWT signed successfully:", jwt);

    // Test token request
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

    const tokenData = await tokenResponse.json();
    console.log("Token Response Status:", tokenResponse.status);
    console.log("Token Response Data:", tokenData);

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
