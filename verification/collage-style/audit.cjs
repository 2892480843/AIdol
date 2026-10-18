const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const postcss=require('../../frontend/node_modules/postcss');
const root=path.resolve(__dirname,'../..');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const files=[...walk(path.join(root,'frontend/app')),...walk(path.join(root,'frontend/components'))];
const violations=[];
for(const p of files){
 const src=fs.readFileSync(p,'utf8');const rel=path.relative(root,p);
 if(p.endsWith('.tsx'))for(const m of src.matchAll(/rounded-(?:lg|xl|2xl|3xl|full)(?![\w-])|bg-gradient-to-[a-z]+|backdrop-blur(?:-[a-z0-9]+)?/g))violations.push({file:rel,token:m[0]});
 if(p.endsWith('.css'))postcss.parse(src,{from:p}).walkDecls(d=>{
  if(/(?<!repeating-)(linear|radial)-gradient\(/.test(d.value))violations.push({file:rel,prop:d.prop,value:d.value});
  if(d.prop==='border-radius'&&!['0','2px'].includes(d.value))violations.push({file:rel,prop:d.prop,value:d.value});
  if(d.prop.includes('backdrop-filter')&&d.value!=='none')violations.push({file:rel,prop:d.prop,value:d.value});
 });
}
const lum=h=>{const v=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
const pairs=[['#f5f0e8','#2d2d2d'],['#e74c3c','#171717'],['#3498db','#171717'],['#f39c12','#2d2d2d'],['#9b59b6','#ffffff']].map(([background,foreground])=>{const a=lum(background),b=lum(foreground),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);return{background,foreground,contrast:Number(ratio.toFixed(2)),passesAA:ratio>=4.5};});
const old=JSON.parse(fs.readFileSync(path.join(root,'verification/ui-content/frontend-manifest.json'),'utf8')).files;
const rendererFiles=['frontend/components/avatar-studio/scene.tsx','frontend/components/wardrobe-3d/scene.tsx'];
const renderers=rendererFiles.map(file=>({file,unchanged:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')===old[file]}));
const result={filesChecked:files.length,violations,paletteContrast:pairs,renderers};
fs.writeFileSync(path.join(__dirname,'style-audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({filesChecked:files.length,violations:violations.length,paletteContrast:pairs,renderers},null,2));
if(violations.length||pairs.some(x=>!x.passesAA)||renderers.some(x=>!x.unchanged))process.exit(1);
