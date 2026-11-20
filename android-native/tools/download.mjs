import https from 'node:https';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import dns from 'node:dns/promises';

export async function request(url, attempt = 0) {
  try {
    const addresses = await dns.resolve4(new URL(url).hostname).catch(() => []);
    const address = addresses.length ? addresses[attempt % addresses.length] : null;
    const response = await new Promise((resolve, reject) => {
      const options = { family: 4, agent: false, headers: { 'User-Agent': 'fitTODOay-Android-Setup' } };
      if (address) options.lookup = (_host, settings, callback) => settings.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4);
      const req = https.get(url, options, resolve);
      req.setTimeout(45000, () => req.destroy(new Error('Download timed out')));
      req.on('error', reject);
    });
    if (response.statusCode >= 300 && response.statusCode < 400) {
      response.resume();
      return request(new URL(response.headers.location, url).href);
    }
    if (response.statusCode !== 200) { response.resume(); const error = new Error(`HTTP ${response.statusCode}: ${url}`); error.status = response.statusCode; throw error; }
    return response;
  } catch (error) {
    if (attempt >= 5 || (error.status >= 400 && error.status < 500)) throw error;
    console.log(`Retry ${attempt + 1}: ${new URL(url).hostname}`);
    return request(url, attempt + 1);
  }
}

if (process.argv[2] && process.argv[3]) {
  const response = await request(process.argv[2]);
  await pipeline(response, fs.createWriteStream(process.argv[3]));
  console.log(`Downloaded ${process.argv[3]}`);
}
