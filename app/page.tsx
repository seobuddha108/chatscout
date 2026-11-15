import styles from "./home.module.css";

export const metadata = {
  title: "ChatScout: search your TikTok LIVE chat",
  description: "Search the chat of your own TikTok LIVE streams by keyword or viewer, see poll results and where your content was discussed.",
};

const CHAT = [
  { t: "20:14", u: "lena_m", m: <>wann ist das <mark className={styles.hit}>giveaway</mark>? 🙏</> },
  { t: "20:15", u: "max.99", m: <>bin dabei beim <mark className={styles.hit}>giveaway</mark>!</> },
  { t: "20:17", u: "nora_k", m: <><mark className={styles.hit}>giveaway</mark> pls ❤️</> },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <nav className={styles.nav} aria-label="Main">
          <a href="/" className={styles.brand}>
            <img src="/icon.png" alt="" width={32} height={32} />
            ChatScout
          </a>
          <div className={styles.navLinks}>
            <a href="#features">Features</a>
            <a href="#privacy">Privacy</a>
            <a href="/login">Log in</a>
          </div>
        </nav>

        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>For TikTok LIVE creators</span>
            <h1>Find any message in your LIVE chat in seconds.</h1>
            <p className={styles.lead}>
              ChatScout keeps the chat of your own TikTok LIVE streams searchable. Find giveaway entries, spam and
              scam links, or everything a viewer wrote, so you can moderate and reward your community with ease.
            </p>
            <div className={styles.ctaRow}>
              <a className={styles.cta} href="/api/auth/tiktok/start">Login with TikTok</a>
              <a className={styles.ghost} href="#how">How it works →</a>
            </div>
            <p className={styles.fine}>We only read your username, display name and avatar. We never post on your behalf.</p>
          </div>

          <div className={styles.mock} aria-label="Example: searching the chat for “giveaway”">
            <div className={styles.search}>🔍 <strong>giveaway</strong> <span>· 3 results in tonight&apos;s stream</span></div>
            {CHAT.map((c) => (
              <div key={c.t} className={styles.msg}>
                <time>{c.t}</time>
                <div><b>@{c.u}</b> {c.m}</div>
              </div>
            ))}
          </div>
        </header>

        <section id="features" className={styles.section}>
          <h2>Everything you need after a stream</h2>
          <p className={styles.sub}>Built for creators, moderators and their agencies.</p>
          <div className={styles.grid}>
            <div className={styles.card}><div className={styles.icon}>🔎</div><h3>Chat search</h3>
              <p>Search by words, exclude terms, filter by viewer or time. Jump straight to the right moment.</p></div>
            <div className={styles.card}><div className={styles.icon}>📊</div><h3>Poll results</h3>
              <p>See how your polls went, minute by minute, and who voted in your own streams.</p></div>
            <div className={styles.card}><div className={styles.icon}>🎬</div><h3>Where you were discussed</h3>
              <p>Find streams that talked about you, with reach, gifts and chat mood.</p></div>
            <div className={styles.card}><div className={styles.icon}>🛡️</div><h3>Moderation help</h3>
              <p>Spot spam, scam links and insults quickly, and see who your regulars are.</p></div>
          </div>
        </section>

        <section id="how" className={styles.section}>
          <h2>How it works</h2>
          <p className={styles.sub}>Up and running in under a minute.</p>
          <ol className={styles.steps}>
            <li><b>Login with TikTok</b><span>This confirms that you own the account. Nothing else is accessed.</span></li>
            <li><b>Go LIVE as usual</b><span>ChatScout keeps your stream&apos;s chat searchable while your access is active.</span></li>
            <li><b>Search your dashboard</b><span>Find messages, check polls and see where you were mentioned.</span></li>
          </ol>
        </section>

        <section id="privacy" className={styles.section}>
          <h2>Privacy by design</h2>
          <p className={styles.sub}>Your community&apos;s trust matters, so we keep it simple.</p>
          <ul className={styles.privacy}>
            <li>Only your <strong>own</strong> streams. There is no search across other creators or other people&apos;s streams.</li>
            <li>Chat messages are deleted automatically after 30 days.</li>
            <li>Viewers can ask to have their messages deleted at any time.</li>
            <li>We revoke the TikTok access token right after login and never post on your behalf.</li>
            <li>No ads, no tracking, no selling of data.</li>
          </ul>
        </section>

        <section className={`${styles.section} ${styles.faq}`}>
          <h2>FAQ</h2>
          <details><summary>Is ChatScout made by TikTok?</summary>
            <p>No. ChatScout is an independent tool and is not affiliated with or endorsed by TikTok or ByteDance.</p></details>
          <details><summary>Can I see the chat of other creators?</summary>
            <p>No. You can only search the chat of the account you logged in with.</p></details>
          <details><summary>What does it cost?</summary>
            <p>You can start with a free 7-day trial from your dashboard. Paid packages will follow.</p></details>
          <details><summary>Is there an API?</summary>
            <p>Yes, for developers and agencies. See the <a href="/docs">API overview</a>.</p></details>
        </section>

        <section className={styles.final}>
          <h2>Ready to find that one message?</h2>
          <a className={styles.cta} href="/api/auth/tiktok/start">Login with TikTok</a>
        </section>
        <p className={styles.note}>ChatScout is not affiliated with TikTok or ByteDance.</p>
      </div>
    </div>
  );
}
