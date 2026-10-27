const sharp=require("sharp");
const SC=+process.argv[2]||1.08, SH=+process.argv[3]||95, STROKE=6, AX=630, AY=632;
const ox=200, oy=600;
const pts=[[116,128],[122,104],[145,90],[215,78],[545,32],[575,34],[588,48],[590,66],[635,66],[645,75],[650,90],[690,89],[700,98],[700,118],
 [715,118],[740,125],[745,145],[800,148],[825,150],[830,165],[832,250],[870,255],[888,275],[890,420],[882,480],[850,530],[780,560],[560,640],[420,664],[360,656],[300,620],[230,575],[180,540],[130,505],[90,477],[55,455],[30,425],[17,395],[15,355],[15,280],[16,225],[30,205],[100,185],[116,175]];
(async()=>{
 const {data,info}=await sharp("calendar-tray-clean-full.png").ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,C=4;
 const poly=pts.map(p=>(p[0]+ox)+","+(p[1]+oy)).join(" ");
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><polygon points="${poly}" fill="#fff" stroke="#fff" stroke-width="${STROKE}" stroke-linejoin="round"/></svg>`;
 const mk=await sharp({create:{width:W,height:H,channels:3,background:"#000"}}).composite([{input:Buffer.from(svg)}]).greyscale().raw().toBuffer();
 const M=new Float32Array(W*H);for(let i=0;i<W*H;i++)M[i]=mk[i]/255;
 // distance from outside the traced outline; near it, glass-coloured pixels (peach/pink glow) are not part of the tray
 const DIN=new Float32Array(W*H);for(let i=0;i<W*H;i++)DIN[i]=M[i]>=0.03?9999:0;
 for(let y=1;y<H;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(M[i]<0.03)continue;DIN[i]=Math.min(DIN[i],DIN[i-1]+1,DIN[i-W]+1,DIN[i-W-1]+1.41,DIN[i-W+1]+1.41)}
 for(let y=H-2;y>=0;y--)for(let x=W-2;x>=1;x--){const i=y*W+x;if(M[i]<0.03)continue;DIN[i]=Math.min(DIN[i],DIN[i+1]+1,DIN[i+W]+1,DIN[i+W+1]+1.41,DIN[i+W-1]+1.41)}
 const TR=new Float32Array(W*H);for(let i=0;i<W*H;i++)TR[i]=M[i];
 const glassLike=i=>{const r=data[i*4],b=data[i*4+2];return b>=110&&r>=225&&r>b+8};
 // from the outline inward (top-down, left-to-right, right-to-left) drop glass-coloured pixels until the first real tray pixel
 for(let x=0;x<W;x++){for(let y=0;y<H;y++){const i=y*W+x;if(M[i]<0.03)continue;if(glassLike(i))TR[i]=0;else break}}
 for(let y=0;y<H;y++){for(let x=0;x<W;x++){const i=y*W+x;if(M[i]<0.03)continue;if(glassLike(i))TR[i]=0;else break}
   for(let x=W-1;x>=0;x--){const i=y*W+x;if(M[i]<0.03)continue;if(glassLike(i))TR[i]=0;else break}}
 const inM=(x,y)=>y>=0&&y<H&&x>=0&&x<W&&M[y*W+x]>=0.03;
 const NH=Math.ceil(AY+(H-AY)*SC+SH)+6;
 // tray layer (premultiplied), scaled about (AX,AY) and moved down by SH, sampled bilinearly
 const tr=new Float32Array(W*NH*4);
 const samp=(sx,sy)=>{const x0=Math.floor(sx),y0=Math.floor(sy);const fx=sx-x0,fy=sy-y0;let r=0,g=0,b=0,a=0;
   for(const [dx,dy,w] of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){const x=x0+dx,y=y0+dy;if(x<0||x>=W||y<0||y>=H)continue;
     const i=y*W+x;const al=TR[i]*data[i*4+3]/255;r+=data[i*4]*al*w;g+=data[i*4+1]*al*w;b+=data[i*4+2]*al*w;a+=al*w}
   return [r,g,b,a]};
 for(let y=0;y<NH;y++)for(let x=0;x<W;x++){const sx=(x-AX)/SC+AX,sy=(y-SH-AY)/SC+AY;if(sx<-1||sx>W||sy<-1||sy>H)continue;
   const p=samp(sx,sy);if(p[3]<=0)continue;const k=(y*W+x)*4;tr[k]=p[0];tr[k+1]=p[1];tr[k+2]=p[2];tr[k+3]=p[3]}
 // calendar layer: the original; fill what the old tray covered and the new one does not
 const out=Buffer.alloc(W*NH*C);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*C;for(let c=0;c<4;c++)out[i+c]=data[i+c]}
 const cardBottom=x=>{const r=170;if(x<285)return 1145-(r-Math.sqrt(Math.max(0,r*r-(285-x)*(285-x))));if(x>975)return 1145-(r-Math.sqrt(Math.max(0,r*r-(x-975)*(x-975))));return 1145};
 const vac=new Uint8Array(W*H),idx=[],clear=[];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(inM(x,y)&&tr[(y*W+x)*4+3]<0.995){ if(y<cardBottom(x)-6){vac[y*W+x]=1;idx.push(y*W+x)} else clear.push(y*W+x)}
 for(const i of idx.slice()){const x=i%W,y=(i/W)|0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<W&&yy>=0&&yy<H&&!vac[yy*W+xx]&&inM(xx,yy)&&yy<cardBottom(xx)-6){vac[yy*W+xx]=1;idx.push(yy*W+xx)}}}
 const f=new Float32Array(W*H*3);for(let i=0;i<W*H;i++){f[i*3]=data[i*4];f[i*3+1]=data[i*4+1];f[i*3+2]=data[i*4+2]}
 for(let x=0;x<W;x++){let last=null;for(let y=0;y<H;y++){const k=y*W+x;if(!inM(x,y)){last=[f[k*3],f[k*3+1],f[k*3+2]]}else if(vac[k]&&last){f[k*3]=last[0];f[k*3+1]=last[1];f[k*3+2]=last[2]}}}
 for(let it=0;it<500;it++){for(const i of idx){const x=i%W,y=(i/W)|0;let r=0,g=0,b=0,n=0;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>=W||yy<0||yy>=H)continue;const j=yy*W+xx;
     if(vac[j]||!inM(xx,yy)){r+=f[j*3];g+=f[j*3+1];b+=f[j*3+2];n++}}
   if(n){f[i*3]=r/n;f[i*3+1]=g/n;f[i*3+2]=b/n}}}
 for(const i of idx){out[i*4]=Math.round(f[i*3]);out[i*4+1]=Math.round(f[i*3+1]);out[i*4+2]=Math.round(f[i*3+2]);out[i*4+3]=255}
 for(const i of clear){out[i*4+3]=0}
 // tray on top
 for(let y=0;y<NH;y++)for(let x=0;x<W;x++){const k=(y*W+x)*4;const sa=tr[k+3];if(sa<=0)continue;const j=(y*W+x)*C;
   const da=out[j+3]/255;const oa=sa+da*(1-sa);
   for(let c=0;c<3;c++)out[j+c]=Math.round((tr[k+c]+out[j+c]*da*(1-sa))/oa);out[j+3]=Math.round(oa*255)}
 await sharp(out,{raw:{width:W,height:NH,channels:4}}).png().toFile("calendar-tray-v4-full.png");
 await sharp(out,{raw:{width:W,height:NH,channels:4}}).resize(640).png({compressionLevel:9}).toFile("calendar-tray-v4.png");
 const bg={r:11,g:15,b:31,alpha:1};
 const a=await sharp("calendar-tray-shifted-full.png").resize({height:640}).flatten({background:bg}).png().toBuffer();
 const b=await sharp("calendar-tray-v4-full.png").resize({height:640}).flatten({background:bg}).png().toBuffer();
 await sharp({create:{width:1200,height:660,channels:3,background:bg}}).composite([{input:a,left:10,top:10},{input:b,left:620,top:10}]).png().toFile("v4-compare.png");
 console.log("ok",W,NH);
})();
