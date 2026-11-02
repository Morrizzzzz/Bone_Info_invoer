import {EMPTY_ENTRIES, validateEntry, validateEntries} from './entries.js';
export const REPOSITORY={owner:'Morrizzzzz',repo:'RCE_BoneInfo',branch:'main',path:'data/entries.json'};
const encoder=new TextEncoder();
export function encodeContent(value){let binary='';for(const byte of encoder.encode(value))binary+=String.fromCharCode(byte);return btoa(binary);}
export function decodeContent(value){return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
export class GitHubError extends Error{constructor(message,status=0){super(message);this.status=status;}}
export function githubClient(token, config=REPOSITORY, request=fetch){
 const root=`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
 async function api(url,options={}){
  let response;
  try{response=await request(url,{...options,cache:'no-store',redirect:'error',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10',Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(30000)});}catch{throw new GitHubError('Geen antwoord van GitHub. Controleer de verbinding; probeer opnieuw met dezelfde invoer om een mogelijke eerdere commit te controleren.');}
  if(!response.ok){const messages={401:'GitHub-token ongeldig of verlopen.',403:'GitHub weigert toegang: controleer tokenrechten, organisatiegoedkeuring en API-limieten.',404:'Repository, branch of bestand niet gevonden, of geen toegang.',409:'Een andere wijziging is opgeslagen. Controleer de invoer en probeer opnieuw; er is niets overschreven.',422:'GitHub weigert de wijziging. Controleer branchbeveiliging en schrijfrechten.'};throw new GitHubError(messages[response.status]||`GitHub-fout (${response.status}). Probeer later opnieuw.`,response.status);}
  return response.json();
 }
 const contentUrl=`${root}/contents/${config.path.split('/').map(encodeURIComponent).join('/')}`;
 async function read(){
  let file;
  try{file=await api(`${contentUrl}?ref=${encodeURIComponent(config.branch)}`);}catch(e){if(e.status===404)return {document:EMPTY_ENTRIES(),sha:null};throw e;}
  if(file.type!=='file'||!file.sha)throw new Error('De gegevenslocatie is geen bestand.');
  if(file.size>5000000)throw new Error('Aanvullende gegevens zijn groter dan 5 MB. Splits of migreer het invoerbestand voordat je verder invoert.');
  if(file.encoding!=='base64')file={...file,...await api(`${root}/git/blobs/${file.sha}`)};
  if(file.encoding!=='base64'||typeof file.content!=='string')throw new Error('GitHub leverde geen leesbare bestandsinhoud.');
  return {document:JSON.parse(decodeContent(file.content)),sha:file.sha};
 }
 async function connect(){
  const repo=await api(root);
  if(!repo.permissions?.push)throw new Error('Je GitHub-account heeft geen schrijfrechten op deze repository.');
  await api(`${root}/branches/${encodeURIComponent(config.branch)}`);
  const user=await api('https://api.github.com/user');
  return {login:user.login,private:repo.private};
 }
 async function save(entry,base){
  validateEntry(entry,base);
  const current=await read();validateEntries(current.document,base);
  const existing=current.document.entries.find(e=>e.id===entry.id);
  if(existing){if(JSON.stringify(existing)!==JSON.stringify(entry))throw new Error('Dit invoer-ID bestaat al met andere inhoud. Controleer het bestand op GitHub.');return {alreadySaved:true,url:`https://github.com/${config.owner}/${config.repo}/blob/${encodeURIComponent(config.branch)}/${config.path}`};}
  const next={...current.document,entries:[...current.document.entries,entry]};validateEntries(next,base);
  const json=JSON.stringify(next,null,2)+'\n';
  if(encoder.encode(json).length>5000000)throw new Error('De limiet van 5 MB voor aanvullende gegevens is bereikt.');
  const result=await api(contentUrl,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:`BoneInfo: voeg cluster ${entry.cluster.Zoonr} toe (${entry.cluster.Plaats.replace(/[\r\n]/g,' ').slice(0,80)})`,content:encodeContent(json),branch:config.branch,...(current.sha?{sha:current.sha}:{})})});
  if(!result.commit?.sha)throw new Error('Geen commitbevestiging ontvangen. Probeer opnieuw met dezelfde invoer om de opslag te controleren.');
  return {sha:result.commit.sha,url:`https://github.com/${config.owner}/${config.repo}/commit/${result.commit.sha}`,alreadySaved:false};
 }
 return {connect,read,save};
}
