const sharp=require("sharp");
const S=+process.argv[2]||70, STROKE=+process.argv[3]||6;
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
 const inM=(x,y)=>y>=0&&y<H&&M[y*W+x]>=0.03;
 const NH=H+S, out=Buffer.alloc(W*NH*C);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*C;for(let c=0;c<4;c++)out[i+c]=data[i+c]}     // start from the original
 // vacated strip = was tray, and the moved tray no longer covers it
 const vac=new Uint8Array(W*H);const idx=[];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(inM(x,y)&&!inM(x,y-S)){vac[y*W+x]=1;idx.push(y*W+x)}
 // widen by 2 px so the old tray's halo cannot peek out
 for(const i of idx.slice()){const x=i%W,y=(i/W)|0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<W&&yy>=0&&yy<H&&!vac[yy*W+xx]&&inM(xx,yy)){vac[yy*W+xx]=1;idx.push(yy*W+xx)}}}
 const f=new Float32Array(W*H*3);for(let i=0;i<W*H;i++){f[i*3]=data[i*4];f[i*3+1]=data[i*4+1];f[i*3+2]=data[i*4+2]}
 const fixedOk=(xx,yy)=>!inM(xx,yy);                       // calendar pixels only
 for(let x=0;x<W;x++){let last=null;for(let y=0;y<H;y++){const k=y*W+x;if(!inM(x,y)){last=[f[k*3],f[k*3+1],f[k*3+2]]}else if(vac[k]&&last){f[k*3]=last[0];f[k*3+1]=last[1];f[k*3+2]=last[2]}}}
 for(let it=0;it<500;it++){for(const i of idx){const x=i%W,y=(i/W)|0;let r=0,g=0,b=0,n=0;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>=W||yy<0||yy>=H)continue;const j=yy*W+xx;
     if(vac[j]||fixedOk(xx,yy)){r+=f[j*3];g+=f[j*3+1];b+=f[j*3+2];n++}}
   if(n){f[i*3]=r/n;f[i*3+1]=g/n;f[i*3+2]=b/n}}}
 for(const i of idx){out[i*4]=Math.round(f[i*3]);out[i*4+1]=Math.round(f[i*3+1]);out[i*4+2]=Math.round(f[i*3+2]);out[i*4+3]=255}
 // moved tray on top
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const m=M[y*W+x];if(m<=0)continue;const i=(y*W+x)*C;const sa=data[i+3]/255*m;if(sa<=0)continue;
   const j=((y+S)*W+x)*C;const da=out[j+3]/255;const oa=sa+da*(1-sa);
   for(let c=0;c<3;c++)out[j+c]=Math.round((data[i+c]*sa+out[j+c]*da*(1-sa))/oa);out[j+3]=Math.round(oa*255)}
 await sharp(out,{raw:{width:W,height:NH,channels:4}}).png().toFile("calendar-tray-shifted-full.png");
 await sharp(out,{raw:{width:W,height:NH,channels:4}}).resize(640).png({compressionLevel:9}).toFile("calendar-tray-shifted.png");
 const bg={r:11,g:15,b:31,alpha:1};
 const a=await sharp("calendar-tray-clean-full.png").resize(620).flatten({background:bg}).png().toBuffer();
 const b=await sharp("calendar-tray-shifted-full.png").resize(620).flatten({background:bg}).png().toBuffer();
 await sharp({create:{width:1280,height:700,channels:3,background:bg}}).composite([{input:a,left:10,top:10},{input:b,left:650,top:10}]).png().toFile("shift-compare.png");
 console.log("ok",W,NH,idx.length);
})();
