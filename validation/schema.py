from typing import Literal
from datetime import date
from pydantic import field_validator
from pydantic import BaseModel,ConfigDict,Field
class Strict(BaseModel):
 model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
class Evidence(Strict):
 route:Literal['live','saved']
 basis:Literal['source','estimated','unknown']
 sourceUrl:str
 fetchedAt:str
 environment:Literal['local','daytona','web-search']
 estimationReason:str|None=None
class Requirement(Strict):
 ingredientId:str
 nameJa:str
 amount:float|None=Field(default=None,ge=0)
 unit:str|None=None
 raw:str
 grams:float|None=Field(default=None,ge=0)
 conversionSource:str|None=None
class Recipe(Strict):
 id:str
 title:str
 sourceUrl:str
 evidence:Evidence
 servings:float|None=Field(default=None,gt=0)
 servingsRaw:str|None=None
 cookingMinutes:float|None=Field(default=None,gt=0)
 rating:float|None=None
 cooksnapCount:int|None=Field(default=None,ge=0)
 bookmarkCount:int|None=Field(default=None,ge=0)
 requirements:list[Requirement]
 exclusionReviewed:bool=False
 allergens:list[str]=[]
class Deal(Strict):
 id:str
 storeId:str
 ingredientId:str
 productName:str
 priceYen:float|None=Field(default=None,ge=0)
 tax:Literal['included','excluded','unknown']
 quantity:float|None=Field(default=None,gt=0)
 unit:str|None=None
 packGrams:float|None=Field(default=None,gt=0)
 validFrom:str|None=None
 validTo:str|None=None
 membershipRequired:bool|None=None
 purchaseConditions:str|None=None
 comparisonPriceYen:float|None=None
 evidence:Evidence
 @field_validator('validFrom','validTo')
 @classmethod
 def validate_date(cls,v):return date.fromisoformat(v).isoformat() if v is not None else None
class SelectionItem(Strict):
 day:int=Field(ge=1,le=7)
 recipeId:str
 servings:float=Field(gt=0,le=2)
 reason:str=Field(min_length=1,max_length=300)
class Selection(Strict):
 days:list[SelectionItem]=Field(min_length=1,max_length=7)
def validate_selection(text,candidates,days):
 s=Selection.model_validate_json(text)
 if len(s.days)!=days or sorted(d.day for d in s.days)!=list(range(1,days+1)):raise ValueError('invalid_days')
 if any(d.recipeId not in candidates for d in s.days):raise ValueError('unknown_recipe_id')
 return s
class Conditions(Strict):
 budgetYen:float=Field(default=3000,ge=0)
 proteinGoalG:float=Field(default=35,ge=0)
 kcalGoal:float=Field(default=600,ge=0)
 allergies:list[Literal['egg','milk','wheat','buckwheat','peanut','shrimp','crab','walnut','soy','sesame','fish']]=[]
 dislikes:list[Literal['broccoli-raw','onion-raw','pork-mixed-cut-raw','chicken-thigh-skin-unspecified-raw','mushroom']]=[]
 pantry:list[str]=['rice-cooked','oil','salt','pepper','soy-sauce','sugar']
 shoppingDate:str=Field(default_factory=lambda:date.today().isoformat())
 @field_validator('shoppingDate')
 @classmethod
 def valid_date(cls,v):return date.fromisoformat(v).isoformat()
def eligible_recipe(recipe,conditions):
 if not recipe.exclusionReviewed:return False
 if set(recipe.allergens)&set(conditions.allergies):return False
 if {q.ingredientId for q in recipe.requirements}&set(conditions.dislikes):return False
 return recipe.cookingMinutes is not None and recipe.cookingMinutes<=30 and recipe.servings is not None and all(q.grams is not None for q in recipe.requirements)
