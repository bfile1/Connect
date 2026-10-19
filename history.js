const HISTORY_PAGE_SIZE=50;
let historyFilters={person:'all',from:'',to:'',page:0};
let historyRequest=0;
const canViewHistory=()=>membership?.slots.length===1&&[0,1].includes(membership.slots[0]);
function resetHistory(){historyRequest++;historyFilters={person:'all',from:'',to:'',page:0}}
function formatHistoryDay(value){return new Date(value+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
function historyQuery(family,filters){
 const params=new URLSearchParams({family_id:'eq.'+family,select:'day,person,mood,wellbeing,happiness,energy,note',order:'day.desc,person.asc',limit:String(HISTORY_PAGE_SIZE+1),offset:String(filters.page*HISTORY_PAGE_SIZE)});
 if(filters.person!=='all')params.set('person','eq.'+filters.person);
 if(filters.from)params.append('day','gte.'+filters.from);
 if(filters.to)params.append('day','lte.'+filters.to);
 return 'connect_checkins?'+params;
}
function historyView(){
 if(!canViewHistory())return;
 const filters=historyFilters;
 $('#content').innerHTML=`<section class="card history"><span class="tag">LITTLE MOMENTS, OVER TIME</span><h2>Our family journal</h2><p>Look back at everyone’s daily check-ins, feelings, and notes. Each day keeps the latest check-in for each person.</p><form id="historyfilters" class="history-filters"><label>Family member<select name="person" id="historyperson"><option value="all">Everyone</option>${people.map((p,i)=>`<option value="${i}" ${filters.person===String(i)?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label>From<input type="date" name="from" value="${esc(filters.from)}"></label><label>To<input type="date" name="to" value="${esc(filters.to)}"></label><button class="primary" type="submit">View entries</button><button class="quiet" id="historyreset" type="button">All dates</button></form><p id="historystatus" role="status" aria-live="polite">Loading saved check-ins…</p><div id="historyentries" aria-busy="true"></div><div class="history-pages"><button class="quiet" id="historyprev" disabled>← Newer entries</button><button class="quiet" id="historynext" disabled>Older entries →</button></div></section>`;
 $('#historyfilters').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);historyFilters={person:f.get('person'),from:f.get('from'),to:f.get('to'),page:0};loadHistory()};
 $('#historyreset').onclick=()=>{historyFilters={...historyFilters,from:'',to:'',page:0};historyView()};
 $('#historyprev').onclick=()=>{historyFilters.page=Math.max(0,historyFilters.page-1);loadHistory()};
 $('#historynext').onclick=()=>{historyFilters.page++;loadHistory()};
 loadHistory();
}
async function loadHistory(){
 const id=++historyRequest,filters={...historyFilters},family=membership?.family_id;
 if(!canViewHistory()||tab!=='history')return;
 $('#historyprev').disabled=$('#historynext').disabled=true;
 if(filters.from&&filters.to&&filters.from>filters.to){$('#historystatus').textContent='Choose a From date on or before the To date.';$('#historyentries').replaceChildren();$('#historyentries').setAttribute('aria-busy','false');return}
 $('#historystatus').textContent='Loading saved check-ins…';$('#historyentries').replaceChildren();$('#historyentries').setAttribute('aria-busy','true');
 try{
  const rows=await rest(historyQuery(family,filters));
  if(id!==historyRequest||tab!=='history'||!canViewHistory()||membership.family_id!==family)return;
  const more=rows.length>HISTORY_PAGE_SIZE,entries=rows.slice(0,HISTORY_PAGE_SIZE);
  const groups=new Map();for(const entry of entries){if(!groups.has(entry.day))groups.set(entry.day,[]);groups.get(entry.day).push(entry)}
  $('#historystatus').textContent=entries.length?`${entries.length} check-in${entries.length===1?'':'s'} on this page · Page ${filters.page+1}`:'No check-ins found for these dates and person. Missing days simply mean no check-in was saved.';
  $('#historyentries').innerHTML=[...groups].map(([date,checks])=>`<section class="history-day"><h3><time datetime="${esc(date)}">${esc(formatHistoryDay(date))}</time></h3><div class="history-cards">${checks.map(c=>`<article class="history-entry"><div class="history-name"><span class="avatar">${people[c.person].emoji}</span><strong>${esc(people[c.person].name)}</strong><span>${['😔 Tough','🙁 Low','😐 Okay','🙂 Good','😄 Great'][c.mood]}</span></div><dl><div><dt>Wellbeing</dt><dd>${c.wellbeing} / 5</dd></div><div><dt>Happiness</dt><dd>${c.happiness} / 5</dd></div><div><dt>Energy</dt><dd>${c.energy} / 5</dd></div></dl>${c.note?`<p class="history-note">${esc(c.note)}</p>`:'<p class="history-no-note">No extra note this day.</p>'}</article>`).join('')}</div></section>`).join('');
  $('#historyentries').setAttribute('aria-busy','false');$('#historyprev').disabled=filters.page===0;$('#historynext').disabled=!more;
 }catch(error){if(id!==historyRequest||tab!=='history')return;$('#historystatus').textContent='Could not load the journal. '+error.message;$('#historyentries').setAttribute('aria-busy','false');$('#historyprev').disabled=filters.page===0}
}
