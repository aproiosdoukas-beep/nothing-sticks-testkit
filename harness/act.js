// Persistent-game action driver. Usage: node act.js <cmd> [arg...]
// cmds: init | obs | scrollup | scrolldown | chats | open <name-part> | tapnote | openlink <text> | header | closeart | closeinfo | endround | code <word>
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0] || await b.newContext({viewport:{width:390,height:800}});
  let p = ctx.pages().find(x=>x.url().includes('nothing-sticks')) || null;
  const cmd = process.argv[2], arg = process.argv.slice(3).join(' ');
  const out = (o)=>{console.log(JSON.stringify(o,null,1).slice(0,3000));};

  if(cmd==='init'){
    p = p || await ctx.newPage();
    await p.setViewportSize({width:390,height:800});
    await p.goto('file://GAME_PATH_HERE/game.html'); // NORMAL mode: host-paced
    await p.fill('#introcode','wake'); await p.click('text=join the chat');
    out({ok:'game started'}); await b.close(); return;
  }
  if(!p){out({error:'no game page; run init'});await b.close();return;}

  if(cmd==='scrollup') await p.evaluate(()=>{document.getElementById('feed').scrollTop-=550;});
  if(cmd==='scrolldown') await p.evaluate(()=>{document.getElementById('feed').scrollTop+=550;});
  if(cmd==='chats'){ await p.evaluate(()=>openList()); }
  if(cmd==='open'){ await p.evaluate(()=>{}); const items=await p.$$('#cllist .clitem'); for(const it of items){const t=await it.innerText(); if(t.toLowerCase().includes(arg.toLowerCase())){await it.click();break;}} }
  if(cmd==='tapnote'){ const n=await p.$('#toast .note'); if(n) await n.click(); else out({note:'no notification visible'}); }
  if(cmd==='openlink'){ const links=await p.$$('#feed .linkcard'); let done=false; for(const l of links){const t=await l.innerText(); if(t.toLowerCase().includes(arg.toLowerCase())){await l.click();done=true;break;}} if(!done&&links.length)await links[links.length-1].click(); }
  if(cmd==='header'){ await p.evaluate(()=>openInfo()); }
  if(cmd==='closeart'){ await p.evaluate(()=>closeArticle()); }
  if(cmd==='closeinfo'){ await p.evaluate(()=>closeInfo()); }
  if(cmd==='endround'){ await p.evaluate(()=>finishRound(false)); }
  if(cmd==='code'){ await p.fill('#roundcode',arg); await p.click('#rs_btn'); }

  await p.waitForTimeout(400);
  // observation
  const o = await p.evaluate(()=>{
    const vis=(el)=>el&&getComputedStyle(el).display!=='none';
    const art=document.getElementById('article'), info=document.getElementById('info'), cl=document.getElementById('chatlist'), rs=document.getElementById('roundscreen');
    if(vis(rs)&&rs.style.display!=='none') return {screen:'ROUND_OVER',text:rs.innerText.slice(0,400)};
    if(art.style.display==='flex') return {screen:'ARTICLE',text:document.getElementById('abody').innerText.slice(0,900),url:document.getElementById('aurl').textContent};
    if(info.style.display==='flex') return {screen:'GROUP_INFO',text:document.getElementById('ibody').innerText.slice(0,500)};
    if(cl.style.display==='flex') return {screen:'CHAT_LIST',text:document.getElementById('cllist').innerText.slice(0,500)};
    const feed=document.getElementById('feed');
    // visible messages approximation: last portion of innerText around scroll
    const rows=[...feed.querySelectorAll('.row,.sys')];
    const inView=rows.filter(r=>{const a=r.getBoundingClientRect();return a.bottom>140&&a.top<720;}).map(r=>r.innerText.replace(/\n/g,' ').slice(0,140));
    const notes=[...document.querySelectorAll('#toast .note')].map(n=>n.innerText.replace(/\n/g,' ').slice(0,90));
    const badge=document.getElementById('backbadge');
    return {screen:'CHAT', chat:document.getElementById('hname').textContent, mission:document.querySelector('#mission .q').textContent,
            unread_badge_on_back_arrow: badge&&badge.style.display!=='none'?badge.textContent:'none',
            notifications_on_screen:notes, visible_messages:inView};
  });
  out(o); await b.close();
})().catch(e=>{console.log(JSON.stringify({error:e.message.slice(0,300)}));process.exit(0);});
