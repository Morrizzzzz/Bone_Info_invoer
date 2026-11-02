// New submissions are separate from the unchanged Access export.
export const EMPTY_ENTRIES = () => ({schemaVersion:1,entries:[]});
export const CLUSTER_FIELDS = ['Zoonr','Waarnemingsnr','Onderzoeksmeldingsnr','X_coord','Y_coord','Toponiem','Plaats','Gemeente','Provincie','Vondstverwerving','Datum_vondst','Complextype','Begin_periode','Beginjaar','Eind_periode','Eindjaar','Opdrachtgever','Onderzoeksinstantie','Onderzoeker','Omvang','Verzamelwijze','Gewogen','Beschrijving','Invoerder','Datum_invoer','YYYYMMDD_datum_vondst'];
const fail = message => {throw new Error(message);};
const text = (v, max=20000) => typeof v==='string' && v.length<=max;
export function validateEntry(entry, base) {
 if (!entry || !text(entry.id,100) || !entry.id || !text(entry.createdAt,50) || !Number.isFinite(Date.parse(entry.createdAt))) fail('Ongeldige invoeridentiteit of datum.');
 const c=entry.cluster;
 if(!c || CLUSTER_FIELDS.some(k=>!text(c[k]))) fail('Clustergegevens ontbreken of bevatten ongeldige waarden.');
 if(!/^\d+$/.test(c.Zoonr)||!Number.isSafeInteger(Number(c.Zoonr))||Number(c.Zoonr)<1) fail('Ongeldig clusternummer.');
 if(!c.Plaats.trim()||!c.Beschrijving.trim()) fail('Plaats en beschrijving zijn verplicht.');
 if(Boolean(c.X_coord)!==Boolean(c.Y_coord)) fail('Vul beide RD-coördinaten in, of laat beide leeg.');
 if(c.X_coord && (!Number.isFinite(Number(c.X_coord))||!Number.isFinite(Number(c.Y_coord))||Number(c.X_coord)<=0||Number(c.X_coord)>=300000||Number(c.Y_coord)<=300000||Number(c.Y_coord)>=625000)) fail('Gebruik RD New: 0 < X < 300000 en 300000 < Y < 625000 meter.');
 for(const k of ['Beginjaar','Eindjaar']) if(c[k] && (!/^-?\d+$/.test(c[k])||!Number.isSafeInteger(Number(c[k]))||Number(c[k])===0)) fail('Jaren moeten gehele getallen zijn, zonder jaar 0. Gebruik negatief voor v.Chr.');
 const periods=new Map(base.tables.tblPeriode.map(p=>[p.periodecode,p]));
 for(const k of ['Begin_periode','Eind_periode']) if(c[k] && !periods.has(c[k])) fail('Kies een bestaande periode.');
 const start=c.Beginjaar?Number(c.Beginjaar):c.Begin_periode && c.Begin_periode!=='Onbekend'?Number(periods.get(c.Begin_periode).beginwaarde):null;
 const end=c.Eindjaar?Number(c.Eindjaar):c.Eind_periode && c.Eind_periode!=='Onbekend'?Number(periods.get(c.Eind_periode).eindwaarde):null;
 if(start!==null&&end!==null&&start>end) fail('Begin van de datering ligt na het einde.');
 if(!Array.isArray(entry.species)||!entry.species.length||entry.species.length>500) fail('Voeg minimaal één diersoort toe (maximaal 500).');
 const taxa=new Set(base.tables.tblDiersoort.map(t=>t.diersoortID));
 for(const s of entry.species) if(!s||!taxa.has(s.DiersoortID)||!text(s.Opmerking)) fail('Kies voor elke soortvermelding een bestaand taxon.');
 if(!Array.isArray(entry.publications)||entry.publications.length>100) fail('Ongeldige literatuurlijst.');
 const journals=new Set(base.tables.tblPeriodiek.map(p=>p.PeriodiekID));
 for(const p of entry.publications) {
  if(['Auteursnaam','Jaar','Artikel_titel','Boektitel','Periodiek','Deel'].some(k=>!text(p[k]))) fail('Ongeldige literatuurvelden.');
  if(!p.Auteursnaam.trim()||!p.Artikel_titel.trim()) fail('Vul bij literatuur minimaal auteur en titel in.');
  if(p.Periodiek&&!journals.has(p.Periodiek)) fail('Kies een bestaand periodiek.');
 }
 return entry;
}
export function validateEntries(document, base) {
 if(document?.schemaVersion!==1||!Array.isArray(document.entries)) fail('Onbekend formaat van de aanvullende gegevens.');
 const ids=new Set(), clusters=new Set(base.tables.tblZoo_cluster.map(c=>c.Zoonr));
 for(const entry of document.entries){validateEntry(entry,base);if(ids.has(entry.id)||clusters.has(entry.cluster.Zoonr))fail('Dubbel invoer-ID of clusternummer; controleer het gegevensbestand.');ids.add(entry.id);clusters.add(entry.cluster.Zoonr);}
 return document;
}
export function mergeEntries(base, additions) {
 validateEntries(additions,base);
 const result={...base,metadata:{...base.metadata,webEntries:additions.entries.map(e=>({id:e.id,createdAt:e.createdAt,clusterId:e.cluster.Zoonr}))},tables:{...base.tables}};
 for(const key of ['tblZoo_cluster','tblZoo_diersoort','tblZoo_publicatie'])result.tables[key]=[...base.tables[key]];
 for(const entry of additions.entries){const Zoonr=entry.cluster.Zoonr;result.tables.tblZoo_cluster.push({...entry.cluster});result.tables.tblZoo_diersoort.push(...entry.species.map((s,i)=>({...s,Zoonr,Volgnr:String(i+1)})));result.tables.tblZoo_publicatie.push(...entry.publications.map((p,i)=>({...p,Zoonr,Volgnr:String(i+1)})));}
 return result;
}
