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

const searches = [
  'cisplatin', 'ebselen', 'selenomethionine', 'carboplatin', 'oxaliplatin',
  'auranofin', 'chlorophyll a', 'methylcobalamin', 'ruthenocene', 'chromocene',
  'nickel tetracarbonyl', 'chromium hexacarbonyl', 'dibenzenechromium',
  'vanadocene dichloride', 'titanocene dichloride', 'selenocysteine',
];

for (const name of searches) {
  await sleep(300);
  const r = await get('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/' + encodeURIComponent(name) + '/cids/JSON');
  if (r.status !== 200) { console.log(name + ': no CIDs'); continue; }
  const cids = JSON.parse(r.body).IdentifierList?.CID || [];
  let found = false;
  for (const cid of cids.slice(0, 5)) {
    await sleep(300);
    const r2 = await get('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' + cid + '/JSON?record_type=3d');
    if (r2.status === 200) {
      const atoms = JSON.parse(r2.body).PC_Compounds[0].atoms.element;
      console.log(name.padEnd(28) + ' CID ' + String(cid).padEnd(12) + atoms.length + ' atoms 3D OK');
      found = true;
      break;
    }
  }
  if (!found) console.log(name.padEnd(28) + ' no 3D (CIDs: ' + cids.slice(0, 4).join(',') + ')');
}
