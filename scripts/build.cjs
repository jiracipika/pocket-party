const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const file of ['index.html','landing.css','landing.js','icon.svg'])fs.copyFileSync(path.join(root,file),path.join(out,file));
for(const slug of ['snack-catch','stack-rush','color-panic','donut-dash','balloon-bank','turbo-kart']){const src=path.join(root,'games',slug),dst=path.join(out,'games',slug);fs.mkdirSync(dst,{recursive:true});for(const f of ['index.html','style.css','app.js','core.js']){if(!fs.existsSync(path.join(src,f)))throw Error('Missing '+slug+'/'+f);fs.copyFileSync(path.join(src,f),path.join(dst,f));}if(fs.existsSync(path.join(src,'meta.js')))fs.copyFileSync(path.join(src,'meta.js'),path.join(dst,'meta.js'));console.log('Built',slug);}
// Copy shared art assets recursively into dist/assets (read-only source, owned by parent).
function copyDir(src,dst){fs.mkdirSync(dst,{recursive:true});for(const entry of fs.readdirSync(src,{withFileTypes:true})){if(entry.isDirectory())copyDir(path.join(src,entry.name),path.join(dst,entry.name));else fs.copyFileSync(path.join(src,entry.name),path.join(dst,entry.name));}}
if(fs.existsSync(path.join(root,'assets'))){copyDir(path.join(root,'assets'),path.join(out,'assets'));console.log('Copied assets/');}
let commit='uncommitted';try{commit=cp.execSync('git rev-parse HEAD',{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{}
fs.writeFileSync(path.join(out,'build-info.json'),JSON.stringify({project:'pocket-party',commit,builtAt:new Date().toISOString(),nativeLensValidated:false},null,2));
