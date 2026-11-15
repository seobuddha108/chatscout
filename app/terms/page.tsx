import { LEGAL } from "@/legal/config";
import { LegalPage } from "@/legal/LegalPage";

export const metadata = { title: "Terms of Service – ChatScout" };

const CHAT_DAYS = Number(process.env.CHAT_RETENTION_DAYS ?? 30);

export default function Terms() {
  const L = LEGAL;
  const P = L.productName;
  return (
    <LegalPage title="Terms of Service" lang="en">
      <p>Last updated: {L.lastUpdated}. This is an English translation of our{" "}
        <a href="/agb" hrefLang="de">Allgemeine Geschäftsbedingungen (AGB)</a>. If the two versions differ, the German version prevails.</p>

      <h2>1. Scope and provider</h2>
      <p>These terms apply to the use of {P} (website, dashboard and API), provided by {L.company}, {L.street}, {L.zipCity},
        Germany (&quot;Provider&quot;). Deviating terms of users do not apply.</p>
      <p>{P} is an independent service and is not affiliated with TikTok or ByteDance.</p>

      <h2>2. Services</h2>
      <ol>
        <li>{P} stores the chat messages of a verified creator&apos;s own TikTok LIVE streams and makes them searchable for that
          creator (by keywords, people and time ranges). {P} also records the LIVE streams of creators that users
          follow (timeline, polls, chat with pseudonyms instead of viewer names) and offers statistics via an API. The number of
          creators one can follow depends on the package.</li>
        <li>The data comes from publicly accessible LIVE streams. The Provider has no influence on TikTok. It does not guarantee that
          the collected data is complete or that the service is available without interruption. Changes at TikTok may limit
          features.</li>
        <li>Chat messages are deleted automatically after {CHAT_DAYS} days.</li>
      </ol>

      <h2>3. Account and verification</h2>
      <ol>
        <li>Sign-in works via &quot;Login with TikTok&quot;. Each person may only sign in with a TikTok account that they control
          themselves or for which they are authorized (e.g. as an agency with the creator&apos;s authorization).</li>
        <li>Chat data is only collected for the verified account and only shown to it.</li>
        <li>API keys must be kept secret. If misuse is suspected, the key must be revoked in the dashboard.</li>
      </ol>

      <h2>4. Packages, term and prices</h2>
      <ol>
        <li>Access is offered as packages with a fixed term (usually 7 days) and a daily request quota. A package ends automatically
          when its term expires. It does not renew and does not need to be cancelled.</li>
        <li>A free trial may be offered without any entitlement to its continuation.</li>
        <li>Currently, only a free trial is available. For future paid packages, the prices and payment terms shown at the time of
          booking apply.</li>
      </ol>

      <h2>5. Right of withdrawal for consumers</h2>
      <p>No paid services are currently offered. Before introducing paid packages, we will provide consumers with withdrawal
        instructions and a model withdrawal form.</p>

      <h2>6. Users&apos; obligations</h2>
      <ol>
        <li>{P} may only be used for moderation, community management and content analysis of LIVE streams. In particular, it is
          prohibited to use data to harass, expose, stalk or reveal the identity of people (&quot;doxxing&quot;), to de-anonymize pseudonyms, and to pass on or
          publish third parties&apos; chat data without a legal basis.</li>
        <li>Creators inform their viewers in a suitable way (e.g. in their profile description or chat rules) that chat messages are
          stored for moderation. They handle viewers&apos; requests for access or deletion themselves or forward them to the Provider.
          Messages of individual people can be deleted in the dashboard or via the API.</li>
        <li>The API may only be used within the booked quota. Automated circumvention of limits is not permitted.</li>
      </ol>

      <h2>7. Data processing on behalf</h2>
      <p>Where the Provider processes chat messages on behalf of a creator, the creator is the controller and the Provider is the
        processor within the meaning of Art. 28 GDPR. The Provider makes a data processing agreement available on request at{" "}
        <a href={`mailto:${L.email}`}>{L.email}</a>.</p>

      <h2>8. Suspension and termination</h2>
      <p>The Provider may suspend access if users violate these terms or applicable law, or if there is a reasonable suspicion of
        this. Fees already paid for the suspended period are not refunded in the case of a culpable violation. Users can have their
        account deleted at any time ({L.email}).</p>

      <h2>9. Liability</h2>
      <ol>
        <li>The Provider is liable without limitation for intent and gross negligence, for injury to life, body or health, under
          the German Product Liability Act, and to the extent of any guarantee given.</li>
        <li>In the case of a slightly negligent breach of an essential contractual obligation (an obligation whose fulfilment makes
          the proper performance of the contract possible in the first place and on whose compliance users may regularly rely),
          liability is limited to the foreseeable damage typical for the contract. Otherwise, liability for slight negligence is
          excluded.</li>
      </ol>

      <h2>10. Changes</h2>
      <p>The Provider may change these terms with effect for future packages. For packages already booked, the terms in force at
        the time of booking apply.</p>

      <h2>11. Final provisions</h2>
      <p>The law of the Federal Republic of Germany applies, excluding the UN Convention on Contracts for the International Sale of
        Goods. For consumers, this choice of law only applies insofar as it does not deprive them of the protection of mandatory
        consumer protection provisions of their country of residence. If the user is a merchant, the place of jurisdiction is the
        Provider&apos;s registered office. Should any provision be invalid, the rest of the contract remains valid.</p>
    </LegalPage>
  );
}
