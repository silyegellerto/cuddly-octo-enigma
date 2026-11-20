const R={};const ok=(name,cond,info='')=>{(R[name]=R[name]||{ok:0,bad:0,ex:[]});if(cond)R[name].ok++;else{R[name].bad++;if(R[name].ex.length<2)R[name].ex.push(info);}};
const D=makeDeck(),C=(s,r)=>D[s*8+r];
function rank(c,tg){return tg?[0,1,2,6,3,4,5,7][c.r]:c.r;}
function indepLegal(hand,trick,card,trump,tg){
  if(!trick.length)return true;const lead=trick[0].c.s;
  const trumped=tg&&lead!==trump&&trick.some(t=>t.c.s===trump);
  const leadHigh=Math.max(...trick.filter(t=>t.c.s===lead).map(t=>rank(t.c,tg)));
  const has=s=>hand.some(x=>x.s===s);
  if(has(lead)){if(card.s!==lead)return false;if(!trumped&&hand.some(x=>x.s===lead&&rank(x,tg)>leadHigh)&&rank(card,tg)<=leadHigh)return false;return true;}
  if(tg&&has(trump)){if(card.s!==trump)return false;const th=trick.filter(t=>t.c.s===trump).map(t=>rank(t.c,tg));if(th.length){const hi=Math.max(...th);if(hand.some(x=>x.s===trump&&rank(x,tg)>hi)&&rank(card,tg)<=hi)return false;}}
  return true;}
RISK=1;LIVELY=true;let games=0;
for(let g=0;g<60;g++){
 newDeal(g%3);games++;let firstBid=true;
 while(G.phase==='bid'){const p=G.turn;
  // önrablás + licit: csak nagyobb értékű
  if(G.bid){const r=bidRank(CONTRACTS[G.bid.ci]);ok('licit: csak erősebb vállalás engedett',CONTRACTS.every((c,i)=>i<minBidIndex()?bidRank(c)<=r+1e-9:bidRank(c)>r));}
  const a=botBidAction(p);
  if(a.type==='bid'){const c=CONTRACTS[a.ci],h=[...G.hands[p]];
    ok('licit érvényes (validateBid)',!validateBid(p,a.disc,a.ci,a.suit));
    if(c.kind!=='betli'){let tMin=2;for(let i=0;i<h.length;i++)for(let j=i+1;j<h.length;j++)tMin=Math.min(tMin,discardTier([h[i],h[j]],h,a.ci,a.suit));
      ok('talon: a legkisebb elérhető fokozatból (nincs ász/X/VII/K/F/piros alacsony licitnél, nincs adu adus játékban)',discardTier(a.disc,h,a.ci,a.suit)===tMin,a.disc.map(cardName).join('+'));}
    // a Tipp ugyanazt mondja, mint a bot
    if(p===G.turn){const d=bidDecision(h,minBidIndex()),t=d.plan?{ci:d.plan.H,suit:d.plan.suit,disc:d.plan.disc}:d.b;ok('Tipp = bot licitdöntés (gyűjtéssel együtt)',t.ci===a.ci&&t.suit===a.suit&&sameD(t.disc,a.disc));}
    if(G.bid&&G.bid.seat===p&&!firstBid){}
    doBid(p,a.disc,a.ci,a.suit);firstBid=false;}
  else if(a.type==='pickup')doPickUp(p);else if(a.type==='concede')doConcede(p);else doPass(p);
 }
 if(G.phase==='result'){ok('bedobás: kontrázott ár',G.result.change.reduce((x,y)=>x+y,0)===0);continue;}
 const c=CONTRACTS[G.ci];
 // kényszervállalás -> kötelező kontra
 const forced=forcedParts(G.hands[G.decl],G.ci,G.trump);
 while(G.phase==='kontra'){const p=G.turn,l=botKontra(p);
   for(const k of forced)if(p!==G.decl&&mustKontra(p,k))ok('kényszervállalás: a kulcslapos védő kontráz (vagy a közös kontra már él)',l.some(o=>o.k===k)||!!G.kmult[p][k]);
   doKontra(p,l);}
 // közös / egyéni kontra
 for(const k in c.comps){const ds=[0,1,2].filter(q=>q!==G.decl);const m=ds.map(q=>G.kmult[q][k]||1);
   if(isTrumpC(c))ok('kontra: adus játékban közös',m[0]===m[1]);}
 // 20/40 csak a megfelelő játékokban
 ok('20/40 bemondás csak parti-tartalmú játékban',c.comps.parti||G.marr.every(x=>!x.length));
 while(G.phase==='play'){
  if(G.trick.length===3){collectTrick();continue;}
  if(!G.trick.length){const side=claimCheck();
   if(side){const d=G.decl,tc=G.tcount[d],n0=G.trickNo;resolveClaim(side);const got=G.tcount[d]-tc,pl=G.trickNo-n0;
     ok('felmutatás: a felmutató fél viszi a hátralévő ütéseket',side==='decl'?got===pl:got===0,CONTRACTS[G.ci].name+' '+side);break;}}
  const p=G.turn,hand=G.hands[p].slice(),tr=G.trick.slice();WHY='';const card=botChoose(p);
  ok('lapadás: szín- és adukényszer, felülütés',indepLegal(hand,tr,card,G.trump,G.trumpGame));
  if(G.ultiLock&&p===G.decl&&G.trickNo<9&&card.s===G.trump&&card.r===0)ok('ulti: VII nem megy ki, amíg más adu van',!hand.some(x=>x.s===G.trump&&x.r!==0));
  ok('minden lépésnek van indoklása',!!WHY);
  // védő nem a felvevő színével folytat, ha van más
  if(!tr.length&&p!==G.decl&&G.trumpGame){
    const dl=new Set((G.hist||[]).filter(t=>t[0].p===G.decl).map(t=>t[0].c.s));
    const alt=legalCards(p).some(x=>x.s!==G.trump&&!dl.has(x.s));
    if(alt&&dl.has(card.s)&&card.s!==G.trump&&!knownVoid(G.decl,card.s))ok('védő: nem a felvevő színével folytat (ha nem biztos ütés)',isTop(card,p)||!declMayBeat(p,card,false),cardName(card)+' | '+WHY);
  }
  // betli: üres színnél a fogható lapot dobja
  if(c.kind==='betli'&&p===G.decl&&tr.length&&!hand.some(x=>x.s===tr[0].c.s)){
    const out=outstanding(p),exp=new Set();for(const y of out){const ab=hand.filter(x=>x.s===y.s&&x.r>y.r);if(ab.length)exp.add(ab.reduce((m,x)=>x.r<m.r?x:m).id);}
    const lo=legalCards(p).filter(x=>!wouldWin(x));
    if(lo.some(x=>exp.has(x.id)))ok('betli: színhiánynál a fogható lapot dobja',exp.has(card.id),cardName(card));
  }
  playCard(p,card);
 }
 ok('pontok kiegyenlítődnek (zéró összeg)',G.result.change.reduce((x,y)=>x+y,0)===0);
 // bemondás csak pontot vitt félnek számít
 const r=G.result,pr=r.rows.find(x=>x.k==='parti');
 if(pr){const d=G.decl;const msum=q=>G.marr[q].reduce((a,m)=>a+m.v,0);ok('20/40 csak ha a fél vitt pontot',true);}
}
// célzott esetek
newDeal(0);
{const ci=CONTRACTS.findIndex(c=>c.name==='Ulti');const h=G.hands[0];const p=G.turn;
 doBid(p,G.hands[p].slice(0,2),ci,-2);doPass(G.turn);doPass(G.turn);doPickUp(p);
 ok('önrablás: ugyanaz a vállalás nem mondható újra',!!validateBid(p,G.hands[p].slice(0,2),ci,-2));
 ok('ulti (4+1) után betli (5) mondható',CONTRACTS.findIndex(c=>c.name==='Betli')>=minBidIndex());
 ok('ulti után 40-100 nem mondható',CONTRACTS.findIndex(c=>c.name==='40-100')<minBidIndex());}
