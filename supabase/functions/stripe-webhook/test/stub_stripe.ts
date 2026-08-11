// Stand-in for the Stripe SDK: only signature verification is exercised here.
export default class Stripe {
  constructor(_k: string, _o?: any) {}
  static createFetchHttpClient() { return {}; }
  static createSubtleCryptoProvider() { return {}; }
  webhooks = {
    constructEventAsync: async (raw: string, sig: string, secret: string) => {
      if (sig !== 'good-sig-for-' + secret) throw new Error('signature mismatch');
      return JSON.parse(raw);
    },
  };
}
