import { WIDTH, HEIGHT, CRAFTS } from './engine.js';

function polygon(ctx, points, fill, stroke) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = .65; ctx.stroke(); }
}

export function drawAircraft(ctx, x, y, scale = 1, craft = 'falcon', time = 0, angle = 0, exhaust = true) {
  const spec = CRAFTS[craft] || CRAFTS.falcon;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  const wide = craft === 'turtle' ? 1.16 : craft === 'swift' ? .86 : 1;
  ctx.scale(wide, 1);
  if (exhaust) {
    for (const side of [-1, 1]) {
      const fire = ctx.createLinearGradient(0, 34, 0, 93);
      fire.addColorStop(0, '#ffedb3'); fire.addColorStop(.17, '#ffb06be0'); fire.addColorStop(.55, '#f4824e60'); fire.addColorStop(1, '#ff7b3e00');
      polygon(ctx, [[side * 7 - 4, 35], [side * 7 + 4, 35], [side * 7 + 2, 65], [side * 7, 88 + Math.sin(time * 22) * 7], [side * 7 - 2, 65]], fire);
    }
  }
  const outline = [[0, -55], [6, -40], [10, -14], [17, -4], [43, 16], [46, 29], [14, 20], [12, 34], [23, 44], [23, 50], [7, 46], [0, 50], [-7, 46], [-23, 50], [-23, 44], [-12, 34], [-14, 20], [-46, 29], [-43, 16], [-17, -4], [-10, -14], [-6, -40]];
  ctx.save(); ctx.translate(5, 7); polygon(ctx, outline, '#04192355'); ctx.restore();
  polygon(ctx, outline, '#42646d', '#c0eced77');
  const wing = ctx.createLinearGradient(-45, -5, 45, 26);
  wing.addColorStop(0, '#87afb5'); wing.addColorStop(.4, '#c4e0dc'); wing.addColorStop(.5, '#7da8b0'); wing.addColorStop(1, '#bfd8d0');
  polygon(ctx, [[-11, -12], [-44, 18], [-45, 26], [-12, 17], [0, 5], [12, 17], [45, 26], [44, 18], [11, -12]], wing, '#d7efec66');
  polygon(ctx, [[-15, 3], [-40, 23], [-18, 17], [-11, 9]], spec.color);
  polygon(ctx, [[15, 3], [40, 23], [18, 17], [11, 9]], spec.color);
  for (const side of [-1, 1]) {
    polygon(ctx, [[side * 21, 9], [side * 37, 20], [side * 31, 20], [side * 19, 12]], '#315966');
    polygon(ctx, [[side * 25, 17], [side * 28, 18], [side * 28, 29], [side * 25, 28]], '#b2c7c3');
    polygon(ctx, [[side * 4, 8], [side * 11, 13], [side * 10, 37], [side * 4, 40]], '#638e99', '#b4d2d1');
    polygon(ctx, [[side * 7, 25], [side * 11, 34], [side * 20, 43], [side * 21, 47], [side * 8, 42]], '#a4c5c4', '#d3e7dd88');
    polygon(ctx, [[side * 6, -11], [side * 12, 0], [side * 11, 14], [side * 6, 10]], '#25444e');
    ctx.fillStyle = '#e5a66f'; ctx.fillRect(side * 7 - 2.4, 35, 4.8, 4);
  }
  const body = ctx.createLinearGradient(-9, 0, 9, 0);
  body.addColorStop(0, '#6a959d'); body.addColorStop(.4, '#d6e6db'); body.addColorStop(.55, '#b8d6d1'); body.addColorStop(1, '#4c7b87');
  polygon(ctx, [[0, -55], [5, -39], [7, -18], [7, 21], [3, 42], [0, 46], [-3, 42], [-7, 21], [-7, -18], [-5, -39]], body, '#b7dad8');
  polygon(ctx, [[0, -31], [3.8, -23], [4.5, -9], [0, -3], [-4.5, -9], [-3.8, -23]], '#153945', '#94cbd4');
  polygon(ctx, [[0, -29], [2, -21], [2, -11], [0, -7], [-2, -11], [-2, -21]], '#68a5b2');
  ctx.strokeStyle = '#567984'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(-4, 11); ctx.lineTo(4, 11); ctx.moveTo(-3, 22); ctx.lineTo(3, 22); ctx.stroke();
  polygon(ctx, [[0, 20], [3, 36], [0, 46], [-3, 36]], '#3f6472', '#bad8d6');
  ctx.fillStyle = '#eff8eb'; ctx.fillRect(-1, -47, 2, 4);
  for (const side of [-1, 1]) { ctx.fillStyle = side === -1 ? '#f69d78' : '#8ef4dc'; ctx.fillRect(side * 43 - 1, 24, 2, 2); }
  ctx.restore();
}

