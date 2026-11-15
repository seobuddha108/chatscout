const endpoints = [
  ["GET /api/v1/chat/search", "q (words, prefix match, -word excludes), user, session, from, to, limit, offset"],
  ["GET /api/v1/chat/chatters", "period, date, prefix, limit, offset"],
  ["DELETE /api/v1/chat/chatters/:user", "erases that chatter's messages"],
  ["GET /api/v1/rankings/creators", "country, period (day|week|month), date, category (general|gaming), league (S–D), limit, offset"],
  ["GET /api/v1/rankings/gifters", "country, period, date, creator, limit, offset"],
  ["GET /api/v1/creators/:uniqueId", "date"],
  ["GET /api/v1/countries", "period, date"],
  ["GET /api/v1/leagues", "period"],
];

export default function Home() {
  return (
    <main>
      <h1>ChatScout API</h1>
      <p>Search the chat of your own TikTok LIVE streams by keywords and users. Plus LIVE rankings and gifter leaderboards.</p>
      <p>Chat search is only available for keys linked to a creator account and only covers that creator&apos;s streams.</p>
      <p>Authenticate with <code>Authorization: Bearer &lt;key&gt;</code> or <code>x-api-key</code>.</p>
      <table cellPadding={6} style={{ borderCollapse: "collapse" }}>
        <thead><tr><th align="left">Endpoint</th><th align="left">Query parameters</th></tr></thead>
        <tbody>
          {endpoints.map(([e, q]) => (
            <tr key={e} style={{ borderTop: "1px solid #ddd" }}><td><code>{e}</code></td><td>{q}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
