const $ = (id) => document.getElementById(id);
const homeScreen = $('homeScreen'), lobbyScreen = $('lobbyScreen'), gameScreen = $('gameScreen');
const idKey = 'blackwater-player-id', nameKey = 'blackwater-callsign';
let playerId = localStorage.getItem(idKey);
if (!playerId) { playerId = crypto.randomUUID(); localStorage.setItem(idKey, playerId); }
$('playerName').value = localStorage.getItem(nameKey) || '';
$('roomCode').value = new URL(location.href).searchParams.get('case') || '';
let state = null, currentCode = null, selectedStage = 'radio', pollTimer = null, pingTimer = null, toastTimer = null;
const GAME_API = '/.netlify/functions/game';
const stageData = [
  { id:'radio', name:'Radio shack', number:'01', atmosphere:'The air tastes of salt and hot dust. A receiver coughs up one last burst of static.', objective:'Decode the radio call and find the cutter’s channel.', puzzle:'What single word does the recording spell? Enter the cutter’s channel as a word.', prompt:'The channel is hidden in a short, grouped signal.', button:'DECODE SIGNAL' },
  { id:'chart', name:'Chart room', number:'02', atmosphere:'Charts are pinned over every wall. One corner has been circled so hard the paper nearly tore.', objective:'Use Mara’s chart key to identify the safe bearing.', puzzle:'Translate the four numbers using the atlas key. Which direction should the cutter take?', prompt:'The numbers each represent one letter.', button:'SET BEARING' },
  { id:'engine', name:'Engine room', number:'03', atmosphere:'The generator is cold. A maintenance lamp blinks once, then goes dark.', objective:'Reconstruct the emergency fuse order and bring the generator back.', puzzle:'Arrange the backup fuse values from lowest to highest. Enter all four digits together.', prompt:'Read the stamped values, then order them by size.', button:'RESTORE POWER' },
  { id:'lantern', name:'Lantern gallery', number:'04', atmosphere:'Rain lashes the glass. The lens is intact, but its controls are waiting for a sequence.', objective:'Combine your discoveries and guide the cutter into safe water.', puzzle:'Enter the complete relay sequence in the order on the brass plate: bearing — channel — fuse order.', prompt:'Use the three answers your team recovered along the way.', button:'LIGHT THE BEACON' }
];
const clueData = {
  morse:{title:'A call in the static',kind:'TRANSMISSION',text:'A strip of recorder tape reads: “... / . / ...- / . / -.” The groups have a short pause between each.'},
  decoder:{title:'The signal card',kind:'REFERENCE',text:'Mara’s pocket card: ... = S   · = E   ...- = V   -. = N. A longer pause means the next letter.'},
  bearing:{title:'Numbers in the margin',kind:'CHART MARK',text:'A grease-pencil note on the eastern coast: 5 — 1 — 19 — 20. “The cutter must know where the safe water is.”'},
  atlas:{title:'The old atlas key',kind:'REFERENCE',text:'Inside the cover: “For the beacon charts, A is 1, B is 2, and each letter follows in order.”'},
  fuses:{title:'Spare fuse tin',kind:'INVENTORY',text:'Four fuses were found, stamped 8, 2, 5, and 3. A chalk arrow says “load low to high.”'},
  loadnote:{title:'Generator maintenance note',kind:'ENGINEER’S NOTE',text:'“For an emergency restart, place backup fuses in ascending order. Enter the four values together; no spaces.”'},
  finalmessage:{title:'Mara’s final transmission',kind:'RECOVERED AUDIO',text:'“The cutter is close. Aim for the safe bearing. Call on the channel I sent. I left the fuse order beside the lens. Bring all three together and light the east water.”'},
  lensplate:{title:'The lens controls',kind:'FINAL CONTROL',text:'Three brass slots are engraved: BEARING — CHANNEL — FUSE ORDER. The lighthouse will not turn until the complete sequence is entered.'}
};
function escapeHtml(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function name(){return $('playerName').value.trim().slice(0,20)||'Guest';}
function codeFromUrl(){return (new URL(location.href).searchParams.get('case')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);}
function showToast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2300);}
async function post(body){const response=await fetch(GAME_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||'The action could not be completed.');return data;}
async function getRoom(code){const query=new URLSearchParams({code,playerId});const response=await fetch(GAME_API+'?'+query,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'The case could not be refreshed.');return data;}
async function joinCase(code,create=false){
  code=code.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
  if(code.length!==6){$('homeError').textContent='Enter the six-letter case code.';return;}
  localStorage.setItem(nameKey,name());
  try{const result=await post({code,action:'join',playerId,name:name(),create});startRoom(code,result.room);}
  catch(error){$('homeError').textContent=error.message;}
}
function randomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('');}
function startRoom(code,initialRoom){
  currentCode=code;state=initialRoom||state;const url=new URL(location.href);url.searchParams.set('case',code);history.pushState({case:code},'',url);$('gameCode').textContent=code;$('lobbyCode').textContent=code;
  $('liveStatus').innerHTML='<i></i> CONNECTING';render();
  let refreshing=false;
  const refresh=async()=>{if(refreshing||currentCode!==code)return;refreshing=true;try{const result=await getRoom(code);state=result.room;$('liveStatus').innerHTML='<i></i> LIVE';render();}catch{$('liveStatus').innerHTML='<i class="offline"></i> RECONNECTING';}finally{refreshing=false;}};
  clearInterval(pollTimer);pollTimer=setInterval(refresh,2200);refresh();
  clearInterval(pingTimer);pingTimer=setInterval(()=>{if(currentCode===code)post({code,action:'ping',playerId}).then(result=>{if(result.room){state=result.room;render();}}).catch(()=>{});},6000);
}
function activeStage(){return stageData.find(s=>s.id===selectedStage)||stageData[0];}
function render(){
  if(!state)return;
  $('gameCode').textContent=state.code;$('lobbyCode').textContent=state.code;
  homeScreen.classList.add('hidden');
  if(state.status==='waiting'){lobbyScreen.classList.remove('hidden');gameScreen.classList.add('hidden');renderLobby();}
  else{lobbyScreen.classList.add('hidden');gameScreen.classList.remove('hidden');renderGame();}
}
function renderLobby(){
  $('lobbyPlayers').innerHTML=state.players.map((p,i)=>'<div class="lobby-player"><span class="avatar" style="--player:'+p.color+'">'+escapeHtml(p.name.slice(0,1).toUpperCase())+'</span><span><b>'+escapeHtml(p.name)+'</b><small>'+escapeHtml(p.role)+'</small></span><i class="presence '+(p.online?'online':'')+'"></i></div>').join('');
  $('waitingNote').innerHTML='<i></i> '+(state.players.length<2?'Waiting for another investigator…':'Opening the case…');
}
function renderGame(){
  if(!state.unlocked.includes(selectedStage))selectedStage=state.unlocked[state.unlocked.length-1];
  const stage=activeStage(), index=stageData.findIndex(s=>s.id===stage.id), solved=state.solved.includes(stage.id);
  $('objectiveText').textContent=state.status==='won'?'The cutter is safely through the eastern passage.':stage.objective;
  $('clockLabel').textContent=state.status==='won'?'THE BEACON IS LIT':'THE STORM IS CLOSING IN';
  $('locationNav').innerHTML=stageData.map((s,i)=>{const unlocked=state.unlocked.includes(s.id),complete=state.solved.includes(s.id);return '<button class="location-tab '+(s.id===stage.id?'selected ':'')+(complete?'complete ':'')+(!unlocked?'locked':'')+'" '+(!unlocked?'disabled':'')+' data-stage="'+s.id+'"><span class="tab-number">'+(complete?'✓':s.number)+'</span><span>'+s.name+'</span><small>'+(complete?'SOLVED':unlocked?'OPEN':'LOCKED')+'</small></button>';}).join('');
  document.querySelectorAll('.location-tab:not(:disabled)').forEach(button=>button.onclick=()=>{selectedStage=button.dataset.stage;renderGame();});
  $('sceneCard').innerHTML='<div class="scene-meta"><span>LOCATION '+stage.number+'</span><span>BLACKWATER ISLAND</span></div><div class="scene-content"><div><p class="eyebrow">FIELD NOTES</p><h2>'+stage.name+'</h2><p>'+stage.atmosphere+'</p></div><div class="scene-sketch sketch-'+stage.id+'"><span>'+['⌁','✣','ϟ','◉'][index]+'</span><small>'+['SIGNAL','BEARING','POWER','LENS'][index]+'</small></div></div>';
  const stageClues=Object.entries(clueData).filter(([id])=>({radio:['morse','decoder'],chart:['bearing','atlas'],engine:['fuses','loadnote'],lantern:['finalmessage','lensplate']}[stage.id]).includes(id));
  const foundCount=stageClues.filter(([id])=>state.found.includes(id)).length;
  $('evidenceCount').textContent=foundCount+' / '+stageClues.length;
  $('evidenceGrid').innerHTML=stageClues.map(([id,clue],i)=>{const found=state.found.includes(id);return '<article class="evidence-card '+(found?'found':'unfound')+'"><div class="evidence-top"><span class="evidence-index">EVIDENCE '+String(i+1).padStart(2,'0')+'</span><span class="evidence-kind">'+(found?clue.kind:'UNDISCOVERED')+'</span></div><div class="evidence-body">'+(found?'<h3>'+clue.title+'</h3><p>'+clue.text+'</p>':'<div class="sealed-clue"><span>?</span><b>Something is caught under the '+(i===0?'desk':'old map')+'.</b></div>')+'</div>'+(found?'<div class="found-tag">✓ ADDED TO SHARED CASE FILE</div>':'<button class="inspect-button" data-clue="'+id+'">EXAMINE EVIDENCE <span>↗</span></button>')+'</article>';}).join('');
  document.querySelectorAll('.inspect-button').forEach(button=>button.onclick=()=>act({action:'inspect',stage:stage.id,clue:button.dataset.clue}));
  const allFound=foundCount===stageClues.length, hints=state.revealedHints[stage.id]||[];
  $('puzzlePanel').innerHTML='<div class="puzzle-top"><div><p class="eyebrow">'+(solved?'PUZZLE SOLVED':'TEAM PUZZLE')+' · '+stage.number+'</p><h2>'+(solved?'The lock is open.':stage.puzzle)+'</h2><p>'+stage.prompt+'</p></div><div class="puzzle-lock '+(solved?'open':'')+'">'+(solved?'✓':'⌑')+'</div></div>'+(allFound?'<form id="answerForm" class="answer-form"><input id="answerInput" maxlength="32" autocomplete="off" placeholder="'+(stage.id==='engine'?'Four digits':stage.id==='lantern'?'Bearing-channel-fuses':'Your answer')+'" aria-label="Puzzle answer" '+(solved?'disabled':'')+'><button '+(solved?'disabled':'')+'>'+(solved?'SOLVED ✓':stage.button+' ↗')+'</button></form>':'<div class="locked-puzzle">Examine both evidence cards to compare the clues and unlock the answer box.</div>')+'<div class="hint-row"><button id="hintButton" class="hint-button" '+(!allFound||solved||hints.length>=3||state.hintsLeft<=0?'disabled':'')+'>REVEAL NEXT HINT <span>−1 INSIGHT</span></button><span class="insight-count">TEAM INSIGHT <b>'+state.hintsLeft+'</b> / 8</span></div>'+(hints.length?'<div class="hint-list">'+hints.map((hint,i)=>'<p><b>HINT '+(i+1)+'</b>'+escapeHtml(hint)+'</p>').join('')+'</div>':'');
  $('answerForm')?.addEventListener('submit',async e=>{e.preventDefault();const answer=$('answerInput').value;try{const result=await post({code:currentCode,action:'solve',playerId,stage:stage.id,answer});if(result.room){state=result.room;render();}if(!result.correct)showToast(result.message);else{selectedStage=stageData[Math.min(index+1,stageData.length-1)].id;renderGame();showToast(index===3?'The signal is away. The cutter is safe.':'Puzzle solved — the next location is open.');}}catch(error){showToast(error.message);}});
  $('hintButton')?.addEventListener('click',()=>act({action:'hint',stage:stage.id}));
  renderTeam();renderActivity();renderChat();
  $('victoryPanel').classList.toggle('hidden',state.status!=='won');
  if(state.status==='won')$('victoryPanel').innerHTML='<div class="victory-icon">✳</div><p class="eyebrow">CASE CLOSED · TEAM SUCCESS</p><h2>She kept the light.<br><em>You brought it back.</em></h2><p>The cutter answers with two long horn blasts. In the lantern room, Mara’s final log explains everything: she stayed through the storm to guide the crew safely home.</p><p class="victory-score">THREE ROUNDS · '+state.roundsCompleted+'/3 · '+state.score+' TEAM POINTS</p><p class="victory-winner">WINNER · '+escapeHtml(state.winner||'The Blackwater Crew')+'</p><div class="victory-team">'+state.players.map(p=>'<span>'+escapeHtml(p.name)+'</span>').join('<i>✦</i>')+'</div>';
}
function renderTeam(){
  $('playerCount').textContent=state.players.length+'/4';
  $('teamList').innerHTML=state.players.map(p=>'<div class="team-member"><span class="avatar" style="--player:'+p.color+'">'+escapeHtml(p.name.slice(0,1).toUpperCase())+'</span><span class="member-copy"><b>'+escapeHtml(p.name)+(p.id===playerId?' <small>(YOU)</small>':'')+'</b><small>'+escapeHtml(p.role)+'</small></span><i class="presence '+(p.online?'online':'')+'"></i></div>').join('');
}
function renderActivity(){
  $('activityCount').textContent=state.activity.length;
  $('activityFeed').innerHTML=state.activity.slice(0,12).map(item=>'<div class="activity-item type-'+item.type+'"><span class="activity-mark"></span><p>'+escapeHtml(item.text)+'<small>'+new Date(item.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'</small></p></div>').join('')||'<p class="empty-note">The case file is waiting for its first discovery.</p>';
}
function renderChat(){
  const box=$('chatMessages'),wasBottom=box.scrollHeight-box.scrollTop-box.clientHeight<50;
  box.innerHTML=state.chat.map(message=>'<div class="chat-message '+(message.playerId===playerId?'own':'')+'"><b>'+escapeHtml(message.name)+'</b><p>'+escapeHtml(message.text)+'</p></div>').join('')||'<p class="empty-note">Share theories, compare clues, and keep the team together.</p>';
  if(wasBottom)box.scrollTop=box.scrollHeight;
}
async function act(payload){try{const result=await post({code:currentCode,...payload,playerId});if(result.room){state=result.room;render();}}catch(error){showToast(error.message);}}
async function copyInvite(){try{await navigator.clipboard.writeText(location.origin+'/?case='+currentCode);showToast('Case link copied for your team.');}catch{showToast('Share case code '+currentCode);}}
async function leaveCase(){
  const code=currentCode;clearInterval(pollTimer);pollTimer=null;clearInterval(pingTimer);pingTimer=null;
  if(code)try{await post({code,action:'leave',playerId});}catch{}
  state=null;currentCode=null;const url=new URL(location.href);url.searchParams.delete('case');history.pushState({},'',url);gameScreen.classList.add('hidden');lobbyScreen.classList.add('hidden');homeScreen.classList.remove('hidden');
}
$('createRoom').onclick=()=>joinCase(randomCode(),true);
$('joinRoom').onclick=()=>joinCase($('roomCode').value,false);
$('roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
$('roomCode').addEventListener('keydown',e=>{if(e.key==='Enter')joinCase(e.target.value,false);});
$('playerName').addEventListener('input',()=>localStorage.setItem(nameKey,name()));
$('copyInvite').onclick=copyInvite;$('copyInviteLobby').onclick=copyInvite;
$('leaveGame').onclick=leaveCase;$('leaveLobby').onclick=leaveCase;
$('rulesOpen').onclick=()=>$('rulesDialog').showModal();$('rulesClose').onclick=()=>$('rulesDialog').close();
$('rulesDialog').addEventListener('click',e=>{if(e.target===$('rulesDialog'))$('rulesDialog').close();});
$('chatForm').addEventListener('submit',async e=>{e.preventDefault();const input=$('chatInput'),message=input.value.trim();if(!message)return;input.value='';await act({action:'chat',message});});
window.addEventListener('popstate',()=>{const code=codeFromUrl();if(code&&!currentCode){if($('playerName').value.trim())joinCase(code,false);else $('roomCode').value=code;}else if(!code&&currentCode)leaveCase();});
const initialCode=codeFromUrl();if(initialCode){$('roomCode').value=initialCode;if(localStorage.getItem(nameKey))joinCase(initialCode,false);else $('homeError').textContent='Your team saved you a seat. Add your callsign to join.';}