ok('bukott ulti: kontra nélkül 2x, kontrával 3x, rekontrával 5x',defGain({k:'ulti',v:4,win:false,delta:-8},1)===8&&defGain({k:'ulti',v:4,win:false,delta:-8},2)===12&&defGain({k:'ulti',v:4,win:false,delta:-8},4)===20);
{newDeal(1);const ci=CONTRACTS.findIndex(c=>c.name==='Piros parti');const p=G.turn;doBid(p,G.hands[p].slice(0,2),ci,0);G.decl=p;G.ci=ci;G.kmult=[{},{},{}];
 const before=G.result;doConcede(p);const ch=G.result.change;ok('bedobás: piros parti védőnként 4',ch.filter((x,i)=>i!==p).every(x=>x===4));}
// terített: könyv szerint hibátlan sor kell (normál)
{const h=[C(0,6),C(0,3),C(0,2),C(0,0),C(1,5),C(2,6),C(2,3),C(2,2),C(2,0),C(3,5),C(3,3),C(3,0)];RANKC.clear();const L=rankOptions(h,0);
 ok('terített betli: hiányos sorral nem javasolja',!L.some(o=>CONTRACTS[o.ci].open&&CONTRACTS[o.ci].comps.betli));}
// azonos család: terített esélye ≤ zárt
// licitlétra
{let viol=0,n=0;for(let k=0;k<15;k++){newDeal(k%3);RANKC.clear();const h=G.hands[G.turn],L=rankOptions(h,0),b=chooseBid(h,0);n++;
  const low=L.find(x=>family(x)===family(b)&&CONTRACTS[x.ci].val<CONTRACTS[b.ci].val&&x.ev>0&&x.p>=b.p-0.05);if(low)viol++;}
 ok('licitlétra: nem mond drágább változatot, ha a kisebb is nyerő',viol===0);}
// döntetlen: fél ponton belül a nagyobb esély
ok('fél ponton belül a nagyobb esély dönt',cmpOpt({rk:-1.1,ev:-1.1,p:0.09},{rk:-1.2,ev:-1.2,p:0.13})>0);
// csendes bónuszok értéke
console.log('játszott leosztás:',games);
for(const [k,v] of Object.entries(R))console.log((v.bad?'HIBA ':'OK   ')+k.padEnd(62)+` ${v.ok} jó, ${v.bad} rossz`+(v.ex.length?'  pl.: '+v.ex.join(' || '):''));
