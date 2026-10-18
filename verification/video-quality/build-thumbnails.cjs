// Crop only the observed scene rectangle from actual browser captures; no generated substitute images.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('../../frontend/node_modules/sharp');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'frontend/public/models/avatar/v2/thumbs');
const presets = ['sweet','minimal','street','relaxed','elegant','sport'];
async function main() {
 await fs.mkdir(out,{recursive:true});
 const cells=[],manifest=[];
 for (const sex of ['female','male']) for (const [i,preset] of presets.entries()) {
  const source=path.join(__dirname,`gpu-${sex}-${preset}-front.png`);
  const file=path.join(out,`${sex}-${preset}.webp`);
  const bytes=await sharp(source).extract({left:430,top:198,width:420,height:700}).resize(240,400).webp({quality:85}).toBuffer();
  await fs.writeFile(file,bytes);
  cells.push({input:await sharp(bytes).png().toBuffer(),left:i*240,top:sex==='female'?0:400});
  manifest.push({sex,preset,source:path.relative(root,source),source_sha256:crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex'),file:path.relative(root,file),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 await sharp({create:{width:1440,height:800,channels:3,background:'#eeebe8'}}).composite(cells).png().toFile(path.join(__dirname,'all-looks-contact.png'));
 await fs.writeFile(path.join(__dirname,'thumbnails-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(`Created ${manifest.length} actual-scene thumbnails`);
}
main().catch(e=>{console.error(e);process.exit(1)});
