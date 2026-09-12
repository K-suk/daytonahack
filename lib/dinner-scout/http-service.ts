import type {Catalog, Ingredient, ProgressEvent, UserPreference} from './types';
import type {DinnerScoutService} from './service';
export type SavedEvent={sequence:number;stage:string;status:string;recipeId?:string;documentId?:string;elapsedSeconds?:number;candidateCount?:number};
export type SavedRecipe={id:string;title:string;sourceUrl:string;cookingMinutes:number|null;requirements:{ingredientId:string;nameJa:string;raw:string;grams:number|null}[]};
export type SavedResult={runId:string;status:string;route:'saved';revision:number;stopReasons:string[];stores?:{id:string;name:string}[];deals?:{id:string;storeId:string;productName:string;priceYen:number|null;quantity:number|null;unit:string|null;packGrams:number|null;validFrom:string|null;validTo:string|null;evidence:{basis:string;sourceUrl:string}}[];recipes?:SavedRecipe[];eligibility?:{recipeId:string;issues:{field:string;status:string;ingredientId?:string;raw?:string}[]}[];graph?:{candidates:{recipeId:string;storeId:string;matching:string[];missing:string[]}[]};documents?:{documentId:string;method:string;previewUrl:string;previewLabel:string}[];mealPlan?:{meals:{day:number;recipeId:string;nutrition:Record<string,number|null>}[];shopping:{totalYen:number|null;totalBasis:string;budgetStatus:string;store:{name:string};shopping:{ingredientId:string;usedGrams:number|null;packs:number|null;costYen:number|null}[]}}|null};
const base='/api/backend';
export async function api<T>(path:string,init?:RequestInit):Promise<T>{
 const r=await fetch(base+path,{...init,headers:{'Content-Type':'application/json',...init?.headers},cache:'no-store'});const data=await r.json();
 if(!r.ok)throw Error(data.error||`Backend request failed (${r.status})`);return data as T;
}
export function validateResult(raw:unknown):SavedResult {
 if(!raw||typeof raw!=='object')throw Error('Invalid backend result');
 const d=raw as SavedResult;
 if(typeof d.runId!=='string'||typeof d.status!=='string'||d.route!=='saved'||!Array.isArray(d.stopReasons))throw Error('Invalid backend result');return d;
}
const option=(id:string,name:string):Ingredient=>({id,name,unit:'g',allergens:[],nutrition:{kcal:null,protein:null,fat:null,carbs:null}});
const pantry=[option('rice-cooked','Cooked rice'),option('oil','Oil'),option('salt','Salt'),option('pepper','Pepper'),option('soy-sauce','Soy sauce'),option('sugar','Sugar')];
const dislikes=[option('broccoli-raw','Broccoli'),option('onion-raw','Onion'),option('pork-mixed-cut-raw','Pork mixed cuts'),option('chicken-thigh-skin-unspecified-raw','Chicken thigh'),option('mushroom','Mushrooms')];
const catalog:Catalog={defaults:{budget:4000,protein:40,calories:650,pantry:pantry.map(x=>x.id),allergies:[],dislikes:[]},pantry,ingredients:[...pantry,...dislikes],dislikes,allergies:['egg','milk','wheat','buckwheat','peanut','shrimp','crab','walnut','soy','sesame','fish'],stores:[{id:'seijo-minamiaoyama',name:'成城石井 南青山店'},{id:'kino-aoyama',name:'紀ノ国屋 インターナショナル'},{id:'ville-aoyama',name:'ヴィルマルシェ 青山店'}]};
export function requestBody(p:UserPreference){return {days:7,conditions:{budgetYen:p.budget,proteinGoalG:p.protein,kcalGoal:p.calories,pantry:p.pantry,allergies:p.allergies,dislikes:p.dislikes,shoppingDate:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})}};}
export const service:DinnerScoutService={
 getCatalog:()=>structuredClone(catalog),
 async startRun(p){return (await api<{runId:string}>('/runs',{method:'POST',body:JSON.stringify(requestBody(p))})).runId},
 subscribe(id,listener){let stopped=false;let timer:ReturnType<typeof setTimeout>|undefined;const controller=new AbortController();const events:SavedEvent[]=[];
  const poll=async()=>{try{const row=await api<{status:string;events:SavedEvent[]}>(`/runs/${id}/events?after=${events.at(-1)?.sequence||0}`,{signal:controller.signal});if(stopped)return;events.push(...row.events);const last=events.at(-1);const stage=last?.stage.startsWith('selection')?'Planning dinners':events.some(e=>e.stage==='graph.queried')?'Matching recipes':'Finding deals';
   listener({runId:id,tasks:[],stage,status:row.status==='running'?'running':row.status==='complete'?'complete':row.status==='blocked'?'blocked':'failed',rawEvents:[...events]});if(row.status==='running'&&!stopped)timer=setTimeout(poll,1000);
  }catch(e){if(!stopped)listener({runId:id,tasks:[],stage:'Finding deals',status:'failed',error:(e as Error).message,rawEvents:[...events]})}};void poll();return()=>{stopped=true;controller.abort();if(timer)clearTimeout(timer)};
 },
 async getSavedResult(id){return validateResult(await api<unknown>(`/runs/${id}/result`))},
 async getResult(){throw Error('Use the saved-result view for real backend results')},
 async cancelRun(id){await api(`/runs/${id}/cancel`,{method:'POST',body:'{}'})},
 async getAlternatives(){throw Error('Use the saved-result Swap action')},
 async replaceMeal(){throw Error('Use the saved-result Swap action')},
};
