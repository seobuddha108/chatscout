import { LEGAL } from "@/legal/config";
import { LegalPage } from "@/legal/LegalPage";

export const metadata = { title: "Privacy Policy – ChatScout" };

const CHAT_DAYS = Number(process.env.CHAT_RETENTION_DAYS ?? 30);
const GIFT_DAYS = Number(process.env.GIFT_RETENTION_DAYS ?? 90);
const VIDEO_DAYS = Number(process.env.VIDEO_RETENTION_DAYS ?? 14);

export default function Privacy() {
  const L = LEGAL;
  const mail = <a href={`mailto:${L.privacyEmail}`}>{L.privacyEmail}</a>;
  return (
    <LegalPage title="Privacy Policy" lang="en">
      <p>Last updated: {L.lastUpdated}. This is an English translation of our{" "}
        <a href="/datenschutz" hrefLang="de">Datenschutzerklärung</a>. If the two versions differ, the German version prevails.</p>

      <h2>1. Controller</h2>
      <p>
        {L.company}, {L.street}, {L.zipCity}, Germany<br />
        Email: {mail}
      </p>

      <h2>2. Overview</h2>
      <p>{L.productName} helps creators search the chat of their <strong>own</strong> TikTok LIVE streams, records the LIVE
        streams of creators that users follow, and provides statistics about LIVE streams. These groups of people are affected:</p>
      <ul>
        <li><strong>Creators</strong> who sign in to {L.productName} (sections 4–7),</li>
        <li><strong>Viewers</strong> who write in the LIVE chat of a signed-in creator (section 8),</li>
        <li><strong>Creators followed by users, and their viewers</strong> (section 8a),</li>
        <li><strong>Creators and supporters</strong> who appear in public LIVE rankings (section 9).</li>
      </ul>
      <p>We do not use any advertising, analytics or tracking tools and we do not sell data.</p>

      <h2>3. Hosting and server logs</h2>
      <p>The application is operated by {L.hosting.app}, the database by {L.hosting.database} in the region London (eu-west-2),
        United Kingdom. We have data processing agreements with both providers (Art. 28 GDPR). For the United Kingdom, an
        adequacy decision of the European Commission applies (Art. 45 GDPR). Where data is transferred to the USA or other third
        countries, we rely on the EU-U.S. Data Privacy Framework or the EU Standard Contractual Clauses (Art. 45, 46 GDPR).</p>
      <p>When you visit the website, the host processes technically necessary data (IP address, time, requested address, browser
        identifier) in server logs to provide the service securely and analyze errors. The legal basis is our legitimate interest
        in secure operation (Art. 6(1)(f) GDPR). Logs are kept only for a short time.</p>

      <h2>4. Login with TikTok</h2>
      <p>Sign-in works exclusively via &quot;Login with TikTok&quot; (TikTok Login Kit). After you consent, TikTok redirects you back
        to us and transmits: your TikTok account ID (open_id), your username, your display name and your profile picture. We use
        this to make sure you only see data from your own streams.</p>
      <p>We revoke the access token issued by TikTok immediately after reading this information. We do not store it and do not
        access your TikTok account any further. The legal basis is the performance of the contract (Art. 6(1)(b) GDPR). TikTok&apos;s
        own privacy policy applies to the processing at TikTok.</p>

      <h2>5. Customer account and API keys</h2>
      <p>For your account we store the information from section 4, the time of verification, your API keys (only as a
        cryptographic hash), package and term, and the number of API requests per day (for quotas). The legal basis is
        Art. 6(1)(b) GDPR. We keep this data for as long as your account exists and then delete it, unless statutory retention
        obligations apply (e.g. up to 10 years for invoices under German commercial and tax law).</p>

      <h2>6. Cookies</h2>
      <p>We only use technically necessary cookies (§ 25(2) no. 2 TDDDG). No consent is required for them:</p>
      <ul>
        <li><code>cs_oauth_state</code>: protects the TikTok sign-in against forgery, lifetime 10 minutes.</li>
        <li><code>cs_session</code>: keeps you signed in, lifetime 30 days or until you log out.</li>
      </ul>

      <h2>7. Payments</h2>
      <p>We currently only offer a free trial and do not process any payment data. Once we introduce paid packages, we will add
        the payment provider and the data processed here.</p>

      <h2>8. Chat messages in the streams of signed-in creators</h2>
      <p><strong>Which data:</strong> username and display name of the person writing, message text, time and the related stream.
        The data comes from the public LIVE chat (Art. 14 GDPR).</p>
      <p><strong>Only for signed-in creators:</strong> chat messages are only stored from streams of creators who have verified
        their TikTok account with us and have active access. Only that creator can search them. We do not store chats from other
        streams. Section 8a applies to other creators' streams. There is no search for people across streams.</p>
      <p><strong>Purpose and role:</strong> the search serves the creator&apos;s moderation and community management, for example to
        find giveaway entries, spam or insults. We process the data on behalf of the creator (Art. 28 GDPR). The creator is the
        controller and relies on their legitimate interest in moderating their stream (Art. 6(1)(f) GDPR).</p>
      <p><strong>Retention:</strong> chat messages are deleted automatically after {CHAT_DAYS} days. When the creator&apos;s access
        ends, no new messages are stored.</p>
      <p><strong>Your rights as a viewer:</strong> you can object to the processing and request deletion of your messages, either
        with the creator directly or with us at {mail} (please state your TikTok username and the stream). We forward requests to
        the creator or delete the messages on their behalf.</p>

      <h2>8b. Video recording of own streams</h2>
      <p>Signed-in creators can switch on recording of video and audio of their <strong>own</strong> LIVE streams in the settings.
        Recordings are stored with {L.hosting.database} (region London (eu-west-2), United Kingdom). Only that creator can play them.
        They are deleted automatically after {VIDEO_DAYS} days. We process them on the creator&apos;s behalf (Art. 28 GDPR). We do not
        record video of other creators&apos; streams.</p>

      <h2>8a. Recording of followed creators</h2>
      <p><strong>What:</strong> Users with an active package can follow public TikTok creators. We then record their LIVE streams:
        title, times, viewer numbers, gifts, poll results, chat activity and chat messages.</p>
      <p><strong>Pseudonymization:</strong> For chat messages, gifts and poll votes in these streams we store <strong>no viewer
        usernames</strong>, only a pseudonym (e.g. &quot;Zuschauer #a3f9&quot;). It is derived per stream with a secret key. Within one
        stream you can tell that the same person wrote several times, but not across streams. Message texts are stored and can be
        searched by the users following that creator.</p>
      <p><strong>Legal basis and role:</strong> We are the controller for these recordings. We rely on our and our users&apos;
        legitimate interest in analyzing public LIVE streams, e.g. for content analysis and reaction formats (Art. 6(1)(f) GDPR).
        Pseudonymization and short retention periods protect viewers.</p>
      <p><strong>Retention:</strong> chat messages {CHAT_DAYS} days, individual gift events {GIFT_DAYS} days, then automatic deletion.</p>
      <p><strong>Objection for creators:</strong> Creators can stop others from recording their streams at any time, in the dashboard
        under &quot;Einstellungen&quot; (settings) after signing in, or by email to {mail}. Existing follows and pseudonymous chat recordings are then deleted.</p>
      <p><strong>Objection for viewers:</strong> Send us your TikTok username and the stream ({mail}). We can compute your pseudonym
        for that stream and delete the related data.</p>

      <h2>9. Public LIVE rankings</h2>
      <p>For rankings we process publicly visible information about LIVE streams: username, display name, country and category of
        creators, times and viewer numbers of streams, and the totals of virtual gifts. Names of people sending gifts are only stored
        in a signed-in creator&apos;s own streams, otherwise pseudonymously (section 8a). The legal basis is our legitimate interest in providing statistics about public LIVE activity
        (Art. 6(1)(f) GDPR). You can object at any time (section 11), and we will then remove your data from the rankings.
        Individual gift events, including the names of the people sending gifts, are deleted automatically after {GIFT_DAYS} days.</p>

      <h2>9a. Stream analytics (polls and content tracking)</h2>
      <p>From public LIVE streams we evaluate how many votes each poll option received, how many chat messages were written per
        minute, the mood in the chat, and how often other creators were named via @-mention or in the stream title. Messages and
        votes are evaluated automatically as they arrive. Only <strong>counts without viewers&apos; names</strong> are stored; the
        message text is discarded. The legal basis is our legitimate interest in statistics about public LIVE activity
        (Art. 6(1)(f) GDPR).</p>
      <p><strong>Named poll votes</strong> are only stored for streams of signed-in creators with active access, on behalf of that
        creator (Art. 28 GDPR, see section 8). Only that creator can see them. We do not share them with third parties and do not
        offer any cross-stream analysis of individual people. Like chat messages, they are deleted after {CHAT_DAYS} days.</p>

      <h2>10. Recipients</h2>
      <p>Recipients are our hosting providers (section 3) and, for chat data, only the respective creator. Data is only passed on to
        third parties if we are legally obliged to do so.</p>

      <h2>11. Your rights</h2>
      <p>You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing
        (Art. 18), data portability (Art. 20) and the <strong>right to object to processing based on legitimate interests
        (Art. 21)</strong>. To exercise them, contact {mail}.</p>
      <p>You can also lodge a complaint with a data protection supervisory authority (Art. 77 GDPR), for example the authority
        responsible for us: Independent Centre for Privacy Protection Schleswig-Holstein (ULD), Holstenstraße 98, 24103 Kiel, Germany.</p>

      <h2>12. Automated decision-making</h2>
      <p>There is no automated decision-making, including profiling, within the meaning of Art. 22 GDPR.</p>
    </LegalPage>
  );
}
