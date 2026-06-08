const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read .env
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');

// Simple parser
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

const email = secrets['GOOGLE_SERVICE_ACCOUNT_EMAIL'];
const privateKey = secrets['GOOGLE_PRIVATE_KEY'];
const calendarId = secrets['GOOGLE_CALENDAR_ID'];

if (!email || !privateKey || !calendarId) {
  console.error('Missing secrets in .env');
  process.exit(1);
}

console.log('Setting secrets on Supabase project jxsqlvpydnjssukeyjrm...');
console.log('Email:', email);
console.log('Calendar ID:', calendarId);

// Wrap values in double quotes and escape them for shell parsing on Windows
const args = [
  'supabase',
  'secrets',
  'set',
  '--project-ref', 'jxsqlvpydnjssukeyjrm',
  `GOOGLE_SERVICE_ACCOUNT_EMAIL="${email}"`,
  `GOOGLE_PRIVATE_KEY="${privateKey}"`,
  `GOOGLE_CALENDAR_ID="${calendarId}"`
];

const result = spawnSync('npx.cmd', args, { stdio: 'inherit', shell: true });
if (result.status === 0) {
  console.log('Secrets set successfully!');
} else {
  console.error('Failed to set secrets');
  process.exit(result.status || 1);
}
