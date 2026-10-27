const sharp=require("sharp");
const src="C:/Users/abiji/AppData/Local/Temp/claude/C--Users-abiji-Desktop-DOCMAN-PLAY-STORE-docman-native-www/0e032d73-9121-4edb-b803-cc929ba9c224/images/2.webp";
(async()=>{
 const {data,info}=await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,C=4;
 const get=(x,y)=>{const i=(y*W+x)*C;return [data[i],data[i+1],data[i+2],data[i+3]]};
 const edge=x=>632+(790-x)*0.145-6;
 const isTrayPx=(x,y)=>y>=edge(x)-2&&x>300&&x<860;       // never borrow colour from the tray
 const mask=new Uint8Array(W*H);
 for(let y=300;y<700;y++)for(let x=470;x<800;x++){
   const [r,g,b]=get(x,y);
   const dark=(r<95&&g<95&&b<105), red=(r>150&&g<90&&b<90&&r-g>90);
   const sunZone=y<445, eightZone=y>=440&&y<edge(x)&&x>495&&x<750;
   if((dark||red)&&(sunZone||eightZone)) mask[y*W+x]=1;
 }
 const m2=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(mask[y*W+x]){
   for(let dy=-9;dy<=9;dy++)for(let dx=-9;dx<=9;dx++){const yy=y+dy,xx=x+dx;if(yy>=0&&yy<H&&xx>=0&&xx<W&&yy<edge(xx)+1)m2[yy*W+xx]=1}}
 // smooth (Laplace) fill: masked pixels become the average of their neighbours, tray pixels never count
 const f=new Float32Array(W*H*3);
 for(let i=0;i<W*H;i++){f[i*3]=data[i*4];f[i*3+1]=data[i*4+1];f[i*3+2]=data[i*4+2]}
 const warm=i=>data[i*4]>data[i*4+2]+8&&data[i*4+3]>200;
 const idx=[];for(let i=0;i<W*H;i++)if(m2[i])idx.push(i);
 // start from a row-wise estimate between the nearest warm glass pixels, then smooth
 for(let y=0;y<H;y++){let x=0;while(x<W){if(!m2[y*W+x]){x++;continue}let s0=x;while(x<W&&m2[y*W+x])x++;const e=x;
   let L=s0-1;while(L>0&&(m2[y*W+L]||!warm(y*W+L))&&s0-L<60)L--;let R=e;while(R<W-1&&(m2[y*W+R]||!warm(y*W+R))&&R-e<60)R++;
   const okL=!m2[y*W+L]&&warm(y*W+L),okR=!m2[y*W+R]&&warm(y*W+R);
   for(let k=s0;k<e;k++){let t=(k-s0+1)/(e-s0+1);let a=L,b=R;if(!okL){a=R;t=0}else if(!okR){b=L;t=0}
     for(let c=0;c<3;c++)f[(y*W+k)*3+c]=f[(y*W+a)*3+c]*(1-t)+f[(y*W+b)*3+c]*t}}}
 for(let it=0;it<600;it++){
   for(const i of idx){const x=i%W,y=(i/W)|0;let r=0,g=0,b=0,n=0;
     for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>=W||yy<0||yy>=H)continue;
       if(!m2[yy*W+xx]&&(isTrayPx(xx,yy)||!warm(yy*W+xx)))continue;
       const j=yy*W+xx;r+=f[j*3];g+=f[j*3+1];b+=f[j*3+2];n++}
     if(n){f[i*3]=r/n;f[i*3+1]=g/n;f[i*3+2]=b/n}}}
 const fin=Buffer.from(data);
 for(const i of idx){fin[i*4]=Math.round(f[i*3]);fin[i*4+1]=Math.round(f[i*3+1]);fin[i*4+2]=Math.round(f[i*3+2])}
 await sharp(fin,{raw:{width:W,height:H,channels:4}}).png().toFile("calendar-tray-clean-full.png");
 console.log("erased",idx.length);
})();
