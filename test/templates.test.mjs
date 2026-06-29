// Template fingerprint unit tests.
import { identifyTemplates, listTemplates } from '../src/templates.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${n}`); } else { fail++; console.log(`  \x1b[91m✗ ${n}\x1b[0m`); } };
const S = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

S('1. Positive identification — needs ≥2 signature hits');
{
  const spotify = 'These are the Spotify Terms of Service. The Service is provided by Spotify AB. Premium Family plan is available at spotify.com.';
  const m = identifyTemplates(spotify);
  ok('identifies Spotify (hits ≥ 2)', m.length === 1 && m[0].id === 'spotify');
  ok('reports confidence + hits + of',  m[0].confidence > 0 && m[0].hits >= 2 && m[0].of > 0);
  ok('returns known issues for Spotify', Array.isArray(m[0].issues) && m[0].issues.length >= 2);
}
{
  const lazada = 'Welcome to Lazada Marketplace. As a marketplace seller, you agree to the service commission terms. Visit lazada.co.th for details.';
  const m = identifyTemplates(lazada);
  ok('identifies Lazada',                m.some((x) => x.id === 'lazada'));
  ok('Lazada has known issue ids',       m.find((x) => x.id === 'lazada').issues.some((i) => i.id === 'platform_commission_change'));
}
{
  const aws = 'Amazon Web Services (AWS) Customer Agreement. Service terms apply at aws.amazon.com.';
  const m = identifyTemplates(aws);
  ok('identifies AWS', m.some((x) => x.id === 'aws'));
}
{
  const stripe = 'Stripe Services Agreement governs your use of Stripe Connect. See stripe.com.';
  const m = identifyTemplates(stripe);
  ok('identifies Stripe', m.some((x) => x.id === 'stripe'));
}
{
  const shopee = 'Shopee Seller Terms. Shopee Mall participants. Visit shopee.co.th.';
  const m = identifyTemplates(shopee);
  ok('identifies Shopee', m.some((x) => x.id === 'shopee'));
}

S('2. Negative — innocent text matches nothing');
{
  ok('empty string → []', identifyTemplates('').length === 0);
  ok('short text < 50 chars → []', identifyTemplates('hello world').length === 0);
  ok('generic contract → []', identifyTemplates('This agreement sets forth the terms between Provider and Client for the supply of services as described in Schedule A.').length === 0);
  ok('only 1 signature hit (Spotify mentioned in passing) → []', identifyTemplates('I use Spotify sometimes but this is a contract about widgets and gadgets and other things entirely.').length === 0);
}

S('3. listTemplates() metadata');
{
  const list = listTemplates();
  ok('returns 5+ templates',                list.length >= 5);
  ok('every entry has id, name, counts',    list.every((t) => t.id && t.name && typeof t.signature_count === 'number' && typeof t.issue_count === 'number'));
}

S('4. Each issue has bilingual text + severity');
{
  const m = identifyTemplates('These are the Spotify Terms of Service. The Service is provided by Spotify AB. Premium Family plan is available at spotify.com.');
  ok('every issue has en+th+severity', m[0].issues.every((i) => i.en && i.th && i.severity));
}

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
