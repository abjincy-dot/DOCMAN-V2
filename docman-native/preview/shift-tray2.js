const sharp=require("sharp");
const S=+process.argv[2]||70;
const ox=200, oy=600;                       // grid.png offset
const pts=[[116,128],[122,104],[145,90],[215,78],[545,32],[575,34],[588,48],[590,66],[635,66],[645,75],[650,90],[690,89],[700,98],[700,118],
 [715,118],[740,125],[745,145],[800,148],[825,150],[830,165],[832,250],[870,255],[888,275],[890,420],[882,480],[850,530],[780,560],[560,640],[420,664],[330,655],[240,625],[100,560],[20,500],[8,480],[8,260],[15,225],[30,205],[100,185],[116,175]];
(async()=>{
 const {data,info}=await sharp("calendar-tray-clean-full.png").ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,C=4;
 const poly=pts.map(p=>(p[0]+ox)+","+(p[1]+oy)).join(" ");
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><polygon points="${poly}" fill="#fff" stroke="#fff" stroke-width="${+process.argv[3]||6}" stroke-linejoin="round"/></svg>`;
 const mk=await sharp({create:{width:W,height:H,channels:3,background:"#000"}}).composite([{input:Buffer.from(svg)}]).greyscale().raw().toBuffer();
 const M=new Float32Array(W*H);for(let i=0;i<W*H;i++)M[i]=mk[i]/255;
 await sharp(Buffer.from(mk),{raw:{width:W,height:H,channels:1}}).png().toFile("tray-mask2.png");
 const NH=H+S, out=Buffer.alloc(W*NH*C);
 // calendar layer: fill under the mask from the nearest calendar pixel above
 for(let x=0;x<W;x++){let last=null;for(let y=0;y<H;y++){const i=(y*W+x)*C;
   if(M[y*W+x]<0.03){last=[data[i],data[i+1],data[i+2],data[i+3]];for(let c=0;c<4;c++)out[i+c]=data[i+c]}
   else if(last){for(let c=0;c<4;c++)out[i+c]=last[c]}}}
 // smooth the fill sideways so single columns do not streak
 {const tmp=Buffer.from(out);for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(M[y*W+x]<0.03)continue;let r=0,g=0,b=0,al=0,n=0;
   for(let dx=-14;dx<=14;dx++){const xx=x+dx;if(xx<0||xx>=W)continue;const i=(y*W+xx)*C;r+=tmp[i];g+=tmp[i+1];b+=tmp[i+2];al+=tmp[i+3];n++}
   const o=(y*W+x)*C;out[o]=r/n;out[o+1]=g/n;out[o+2]=b/n;out[o+3]=al/n}}
 // tray layer, moved down by S
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const m=M[y*W+x];if(m<=0)continue;const i=(y*W+x)*C;const sa=data[i+3]/255*m;if(sa<=0)continue;
   const j=((y+S)*W+x)*C;const da=out[j+3]/255;const oa=sa+da*(1-sa);
   for(let c=0;c<3;c++)out[j+c]=Math.round((data[i+c]*sa+out[j+c]*da*(1-sa))/oa);out[j+3]=Math.round(oa*255)}
 await sharp(out,{raw:{width:W,height:NH,channels:4}}).png().toFile("calendar-tray-shifted-full.png");
 await sharp(out,{raw:{width:W,height:NH,channels:4}}).resize(640).png({compressionLevel:9}).toFile("calendar-tray-shifted.png");
 const bg={r:11,g:15,b:31,alpha:1};
 const a=await sharp("calendar-tray-clean-full.png").resize(620).flatten({background:bg}).png().toBuffer();
 const b=await sharp("calendar-tray-shifted-full.png").resize(620).flatten({background:bg}).png().toBuffer();
 await sharp({create:{width:1280,height:700,channels:3,background:bg}}).composite([{input:a,left:10,top:10},{input:b,left:650,top:10}]).png().toFile("shift-compare.png");
 console.log("ok",W,NH);
})();
