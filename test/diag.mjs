import { answerKey } from './helpers.js';
import { solveBoard } from '../js/solve.js';
for (const b of process.argv.slice(2)) {
  const t0 = Date.now();
  const { S, G, truth, keyErr, slotDist } = answerKey(b);
  const cnt = a => { const m = {}; a.tiles.forEach(t => m[t.group] = (m[t.group]||0)+1); return JSON.stringify(m); };
  console.log(b, 'tiles', S.tiles.length, G.tiles.length, 'fixed', S.tiles.filter(t=>t.fixed).length, G.tiles.filter(t=>t.fixed).length, 'groups', cnt(S), 'keyErr', keyErr.toFixed(1), 'slotDist', slotDist.toFixed(1), 'segMs', Date.now()-t0);
  const crossGroup = truth.filter((j,i)=>S.tiles[i].group!==S.tiles[j].group).length;
  console.log('  truth moves across groups:', crossGroup);
  const r = solveBoard(S.tiles);
  const wrong = [...r.dest].filter((v,i)=>v!==truth[i]).length;
  let seen=new Uint8Array(truth.length),cyc=0; for(let i=0;i<truth.length;i++) if(!seen[i]){cyc++;let j=i;while(!seen[j]){seen[j]=1;j=truth[j];}}
  console.log('  solver wrong', wrong, 'moves', r.moves, 'optimal', truth.length-cyc, 'rms', r.rms.toFixed(2), 'startDeg', r.startDeg);
}
