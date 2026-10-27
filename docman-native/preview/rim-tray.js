const sharp=require("sharp");
const R=+process.argv[2]||3.2;
(async()=>{
 const {data,info}=await sharp("calendar-tray-v4-full.png").ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,C=4;
 const out=Buffer.from(data);
 const isTray=i=>{const r=data[i*4],g=data[i*4+1],b=data[i*4+2],a=data[i*4+3];return a>200&&((0.3*r+0.59*g+0.11*b)<130||b>r+10)};
 const rr=Math.ceil(R+1);
 for(let y=1000;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(data[i*4+3]>12)continue;
   let best=99;
   for(let dy=-rr;dy<=rr;dy++)for(let dx=-rr;dx<=rr;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=W||yy<0||yy>=H)continue;const d=Math.hypot(dx,dy);if(d<best&&d<=R+0.7&&isTray(yy*W+xx))best=d}
   if(best<99){const a=Math.max(0,Math.min(1,(R+0.7-best)/3))*1.0;out[i*4]=236;out[i*4+1]=242;out[i*4+2]=255;out[i*4+3]=Math.round(a*255)}}
 await sharp(out,{raw:{width:W,height:H,channels:4}}).png().toFile("calendar-tray-v5-full.png");
 await sharp(out,{raw:{width:W,height:H,channels:4}}).resize(640).png({compressionLevel:9}).toFile("calendar-tray-v5.png");
 console.log("ok",W,H);
})();
