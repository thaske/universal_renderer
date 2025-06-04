export function createHealthHandler() {
  return () =>
    JSON.stringify({ status: "OK", timestamp: new Date().toISOString() });
}
