// Exact DP with a partition quota: require >= q items with p >= 0.8 (safety slots).
// Compare vs brute force with same constraint. State: (i, k, s) s = safety picked (capped at q).
function utility(order, v, p) { let t=0,s=1; for (const i of order){ t+=v[i]*p[i]*s; s*=1-p[i];} return t; }
function* combos(arr,k,st=0,cur=[]){ if(cur.length===k){yield [...cur];return;} for(let i=st;i<=arr.length-(k-cur.length);i++){cur.push(arr[i]);yield* combos(arr,k,i+1,cur);cur.pop();}}
function bfQuota(N,n,q,v,p){
  const ids=[...Array(N).keys()]; let best=-1;
  for (const S of combos(ids, Math.min(n,N))) {
    if (S.filter(i=>p[i]>=0.8).length < q) continue;
    const ord=[...S].sort((a,b)=>v[b]-v[a]);
    best=Math.max(best, utility(ord,v,p));
  }
  return best;
}
function dpQuota(N,n,q,v,p){
  const idx=[...Array(N).keys()].sort((a,b)=>v[b]-v[a]);
  const cap=Math.min(n,N);
  const NEG=-1e18;
  // g[k][s] over suffix; s capped at q
  let next=Array.from({length:cap+1},()=>new Float64Array(q+1).fill(NEG));
  for(let k=0;k<=cap;k++) next[k][q]=0; // base: end of list, feasible only if s==q (met)
  for(let i=N-1;i>=0;i--){
    const cur=Array.from({length:cap+1},()=>new Float64Array(q+1).fill(NEG));
    const c=idx[i], safe=p[c]>=0.8?1:0;
    for(let k=0;k<=cap;k++) for(let s=0;s<=q;s++){
      let bestv=next[k][s]; // skip
      if(k>=1){
        const ns=Math.min(q,s+safe);
        const cont=next[k-1][ns];
        if(cont>NEG/2){ const tk=p[c]*v[c]+(1-p[c])*cont + p[c]*0; // careful: absorption means tail contributes only via survival
          // Actually utility decomposition: take -> p*v + (1-p)*g(tail); but constraint counting must be on CHOSEN set regardless of absorption.
          if(tk>bestv) bestv=tk;
        }
      }
      cur[k][s]=bestv;
    }
    next=cur;
  }
  return next[cap][0];
}
let state=20260716>>>0; const rnd=()=>{state=(1664525*state+1013904223)>>>0;return state/0x100000000;};
let mism=0,tr=0;
for(let t=0;t<1500;t++){
  const N=4+Math.floor(rnd()*6), n=2+Math.floor(rnd()*Math.min(N-1,4)), q=1+Math.floor(rnd()*2);
  const v=Array.from({length:N},()=>rnd()*10), p=Array.from({length:N},()=>0.02+rnd()*0.96);
  if(p.filter(x=>x>=0.8).length<q) continue; // ensure feasible
  const bf=bfQuota(N,n,q,v,p), dp=dpQuota(N,n,q,v,p);
  tr++;
  if(Math.abs(bf-dp)>1e-9){ mism++; if(mism<=3) console.log(`MISMATCH t=${t} N=${N} n=${n} q=${q} bf=${bf} dp=${dp}`);}
}
console.log(`feasible trials=${tr} mismatches=${mism}`);
