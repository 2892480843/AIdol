const fs = require('node:fs');
const path = require('node:path');
const postcss = require('../../frontend/node_modules/postcss');
const root = path.resolve(__dirname, '../..');
const before = path.join(__dirname, 'source-before');
const changed = [];
function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]); }
function save(p,old,next) {
  if(old===next)return;
  const rel=path.relative(root,p),backup=path.join(before,rel);
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  if(!fs.existsSync(backup)) fs.writeFileSync(backup,old,'utf8');
  fs.writeFileSync(p,next,'utf8');changed.push(rel);
}
for(const p of [...walk(path.join(root,'frontend/app')),...walk(path.join(root,'frontend/components'))]) {
 const old=fs.readFileSync(p,'utf8');let next=old;
 if(p.endsWith('.tsx')) {
   next=next.replace(/rounded-(?:lg|xl|2xl|3xl|full)(?![\w-])/g,'rounded-none')
    .replace(/rounded-\[[^\]]+\]/g,'rounded-none')
    .replace(/bg-gradient-to-[a-z]+/g,'bg-[#f5f0e8]')
    .replace(/backdrop-blur(?:-[a-z0-9]+)?/g,'backdrop-filter-none')
    .replace(/(?<![\w-])shadow-(?:sm|md|lg|xl|2xl)(?![\w-])/g,'shadow-[3px_3px_0px_#2d2d2d]');
 } else if(p.endsWith('.css')) {
  const ast=postcss.parse(old,{from:p});
  ast.walkDecls(d=>{
    if(d.prop==='border-radius')d.value='0';
    if(['backdrop-filter','-webkit-backdrop-filter'].includes(d.prop))d.value='none';
    if(['background','background-image'].includes(d.prop)&&/(?<!repeating-)(?:linear|radial)-gradient\(/.test(d.value)) {
     const selector=d.parent.selector||'';
     d.value=selector.includes('.night')?'#272b3d':selector.includes('.warm')?'#e6d4c0':'#f5f0e8';
    }
    if(d.prop==='box-shadow'&&d.value!=='none'&&!d.value.includes('var(')&&!/^inset/.test(d.value))d.value='3px 3px 0 #2d2d2d';
    if(d.prop==='text-shadow')d.value='none';
    if(d.prop==='filter'&&d.value.includes('drop-shadow('))d.value='drop-shadow(2px 2px 0 #2d2d2d)';
  });
  next=ast.toString();
 }
 save(p,old,next);
}
fs.writeFileSync(path.join(__dirname,'style-source-changes.json'),JSON.stringify({scope:'presentation declarations and utility classes only',files:changed},null,2)+'\n');
process.stdout.write(JSON.stringify({files:changed.length})+'\n');
