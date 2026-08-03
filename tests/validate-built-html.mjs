import fs from 'node:fs';
import vm from 'node:vm';

const htmlPath = process.argv[2];
if (!htmlPath) {
  throw new Error('Informe o HTML compilado para validacao.');
}

const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [];
const pattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi;
let match;
while ((match = pattern.exec(html)) !== null) {
  scripts.push(match[1]);
}

if (scripts.length !== 1) {
  throw new Error('O artefato deve conter exatamente um script inline; encontrados: ' + scripts.length);
}
new vm.Script(scripts[0], { filename: 'pmo-tool.inline.js' });

for (const marker of ['<!--@inject:css-->', '<!--@inject:js-->', '@@BUILD_VERSION@@']) {
  if (html.includes(marker)) {
    throw new Error('Marcador de build nao resolvido: ' + marker);
  }
}
for (const meta of ['pmo-app-version', 'pmo-build-commit', 'pmo-build-timestamp']) {
  const count = html.split('name="' + meta + '"').length - 1;
  if (count !== 1) {
    throw new Error('Metadado ' + meta + ' deve ocorrer uma vez; encontrado: ' + count);
  }
}

console.log('HTML compilado: script inline e metadados validos.');
