// TEMPORARY DIAGNOSTIC — restore real handler after debugging

export async function GET(req: Request) {
  return Response.json({
    ok: true,
    route: "walkin-timeouts-debug",
    url: req.url,
    now: new Date().toISOString(),
    envExists: !!process.env.WALKIN_TIMEOUT_SECRET,
    envValue: process.env.WALKIN_TIMEOUT_SECRET ?? null,
  })
}
