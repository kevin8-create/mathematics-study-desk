'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rich(s){
  return String(s ?? '').split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((part,i)=>{
    if(!(i%2)||!window.katex)return esc(part);
    const d=part.startsWith('$$'),n=d?2:1;
    return window.katex.renderToString(part.slice(n,-n),{displayMode:d,throwOnError:false,trust:false,maxExpand:800});
  }).join('');
}
const bi = x => rich(x?.zh)+'<span class="en" lang="en">'+rich(x?.en)+'</span>';
const types={choice:'选择 · Choice','true-false':'判断 · True/false',short:'填空 · Short answer',written:'解答 · Written'};
const courses={'026':'MTH026 微积分 I · Calculus I','028':'MTH028 线性代数 I · Linear Algebra I'};
const levels={1:'基础 · Foundation',2:'进阶 · Intermediate',3:'挑战 · Challenge'};
const modes={practice:'练习 Practice',mock:'限时练习 Timed practice',review:'错题 Review',terms:'术语 Glossary',history:'进度 Progress'};
const key='math-desk-v1';
let data={private:[],log:[],draft:{},responses:{}},storageWarning='';
try{Object.assign(data,JSON.parse(localStorage.getItem(key)||'{}'))}catch{storageWarning='无法读取本地记录 · Local records unavailable'}
function save(){try{localStorage.setItem(key,JSON.stringify(data))}catch{storageWarning='本地存储不可用，本次更改仅在本页有效 · Storage unavailable. Changes last for this session.';if($('storage'))$('storage').textContent=storageWarning}}
let embedded=[],bank,questions,mode='practice',filters={course:'026',topic:'',type:'',level:''},current='',shown=null;
const findQ=id=>questions.find(q=>q.id===id);
const topic=id=>bank.topics.find(t=>t.id===id);
const last=id=>data.log.findLast(a=>a.id===id);
function options(q){return q.options || (q.type==='true-false'?[{id:'true',zh:'正确',en:'True'},{id:'false',zh:'错误',en:'False'}]:[])}
function field(k,title,items){return '<div><label for="'+k+'">'+title+'</label><select id="'+k+'">'+Object.entries(items).map(([id,label])=>'<option value="'+esc(id)+'" '+(filters[k]===id?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select></div>'}
function sidebar(){
 const ts=bank.topics.filter(t=>t.course===filters.course);
 return '<aside class="panel"><h2>学习设置 <small>Study settings</small></h2><div class="filters">'+field('course','课程 · Course',courses)+(mode==='practice'||mode==='review'?field('topic','知识点 · Topic',{'':'全部 · All',...Object.fromEntries(ts.map(t=>[t.id,t.zh+' · '+t.en]))})+field('type','题型 · Format',{'':'全部 · All',...types})+field('level','难度 · Level',{'':'全部 · All',...levels}):'')+'</div><details><summary>题库信息 · Bank</summary><p class="meta">'+bank.questions.length+' 道公开题 · public questions<br>'+(questions.length-bank.questions.length)+' 道私有题 · private questions</p></details><p class="warning" id="storage">'+esc(storageWarning)+'</p></aside>';
}
function pool(){if(mode==='mock')return mock.ids.map(findQ);return questions.filter(q=>Object.entries(filters).every(([k,v])=>!v||String(q[k])===v)&&(mode!=='review'||last(q.id)?.ok===false||q.id===current&&shown))}
function jump(id){const q=findQ(id);if(!q)return;filters={course:q.course,topic:'',type:'',level:''};mode='practice';current=id;shown=null;render()}
function exercise(){
 const list=pool(),q=list.find(q=>q.id===current)||list[0];
 if(!q)return '<article><h2>暂无题目 <small>No matching questions</small></h2><p>可调整筛选条件。<br>Try changing the filters.</p></article>';
 current=q.id;const idx=list.indexOf(q),opts=options(q);
 const response=(mode==='mock'?mock.responses:data.responses)[q.id]||'';
 const input=opts.length?opts.map((o,i)=>'<label class="option"><input type="radio" name="answer" value="'+esc(o.id)+'" '+(response===o.id?'checked':'')+' '+(shown?'disabled':'')+'><span class="opt-key" aria-hidden="true">'+String.fromCharCode(65+i)+'</span><span>'+bi(o)+'</span></label>').join(''):'<label for="response">作答 · Your answer</label><textarea id="response" '+(shown?'readonly':'')+'>'+esc(response)+'</textarea>';
 const nav='<div class="actions"><button id="prev" '+(idx===0?'disabled':'')+'>← 上一题 · Previous</button><button id="next" '+(idx===list.length-1?'disabled':'')+'>下一题 · Next →</button></div>';
 const t=topic(q.topic);
 const origin=embedded.some(item=>item.id===q.id)?'本机校内题 · Local campus bank':q.id.startsWith('local-')?'私有导入 · Private import':'';
 const badges='<div class="badges"><b class="chip course">MTH'+esc(q.course)+'</b><span class="chip format">'+esc(types[q.type])+'</span><span class="chip level lv'+q.level+'">'+esc(levels[q.level])+'</span>'+(origin?'<span class="chip origin">'+origin+'</span>':'')+'</div>';
 return '<article class="exercise">'+badges+'<div class="topic-line">'+esc(t?.zh)+' · '+esc(t?.en)+'</div><div class="position"><h2>第 '+(idx+1)+' 题 <small>Question '+(idx+1)+' of '+list.length+'</small></h2><progress aria-label="题目位置 · Question position" max="'+list.length+'" value="'+(idx+1)+'"></progress></div><div class="prompt">'+bi(q.prompt)+'</div>'+input+(shown?feedback(q):'<div class="actions"><button class="primary" id="submit">提交答案 · Submit answer</button></div>')+'<p id="validation" role="alert"></p><details '+(data.draft[q.id]?'open':'')+'><summary>独立草稿 · Scratchpad</summary><label for="draft">本题草稿 · Notes for this question</label><textarea id="draft">'+esc(data.draft[q.id])+'</textarea></details>'+nav+'</article>';
}
function answerText(value){
 const fraction=/^([+-]?\d+)\s*\/\s*(\d+)$/.exec(value);
 return fraction?rich('$\\frac{'+fraction[1]+'}{'+fraction[2]+'}$'):rich(value);
}
function feedback(q){
 const result=shown.ok===null?'对照解析，为本次作答评分 · Check your work and mark the result':shown.ok?'回答正确 · Correct':'需要复习 · Review this question';
 const displayed=q.type==='short'?(q.answers||[]).slice(0,1):(q.answers||[]);
 const ans=displayed.map(a=>{const o=options(q).find(o=>o.id===a);return o?bi(o):answerText(a)}).join(' · ');
 const variants=(q.related||[]).map(findQ).filter(Boolean);
 return '<section class="result '+(shown.ok===null?'pending':shown.ok?'success':'needs-review')+'"><h3>'+result+'</h3>'+(ans?'<p>参考答案 · Answer<br>'+ans+'</p>':'')+(q.solution||[]).map(s=>'<h3>'+bi(s.title)+'</h3><ol>'+s.steps.map(x=>'<li>'+bi(x)+'</li>').join('')+'</ol>').join('')+(shown.ok===null?'<div class="actions"><button id="correct">做对了 · Correct</button><button id="wrong">需复习 · Review</button></div>':'<button id="retry">重新作答 · Retry</button>')+(variants.length?'<details><summary>相关变式 · Related questions</summary>'+variants.map(v=>'<button class="link" data-jump="'+esc(v.id)+'">'+bi(v.prompt)+'</button>').join('')+'</details>':'')+'</section>';
}
function render(){
 document.body.dataset.course=filters.course;
 const active=document.activeElement;
 const focusId=active?.id,focusMode=active?.dataset?.mode;
 $('nav').innerHTML=Object.entries(modes).map(([k,v])=>'<button data-mode="'+k+'" class="'+(mode===k?'active':'')+'">'+v+'</button>').join('');
 let html;
 if(mode==='terms')html=bank.topics.filter(t=>t.course===filters.course).map(t=>'<article><h2>'+bi(t)+'</h2><p>'+bi({zh:t.summaryZh,en:t.summaryEn})+'</p>'+t.terms.map(term=>'<div class="term">'+bi(term)+'</div>').join('')+'</article>').join('');
 else if(mode==='history'){
 const log=data.log.filter(a=>findQ(a.id)?.course===filters.course);
 html='<article><h2>学习进度 <small>Practice history</small></h2><p class="stats">'+log.length+' 次作答 · attempts &emsp; '+log.filter(a=>a.ok).length+' 次正确 · correct</p>'+log.slice().reverse().map(a=>'<button class="link" data-jump="'+esc(a.id)+'">'+(a.ok?'✓':'×')+' &nbsp; '+bi(findQ(a.id).prompt)+'<small>'+esc(new Date(a.at).toLocaleString())+'</small></button>').join('')+'</article>';
 }else if(mode==='mock')html=timedView();else html=exercise();
 $('app').innerHTML='<div class="layout">'+sidebar()+'<section>'+html+'</section></div>';
 if(focusMode)document.querySelector('[data-mode="'+focusMode+'"]')?.focus({preventScroll:true});
 else if(focusId)($(focusId)||(['submit','correct','wrong'].includes(focusId)?$('correct')||$('retry'):null))?.focus({preventScroll:true});
}
function record(ok){shown={ok};if(mode==='mock')mock.results[current]=ok;data.log.push({id:current,ok,at:Date.now()});save();render()}
const norm=x=>String(x).normalize('NFKC').trim().replace(/−/g,'-').replace(/\s+/g,'');
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.id==='import')return $('upload').showModal();
 if(!bank)return;
 if(b.id==='startMock')return startMock();if(b.id==='finishMock'){mock.done=true;return render()}if(b.id==='resetMock'){mock=null;shown=null;return render()}if(b.dataset.mode){mode=b.dataset.mode;shown=null;current='';return render()}
 if(b.dataset.jump)return jump(b.dataset.jump);
 if(['prev','next'].includes(b.id)){const list=pool(),i=list.findIndex(q=>q.id===current);current=list[i+(b.id==='next'?1:-1)]?.id||'';shown=null;return render()}
 if(b.id==='submit'){const q=findQ(current),a=(mode==='mock'?mock.responses:data.responses)[current]||'';if(!a.trim()){$('validation').textContent='请先作答 · Enter your answer first.';return}
 if(q.type==='written'||!q.answers?.length){shown={ok:null};return render()}
 return record(q.answers.some(v=>norm(v)===norm(a)))}
 if(b.id==='correct'||b.id==='wrong')return record(b.id==='correct');
 if(b.id==='retry'){if(mode==='mock')delete mock.results[current];shown=null;delete (mode==='mock'?mock.responses:data.responses)[current];save();render()}
});
document.addEventListener('input',e=>{if(e.target.id==='draft')data.draft[current]=e.target.value;else if(e.target.id==='response'||e.target.name==='answer')(mode==='mock'?mock.responses:data.responses)[current]=e.target.value;else return;save()});
document.addEventListener('change',e=>{const k=e.target.id;if(Object.hasOwn(filters,k)){filters[k]=e.target.value;if(k==='course'){filters.topic='';if(mode==='mock')mock=null}current='';shown=null;render()}});
const pair=x=>x&&typeof x.zh==='string'&&typeof x.en==='string';
function validate(q){return q&&typeof q.id==='string'&&/^local-[a-zA-Z0-9_-]+$/.test(q.id)&&topic(q.topic)?.course===q.course&&Object.hasOwn(courses,q.course)&&Object.hasOwn(types,q.type)&&[1,2,3].includes(q.level)&&pair(q.prompt)&&Array.isArray(q.solution)&&q.solution.length&&q.solution.every(s=>pair(s.title)&&Array.isArray(s.steps)&&s.steps.length&&s.steps.every(pair))&&(!q.answers||Array.isArray(q.answers)&&q.answers.every(x=>typeof x==='string'))&&(!q.related||Array.isArray(q.related)&&q.related.every(x=>typeof x==='string'))&&(!q.options||Array.isArray(q.options)&&q.options.every(o=>pair(o)&&typeof o.id==='string'))&&(q.type!=='choice'||q.options?.length>=2)&&(!['choice','true-false'].includes(q.type)||q.answers?.length&&q.answers.every(a=>options(q).some(o=>o.id===a)))}
$('file').addEventListener('change',async e=>{
 const f=e.target.files[0];if(!f||!bank)return;
 try{if(f.size>5000000)throw Error();const obj=JSON.parse(await f.text());if(obj.version!==1||!Array.isArray(obj.questions)||!obj.questions.length||!obj.questions.every(validate))throw Error();
 const ids=new Set(questions.map(q=>q.id));for(const q of obj.questions){if(ids.has(q.id))throw Error();ids.add(q.id)}
 data.private.push(...obj.questions);refreshQuestions();save();$('notice').textContent=storageWarning||('已导入 · Imported '+obj.questions.length);render()
 }catch{$('notice').textContent='导入失败。请检查格式、题号重复或文件大小（5 MB）。 · Check the schema, duplicate IDs, and 5 MB limit.'}e.target.value='';
});
let mock=null;
function startMock(){
 const course=filters.course;
 const available=bank.questions.filter(q=>q.course===course);
 function pick(type,count){
 const arr=available.filter(q=>q.type===type);
 for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}
 return arr.slice(0,count);
 }
 const items=course==='026'?[...pick('choice',20),...pick('written',3)]:[...pick('true-false',3),...pick('choice',5),...pick('short',4),...pick('written',3)];
 if(!items.length)return;
 mock={course,ids:items.map(q=>q.id),end:Date.now()+Number($('minutes').value)*60000,done:false,results:{},responses:{}};
 current=mock.ids[0];shown=null;render()
}
function timedView(){
 if(mock?.course!==filters.course)mock=null;
 if(!mock)return '<article><h2>限时练习 <small>Timed practice</small></h2><p>从公开题库抽题，按可用题量组卷。自行设定练习时间。<span class="en">Draw a practice set from the available public questions and choose a time limit.</span></p><label for="minutes">时长 · Duration</label><select id="minutes"><option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option><option value="120">120 min</option></select><div class="actions"><button id="startMock" class="primary">开始练习 · Start practice</button></div></article>';
 if(Date.now()>=mock.end)mock.done=true;
 if(mock.done)return '<article><h2>练习结束 <small>Practice complete</small></h2><p>'+Object.keys(mock.results).length+' / '+mock.ids.length+' 已评分 · graded &emsp; '+Object.values(mock.results).filter(Boolean).length+' 正确 · correct</p><button id="resetMock">新练习 · New set</button></article>';
 if(!mock.ids.includes(current))current=mock.ids[0];
 if(Object.hasOwn(mock.results,current))shown={ok:mock.results[current]};
 return '<article><div class="actions"><strong>剩余时间 · Remaining <span id="timer">'+clockText()+'</span></strong><button id="finishMock">结束练习 · Finish set</button></div></article>'+exercise();
}
function clockText(){const sec=Math.max(0,Math.ceil((mock.end-Date.now())/1000));return Math.floor(sec/60)+'m '+String(sec%60).padStart(2,'0')+'s'}
setInterval(()=>{if(mode==='mock'&&mock&&!mock.done){if(Date.now()>=mock.end)render();else if($('timer'))$('timer').textContent=clockText()}},1000);
function refreshQuestions(){
 const embeddedIds=new Set(embedded.map(q=>q.id));
 questions=[...bank.questions,...embedded,...data.private.filter(q=>!embeddedIds.has(q.id))];
}
fetch('./bank.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(b=>{bank=b;embedded=(b.embeddedPrivateQuestions||[]).filter(validate);refreshQuestions();render()}).catch(()=>{$('app').textContent='题库载入失败，请重新打开应用。 · Could not load the bank. Reopen the app.'});
if(window.isSecureContext&&/^https?:$/.test(location.protocol)&&'serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

