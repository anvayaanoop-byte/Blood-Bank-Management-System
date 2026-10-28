// Blood camps: load and save records through Flask/SQLite.
const campModal = document.getElementById('campModal');
const campForm = document.getElementById('campForm');
const campTableBody = document.getElementById('campTableBody');
function openCampModal(){ campModal?.classList.add('active'); }
function closeCampModal(){ campModal?.classList.remove('active'); }
function campUser(){ try{return JSON.parse(localStorage.getItem('user')||'null');}catch(_){return null;} }
function campEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function campApi(path, options={}){
 const u=campUser(); const headers={'Content-Type':'application/json',...(u?.token?{Authorization:`Bearer ${u.token}`}:{})};
 const res=await fetch(`http://127.0.0.1:5000${path}`,{...options,headers:{...headers,...(options.headers||{})}});
 let data={};try{data=await res.json();}catch(_){} if(!res.ok)throw new Error(data.message||`Server error (${res.status})`);return data;
}
function renderCamps(camps){if(!campTableBody)return;campTableBody.innerHTML=camps.map(c=>`<tr>
 <td><div class="camp-info"><div class="camp-avatar">🩸</div><div><strong>${campEsc(c.name)}</strong><small>${campEsc(c.camp_id||('CAMP'+c.id))}</small></div></div></td>
 <td>${campEsc(c.date||'—')}</td><td>${campEsc(c.location||'—')}</td><td>${campEsc(c.organizer||'—')}</td>
 <td>${campEsc(c.expected_donors ?? '—')}</td><td><span class="camp-status">${campEsc(c.status||'Upcoming')}</span></td></tr>`).join('');applyCampFilters();}
async function loadCamps(){try{const data=await campApi('/api/camps');renderCamps(data.camps||[]);}catch(e){console.error(e);alert(`Could not load camps: ${e.message}`);}}
function applyCampFilters(){const q=(document.getElementById('campSearch')?.value||'').toLowerCase();const selected=(document.getElementById('campStatusFilter')?.value||'all').toLowerCase();document.querySelectorAll('#campTableBody tr').forEach(r=>{const status=(r.querySelector('.camp-status')?.textContent||'').toLowerCase();r.style.display=r.textContent.toLowerCase().includes(q)&&(selected==='all'||status.includes(selected))?'':'none';});}
campModal?.addEventListener('click',e=>{if(e.target===campModal)closeCampModal();});
document.getElementById('campSearch')?.addEventListener('input',applyCampFilters);
document.getElementById('campStatusFilter')?.addEventListener('change',applyCampFilters);
campForm?.addEventListener('submit',async e=>{e.preventDefault();const btn=campForm.querySelector('[type="submit"]');if(btn)btn.disabled=true;try{
 const payload={name:document.getElementById('campName').value.trim(),date:document.getElementById('campDate').value,location:document.getElementById('campLocation').value.trim(),organizer:document.getElementById('campOrganizer').value.trim(),expected_donors:Number(document.getElementById('expectedDonors')?.value||0)};
 const result=await campApi('/api/camps',{method:'POST',body:JSON.stringify(payload)});alert(`${result.message||'Camp saved'} (${result.camp_id||''})`);campForm.reset();closeCampModal();await loadCamps();
 }catch(err){alert(`Camp was NOT saved: ${err.message}`);}finally{if(btn)btn.disabled=false;}});
document.addEventListener('DOMContentLoaded',loadCamps);
