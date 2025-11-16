let requestCount = 0;
let lastReset = Date.now();

export function trackRequest() {
  requestCount++;
  
  const now = Date.now();
  if (now - lastReset > 10000) { // Every 10 seconds
    console.log(`📊 Supabase requests in last 10s: ${requestCount}`);
    requestCount = 0;
    lastReset = now;
  }
}