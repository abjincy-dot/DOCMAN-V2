const fs=require('fs');
const s=(i,l,v)=>`<div class="dept-info-stat"><span class="stat-icon">${i}</span><span class="dept-info-stat-label">${l}</span><span class="dept-info-stat-val">${v}</span></div>`;
fs.writeFileSync(__dirname+'/stat-card.html','<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="../www/style.css"><link rel="stylesheet" href="stat-card-style.css"><body style="background:#2a1745;margin:0;padding:20px;width:380px"><div class="dept-info-stats">'+s('🏢','Departments',8)+s('📁','Folders',28)+s('📄','Files',31)+s('📝','Notes',3)+'</div>');
