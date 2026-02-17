#!/usr/bin/env node
import https from 'https';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const queries = [
  'nickelocene',
  'cobaltocene',
  'titanocene dichloride',
  'dibenzenechromium',
  'dimethylmercury',
  'tetraethyllead',
];

for (const name of queries) {
  await sleep(300);
  const r = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/JSON`);
  if (r.status !== 200) { console.log(name, 'search failed'); continue; }
  const cids = JSON.parse(r.body).IdentifierList?.CID || [];
  let found = false;
  for (const cid of cids.slice(0, 4)) {
    await sleep(300);
    const r2 = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/JSON?record_type=3d`);
    if (r2.status === 200) {
      const data = JSON.parse(r2.body);
      const els = data.PC_Compounds[0].atoms.element;
      console.log(`${name.padEnd(30)} CID ${String(cid).padEnd(12)} ${els.length} atoms ✓`);
      found = true;
      break;
    }
  }
  if (!found) console.log(`${name.padEnd(30)} no 3D conformer found`);
}
