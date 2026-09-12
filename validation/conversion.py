"""Source-backed estimates, never an exact weight claim."""
from decimal import Decimal
import math
SOURCE='https://park.ajinomoto.co.jp/contents/basic/chomiryo_bunryou/'
def seasoning_grams(ingredient_id, amount, unit):
 if not math.isfinite(amount) or amount < 0: raise ValueError('invalid_amount')
 factors={('soy-sauce','大さじ'):18,('soy-sauce','小さじ'):6}
 factor=factors.get((ingredient_id,unit))
 if factor is None:return {'grams':None,'basis':'unknown','sourceUrl':None}
 return {'grams':float(Decimal(str(amount))*factor),'basis':'estimated','sourceUrl':SOURCE,'reason':'一般調味料の目安量。商品差・計量差あり'}
