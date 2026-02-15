import { addMol, hexPos } from './core.js';

// ---- Methamphetamine ----
{
  const R = 2.64, HR = 4.58;
  addMol({
    name: 'Methamphetamine', category: 'Drug',
  pubchemCid: 10836,
    label: 'C\u2081\u2080H\u2081\u2085N (Methamphetamine)',
    atoms: (() => {
      const a = [];
      for (let i = 0; i < 6; i++) { const [x,y,z] = hexPos(R,i); a.push(['C',x,y,z]); }
      for (let i = 1; i < 6; i++) { const [x,y,z] = hexPos(HR,i); a.push(['H',x,y,z]); } // 6-10
      const dd=[hexPos(R,0)[0]/R,hexPos(R,0)[2]/R];
      const ch2=[hexPos(R,0)[0]+dd[0]*2.88,0,hexPos(R,0)[2]+dd[1]*2.88];
      const chm=[ch2[0]+dd[0]*2.88,0,ch2[2]+dd[1]*2.88];
      const nm=[chm[0]+dd[0]*2.76,0,chm[2]+dd[1]*2.76];
      a.push(['C',...ch2]); // 11
      a.push(['C',...chm]); // 12
      a.push(['N',...nm]); // 13
      a.push(['C',chm[0],2.50,chm[2]]); // 14: side CH₃
      a.push(['C',nm[0]+dd[0]*2.88,0,nm[2]+dd[1]*2.88]); // 15: N-CH₃
      a.push(['H',ch2[0],1.80,ch2[2]]); a.push(['H',ch2[0],-1.80,ch2[2]]); // 16,17
      a.push(['H',chm[0],-1.80,chm[2]]); // 18
      a.push(['H',nm[0]+0.93,1.60,nm[2]]); // 19
      a.push(['H',a[14][1]+1.0,a[14][2]+1.5,a[14][3]]); // 20
      a.push(['H',a[14][1]-1.0,a[14][2]+1.5,a[14][3]]); // 21
      a.push(['H',a[14][1],a[14][2]+1.5,a[14][3]+1.5]); // 22
      a.push(['H',a[15][1]+1.0,1.5,a[15][3]]); // 23
      a.push(['H',a[15][1]-1.0,1.5,a[15][3]]); // 24
      a.push(['H',a[15][1],0,a[15][3]+1.8]); // 25
      return a;
    })(),
    bonds: (() => {
      const b = [];
      for (let i = 0; i < 6; i++) b.push([i,(i+1)%6,1.5]);
      for (let i = 1; i < 6; i++) b.push([i,i+5]);
      b.push([0,11],[11,12],[12,13],[12,14],[13,15]);
      b.push([11,16],[11,17],[12,18],[13,19]);
      b.push([14,20],[14,21],[14,22],[15,23],[15,24],[15,25]);
      return b;
    })(),
    he: 26,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.41],[1,2,1,1,'sin',0.41],[2,2,1,1,'sin',0.41],[3,2,1,1,'sin',0.41],[4,2,1,1,'sin',0.41],[5,2,1,1,'sin',0.41]]],
      ['N lone pair', [[13,2,1,1,'sin',1.0]]],
      ['\u03C3(C-N)', [[12,2,1,0,'real',0.6],[13,2,1,0,'real',-0.6]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.28],[1,2,0,0,'real',0.28],[2,2,0,0,'real',0.28],[3,2,0,0,'real',0.28],[4,2,0,0,'real',0.28],[5,2,0,0,'real',0.28],[11,2,0,0,'real',0.28],[12,2,0,0,'real',0.28]]],
    ]
  });
}