function drawEnemy(ctx, e, time) {
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.type === 'boss') {
    ctx.save(); ctx.translate(8, 12); ctx.scale(1.03, 1.03);
    polygon(ctx, [[0,-55],[28,-37],[85,-12],[95,27],[63,37],[28,23],[22,57],[-22,57],[-28,23],[-63,37],[-95,27],[-85,-12],[-28,-37]], '#03131e66'); ctx.restore();
    const g = ctx.createLinearGradient(0, -55, 0, 58);g.addColorStop(0,'#899593');g.addColorStop(.4,'#3e5b60');g.addColorStop(1,'#203d49');
    polygon(ctx, [[0,-55],[28,-37],[85,-12],[95,27],[63,37],[28,23],[22,57],[-22,57],[-28,23],[-63,37],[-95,27],[-85,-12],[-28,-37]],g,'#b1c3b188');
    for(const s of [-1,1]) {
      polygon(ctx,[[s*29,-28],[s*77,-7],[s*84,21],[s*58,26],[s*29,13]],'#647878','#9eada088');
      polygon(ctx,[[s*35,-16],[s*66,-3],[s*72,17],[s*58,17],[s*37,5]],'#34494f');
      polygon(ctx,[[s*50,-6],[s*62,0],[s*66,14],[s*58,14]],e.final?'#ad7692':'#b58262');
      ctx.fillStyle='#162e38';ctx.fillRect(s*48-7,22,14,17);ctx.fillStyle='#ed9e78';ctx.fillRect(s*48-5,33,10,4);
      for(let i=0;i<4;i++){ctx.fillStyle='#a3b0a366';ctx.fillRect(s*68-4,-3+i*4,8,1);}
      ctx.fillStyle='#a3d5cd';ctx.fillRect(s*82-1,14,3,5);
    }
    polygon(ctx,[[0,-49],[17,-28],[16,24],[9,48],[-9,48],[-16,24],[-17,-28]],'#739089','#bcd1c588');
    polygon(ctx,[[0,-35],[8,-22],[8,-5],[0,2],[-8,-5],[-8,-22]],'#172e3e','#a5b9ab');
    ctx.fillStyle='#e6b780';ctx.fillRect(-5,15,10,17);
    ctx.strokeStyle='#f9b17d';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,17,22,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#f1bc89';ctx.beginPath();ctx.arc(0,17,7+Math.sin(time*5),0,Math.PI*2);ctx.fill();
  } else {
    const heavy=e.type==='gunship', dart=e.type==='dart';
    ctx.rotate(Math.PI);ctx.scale(heavy?.68:dart?.39:.42,heavy?.68:dart?.5:.42);
    const shade=heavy?'#887e76':dart?'#b99996':'#b2a58b';
    polygon(ctx,[[0,-48],[10,-16],[43,15],[46,28],[12,18],[9,36],[21,45],[20,50],[0,44],[-20,50],[-21,45],[-9,36],[-12,18],[-46,28],[-43,15],[-10,-16]],shade,'#d4c3a699');
    polygon(ctx,[[0,-46],[7,-17],[5,34],[0,44],[-5,34],[-7,-17]],'#d4c5a2','#e0d3b277');
    polygon(ctx,[[0,-24],[4,-12],[3,0],[-3,0],[-4,-12]],'#4b5356');
    for(const s of [-1,1]) {polygon(ctx,[[s*13,-3],[s*37,20],[s*27,18],[s*11,7]],heavy?'#9e6453':'#c7725e');ctx.fillStyle='#ffbc7a';ctx.fillRect(s*7-2,34,4,7+Math.sin(time*20)*2);}
    if(heavy){ctx.fillStyle='#253e48';ctx.fillRect(-6,9,12,16);ctx.fillStyle='#f2a77c';ctx.fillRect(-3,11,6,9);}
  }
  ctx.restore();
  if (e.type!=='boss'&&e.hp<e.maxHp) {ctx.fillStyle='#0b273aaa';ctx.fillRect(e.x-16,e.y-e.radius-9,32,2);ctx.fillStyle='#e9b894';ctx.fillRect(e.x-16,e.y-e.radius-9,32*Math.max(0,e.hp/e.maxHp),2);}
}

