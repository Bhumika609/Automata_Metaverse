// Tiny zero-dependency static server:  node serve.js [port]
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = __dirname, port = +process.argv[2] || +process.env.PORT || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.jff': 'application/xml', '.md': 'text/markdown', '.svg': 'image/svg+xml' };

// ---- optional bridge to the REAL JFLAP (put JFLAP.jar in ./jflap/ and have Java installed) ----
function findJar() {
  if (process.env.JFLAP_JAR && fs.existsSync(process.env.JFLAP_JAR)) return process.env.JFLAP_JAR;
  const dir = path.join(root, 'jflap');
  try { const j = fs.readdirSync(dir).find((f) => /\.jar$/i.test(f)); return j ? path.join(dir, j) : null; } catch (e) { return null; }
}
const hasJava = () => { try { return cp.spawnSync('java', ['-version']).status === 0; } catch (e) { return false; } };
function api(req, res) {
  const json = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.headers['x-am'] !== '1') return json(403, { error: 'forbidden' });
  if (req.url === '/api/jflap/status') { const j = findJar(); return json(200, { jar: j ? path.relative(root, j) : null, java: hasJava() }); }
  if (req.url === '/api/jflap/open' && req.method === 'POST') {
    let body = ''; req.on('data', (d) => { body += d; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      try {
        const { name, xml } = JSON.parse(body), jar = findJar();
        if (!jar) return json(400, { error: 'JFLAP.jar not found in the jflap/ folder' });
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-jflap-')), file = path.join(dir, String(name).replace(/[^\w.-]/g, '_').replace(/(\.jff)?$/, '.jff'));
        fs.writeFileSync(file, xml);
        const child = cp.spawn('java', ['-jar', jar, file], { detached: true, stdio: 'ignore' }); child.on('error', () => {}); child.unref();
        json(200, { ok: true });
      } catch (e) { json(400, { error: e.message }); }
    });
    return;
  }
  json(404, { error: 'not found' });
}
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return api(req, res);
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(port, '127.0.0.1', () => console.log(`Automata Metaverse running at http://localhost:${port}`));
