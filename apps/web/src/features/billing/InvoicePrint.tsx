import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { InvoiceRecord, PaymentRecord } from './billing-api';
import { decimal, formatMoney, invoiceStatuses, methodNames } from './billing-money';
export function InvoicePrint({invoice:i,payment:p}:{invoice:InvoiceRecord;payment:PaymentRecord|null}){
  const issuer=i.issuer;if(!issuer)return null;
  const money=(v:string)=>formatMoney(v,i.currency,i.currencyScale);
  const time=(v:string)=>new Intl.DateTimeFormat('ar-YE',{dateStyle:'medium',timeStyle:'short',timeZone:issuer.timezone}).format(new Date(v));
  const paper=(id?:string)=><article id={id} className="invoice-paper" dir="rtl" lang="ar" style={{'--invoice-primary':issuer.primaryColor} as CSSProperties}>
    <header className="invoice-paper-header">{issuer.logoUrl&&<img src={issuer.logoUrl} alt="شعار العيادة" referrerPolicy="no-referrer"/>}<div><h2>{issuer.displayName}</h2><p>{issuer.legalName}</p>{issuer.address&&<p>{issuer.address}</p>}{issuer.registrationNumber&&<p>السجل التجاري: <bdi>{issuer.registrationNumber}</bdi></p>}{issuer.taxIdentifier&&<p>المعرّف الضريبي: <bdi>{issuer.taxIdentifier}</bdi></p>}</div><div><h3>{p?'إيصال استلام دفعة':'فاتورة'}</h3><bdi>{p?p.receiptNumber:i.number}</bdi><p>{time(p?p.createdAt:i.issuedAt!)}</p></div></header>
    <div className="invoice-recipient"><p>المريض: <b>{i.patientName}</b> · <bdi>{i.patientNumber}</bdi></p><p>رقم الفاتورة: <bdi>{i.number}</bdi></p><p>الحالة الحالية: {invoiceStatuses[i.status]}</p></div>
    {p?<section><h3>المبلغ المستلم: {money(p.amountMinor)}</h3><p>طريقة الدفع: {methodNames[p.method]}</p><p>المسترد من هذه الدفعة: {money(p.refundedMinor)}</p><p>صافي هذه الدفعة: {money((BigInt(p.amountMinor)-BigInt(p.refundedMinor)).toString())}</p><p>هذا إثبات تسجيل يدوي للدفع، وليس عملية بوابة دفع إلكترونية.</p></section>:<div className="table-wrap"><table><thead><tr><th>الخدمة / الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>الضريبة</th><th>الإجمالي</th></tr></thead><tbody>{i.lines.map(l=><tr key={l.position}><td>{l.serviceName}{l.description&&<small>{l.description}</small>}</td><td><bdi>{decimal(String(l.quantityMilli),3)}</bdi></td><td>{money(l.unitPriceMinor)}</td><td>{money(l.discountMinor)}</td><td>{money(l.taxMinor)}</td><td>{money(l.totalMinor)}</td></tr>)}</tbody></table></div>}
    <dl className="invoice-totals"><div><dt>الإجمالي قبل الخصم والضريبة</dt><dd>{money(i.subtotalMinor)}</dd></div><div><dt>الخصم</dt><dd>{money(i.discountMinor)}</dd></div><div><dt>الضريبة</dt><dd>{money(i.taxMinor)}</dd></div><div><dt>إجمالي الفاتورة</dt><dd>{money(i.totalMinor)}</dd></div><div><dt>صافي المدفوع</dt><dd>{money(i.netPaidMinor)}</dd></div><div><dt>الرصيد المستحق الحالي</dt><dd>{money(i.balanceMinor)}</dd></div></dl>
    {i.status==='VOID'&&<p className="invoice-void-mark">فاتورة ملغاة ماليًا · لا تُستخدم للمطالبة بالسداد</p>}
    <footer>العملة: <bdi>{i.currency}</bdi> · الأوقات بتوقيت العيادة: <bdi>{issuer.timezone}</bdi><p>المبالغ المحفوظة لقطة إصدار ثابتة. الأرصدة والاستردادات تعكس السجل عند الطباعة.</p></footer>
  </article>;
  // A body-level print root removes hidden application layout and modal scroll
  // containers from pagination. It is never displayed on screen or persisted.
  return <>{paper('invoice-print')}{createPortal(<div id="billing-print-root">{paper()}</div>,document.body)}</>;
}
