"""Local manifest import. Paths and previews are confined to MATERIALS."""
import hashlib,json,re
from datetime import datetime,date
from pathlib import Path
from typing import Literal,Any
from pydantic import BaseModel,ConfigDict,Field,model_validator
ROOT=Path(__file__).resolve().parents[1];MATERIALS=ROOT/'materials'
STORES={'seijo-minamiaoyama','kino-aoyama','ville-aoyama'}
class Supplement(BaseModel):
 model_config=ConfigDict(extra='forbid')
 targetId:str
 field:str
 value:Any
 basis:Literal['source','estimated']
 reason:str=Field(min_length=1)
 confirmedAt:datetime
 sourceUrl:str|None=None
class Document(BaseModel):
 model_config=ConfigDict(extra='forbid')
 documentId:str=Field(pattern=r'^[a-zA-Z0-9_-]+$')
 kind:Literal['store_flyer','recipe']
 localPath:str
 format:Literal['html','json','image','pdf']
 storeId:str|None=None
 recipeSourceId:str|None=None
 sourceUrl:str|None
 obtainedAt:datetime
 validFrom:date|None=None
 validUntil:date|None=None
 contentHash:str=Field(pattern=r'^[0-9a-f]{64}$')
 acquisitionMethod:str
 derivedFromDocumentId:str|None=None
 supplements:list[Supplement]=[]
 @model_validator(mode='after')
 def scope(self):
  if self.kind=='store_flyer' and self.storeId not in STORES:raise ValueError('unknown_store')
  if self.kind=='recipe' and not self.recipeSourceId:raise ValueError('recipe_source_id_required')
  if self.kind=='recipe' and self.sourceUrl:
   from urllib.parse import urlparse
   if urlparse(self.sourceUrl).hostname not in ['cookpad.com','www.cookpad.com']:raise ValueError('cookpad_only')
  if self.validFrom and self.validUntil and self.validFrom>self.validUntil:raise ValueError('invalid_validity')
  return self
class Manifest(BaseModel):
 model_config=ConfigDict(extra='forbid')
 version:Literal[1]
 documents:list[Document]
def local_file(doc):
 p=(MATERIALS/doc.localPath).resolve()
 if not p.is_relative_to(MATERIALS.resolve()) or p==MATERIALS.resolve():raise ValueError('path_outside_materials')
 if p.suffix.lower() not in {'html':['.html'],'json':['.json'],'image':['.jpg','.jpeg','.png','.webp'],'pdf':['.pdf']}[doc.format]:raise ValueError('format_extension_mismatch')
 if not p.is_file() or p.stat().st_size>20_000_000:raise ValueError('missing_or_oversized_document')
 if hashlib.sha256(p.read_bytes()).hexdigest()!=doc.contentHash:raise ValueError('document_hash_mismatch')
 return p

def load_manifest():
 m=Manifest.model_validate_json((MATERIALS/'manifest.json').read_text());ids=[d.documentId for d in m.documents]
 if len(ids)!=len(set(ids)):raise ValueError('duplicate_document_id')
 for d in m.documents:
  local_file(d)
  if d.format=='json' and d.derivedFromDocumentId not in ids:raise ValueError('confirmed_json_requires_source_document')
 return m

def catalog():
 return [dict(**d.model_dump(mode='json'),previewUrl=f'/api/documents/{d.documentId}/preview',previewLabel='Source preview',automaticExtraction='html_jsonld' if d.format=='html' else 'confirmed_json_validation' if d.format=='json' else 'unsupported') for d in load_manifest().documents]
