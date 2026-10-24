import { Temporal } from '@js-temporal/polyfill';
import { SchedulingError } from './scheduling-error.js';
export type Disambiguation='REJECT'|'EARLIER'|'LATER';
export type WeeklyInterval={weekday:number;startMinute:number;endMinute:number};
export const occupies=(status:string)=>!['CANCELLED','NO_SHOW'].includes(status);
export function zone(value:string){
  try{if(!value||/^[+-]/.test(value))throw Error();new Intl.DateTimeFormat('en',{timeZone:value});return value;}
  catch{throw new SchedulingError('INVALID_TIMEZONE');}
}
export function plainDate(value:string){
  try{if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01')throw Error();return Temporal.PlainDate.from(value,{overflow:'reject'});}
  catch{throw new SchedulingError('INVALID_TIME_RANGE');}
}
export function localCandidates(value:string,timeZone:string){
  zone(timeZone);
  let local:Temporal.PlainDateTime;
  try{if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||value<'0001-01-01')throw Error();local=Temporal.PlainDateTime.from(value,{overflow:'reject'});}
  catch{throw new SchedulingError('INVALID_TIME_RANGE');}
  const earlier=local.toZonedDateTime(timeZone,{disambiguation:'earlier'});
  const later=local.toZonedDateTime(timeZone,{disambiguation:'later'});
  // Temporal's earlier/later resolve gaps too. Round-trip rejection is mandatory:
  // explicit ambiguity selection must never silently shift a nonexistent time.
  return [earlier,later].filter(z=>z.toPlainDateTime().equals(local))
    .filter((z,i,a)=>a.findIndex(x=>x.epochMilliseconds===z.epochMilliseconds)===i);
}
export function localInstant(value:string,timeZone:string,choice:Disambiguation='REJECT'){
  const candidates=localCandidates(value,timeZone);
  if(!candidates.length)throw new SchedulingError('INVALID_LOCAL_TIME');
  if(candidates.length>1&&choice==='REJECT')throw new SchedulingError('AMBIGUOUS_LOCAL_TIME');
  return new Date((choice==='LATER'?candidates.at(-1)!:candidates[0]).epochMilliseconds);
}
export function localView(value:Date,timeZone:string){
  const z=Temporal.Instant.from(value.toISOString()).toZonedDateTimeISO(zone(timeZone));
  return {local:z.toPlainDateTime().toString({smallestUnit:'minute'}),offset:z.offset};
}
export function calendarRange(from:string,to:string,timeZone:string,maxDays=31){
  const first=plainDate(from),last=plainDate(to),days=first.until(last).days;
  if(days<1||days>maxDays)throw new SchedulingError('INVALID_TIME_RANGE');
  const boundary=(date:Temporal.PlainDate)=>{
    const z=date.toZonedDateTime(zone(timeZone));
    if(!z.toPlainDate().equals(date))throw new SchedulingError('INVALID_LOCAL_TIME');
    return new Date(z.epochMilliseconds);
  };
  return {startAt:boundary(first),endAt:boundary(last)};
}
export function bookingTimes(local:string,timeZone:string,duration:number,choice:Disambiguation='REJECT',checkFuture=true){
  if(!Number.isInteger(duration)||duration<5||duration>480)throw new SchedulingError('INVALID_TIME_RANGE');
  const startAt=localInstant(local,timeZone,choice),endAt=new Date(startAt.getTime()+duration*60000);
  if(checkFuture){const days=Temporal.Now.plainDateISO(timeZone).until(plainDate(local.slice(0,10))).days;
    if(startAt.getTime()<Date.now()||days>366)throw new SchedulingError('INVALID_TIME_RANGE');}
  return {startAt,endAt};
}
export function withinWeekly(startAt:Date,endAt:Date,timeZone:string,intervals:WeeklyInterval[]){
  // Validate every occupied real minute. This handles repeated/skipped wall-clock
  // minutes and midnight crossings without treating a day as a fixed 24 hours.
  const minutes=(endAt.getTime()-startAt.getTime())/60000;
  if(minutes<5||minutes>480||!Number.isInteger(minutes))return false;
  for(let i=0;i<minutes;i++){
    const z=Temporal.Instant.fromEpochMilliseconds(startAt.getTime()+i*60000).toZonedDateTimeISO(timeZone);
    const minute=z.hour*60+z.minute;
    if(!intervals.some(w=>w.weekday===z.dayOfWeek&&minute>=w.startMinute&&minute<w.endMinute))return false;
  }
  return true;
}
export const nextStatuses:Record<string,readonly string[]>={
  SCHEDULED:['CONFIRMED','ARRIVED','CANCELLED','NO_SHOW'],
  CONFIRMED:['ARRIVED','CANCELLED','NO_SHOW'],ARRIVED:['COMPLETED'],
  COMPLETED:[],CANCELLED:[],NO_SHOW:[],
};

export const todayInZone=(timeZone:string)=>Temporal.Now.plainDateISO(timeZone).toString();
