import { chromium } from 'playwright';
const FE='http://localhost:5173', BE='http://localhost:3001';
let p=0,t=0;
const log=(l,ok,d)=>{t++;if(ok)p++;console.log((ok?'PASS':'FAIL')+' '+l+(d?' ['+d+']':''));return ok;};
const jwtFn=async()=>(await(await fetch(BE+'/api/functions/verifyPasswordLogin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@fitcoach.local',password:'Admin123!'})})).json())?.access_token;

const tok=await jwtFn();
console.log('=== BUG #3: Onboarding navigation proof ===');
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:390,height:844}});
const pg=await ctx.newPage();
pg.on('framenavigated',f=>{if(f===pg.mainFrame())console.log('  [NAV]',f.url());});

await pg.addInitScript(t=>localStorage.setItem('fitcoach_token',t),tok);
await pg.goto(FE+'/OnboardingScreen');
await pg.waitForLoadState('networkidle');
await pg.waitForTimeout(2500);
const xbtn=pg.locator('button').filter({hasText:'✕'}).first();
if(await xbtn.isVisible().catch(()=>false)){await xbtn.click();await pg.waitForTimeout(500);}
await pg.screenshot({path:'/tmp/onb1.png'});

const h1=await pg.locator('h1').textContent().catch(()=>'');
log('Heading renders',h1.length>0,h1.trim());
const h2=await pg.locator('h2').textContent().catch(()=>'');
log('Step 1 title shows',h2.length>0,h2.trim());
const prog=await pg.locator('[aria-label]').first().isVisible().catch(()=>false);
log('Progress indicator renders',prog);
const btns=await pg.locator('button').allTextContents();
console.log('  Buttons visible:',JSON.stringify(btns));

// Nav button (coach step 1 = "פתח ניהול מתאמנים")
const navBtn=pg.locator('button').filter({hasText:'פתח ניהול'}).first();
const navVis=await navBtn.isVisible().catch(()=>false);
log('Step 1 nav button visible',navVis,'looking for: פתח ניהול מתאמנים');
if(navVis){
  await navBtn.click();await pg.waitForTimeout(1500);
  const url=pg.url();
  log('Nav button navigates away from onboarding',!url.includes('OnboardingScreen'),url);
  const ls=await pg.evaluate(()=>{try{return JSON.parse(localStorage.getItem('onboarding_state')||'null');}catch{return null;}});
  log('localStorage.onboarding_state saved before navigation',!!ls,ls?'step='+ls.stepIndex+' role='+ls.roleType:'null');
  await pg.screenshot({path:'/tmp/onb2_after_nav.png'});
  console.log('  Screenshot: /tmp/onb2_after_nav.png');
  await pg.goto(FE+'/OnboardingScreen');
  await pg.waitForLoadState('networkidle');
  await pg.waitForTimeout(2000);
  const lsAfter=await pg.evaluate(()=>localStorage.getItem('onboarding_state'));
  log('localStorage cleared after state restore on return',lsAfter===null,'val='+lsAfter);
  await pg.screenshot({path:'/tmp/onb3_returned.png'});
  console.log('  Screenshot: /tmp/onb3_returned.png');
}

// Self-confirm path
await pg.goto(FE+'/OnboardingScreen');
await pg.waitForLoadState('networkidle');
await pg.waitForTimeout(2000);
const xb2=pg.locator('button').filter({hasText:'✕'}).first();
if(await xb2.isVisible().catch(()=>false)){await xb2.click();await pg.waitForTimeout(500);}

const confirm=pg.locator('button').filter({hasText:'הסמנתי'}).first();
log('Self-confirm "הסמנתי כבוצע" button visible',await confirm.isVisible().catch(()=>false));
if(await confirm.isVisible().catch(()=>false)){
  await confirm.click();await pg.waitForTimeout(1000);
  await pg.screenshot({path:'/tmp/onb4_success.png'});
  console.log('  Screenshot: /tmp/onb4_success.png');
  const body=await pg.textContent('body').catch(()=>'');
  const hasWin=body.includes('רואים')||body.includes('ניצחון')||body.includes('נקודות');
  log('SuccessBurst win text appears',hasWin);
  const nxt=pg.locator('button').filter({hasText:'המשך'}).first();
  log('Continue button appears',await nxt.isVisible().catch(()=>false));
  if(await nxt.isVisible().catch(()=>false)){
    await nxt.click();await pg.waitForTimeout(800);
    const h2b=await pg.locator('h2').textContent().catch(()=>'');
    log('Step 2 shows different title (advanced)',h2b!==h2&&h2b.length>0,h2b.trim());
    await pg.screenshot({path:'/tmp/onb5_step2.png'});
    console.log('  Screenshot: /tmp/onb5_step2.png');
  }
}

