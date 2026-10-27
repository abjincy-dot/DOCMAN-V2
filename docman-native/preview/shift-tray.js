const sharp=require("sharp");
const S=+process.argv[2]||70;                      // how far the tray moves down, in source pixels
(async()=>{
 const {data,info}=await sharp("calendar-tray-clean-full.png").ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,C=4;
 const g=(x,y)=>{const i=(y*W+x)*C;return [data[i],data[i+1],data[i+2],data[i+3]]};
 // tray = navy/blue/dark, bluish-white cards, orange/yellow cards; calendar glass is always warmer (r > b)
 const isTray=(x,y)=>{const [r,gg,b,a]=g(x,y);if(a<20)return false;
   const lum=0.3*r+0.59*gg+0.11*b;
   if(lum<120&&b>=r-10) return true;                 // navy and its shading
   if(b>r+6) return true;                            // blue rim light
   if(r>222&&gg>222&&b>=r-6) return true;            // white-blue cards
   if(r>200&&b<110&&gg>90&&gg<215&&y>640) return true; // orange / yellow cards
   return false};
 let m=new Uint8Array(W*H);
 for(let y=600;y<H;y++)for(let x=190;x<1110;x++) if(isTray(x,y)) m[y*W+x]=1;
 // close small holes + keep only the big blob: simple dilate then erode (r=4), then dilate 3 for the anti-aliased edge
 const morph=(src,r,grow)=>{const o=new Uint8Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let hit=grow?0:1;
   for(let dy=-r;dy<=r&&(grow?!hit:hit);dy+=1)for(let dx=-r;dx<=r;dx+=1){const yy=y+dy,xx=x+dx;const v=(yy<0||yy>=H||xx<0||xx>=W)?0:src[yy*W+xx];if(grow){if(v){hit=1;break}}else{if(!v){hit=0;break}}}
   o[y*W+x]=hit}return o};
 m=morph(morph(m,4,true),4,false); m=morph(m,3,true);
 await sharp(Buffer.from(Array.from(m,v=>v?255:0)),{raw:{width:W,height:H,channels:1}}).png().toFile("tray-mask.png");
 // calendar layer: tray area filled by copying the nearest calendar pixel above (keeps the glass colours)
 const cal=Buffer.from(data);
 for(let x=0;x<W;x++){let last=null;for(let y=0;y<H;y++){if(!m[y*W+x]){last=g(x,y)}else if(last){for(let c=0;c<4;c++)cal[(y*W+x)*C+c]=last[c]}}}
 const NH=H+S;
 const out=Buffer.alloc(W*NH*C);               // transparent canvas, taller by S
 const put=(x,y,px)=>{const i=(y*W+x)*C;for(let c=0;c<4;c++)out[i+c]=px[c]};
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*C;if(data[i+3]>0&&!(m[y*W+x])||(m[y*W+x]&&y<H)){ /* calendar layer first */
     const a=cal[i+3]; if(a>0){const j=i;for(let c=0;c<4;c++)out[j+c]=cal[i+c]}}}
 // calendar layer must not grow below its own bottom edge: where the original had no pixel, stay transparent
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*C;if(data[i+3]===0&&!m[y*W+x]){out[i+3]=0}}
 // where the tray was and the original calendar had no pixel (below the card), stay transparent too
 // tray layer over it, shifted down by S
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(m[y*W+x]){const i=(y*W+x)*C;if(data[i+3]>0){const j=((y+S)*W+x)*C;const a=data[i+3]/255;
     for(let c=0;c<3;c++)out[j+c]=Math.round(data[i+c]*a+out[j+c]*(1-a));out[j+3]=Math.max(out[j+3],data[i+3])}}
 await sharp(out,{raw:{width:W,height:NH,channels:4}}).png().toFile("calendar-tray-shifted-full.png");
 await sharp(out,{raw:{width:W,height:NH,channels:4}}).resize(640).png({compressionLevel:9}).toFile("calendar-tray-shifted.png");
 console.log("ok",W,NH);
})();
