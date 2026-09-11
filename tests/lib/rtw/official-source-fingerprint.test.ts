import { expect, test } from 'vitest';
import { extractEndpointCandidates, extractScriptHosts, fingerprintOfficialSource } from '../../../src/lib/rtw/official-source-fingerprint.ts';

test('separates Lufthansa Group engine evidence from CDN protection', () => {
  const result = fingerprintOfficialSource({
    requestedUrl: 'https://www.brusselsairlines.com/',
    finalUrl: 'https://www.brusselsairlines.com/be/en/homepage',
    status: 200,
    headers: { server: 'AkamaiGHost', 'set-cookie': '_abck=fixture' },
    html: '<html><body>Travel ID for Lufthansa Group Airlines<script src="https://static.lh.com/app.js"></script></body></html>',
  });
  expect(result.engineFamily).toBe('lufthansa-group');
  expect(result.protection).toBe('akamai');
  expect(result.scriptHosts).toEqual(['static.lh.com']);
  expect(result.endpointCandidates).toEqual([]);
});

test('detects Imperva without inventing an engine family', () => {
  const result = fingerprintOfficialSource({
    requestedUrl: 'https://booking.example.test/',
    finalUrl: 'https://booking.example.test/',
    status: 403,
    headers: { 'set-cookie': 'visid_incap=fixture; incap_ses=fixture' },
    html: '<html>Incapsula incident ID 123</html>',
  });
  expect(result.protection).toBe('imperva');
  expect(result.engineFamily).toBe('unknown');
});

test('detects common booking engine markers and resolves relative script hosts', () => {
  expect(fingerprintOfficialSource({
    requestedUrl: 'https://airline.test/', finalUrl: 'https://airline.test/', status: 200, headers: {},
    html: '<html><script src="/assets/app.js"></script><div>Powered by Navitaire NewSkies</div></html>',
  }).engineFamily).toBe('navitaire');
  expect(extractScriptHosts('<script src="//cdn.example.test/x.js"></script>', 'https://airline.test/')).toEqual(['cdn.example.test']);
});

test('extracts bounded booking and API endpoint candidates without treating every asset as an endpoint', () => {
  const html = `
    <form action="/booking/search"></form>
    <script src="/assets/app.js"></script>
    <img src="/images/flight-search.png">
    <script>window.api = "https:\\/\\/api.airline.test\\/v1\\/flight-search";</script>
  `;
  expect(extractEndpointCandidates(html, 'https://www.airline.test/')).toEqual([
    'https://api.airline.test/v1/flight-search',
    'https://www.airline.test/booking/search',
  ]);
});
