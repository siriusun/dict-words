const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lexi · 阅读测试页</title>
<style>body{font:18px/1.9 system-ui,sans-serif;margin:0;background:#f3f5f4;color:#24342e}main{max-width:800px;margin:90px auto;padding:36px;background:white;border:1px solid #dfe6e0;border-radius:20px}h1{font-size:34px;line-height:1.3}p{margin:30px 0}.word{font-weight:600}label{display:block;color:#53695d;font-size:14px}input{width:100%;padding:12px;box-sizing:border-box;border:1px solid #cad7ce;border-radius:8px;font:inherit}#editable{padding:12px;border:1px solid #cad7ce;border-radius:8px}footer{position:fixed;bottom:8px;left:15px;font-size:13px;color:#75877c}button{font-size:30px;border:4px solid orange}</style>
<main><small>READING ROOM / 本地验收页</small><h1>A small moment of discovery</h1>
<p>Sometimes <span class="word" id="serendipity">serendipity</span> arrives when we least expect it. Reading with <span class="word" id="curiosity">curiosity</span> makes ordinary moments feel extraordinary.</p>
<p>We learn through <span class="word" id="practice">practice</span>, and remember through <span class="word" id="reflection">reflection</span>.</p>
<label>输入框内选词不应触发<input id="typing" value="confidential"></label>
<p id="editable" contenteditable="true">Editable content should stay private.</p>
<p id="phrase">multiple words are not a single word</p><p id="invalid">zzqxnonexistentword</p>
</main><footer>Lexi 本地测试 · 不含用户数据</footer></html>`;
const server = http.createServer((request, response) => {
  if (request.url === '/lexi.user.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fs.readFileSync(path.join(root, 'lexi.user.js')));
  } else if (request.url === '/' || request.url === '/reading') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html);
  } else { response.writeHead(404); response.end('Not found'); }
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ port: server.address().port, pid: process.pid })));
