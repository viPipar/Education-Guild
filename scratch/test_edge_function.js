const url = 'https://jxsqlvpydnjssukeyjrm.supabase.co/functions/v1/add-calendar-event';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4c3FsdnB5ZG5qc3N1a2V5anJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MDkwNjEsImV4cCI6MjA5NTk4NTA2MX0.JKqgG8-hc_F_nsIjKDLq22S5-ynF9qyOEdzbE2aDEBQ';

const payload = {
  title: 'Test Meeting',
  startTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
  endTime: new Date(Date.now() + 7200000).toISOString(),   // 2 hours from now
  description: 'This is a test event from diagnosis script.'
};

console.log('Sending payload:', payload);

fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${anonKey}`,
    'apikey': anonKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
.then(async (res) => {
  console.log('Response Status:', res.status, res.statusText);
  const text = await res.text();
  console.log('Response Body:', text);
})
.catch((err) => {
  console.error('Error sending request:', err);
});
