const http = require('http');
const req = http.request('http://localhost:8080/v1/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test'
  }
}, (res) => {
  res.on('data', (d) => process.stdout.write(d));
});
req.write(JSON.stringify({
  inquiry: "add one share of AAPL to my portfolio",
  portfolio_id: "00000000-0000-0000-0000-000000000000",
  chat_history: []
}));
req.end();
