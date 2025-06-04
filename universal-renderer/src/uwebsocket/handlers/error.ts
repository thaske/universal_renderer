export function createErrorHandler() {
  return (
    res: import("uWebSockets.js").HttpResponse,
    error: Error,
  ) => {
    const isDev = process.env.NODE_ENV !== "production";
    res.writeStatus("500");
    res.writeHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: isDev ? error.message : "Internal Server Error",
        ...(isDev && { stack: error.stack }),
      }),
    );
  };
}