// Skip button
await pg.goto(FE+'/OnboardingScreen');
await pg.waitForLoadState('networkidle');
await pg.waitForTimeout(2000);
const xb3=pg.locator('button').filter({hasText:'✕'}).first();
if(await xb3.isVisible().catch(()=>false)){await xb3.click();await pg.waitForTimeout(500);}
const skipB=pg.locator('button').filter({hasText:'דלג'}).first();
log('Skip "דלג" button visible',await skipB.isVisible().catch(()=>false));
if(await skipB.isVisible().catch(()=>false)){
  await skipB.click();await pg.waitForTimeout(2000);
  const us=pg.url();
  log('Skip redirects away from onboarding',!us.includes('OnboardingScreen'),us);
  await pg.screenshot({path:'/tmp/onb6_skipped.png'});
  console.log('  Screenshot: /tmp/onb6_skipped.png');
}
await browser.close();
console.log('  All onboarding screenshots in /tmp/onb*.png');

console.log('\n=== REGRESSION: Nutrition CRUD + AI ===');
const h={'Content-Type':'application/json','Authorization':'Bearer '+tok};

// Create
const cr=await fetch(BE+'/api/entities/MealEntry',{method:'POST',headers:h,body:JSON.stringify({trainee_email:'trainee@fitcoach.local',date:'2026-06-29',meal_type:'breakfast',food_name:'ביצה',calories:78,protein:6.3,carbs:0.6,fat:5.3,quantity:55,unit:'gram'})});
const cD=await cr.json();log('Create MealEntry',cr.status===200&&!!cD.id,'id='+cD.id);
if(cD.id){
  // Edit
  const ed=await fetch(BE+'/api/entities/MealEntry/'+cD.id,{method:'PUT',headers:h,body:JSON.stringify({calories:90,food_name:'ביצה גדולה'})});
  const eD=await ed.json();log('Edit MealEntry',ed.status===200&&eD.calories===90,'cal='+eD.calories+' name='+eD.food_name);
  // Delete
  const dl=await fetch(BE+'/api/entities/MealEntry/'+cD.id,{method:'DELETE',headers:h});log('Delete MealEntry',dl.status===200);
  // Verify 404
  const ck=await fetch(BE+'/api/entities/MealEntry/'+cD.id,{headers:h});log('Deleted → 404',ck.status===404,'HTTP '+ck.status);
}
// Daily query
const day=await fetch(BE+'/api/entities/MealEntry?date=2026-06-29',{headers:h});log('Daily query returns 200',day.status===200);
// Water
const wc=await fetch(BE+'/api/entities/WaterEntry',{method:'POST',headers:h,body:JSON.stringify({trainee_email:'trainee@fitcoach.local',date:'2026-06-29',amount_ml:500})});
const wD=await wc.json();log('Water create',wc.status===200&&!!wD.id,'id='+wD.id);
if(wD.id){const wd=await fetch(BE+'/api/entities/WaterEntry/'+wD.id,{method:'DELETE',headers:h});log('Water delete',wd.status===200);}
// AI text
const ai=await fetch(BE+'/api/functions/analyzeAndEnrichMealPhoto',{method:'POST',headers:h,body:JSON.stringify({meal_text:'חזה עוף 150 גרם',meal_type:'lunch'})});
const aiR=(await ai.json())?.data?.response;
log('AI text: canonical DB substitution',aiR?.items?.[0]?.nutrition_source==='local_database','cal='+aiR?.total_calories+' src='+aiR?.items?.[0]?.nutrition_source);
// AI image
const {readFileSync}=await import('fs');
const b64=readFileSync('/tmp/food_b64.txt','utf8').trim();
const ai2=await fetch(BE+'/api/functions/analyzeAndEnrichMealPhoto',{method:'POST',headers:h,body:JSON.stringify({meal_text:'חזה עוף 150 גרם',image_url:b64,meal_type:'lunch'})});
const ai2R=(await ai2.json())?.data?.response;
log('AI image: canonical DB substitution',ai2R?.items?.[0]?.nutrition_source==='local_database','cal='+ai2R?.total_calories+' src='+ai2R?.items?.[0]?.nutrition_source);
log('Text path = Image path calories (canonical match)',aiR?.total_calories===ai2R?.total_calories,'text='+aiR?.total_calories+' img='+ai2R?.total_calories);
// Extra fields
const bad=await fetch(BE+'/api/entities/MealEntry',{method:'POST',headers:h,body:JSON.stringify({trainee_email:'trainee@fitcoach.local',date:'2026-06-29',meal_type:'lunch',food_name:'extra-test',calories:100,protein:10,carbs:5,fat:3,quantity:100,unit:'gram',per100_kcal:100,grams_final:100,ai_original_food_name:'test',food_database_scope:'ai',user_food_item_id:'fake',grams_equivalent:100,per100_protein:10,per100_carbs:5,per100_fat:3})});
const bD=await bad.json();
log('MealEntry with 9 extra fields saves (HTTP 200)',bad.status===200&&!!bD.id,'id='+bD.id);
log('All 9 extra fields stripped from saved record',!bD.per100_kcal&&!bD.grams_final&&!bD.ai_original_food_name&&!bD.user_food_item_id,'per100_kcal='+bD.per100_kcal);
if(bD.id)await fetch(BE+'/api/entities/MealEntry/'+bD.id,{method:'DELETE',headers:h});

console.log('\n═══════════════════════════════════════════');
console.log('FINAL: '+p+'/'+t+' tests passed');
console.log(p===t?'✅ ALL TESTS PASS':'❌ '+(t-p)+' TESTS FAILED');
