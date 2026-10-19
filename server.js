const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const routes = {'/':'index.html','/app.js':'app.js','/style.css':'style.css','/config.js':'config.js','/cloud.js':'cloud.js','/history.js':'history.js','/push.js':'push.js','/sw.js':'sw.js','/manifest.webmanifest':'manifest.webmanifest','/family-icon.png':'family-icon.png','/icon.svg':'icon.svg','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png','/push-setup.html':'push-setup.html'};
http.createServer((req,res)=>{
 const file=routes[new URL(req.url,'http://localhost').pathname];
 if(!file){res.writeHead(404);return res.end('Not found');}
 res.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webmanifest')?'application/manifest+json':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
 fs.createReadStream(path.join(__dirname,file)).pipe(res);
}).listen(process.env.PORT || 3000,'0.0.0.0');
