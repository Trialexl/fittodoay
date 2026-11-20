// Optional local cache for machines where Java TLS downloads are interrupted.
// Artifacts come exclusively from Google's Maven and Maven Central over verified HTTPS.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { request } from './download.mjs';

const root = path.resolve(process.env.LOCALAPPDATA, 'fitTODOay/maven-cache');
const inflight = new Map();
async function cached(relative) {
  const destination = path.resolve(root, relative);
  if (!destination.startsWith(root + path.sep)) throw new Error('Invalid artifact path');
  if (fs.existsSync(destination)) return destination;
  if (!inflight.has(relative)) inflight.set(relative, (async () => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const google = 'https://dl.google.com/dl/android/maven2/';
    const central = 'https://repo.maven.apache.org/maven2/';
    const origins = /^(androidx\/|com\/android\/|com\/google\/android\/)/.test(relative) ? [google, central] : [central, google];
    for (const origin of origins) {
      try {
        const response = await request(origin + relative);
        await pipeline(response, fs.createWriteStream(destination + '.part'));
        fs.renameSync(destination + '.part', destination);
        return destination;
      } catch (error) { if (error.status !== 404) throw error; }
    }
    const error = new Error('Artifact not found'); error.status = 404; throw error;
  })().finally(() => inflight.delete(relative)));
  return inflight.get(relative);
}
http.createServer(async (req, res) => {
  try {
    if (!['HEAD', 'GET'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
    if (!/^[a-zA-Z0-9_./+-]+$/.test(relative) || relative.split('/').includes('..')) { res.writeHead(400); res.end(); return; }
    const file = await cached(relative);
    res.writeHead(200, { 'Content-Length': fs.statSync(file).size });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  } catch (error) { res.writeHead(error.status === 404 ? 404 : 502); res.end(); }
}).listen(18765, '127.0.0.1', () => console.log('Maven cache listening on 127.0.0.1:18765'));
