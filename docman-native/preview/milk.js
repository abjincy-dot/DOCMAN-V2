const sharp=require("sharp");
const MILK=[255,248,240];
const pts=[[116,128],[122,104],[145,90],[215,78],[545,32],[575,34],[588,48],[590,66],[635,66],[645,75],[650,90],[690,89],[700,98],[700,118],
 [715,118],[740,125],[745,145],[800,148],[825,150],[830,165],[832,250],[870,255],[888,275],[890,420],[882,480],[850,530],[780,560],[560,640],[420,664],[360,656],[300,620],[230,575],[180,540],[130,505],[90,477],[55,455],[30,425],[17,395],[15,355],[15,280],[16,225],[30,205],[100,185],[116,175]];
(async()=>{
 const {data,info}=await sharp("calendar-tray-clean-orig.png").ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height;
 const poly=pts.map(p=>(p[0]+200)+","+(p[1]+600)).join(" ");
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><polygon points="${poly}" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/></svg>`;
 const mk=await sharp({create:{width:W,height:H,channels:3,background:"#000"}}).composite([{input:Buffer.from(svg)}]).greyscale().raw().toBuffer();
 // the front plate as a rounded rectangle; distance to its edge decides how much of the original rim survives
 const L=118,R=1141,T=288,B=1143,RAD=178;
 const sdf=(x,y)=>{const cx=Math.min(Math.max(x,L+RAD),R-RAD),cy=Math.min(Math.max(y,T+RAD),B-RAD);const d=Math.hypot(x-cx,y-cy);return RAD-d}; // >0 inside along the corner arcs
 const inside=(x,y)=>{if(x<L||x>R||y<T||y>B)return -1;const dx=Math.min(x-L,R-x),dy=Math.min(y-T,B-y);let d=Math.min(dx,dy);
   const cxl=x<L+RAD,cxr=x>R-RAD,cyt=y<T+RAD,cyb=y>B-RAD;if((cxl||cxr)&&(cyt||cyb)){d=sdf(x,y)}return d};
 const G=new Uint8Array(W*H),D=new Float32Array(W*H);
 for(let y=T-2;y<=B;y++)for(let x=L-2;x<=R+2;x++){const i=y*W+x;const d=inside(x,y);if(d<=0)continue;if(mk[i]>8)continue;if(data[i*4+3]<200)continue;G[i]=1;D[i]=d}
 const out=Buffer.from(data);
 for(let i=0;i<W*H;i++){if(!G[i])continue;const k=Math.max(0,Math.min(1,(D[i]-8)/16));if(k<=0)continue;
   for(let c=0;c<3;c++)out[i*4+c]=Math.round(MILK[c]*k+data[i*4+c]*(1-k))}
 await sharp(out,{raw:{width:W,height:H,channels:4}}).png().toFile("calendar-tray-clean-full.png");
 console.log("milk done");
})();