function makeSea() {
  const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=1000;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#1c444e';ctx.fillRect(0,0,WIDTH,1000);
  let seed=7023;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<3800;i++){const x=random()*WIDTH,y=random()*1000;ctx.strokeStyle=random()>.5?'#b2d1c40b':'#032d3f16';ctx.lineWidth=random()>.9?1.2:.5;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+5,y-2,x+9+random()*35,y-1);ctx.stroke();}
  for(let i=0;i<55;i++){const x=random()*WIDTH,y=random()*1000;ctx.strokeStyle='#acd4c119';ctx.lineWidth=.6;ctx.beginPath();ctx.ellipse(x,y,6+random()*18,1,0,0,Math.PI);ctx.stroke();}
  return canvas;
}

function makeIsland() {
  const c=document.createElement('canvas');c.width=330;c.height=640;const ctx=c.getContext('2d');
  const points=[[117,9],[150,20],[171,58],[161,86],[187,124],[201,132],[206,179],[194,206],[216,241],[207,270],[238,302],[252,331],[241,355],[250,384],[225,404],[230,441],[210,457],[202,488],[172,509],[164,551],[130,582],[112,613],[86,625],[74,597],[81,565],[60,541],[65,507],[39,469],[42,441],[23,420],[37,385],[27,351],[41,323],[40,280],[61,247],[61,211],[77,191],[70,155],[86,125],[76,87],[92,57],[90,29]];
  ctx.save();ctx.translate(5,5);ctx.strokeStyle='#83ac9d28';ctx.lineWidth=33;ctx.lineJoin='round';polygon(ctx,points,'#315d60');ctx.stroke();ctx.restore();
  ctx.lineJoin='round';ctx.lineWidth=13;ctx.strokeStyle='#a0bca27a';polygon(ctx,points,'#5f7160');ctx.stroke();
  polygon(ctx,points,'#526e5c');
  let seed=12;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  ctx.save();ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();
  for(let i=0;i<500;i++){const x=rand()*260,y=rand()*640,r=5+rand()*20;ctx.fillStyle=['#334e4559','#81917344','#263e3d33','#a3a18122'][i%4];ctx.beginPath();ctx.ellipse(x,y,r,r*.65,rand(),0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#bcb68f55';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(98,74);ctx.bezierCurveTo(160,220,85,360,155,535);ctx.stroke();
  for(const [x,y]of[[127,202],[124,222],[152,420]]){ctx.fillStyle='#b6b7a0';ctx.fillRect(x,y,12,9);ctx.fillStyle='#66776b';ctx.fillRect(x+2,y+2,8,5);}
  ctx.restore();return c;
}

function makeCloud() {
  const c=document.createElement('canvas');c.width=380;c.height=250;const ctx=c.getContext('2d');
  for(const [x,y,r]of[[80,140,60],[140,100,76],[220,100,62],[285,140,55],[180,155,75]]){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#d7e8da35');g.addColorStop(.48,'#d7e8da1d');g.addColorStop(1,'#d7e8da00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
  return c;
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.game=game;
    this.sea=makeSea();this.island=makeIsland();this.cloud=makeCloud();this.particles=[];this.rings=[];this.shake=0;this.flash=0;this.clock=0;this.worldTime=0;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }
  resize() { const ratio=Math.min(devicePixelRatio||1,2);this.canvas.width=WIDTH*ratio;this.canvas.height=HEIGHT*ratio;this.ratio=ratio; }
  event(event) {
    const burst=(count,x,y,power,color)=>{for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=(20+Math.random()*115)*power;this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.25+Math.random()*.55,maxLife:.8,radius:(1+Math.random()*3)*power,color});}};
    if(event.type==='explosion'){burst(Math.floor(23*event.size),event.x,event.y,event.size,'#f8b279');this.rings.push({x:event.x,y:event.y,r:4,max:42*event.size,life:.4,color:'#ffb787'});this.shake=Math.max(this.shake,event.size*2);}
    if(event.type==='hit')burst(3,event.x,event.y,.45,event.critical?'#ffcb8c':'#b6f0eb');
    if(event.type==='hurt'){this.shake=9;this.flash=.2;burst(24,event.x,event.y,1,'#ef8d6e');}
    if(event.type==='bomb'){this.flash=.45;this.shake=7;this.rings.push({x:event.x,y:event.y,r:0,max:1100,life:.9,color:'#b1f8f1'});}
    if(event.type==='shieldHit')this.rings.push({x:this.game.player.x,y:this.game.player.y,r:5,max:100,life:.4,color:'#a1e9f1'});
    if(event.type==='start'){this.particles=[];this.rings=[];this.flash=0;}
    if(this.particles.length>600)this.particles.splice(0,this.particles.length-600);
  }
  render(dt) {
    const g=this.game,ctx=this.ctx;this.clock+=dt;
    if(g.status==='playing'||(g.status==='menu'&&!this.reducedMotion))this.worldTime+=dt;
    const active=g.status==='playing';
    const time=this.worldTime;
    ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.save();
    if(active&&this.shake>.1&&!this.reducedMotion)ctx.translate((Math.random()-.5)*this.shake,(Math.random()-.5)*this.shake);
    const offset=(time*24)%1000;
    ctx.drawImage(this.sea,0,offset-1000);ctx.drawImage(this.sea,0,offset);
    const shade=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);shade.addColorStop(0,'#51746b28');shade.addColorStop(.5,'#0a2c3d22');shade.addColorStop(1,'#052b48aa');ctx.fillStyle=shade;ctx.fillRect(0,0,WIDTH,HEIGHT);
    if(g.wave>5&&g.status!=='menu'){ctx.fillStyle='#15213f44';ctx.fillRect(0,0,WIDTH,HEIGHT);}
    const islandY=((time*19+310)%1750)-650;
    ctx.save();ctx.translate(-123,islandY);ctx.rotate(-.2);ctx.drawImage(this.island,0,0,265,514);ctx.restore();
    ctx.save();ctx.translate(WIDTH+54,((time*19+1170)%2200)-700);ctx.rotate(.3);ctx.scale(-.6,.6);ctx.drawImage(this.island,0,0);ctx.restore();
    this.drawCarrier(ctx,(time*13+350)%1900-260);
    // Distant aircraft and ocean wakes give the launch screen depth.
    if(g.status==='menu') {
      drawAircraft(ctx,78,((time*14+290)%1200)-150,.3,'turtle',time,-.18);
      drawAircraft(ctx,410,((time*12+490)%1200)-150,.27,'swift',time,.12);
      this.drawReticle(ctx,WIDTH/2,380,116,time);
      drawAircraft(ctx,WIDTH/2+Math.sin(time*.6)*5,383+Math.sin(time*.9)*4,1.9,g.craft,time,Math.sin(time*.65)*.045);
    } else {
      for(const item of g.pickups)this.drawPickup(ctx,item,time);
      for(const b of g.bullets)this.drawBullet(ctx,b);
      for(const e of g.enemies)if(!e.dead)drawEnemy(ctx,e,time);
      if(g.status!=='gameover') {
        const p=g.player;
        ctx.save();if(p.invincible>0&&Math.sin(this.clock*32)<0)ctx.globalAlpha=.4;
        if(p.shield){ctx.strokeStyle='#a1e8e588';ctx.lineWidth=1.3;ctx.fillStyle='#80ddd50b';ctx.beginPath();ctx.ellipse(p.x,p.y,37,45,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
        drawAircraft(ctx,p.x,p.y,.66,g.craft,time);
        for(let i=0;i<(g.stacks.drone||0);i++)drawAircraft(ctx,p.x+(i===0?-43:43),p.y+9,.27,g.craft,time);
        ctx.restore();ctx.fillStyle='#f2ffed';ctx.shadowColor='#b3fffb';ctx.shadowBlur=6;ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      }
      for(const b of g.enemyBullets){ctx.fillStyle=b.color==='pink'?'#ef8ea6':'#ffb47c';ctx.strokeStyle=b.color==='pink'?'#7a294f':'#854c3b';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(b.x,b.y,3.5,5,Math.atan2(b.vy,b.vx)-Math.PI/2,0,Math.PI*2);ctx.stroke();ctx.fill();ctx.fillStyle='#ffebce';ctx.beginPath();ctx.arc(b.x,b.y,1.1,0,Math.PI*2);ctx.fill();}
    }
    for(let i=0;i<3;i++){const cloudY=(time*(12+i*3)+i*370)%1500-300;ctx.globalAlpha=i===1?.6:.45;ctx.drawImage(this.cloud,(i%2?210:-170),cloudY,450,296);}ctx.globalAlpha=1;
    this.drawEffects(ctx,active?dt:0);
    const vignette=ctx.createRadialGradient(WIDTH/2,HEIGHT*.42,80,WIDTH/2,HEIGHT*.42,520);vignette.addColorStop(0,'#001b2800');vignette.addColorStop(1,'#00132166');ctx.fillStyle=vignette;ctx.fillRect(0,0,WIDTH,HEIGHT);
    if(this.flash>0){ctx.fillStyle=`rgba(195,242,231,${Math.min(.7,this.flash*1.5)})`;ctx.fillRect(0,0,WIDTH,HEIGHT);if(active)this.flash=Math.max(0,this.flash-dt);}
    if(active)this.shake*=Math.max(0,1-dt*9);ctx.restore();
  }
  drawReticle(ctx,x,y,r,time){ctx.save();ctx.translate(x,y);ctx.strokeStyle='#9bd9d52b';ctx.lineWidth=.6;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();for(let i=0;i<4;i++){ctx.save();ctx.rotate(i*Math.PI/2);ctx.beginPath();ctx.moveTo(r-7,0);ctx.lineTo(r+10,0);ctx.stroke();ctx.restore();}ctx.setLineDash([3,9]);ctx.beginPath();ctx.arc(0,0,r+9,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore();}
  drawCarrier(ctx,y){ctx.save();ctx.translate(387,y);ctx.rotate(.14);ctx.globalAlpha=.55;ctx.fillStyle='#bcd7ca11';ctx.beginPath();ctx.moveTo(-10,100);ctx.lineTo(-29,245);ctx.lineTo(24,245);ctx.lineTo(8,100);ctx.fill();polygon(ctx,[[-11,-73],[9,-83],[20,-52],[19,70],[8,98],[-14,75],[-18,-40]],'#9aa99c','#bfd0b277');polygon(ctx,[[-8,-65],[7,-69],[12,-45],[11,68],[4,84],[-9,66]],'#51686b');ctx.strokeStyle='#bcc6a26e';ctx.lineWidth=1;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(1,-57);ctx.lineTo(1,73);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#aab9a4';ctx.fillRect(11,-12,6,32);ctx.fillStyle='#334c55';ctx.fillRect(13,-7,3,10);ctx.restore();}
  drawBullet(ctx,b){if(b.kind==='missile'){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx)+Math.PI/2);ctx.fillStyle='#e1d4ab';ctx.fillRect(-2,-7,4,12);ctx.fillStyle='#fb9e62';ctx.fillRect(-1,5,2,10);ctx.restore();return;}ctx.fillStyle=b.critical?'#ffe0aa':'#b3f7ef';ctx.shadowColor=b.critical?'#ffad61':'#7edee3';ctx.shadowBlur=7;ctx.fillRect(b.x-1.5,b.y-8,3,15);ctx.shadowBlur=0;ctx.fillStyle='#edfff3';ctx.fillRect(b.x-.5,b.y-8,1,12);}
  drawPickup(ctx,p,time){ctx.save();ctx.translate(p.x,p.y);if(p.type==='xp'){ctx.rotate(Math.sin(time*3+p.x)*.25);polygon(ctx,[[0,-7],[5,0],[0,7],[-5,0]],'#b1edf0','#e3fff4');ctx.fillStyle='#428fa6';ctx.fillRect(-1,-3,2,5);}else{ctx.fillStyle=p.type==='health'?'#95e3bc':'#ebbd84';ctx.strokeStyle='#c9e5d9';ctx.lineWidth=1;ctx.fillRect(-10,-10,20,20);ctx.strokeRect(-10,-10,20,20);ctx.fillStyle='#254957';if(p.type==='health'){ctx.fillRect(-6,-2,12,4);ctx.fillRect(-2,-6,4,12);}else{polygon(ctx,[[1,-7],[-5,1],[0,1],[-1,7],[5,-1],[0,-1]],'#254957');}}ctx.restore();}
  drawEffects(ctx,dt){for(const p of this.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;ctx.globalAlpha=Math.max(0,p.life/p.maxLife);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.radius,p.radius);}ctx.globalAlpha=1;this.particles=this.particles.filter(p=>p.life>0);for(const r of this.rings){r.life-=dt;r.r+=(r.max-r.r)*dt*7;ctx.strokeStyle=r.color;ctx.globalAlpha=Math.max(0,r.life);ctx.lineWidth=2;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;this.rings=this.rings.filter(r=>r.life>0);}
}
