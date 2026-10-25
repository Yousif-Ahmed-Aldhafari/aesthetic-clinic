// Currency scale comes from the issued server contract. No inferred conversion.
export function decimal(minor:string,scale:number){
  const value=BigInt(minor),power=10n**BigInt(scale),whole=value/power;
  return scale?`${whole}.${(value%power).toString().padStart(scale,'0')}`:whole.toString();
}
export function formatMoney(minor:string,currency:string,scale:number){
  const [whole,fraction]=decimal(minor,scale).split('.');
  const parts=new Intl.NumberFormat('ar-YE',{useGrouping:true}).format(BigInt(whole));
  const digits=fraction?fraction.replace(/\d/g,c=>'٠١٢٣٤٥٦٧٨٩'[Number(c)]):'';
  return `${parts}${fraction?'٫'+digits:''} ${currency}`;
}
export function preview(lines:{quantity:string;unitPrice:string;discount:string;taxBasisPoints:number}[],scale:number):string|null {
  function parse(value:string,s:number){if(!/^\d{1,12}(?:\.\d{1,3})?$/.test(value))throw new Error();const [w,f='']=value.split('.');if(f.length>s)throw new Error();return BigInt(w)*10n**BigInt(s)+BigInt(f.padEnd(s,'0')||'0');}
  try{return lines.reduce((sum,l)=>{const q=parse(l.quantity,3),price=parse(l.unitPrice,scale),discount=parse(l.discount,scale);if(q<1n||q>1000000n||!Number.isInteger(l.taxBasisPoints)||l.taxBasisPoints<0||l.taxBasisPoints>10000)throw new Error();const gross=(q*price+500n)/1000n;if(discount>gross)throw new Error();const taxable=gross-discount;return sum+taxable+(taxable*BigInt(l.taxBasisPoints)+5000n)/10000n;},0n).toString();}catch{return null;}
}
export const invoiceStatuses:Record<string,string>={DRAFT:'مسودة',ISSUED:'صادرة · غير مدفوعة',PARTIALLY_PAID:'مدفوعة جزئيًا',PAID:'مدفوعة بالكامل',VOID:'ملغاة ماليًا'};
export const methodNames:Record<string,string>={CASH:'نقدًا',BANK_TRANSFER:'تحويل بنكي مسجّل يدويًا',CARD_MANUAL:'بطاقة · تسجيل يدوي فقط'};
export const reasonNames:Record<string,string>={ADMIN_ERROR:'خطأ إداري',DUPLICATE:'تكرار',PATIENT_REFUND:'استرداد للمريض',OTHER:'سبب إداري آخر'};
