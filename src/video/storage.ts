/** Object storage for recordings. Supabase Storage in production, in-memory for tests. */
export interface ObjectStore {
  put(path: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Signed, time-limited download URLs. */
  sign(paths: string[], expiresInSec: number): Promise<Map<string, string>>;
  remove(paths: string[]): Promise<void>;
}

export const BUCKET = process.env.RECORDINGS_BUCKET || "recordings";

export class SupabaseStore implements ObjectStore {
  private bucketReady: Promise<void> | null = null;
  constructor(private url: string, private key: string, private bucket = BUCKET) {}
  private headers(extra: Record<string, string> = {}) {
    return { authorization: `Bearer ${this.key}`, apikey: this.key, ...extra };
  }
  private ensureBucket() {
    // Private bucket; creating an existing bucket just fails with 400/409, which is fine.
    this.bucketReady ??= fetch(`${this.url}/storage/v1/bucket`, {
      method: "POST", headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false }),
    }).then(() => undefined, () => undefined);
    return this.bucketReady;
  }
  async put(path: string, body: Uint8Array, contentType: string) {
    await this.ensureBucket();
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${path}`, {
      method: "POST", headers: this.headers({ "content-type": contentType, "x-upsert": "true" }), body: Buffer.from(body),
    });
    if (!res.ok) throw new Error(`storage put ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  async sign(paths: string[], expiresInSec: number) {
    const out = new Map<string, string>();
    for (let i = 0; i < paths.length; i += 500) {
      const res = await fetch(`${this.url}/storage/v1/object/sign/${this.bucket}`, {
        method: "POST", headers: this.headers({ "content-type": "application/json" }),
        body: JSON.stringify({ expiresIn: expiresInSec, paths: paths.slice(i, i + 500) }),
      });
      if (!res.ok) throw new Error(`storage sign ${res.status}`);
      for (const r of (await res.json()) as { path: string; signedURL?: string; signedUrl?: string }[]) {
        const u = r.signedURL ?? r.signedUrl;
        if (u) out.set(r.path, u.startsWith("http") ? u : `${this.url}/storage/v1${u}`);
      }
    }
    return out;
  }
  async remove(paths: string[]) {
    for (let i = 0; i < paths.length; i += 500) {
      await fetch(`${this.url}/storage/v1/object/${this.bucket}`, {
        method: "DELETE", headers: this.headers({ "content-type": "application/json" }),
        body: JSON.stringify({ prefixes: paths.slice(i, i + 500) }),
      });
    }
  }
}

export class MemoryStore implements ObjectStore {
  objects = new Map<string, Uint8Array>();
  async put(path: string, body: Uint8Array) { this.objects.set(path, body); }
  async sign(paths: string[]) { return new Map(paths.map((p) => [p, `memory://${p}`])); }
  async remove(paths: string[]) { for (const p of paths) this.objects.delete(p); }
}

/** Null when storage isn't configured: video recording is then skipped. */
export function storeFromEnv(): ObjectStore | null {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? new SupabaseStore(url, key) : null;
}
