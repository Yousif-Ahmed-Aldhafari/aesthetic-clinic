import { BillingError } from './billing-error.js';

// Explicit supported currency scales; changing this requires a reviewed policy.
export const currencyScales:Readonly<Record<string,number>> = {
  YER:2, SAR:2, AED:2, USD:2, EUR:2, GBP:2, QAR:2, EGP:2,
  JPY:0, KWD:3, BHD:3, OMR:3, JOD:3, TND:3,
};
export const MAX_MINOR=999_999_999_999_999n;
export function currencyScale(currency:string):number {
  if(!Object.hasOwn(currencyScales,currency))throw new BillingError('BILLING_CURRENCY');
  return currencyScales[currency];
}
export function fixed(value:string,scale:number):bigint {
  if(typeof value!=='string'||!/^\d{1,12}(?:\.\d{1,3})?$/.test(value))throw new BillingError('BILLING_AMOUNT');
  const [whole,fraction='']=value.split('.');
  if(fraction.length>scale)throw new BillingError('BILLING_AMOUNT');
  const result=BigInt(whole)*10n**BigInt(scale)+BigInt(fraction.padEnd(scale,'0')||'0');
  if(result>MAX_MINOR)throw new BillingError('BILLING_AMOUNT');return result;
}
export const roundHalfUp=(numerator:bigint,denominator:bigint)=>(numerator+denominator/2n)/denominator;
export interface MoneyLine {serviceName:string;description?:string|null;quantity:string;unitPrice:string;discount:string;taxBasisPoints:number}
export function calculate(lines:readonly MoneyLine[],scale:number){
  if(!lines.length||lines.length>50)throw new BillingError('BILLING_AMOUNT');
  const items=lines.map((line,position)=>{
    const quantity=fixed(line.quantity,3),unitPriceMinor=fixed(line.unitPrice,scale),discountMinor=fixed(line.discount,scale);
    if(quantity<1n||quantity>1_000_000n||!Number.isInteger(line.taxBasisPoints)||line.taxBasisPoints<0||line.taxBasisPoints>10000)throw new BillingError('BILLING_AMOUNT');
    const grossMinor=roundHalfUp(unitPriceMinor*quantity,1000n);
    if(discountMinor>grossMinor||grossMinor>MAX_MINOR)throw new BillingError('BILLING_AMOUNT');
    const taxMinor=roundHalfUp((grossMinor-discountMinor)*BigInt(line.taxBasisPoints),10000n);
    const totalMinor=grossMinor-discountMinor+taxMinor;
    return {position:position+1,serviceName:line.serviceName,description:line.description??null,quantityMilli:Number(quantity),unitPriceMinor,grossMinor,discountMinor,taxBasisPoints:line.taxBasisPoints,taxMinor,totalMinor};
  });
  const totals=items.reduce((t,l)=>({subtotalMinor:t.subtotalMinor+l.grossMinor,discountMinor:t.discountMinor+l.discountMinor,taxMinor:t.taxMinor+l.taxMinor,totalMinor:t.totalMinor+l.totalMinor}),{subtotalMinor:0n,discountMinor:0n,taxMinor:0n,totalMinor:0n});
  if(Object.values(totals).some(v=>v>MAX_MINOR))throw new BillingError('BILLING_AMOUNT');
  return {items,totals};
}
